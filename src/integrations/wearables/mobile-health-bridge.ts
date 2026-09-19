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
  AdapterTransport,
  DeviceAdapter,
  DiscoveredSource,
} from "../device-adapters";
import type { CanonicalObservationDraft, DataQuality, ObservationValue, RawSignalChunk } from "../../domain";
import { getCanonicalMetric } from "../../domain";
import {
  GOOD_WEARABLE_QUALITY,
  adapterHealth,
  packetCursor,
  wearableObservationDraft,
} from "./common";

export interface MobileHealthRecord {
  recordId: string;
  metricCode: string;
  observedAt: string;
  value: ObservationValue;
  unit?: string;
  dataOrigin?: string;
  updatedAt?: string;
  quality?: DataQuality;
}

export interface MobileHealthBridge {
  sourceId(): Promise<string>;
  displayName(): Promise<string>;
  availableMetricCodes(): Promise<string[]>;
  readRecords(options: { metricCodes: string[]; cursor?: string; signal?: AbortSignal }): AsyncIterable<MobileHealthRecord>;
  cursor(): Promise<string | undefined>;
  health(): Promise<{ available: boolean; message?: string }>;
}

export interface MobileHealthBridgeAdapterOptions {
  adapterId: string;
  displayName: string;
  transport: Extract<AdapterTransport, "health_connect" | "healthkit">;
  platformTag: string;
  bridge: MobileHealthBridge;
}

/** Shared adapter for native Health Connect / HealthKit bridge implementations. */
export class MobileHealthBridgeAdapter implements DeviceAdapter {
  private source?: DiscoveredSource;
  private connected = false;
  private lastDataAt?: string;

  constructor(private readonly options: MobileHealthBridgeAdapterOptions) {}

  descriptor(): AdapterDescriptor {
    return {
      id: this.options.adapterId,
      version: "1.0.0",
      displayName: this.options.displayName,
      transport: this.options.transport,
    };
  }

  async *discover(): AsyncIterable<DiscoveredSource> {
    const sourceId = await this.options.bridge.sourceId();
    this.source = {
      sourceId,
      displayName: await this.options.bridge.displayName(),
      transport: this.options.transport,
    };
    yield this.source;
  }

  async connect(options: AdapterConnectOptions): Promise<void> {
    this.requireSource(options.sourceId);
    const health = await this.options.bridge.health();
    if (!health.available) throw new Error(health.message || `${this.options.displayName} bridge is unavailable`);
    this.connected = true;
  }

  async capabilities(sourceId: string): Promise<AdapterCapabilities> {
    this.requireSource(sourceId);
    const codes = await this.options.bridge.availableMetricCodes();
    const metrics: AdapterCapability[] = codes
      .filter((code) => Boolean(getCanonicalMetric(code)))
      .map((metricCode) => ({ metricCode, modes: ["history", "snapshot"] }));
    return {
      sourceId,
      metrics,
      supportsResumeCursor: true,
      supportsClockMetadata: true,
    };
  }

  async *stream(options: AdapterStreamOptions): AsyncIterable<AdapterStreamItem> {
    this.requireConnected(options.sourceId);
    const capabilities = await this.capabilities(options.sourceId);
    const metricCodes = capabilities.metrics.map((metric) => metric.metricCode);
    for await (const record of this.options.bridge.readRecords({
      metricCodes,
      ...(options.cursor ? { cursor: options.cursor.value } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })) {
      if (!getCanonicalMetric(record.metricCode)) continue;
      const receivedAt = record.updatedAt ?? record.observedAt;
      const cursorValue = await this.options.bridge.cursor();
      const packet: AdapterStreamItem = {
        kind: "observation",
        packet: {
          packetId: record.recordId,
          sourceId: options.sourceId,
          metricCode: record.metricCode,
          observedAt: record.observedAt,
          value: record.value,
          ...(record.unit ? { unit: record.unit } : {}),
          quality: record.quality ?? GOOD_WEARABLE_QUALITY,
          context: { tags: record.dataOrigin ? [`data-origin:${record.dataOrigin}`] : [] },
          clock: { sourceTimestamp: record.observedAt, receivedAt },
          ...(cursorValue ? { cursor: cursorValue } : {}),
        },
      };
      this.lastDataAt = receivedAt;
      yield packet;
    }
  }

  quality(item: AdapterStreamItem): DataQuality {
    return item.packet.quality;
  }

  normalize(
    item: AdapterStreamItem,
    context: AdapterNormalizationContext,
  ): CanonicalObservationDraft | RawSignalChunk {
    if (!this.source) throw new Error(`${this.options.displayName} source unavailable`);
    return wearableObservationDraft(this.descriptor(), this.source, item, context, [
      `adapter:${this.options.transport}`,
      this.options.platformTag,
    ]);
  }

  async disconnect(sourceId: string): Promise<void> {
    this.requireSource(sourceId);
    this.connected = false;
  }

  async syncCursor(sourceId: string): Promise<AdapterSyncCursor | undefined> {
    this.requireSource(sourceId);
    const value = await this.options.bridge.cursor();
    return value ? { sourceId, value, capturedAt: this.lastDataAt ?? new Date(0).toISOString() } : undefined;
  }

  async health(sourceId?: string): Promise<AdapterHealth> {
    const health = await this.options.bridge.health();
    return adapterHealth(
      this.descriptor(),
      this.connected && health.available,
      new Date().toISOString(),
      sourceId,
      this.lastDataAt,
      health.message,
    );
  }

  private requireSource(sourceId: string): void {
    if (!this.source || this.source.sourceId !== sourceId) throw new Error(`Unknown ${this.options.displayName} source`);
  }

  private requireConnected(sourceId: string): void {
    this.requireSource(sourceId);
    if (!this.connected) throw new Error(`${this.options.displayName} source is not connected`);
  }
}

export function createHealthConnectAdapter(bridge: MobileHealthBridge): MobileHealthBridgeAdapter {
  return new MobileHealthBridgeAdapter({
    adapterId: "org.mitochondria.health-connect",
    displayName: "Android Health Connect Bridge",
    transport: "health_connect",
    platformTag: "platform:android-health-connect",
    bridge,
  });
}

export function createHealthKitAdapter(bridge: MobileHealthBridge): MobileHealthBridgeAdapter {
  return new MobileHealthBridgeAdapter({
    adapterId: "org.mitochondria.healthkit",
    displayName: "Apple HealthKit Bridge",
    transport: "healthkit",
    platformTag: "platform:apple-healthkit",
    bridge,
  });
}
