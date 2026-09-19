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
import type { CanonicalObservationDraft, DataQuality, ObservationValue, RawSignalChunk } from "../../domain";
import { getCanonicalMetric } from "../../domain";
import {
  GOOD_WEARABLE_QUALITY,
  adapterHealth,
  wearableObservationDraft,
} from "./common";

export interface VendorWearableRecord {
  id: string;
  metricCode: string;
  observedAt: string;
  value: ObservationValue;
  unit?: string;
  quality?: DataQuality;
  cursor?: string;
}

export interface VendorWearableClient {
  source(): Promise<{ sourceId: string; displayName: string; vendor: string; model?: string }>;
  availableMetricCodes(): Promise<string[]>;
  records(options: { metricCodes: string[]; cursor?: string; signal?: AbortSignal }): AsyncIterable<VendorWearableRecord>;
  health(): Promise<{ available: boolean; message?: string }>;
}

export interface VendorCloudWearableAdapterOptions {
  adapterId: string;
  displayName: string;
  client: VendorWearableClient;
}

/** Vendor-cloud boundary. OAuth/token acquisition remains outside this adapter and no credentials are persisted here. */
export class VendorCloudWearableAdapter implements DeviceAdapter {
  private source?: DiscoveredSource;
  private connected = false;
  private cursor?: AdapterSyncCursor;

  constructor(private readonly options: VendorCloudWearableAdapterOptions) {}

  descriptor(): AdapterDescriptor {
    return {
      id: this.options.adapterId,
      version: "1.0.0",
      displayName: this.options.displayName,
      transport: "vendor_api",
    };
  }

  async *discover(): AsyncIterable<DiscoveredSource> {
    const remote = await this.options.client.source();
    this.source = {
      sourceId: remote.sourceId,
      displayName: remote.displayName,
      transport: "vendor_api",
      manufacturer: remote.vendor,
      ...(remote.model ? { model: remote.model } : {}),
    };
    yield this.source;
  }

  async connect(options: AdapterConnectOptions): Promise<void> {
    this.requireSource(options.sourceId);
    const health = await this.options.client.health();
    if (!health.available) throw new Error(health.message || "Vendor wearable API unavailable");
    this.connected = true;
  }

  async capabilities(sourceId: string): Promise<AdapterCapabilities> {
    this.requireSource(sourceId);
    const metrics: AdapterCapability[] = (await this.options.client.availableMetricCodes())
      .filter((metricCode) => Boolean(getCanonicalMetric(metricCode)))
      .map((metricCode) => ({ metricCode, modes: ["history"] }));
    return { sourceId, metrics, supportsResumeCursor: true, supportsClockMetadata: true };
  }

  async *stream(options: AdapterStreamOptions): AsyncIterable<AdapterStreamItem> {
    this.requireConnected(options.sourceId);
    const metricCodes = (await this.capabilities(options.sourceId)).metrics.map((metric) => metric.metricCode);
    for await (const record of this.options.client.records({
      metricCodes,
      ...(options.cursor ? { cursor: options.cursor.value } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })) {
      if (!getCanonicalMetric(record.metricCode)) continue;
      const receivedAt = record.observedAt;
      const item: AdapterStreamItem = {
        kind: "observation",
        packet: {
          packetId: record.id,
          sourceId: options.sourceId,
          metricCode: record.metricCode,
          observedAt: record.observedAt,
          value: record.value,
          ...(record.unit ? { unit: record.unit } : {}),
          quality: record.quality ?? GOOD_WEARABLE_QUALITY,
          clock: { sourceTimestamp: record.observedAt, receivedAt },
          ...(record.cursor ? { cursor: record.cursor } : {}),
        },
      };
      if (record.cursor) this.cursor = { sourceId: options.sourceId, value: record.cursor, capturedAt: receivedAt };
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
    if (!this.source) throw new Error("Vendor wearable source unavailable");
    return wearableObservationDraft(this.descriptor(), this.source, item, context, ["adapter:vendor-cloud"]);
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
    return adapterHealth(
      this.descriptor(),
      this.connected && status.available,
      new Date().toISOString(),
      sourceId,
      this.cursor?.capturedAt,
      status.message,
    );
  }

  private requireSource(sourceId: string): void {
    if (!this.source || this.source.sourceId !== sourceId) throw new Error("Unknown vendor wearable source");
  }
  private requireConnected(sourceId: string): void {
    this.requireSource(sourceId);
    if (!this.connected) throw new Error("Vendor wearable source is not connected");
  }
}
