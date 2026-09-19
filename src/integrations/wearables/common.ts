import type {
  AdapterDescriptor,
  AdapterHealth,
  AdapterNormalizationContext,
  AdapterPacket,
  AdapterStreamItem,
  AdapterSyncCursor,
  DiscoveredSource,
} from "../device-adapters";
import { sourceRefFromAdapter } from "../device-adapters";
import type { CanonicalObservationDraft, DataQuality } from "../../domain";

export const GOOD_WEARABLE_QUALITY: DataQuality = {
  level: "good",
  score: 1,
  artifactFlags: [],
};

export function wearableObservationDraft(
  descriptor: AdapterDescriptor,
  source: DiscoveredSource,
  item: AdapterStreamItem,
  context: AdapterNormalizationContext,
  tags: string[],
): CanonicalObservationDraft {
  if (item.kind !== "observation") throw new Error("Wearable scalar adapter received series data");
  return {
    id: item.packet.packetId,
    mission: { missionId: context.missionId, crewMemberId: context.crewMemberId },
    source: sourceRefFromAdapter(descriptor, source),
    metricCode: item.packet.metricCode,
    value: item.packet.value,
    ...(item.packet.unit ? { unit: item.packet.unit } : {}),
    observedAt: item.packet.observedAt,
    status: "final",
    quality: item.packet.quality,
    provenance: {
      kind: "raw",
      capturedAt: item.packet.clock.receivedAt,
      ingestionId: context.ingestionId,
      inputObservationIds: [],
    },
    classification: context.classification,
    tags,
    context: item.packet.context ?? { tags: [] },
  };
}

export function packetCursor(sourceId: string, packet: AdapterPacket): AdapterSyncCursor | undefined {
  return packet.cursor
    ? { sourceId, value: packet.cursor, capturedAt: packet.clock.receivedAt }
    : undefined;
}

export function adapterHealth(
  descriptor: AdapterDescriptor,
  connected: boolean,
  checkedAt: string,
  sourceId?: string,
  lastDataAt?: string,
  message?: string,
): AdapterHealth {
  return {
    adapterId: descriptor.id,
    ...(sourceId ? { sourceId } : {}),
    state: connected ? "connected" : "disconnected",
    checkedAt,
    ...(lastDataAt ? { lastDataAt } : {}),
    ...(message ? { message } : {}),
  };
}
