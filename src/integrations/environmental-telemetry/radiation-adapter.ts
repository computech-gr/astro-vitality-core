import type {
  AdapterCapabilities,
  AdapterCapability,
  AdapterConnectOptions,
  AdapterDescriptor,
  AdapterHealth,
  AdapterNormalizationContext,
  AdapterStreamItem,
  AdapterStreamOptions,
  AdapterSyncCursor,
  DeviceAdapter,
  DiscoveredSource,
} from "../device-adapters";
import type {
  CanonicalObservationDraft,
  DataQuality,
  RawSignalChunk,
} from "../../domain";
import { getCanonicalMetric } from "../../domain";
import type {
  RadiationDosimeterClient,
  RadiationMetricCode,
} from "./contracts";
import { RADIATION_METRIC_CODES } from "./contracts";
import {
  GOOD_TELEMETRY_QUALITY,
  telemetryCursor,
  telemetryHealth,
  telemetryObservationDraft,
} from "./common";

export interface RadiationDosimeterAdapterOptions {
  adapterId?: string;
  displayName?: string;
  client: RadiationDosimeterClient;
}

/** Personal dosimetry boundary. Gy and Sv quantities remain distinct canonical metrics. */
export class RadiationDosimeterAdapter implements DeviceAdapter {
  private source?: DiscoveredSource;
  private connected = false;
  private cursor?: AdapterSyncCursor;

  constructor(private readonly options: RadiationDosimeterAdapterOptions) {}

  descriptor(): AdapterDescriptor {
    return {
      id: this.options.adapterId ?? "org.mitochondria.radiation-dosimeter",
      version: "1.0.0",
      displayName: this.options.displayName ?? "Radiation Dosimeter Adapter",
      transport: "rest",
    };
  }

  async *discover(): AsyncIterable<DiscoveredSource> {
    const remote = await this.options.client.source();
    this.source = {
      sourceId: remote.sourceId,
      displayName: remote.displayName,
      transport: "rest",
      ...(remote.manufacturer ? { manufacturer: remote.manufacturer } : {}),
      ...(remote.model ? { model: remote.model } : {}),
    };
    yield this.source;
  }

  async connect(options: AdapterConnectOptions): Promise<void> {
    this.requireSource(options.sourceId);
    const health = await this.options.client.health();
    if (!health.available) throw new Error(health.message || "Radiation dosimeter unavailable");
    this.connected = true;
  }

  async capabilities(sourceId: string): Promise<AdapterCapabilities> {
    this.requireSource(sourceId);
    const allowed = new Set<string>(RADIATION_METRIC_CODES);
    const metrics: AdapterCapability[] = (await this.options.client.availableMetricCodes())
      .filter((metricCode): metricCode is RadiationMetricCode => {
        const metric = getCanonicalMetric(metricCode);
        return Boolean(
          allowed.has(metricCode) &&
            metric &&
            metric.domain === "radiation" &&
            metric.sourceTypes.includes("device"),
        );
      })
      .map((metricCode) => ({ metricCode, modes: ["stream", "history"] }));

    return {
      sourceId,
      metrics,
      supportsResumeCursor: true,
      supportsClockMetadata: true,
    };
  }

  async *stream(options: AdapterStreamOptions): AsyncIterable<AdapterStreamItem> {
    this.requireConnected(options.sourceId);
    const metricCodes = (await this.capabilities(options.sourceId)).metrics.map(
      (metric) => metric.metricCode,
    ) as RadiationMetricCode[];

    for await (const record of this.options.client.records({
      metricCodes,
      ...(options.cursor ? { cursor: options.cursor.value } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })) {
      const metric = getCanonicalMetric(record.metricCode);
      if (!metric || metric.domain !== "radiation") continue;

      const receivedAt = record.observedAt;
      const contextTags = [
        "source:radiation-dosimeter",
        ...(record.detectorType ? [`detector:${record.detectorType}`] : []),
        ...(record.radiationField ? [`radiation-field:${record.radiationField}`] : []),
        ...(record.location ? [`location:${record.location}`] : []),
      ];

      const item: AdapterStreamItem = {
        kind: "observation",
        packet: {
          packetId: record.id,
          sourceId: options.sourceId,
          metricCode: record.metricCode,
          observedAt: record.observedAt,
          value: { number: record.value },
          unit: record.unit,
          quality: record.quality ?? GOOD_TELEMETRY_QUALITY,
          context: { tags: contextTags },
          clock: {
            sourceTimestamp: record.observedAt,
            receivedAt,
          },
          ...(record.cursor ? { cursor: record.cursor } : {}),
        },
      };

      const cursor = telemetryCursor(options.sourceId, item.packet);
      if (cursor) this.cursor = cursor;
      yield item;
    }
  }

  quality(item: AdapterStreamItem): DataQuality {
    return item.packet.quality;
  }

  normalize(
    item: AdapterStreamItem,
    context: AdapterNormalizationContext,
  ): CanonicalObservationDraft | RawSignalChunk {
    if (!this.source) throw new Error("Radiation dosimeter source unavailable");
    return telemetryObservationDraft(
      this.descriptor(),
      this.source,
      item,
      context,
      ["adapter:radiation-dosimeter"],
      "device",
    );
  }

  async disconnect(sourceId: string): Promise<void> {
    this.requireSource(sourceId);
    this.connected = false;
  }

  async syncCursor(sourceId: string): Promise<AdapterSyncCursor | undefined> {
    this.requireSource(sourceId);
    return this.cursor;
  }

  async health(sourceId?: string): Promise<AdapterHealth> {
    const status = await this.options.client.health();
    return telemetryHealth(
      this.descriptor(),
      this.connected && status.available,
      new Date().toISOString(),
      sourceId,
      this.cursor?.capturedAt,
      status.message,
    );
  }

  private requireSource(sourceId: string): void {
    if (!this.source || this.source.sourceId !== sourceId) {
      throw new Error("Unknown radiation dosimeter source");
    }
  }

  private requireConnected(sourceId: string): void {
    this.requireSource(sourceId);
    if (!this.connected) throw new Error("Radiation dosimeter is not connected");
  }
}
