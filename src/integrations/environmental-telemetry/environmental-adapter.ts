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
import type { EnvironmentalTelemetryClient } from "./contracts";
import {
  GOOD_TELEMETRY_QUALITY,
  telemetryCursor,
  telemetryHealth,
  telemetryObservationDraft,
} from "./common";

export interface EnvironmentalTelemetryAdapterOptions {
  adapterId?: string;
  displayName?: string;
  client: EnvironmentalTelemetryClient;
}

/**
 * Habitat/environment telemetry boundary for MQTT, WebSocket or REST gateways.
 * Transport authorization and credentials remain outside the adapter.
 */
export class EnvironmentalTelemetryAdapter implements DeviceAdapter {
  private source?: DiscoveredSource;
  private connected = false;
  private cursor?: AdapterSyncCursor;

  constructor(private readonly options: EnvironmentalTelemetryAdapterOptions) {}

  descriptor(): AdapterDescriptor {
    return {
      id: this.options.adapterId ?? "org.mitochondria.environmental-telemetry",
      version: "1.0.0",
      displayName: this.options.displayName ?? "Environmental Telemetry Adapter",
      transport: this.source?.transport ?? "mqtt",
    };
  }

  async *discover(): AsyncIterable<DiscoveredSource> {
    const remote = await this.options.client.source();
    this.source = {
      sourceId: remote.sourceId,
      displayName: remote.displayName,
      transport: remote.transport,
      ...(remote.manufacturer ? { manufacturer: remote.manufacturer } : {}),
      ...(remote.model ? { model: remote.model } : {}),
    };
    yield this.source;
  }

  async connect(options: AdapterConnectOptions): Promise<void> {
    this.requireSource(options.sourceId);
    const health = await this.options.client.health();
    if (!health.available) {
      throw new Error(health.message || "Environmental telemetry source unavailable");
    }
    this.connected = true;
  }

  async capabilities(sourceId: string): Promise<AdapterCapabilities> {
    this.requireSource(sourceId);
    const metrics: AdapterCapability[] = (await this.options.client.availableMetricCodes())
      .filter((metricCode) => {
        const metric = getCanonicalMetric(metricCode);
        return Boolean(
          metric &&
            metric.domain === "environmental" &&
            metric.sourceTypes.includes("environment"),
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
    );

    for await (const record of this.options.client.records({
      metricCodes,
      ...(options.cursor ? { cursor: options.cursor.value } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })) {
      const metric = getCanonicalMetric(record.metricCode);
      if (!metric || metric.domain !== "environmental") continue;

      const receivedAt = record.observedAt;
      const contextTags = [
        "source:environmental-telemetry",
        ...(record.compartment ? [`compartment:${record.compartment}`] : []),
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
    if (!this.source) throw new Error("Environmental telemetry source unavailable");
    return telemetryObservationDraft(
      this.descriptor(),
      this.source,
      item,
      context,
      ["adapter:environmental-telemetry"],
      "environment",
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
      throw new Error("Unknown environmental telemetry source");
    }
  }

  private requireConnected(sourceId: string): void {
    this.requireSource(sourceId);
    if (!this.connected) throw new Error("Environmental telemetry source is not connected");
  }
}
