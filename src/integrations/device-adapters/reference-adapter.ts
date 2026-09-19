import type { CanonicalObservationDraft, RawSignalChunk } from "../../domain";
import type {
  AdapterCapabilities,
  AdapterConnectOptions,
  AdapterDescriptor,
  AdapterHealth,
  AdapterNormalizationContext,
  AdapterStreamItem,
  AdapterStreamOptions,
  AdapterSyncCursor,
  DeviceAdapter,
  DiscoveredSource,
} from "./contracts";
import { sourceRefFromAdapter } from "./contracts";

const SOURCE: DiscoveredSource = { sourceId: "reference-device-001", displayName: "Reference SDK Device", transport: "synthetic", manufacturer: "Mitochondria", model: "SDK fixture" };

/** Test/reference implementation only. It is not a product simulator or a claim of real hardware support. */
export class ReferenceDeviceAdapter implements DeviceAdapter {
  private connected = false;
  private cursor?: AdapterSyncCursor;

  descriptor(): AdapterDescriptor {
    return { id: "org.mitochondria.reference", version: "1.0.0", displayName: "Reference Device Adapter", transport: "synthetic" };
  }

  async *discover(): AsyncIterable<DiscoveredSource> { yield SOURCE; }

  async connect(options: AdapterConnectOptions): Promise<void> {
    if (options.sourceId !== SOURCE.sourceId) throw new Error("Unknown reference source");
    this.connected = true;
  }

  async capabilities(sourceId: string): Promise<AdapterCapabilities> {
    if (sourceId !== SOURCE.sourceId) throw new Error("Unknown reference source");
    return {
      sourceId,
      metrics: [
        { metricCode: "phys.heart_rate", modes: ["stream", "history"], sourceUnit: "bpm" },
        { metricCode: "phys.ecg_waveform", modes: ["series"], sourceUnit: "mV", samplingRateHz: 250, channels: ["lead-I"] },
      ],
      supportsResumeCursor: true,
      supportsClockMetadata: true,
    };
  }

  async *stream(options: AdapterStreamOptions): AsyncIterable<AdapterStreamItem> {
    if (!this.connected || options.sourceId !== SOURCE.sourceId) throw new Error("Reference source is not connected");
    const item: AdapterStreamItem = {
      kind: "observation",
      packet: {
        packetId: "reference-packet-001",
        sourceId: SOURCE.sourceId,
        metricCode: "phys.heart_rate",
        observedAt: "2026-09-19T12:00:00Z",
        value: { number: 72 },
        unit: "bpm",
        quality: { level: "good", score: 1, artifactFlags: [] },
        clock: { sourceTimestamp: "2026-09-19T12:00:00Z", receivedAt: "2026-09-19T12:00:00.050Z", clockOffsetMs: 50, clockUncertaintyMs: 10 },
        cursor: "cursor-001",
      },
    };
    this.cursor = { sourceId: SOURCE.sourceId, value: "cursor-001", capturedAt: "2026-09-19T12:00:00.050Z" };
    yield item;
  }

  quality(item: AdapterStreamItem) { return item.packet.quality; }

  normalize(item: AdapterStreamItem, context: AdapterNormalizationContext): CanonicalObservationDraft | RawSignalChunk {
    const source = sourceRefFromAdapter(this.descriptor(), SOURCE);
    const common = {
      id: item.packet.packetId,
      mission: { missionId: context.missionId, crewMemberId: context.crewMemberId },
      source,
      metricCode: item.packet.metricCode,
      quality: item.packet.quality,
      provenance: { kind: "raw" as const, capturedAt: item.packet.clock.receivedAt, ingestionId: context.ingestionId, inputObservationIds: [] },
      classification: context.classification,
      context: item.packet.context ?? { tags: [] },
    };
    if (item.kind === "series") {
      return { ...common, startedAt: item.packet.startedAt, endedAt: item.packet.endedAt, samplingRateHz: item.packet.samplingRateHz, channelNames: item.packet.channelNames, unit: item.packet.unit, samples: item.packet.samples };
    }
    return { ...common, value: item.packet.value, ...(item.packet.unit ? { unit: item.packet.unit } : {}), observedAt: item.packet.observedAt, status: "final", tags: ["adapter:reference"] };
  }

  async disconnect(sourceId: string): Promise<void> { if (sourceId === SOURCE.sourceId) this.connected = false; }
  async syncCursor(sourceId: string): Promise<AdapterSyncCursor | undefined> { return sourceId === SOURCE.sourceId ? this.cursor : undefined; }
  async health(sourceId?: string): Promise<AdapterHealth> {
    return { adapterId: this.descriptor().id, ...(sourceId ? { sourceId } : {}), state: this.connected ? "connected" : "disconnected", checkedAt: "2026-09-19T12:00:01Z", ...(this.cursor ? { lastDataAt: this.cursor.capturedAt } : {}) };
  }
}
