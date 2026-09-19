import type {
  AdapterDescriptor,
  AdapterHealth,
  AdapterNormalizationContext,
  AdapterPacket,
  AdapterStreamItem,
  AdapterSyncCursor,
  DiscoveredSource,
} from "../device-adapters";
import type {
  CanonicalObservationDraft,
  DataQuality,
  SourceRef,
} from "../../domain";

export const GOOD_TELEMETRY_QUALITY: DataQuality = {
  level: "good",
  score: 1,
  artifactFlags: [],
};

export function environmentSourceRef(
  descriptor: AdapterDescriptor,
  source: DiscoveredSource,
): SourceRef {
  return {
    sourceId: source.sourceId,
    sourceType: "environment",
    ...(source.manufacturer ? { manufacturer: source.manufacturer } : {}),
    ...(source.model ? { model: source.model } : {}),
    adapterId: descriptor.id,
    adapterVersion: descriptor.version,
  };
}

export function telemetryObservationDraft(
  descriptor: AdapterDescriptor,
  source: DiscoveredSource,
  item: AdapterStreamItem,
  context: AdapterNormalizationContext,
  tags: string[],
  sourceType: "environment" | "device",
): CanonicalObservationDraft {
  if (item.kind !== "observation") {
    throw new Error("Environmental telemetry scalar adapter received series data");
  }

  const sourceRef: SourceRef =
    sourceType === "environment"
      ? environmentSourceRef(descriptor, source)
      : {
          sourceId: source.sourceId,
          sourceType: "device",
          ...(source.manufacturer ? { manufacturer: source.manufacturer } : {}),
          ...(source.model ? { model: source.model } : {}),
          adapterId: descriptor.id,
          adapterVersion: descriptor.version,
        };

  return {
    id: item.packet.packetId,
    mission: {
      missionId: context.missionId,
      crewMemberId: context.crewMemberId,
    },
    source: sourceRef,
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

export function telemetryCursor(
  sourceId: string,
  packet: AdapterPacket,
): AdapterSyncCursor | undefined {
  return packet.cursor
    ? {
        sourceId,
        value: packet.cursor,
        capturedAt: packet.clock.receivedAt,
      }
    : undefined;
}

export function telemetryHealth(
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
