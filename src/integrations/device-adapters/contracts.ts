import type { CanonicalObservationDraft, DataQuality, ObservationContext, ObservationValue, RawSignalChunk, SourceRef } from "../../domain";

export const ADAPTER_CONNECTION_STATES = ["disconnected", "discovering", "connecting", "connected", "degraded", "error"] as const;
export type AdapterConnectionState = (typeof ADAPTER_CONNECTION_STATES)[number];

export const ADAPTER_TRANSPORTS = ["ble", "camera_ppg", "device_sensor", "health_connect", "healthkit", "vendor_api", "file_import", "mqtt", "websocket", "rest", "synthetic"] as const;
export type AdapterTransport = (typeof ADAPTER_TRANSPORTS)[number];

export const ADAPTER_DATA_MODES = ["stream", "snapshot", "history", "series"] as const;
export type AdapterDataMode = (typeof ADAPTER_DATA_MODES)[number];

export interface AdapterDescriptor {
  id: string;
  version: string;
  displayName: string;
  transport: AdapterTransport;
  vendor?: string;
}

export interface DiscoveredSource {
  sourceId: string;
  displayName: string;
  transport: AdapterTransport;
  manufacturer?: string;
  model?: string;
  hardwareId?: string;
  signalStrength?: number;
}

export interface AdapterCapability {
  metricCode: string;
  modes: AdapterDataMode[];
  sourceUnit?: string;
  samplingRateHz?: number;
  channels?: string[];
}

export interface AdapterCapabilities {
  sourceId: string;
  metrics: AdapterCapability[];
  supportsResumeCursor: boolean;
  supportsClockMetadata: boolean;
}

export interface AdapterClockMetadata {
  sourceTimestamp?: string;
  receivedAt: string;
  clockOffsetMs?: number;
  clockUncertaintyMs?: number;
}

export interface AdapterPacket {
  packetId: string;
  sourceId: string;
  metricCode: string;
  observedAt: string;
  value: ObservationValue;
  unit?: string;
  quality: DataQuality;
  context?: ObservationContext;
  clock: AdapterClockMetadata;
  cursor?: string;
}

export interface AdapterSeriesPacket {
  packetId: string;
  sourceId: string;
  metricCode: string;
  startedAt: string;
  endedAt: string;
  samplingRateHz: number;
  channelNames: string[];
  unit: string;
  samples: number[][];
  quality: DataQuality;
  context?: ObservationContext;
  clock: AdapterClockMetadata;
  cursor?: string;
}

export type AdapterStreamItem =
  | { kind: "observation"; packet: AdapterPacket }
  | { kind: "series"; packet: AdapterSeriesPacket };

export interface AdapterSyncCursor {
  sourceId: string;
  value: string;
  capturedAt: string;
}

export interface AdapterHealth {
  adapterId: string;
  sourceId?: string;
  state: AdapterConnectionState;
  checkedAt: string;
  lastDataAt?: string;
  message?: string;
}

export interface AdapterConnectOptions {
  sourceId: string;
}

export interface AdapterStreamOptions {
  sourceId: string;
  cursor?: AdapterSyncCursor;
  signal?: AbortSignal;
}

export interface DeviceAdapter {
  descriptor(): AdapterDescriptor;
  discover(signal?: AbortSignal): AsyncIterable<DiscoveredSource>;
  connect(options: AdapterConnectOptions): Promise<void>;
  capabilities(sourceId: string): Promise<AdapterCapabilities>;
  stream(options: AdapterStreamOptions): AsyncIterable<AdapterStreamItem>;
  quality(item: AdapterStreamItem): DataQuality;
  normalize(item: AdapterStreamItem, context: AdapterNormalizationContext): CanonicalObservationDraft | RawSignalChunk;
  disconnect(sourceId: string): Promise<void>;
  syncCursor(sourceId: string): Promise<AdapterSyncCursor | undefined>;
  health(sourceId?: string): Promise<AdapterHealth>;
}

export interface AdapterNormalizationContext {
  missionId: string;
  crewMemberId: string;
  classification: CanonicalObservationDraft["classification"];
  ingestionId: string;
}

export function sourceRefFromAdapter(descriptor: AdapterDescriptor, source: DiscoveredSource): SourceRef {
  return {
    sourceId: source.sourceId,
    sourceType: source.transport === "mqtt" || source.transport === "websocket" ? "environment" : "device",
    ...(source.manufacturer ? { manufacturer: source.manufacturer } : {}),
    ...(source.model ? { model: source.model } : {}),
    adapterId: descriptor.id,
    adapterVersion: descriptor.version,
  };
}
