/**
 * Unified observation storage: encrypted, append-only, offline-first.
 * Corrections append a new event (erroneous status or a superseding entry);
 * stored events are never rewritten or deleted. No automatic cloud upload.
 */
import { getOfflineMissionStore, persistOfflineMissionEvent, type OfflineMissionStore } from "@/infrastructure/offline";
import {
  canonicalJson,
  isDomainReadable,
  validateUnifiedObservation,
  type UnifiedObservation,
} from "./observation-envelope";

const SOURCE = "unified-intake";
const SOURCE_VERSION = "1.0";

/** Same metric, instant and value — a warning only, never a silent rejection. */
export function findUnifiedDuplicates(
  history: readonly UnifiedObservation[],
  draft: Pick<UnifiedObservation, "metricId" | "observedAt" | "value">,
): UnifiedObservation[] {
  return history.filter(
    (entry) =>
      entry.status !== "erroneous" &&
      entry.metricId === draft.metricId &&
      entry.observedAt === draft.observedAt &&
      entry.value.trim() === draft.value.trim(),
  );
}

/**
 * Append-only version collapse: several stored events may carry the same
 * observation id (an entry plus a later status correction). The newest stored
 * version wins; earlier versions are never rewritten or deleted. Replaying an
 * identical id therefore cannot duplicate a record. An erroneous status is
 * terminal: once present it is never hidden by an entry version, even when a
 * cross-device import stored the entry later than the status (v9.4).
 */
export function collapseUnifiedObservationVersions(
  versions: Array<{ observation: UnifiedObservation; storedAt: string }>,
): UnifiedObservation[] {
  const latest = new Map<string, { observation: UnifiedObservation; storedAt: string }>();
  for (const version of versions) {
    const previous = latest.get(version.observation.id);
    if (previous && previous.observation.status === "erroneous" && version.observation.status !== "erroneous") continue;
    if (
      !previous ||
      previous.storedAt <= version.storedAt ||
      (version.observation.status === "erroneous" && previous.observation.status !== "erroneous")
    )
      latest.set(version.observation.id, version);
  }
  return [...latest.values()].map((version) => version.observation);
}

export async function saveUnifiedObservation(observation: UnifiedObservation): Promise<void> {
  const issue = validateUnifiedObservation(observation);
  if (issue) throw new Error(issue);
  await persistOfflineMissionEvent({
    id: `unified-observation:${observation.id}:${observation.status === "erroneous" ? "status" : "entry"}`,
    kind: "observation",
    mission: { missionId: observation.missionId, crewMemberId: observation.crewMemberId },
    eventTimestamp: observation.observedAt,
    sourceId: SOURCE,
    sourceVersion: SOURCE_VERSION,
    classification: "medical_sensitive",
    payload: { schemaVersion: SOURCE_VERSION, observation },
  });
}

/**
 * Append-only correction: stores a new event marking the existing observation
 * as erroneous. The original event is never rewritten or deleted.
 */
export async function markUnifiedObservationErroneous(
  observation: UnifiedObservation,
  reason: string,
): Promise<void> {
  if (!reason.trim()) throw new Error("A short reason is required to mark a record as erroneous.");
  await saveUnifiedObservation({
    ...observation,
    status: "erroneous",
    statusReason: reason.trim().slice(0, 500),
  });
}

/** One stored append-only event (entry or status) for an observation. */
export interface UnifiedObservationEvent {
  /** `${observationId}:entry` or `${observationId}:status` — stable across devices. */
  eventId: string;
  eventKind: "entry" | "status";
  observation: UnifiedObservation;
  storedAt: string;
}

const LOCAL_PREFIX = "unified-observation:";

async function scopedEvents(
  missionId: string,
  crewMemberId: string,
  store: OfflineMissionStore,
): Promise<UnifiedObservationEvent[]> {
  // Read every stored record (not a bounded page) so sync and history never miss events.
  // Some injected test stores implement only list(); fall back to the historical 1000-record page.
  const total = typeof store.countRecords === "function" ? await store.countRecords() : 0;
  const records = await store.list(Math.max(1000, total));
  return records
    .filter(
      (record) =>
        record.sourceId === SOURCE &&
        record.mission.missionId === missionId &&
        record.mission.crewMemberId === crewMemberId &&
        record.id.startsWith(LOCAL_PREFIX),
    )
    .flatMap((record): UnifiedObservationEvent[] => {
      const payload = record.payload as { observation?: UnifiedObservation } | null;
      const observation = payload?.observation;
      if (!observation || validateUnifiedObservation(observation)) return [];
      const eventId = record.id.slice(LOCAL_PREFIX.length);
      const eventKind = eventId.endsWith(":status") ? "status" : eventId.endsWith(":entry") ? "entry" : null;
      if (!eventKind || eventId !== `${observation.id}:${eventKind}`) return [];
      return [{ eventId, eventKind, observation, storedAt: record.createdAt }];
    });
}

/** Every stored entry/status event for this mission + crew (sync and audit use). */
export async function listUnifiedObservationEvents(
  missionId: string,
  crewMemberId: string,
  store: OfflineMissionStore = getOfflineMissionStore(),
): Promise<UnifiedObservationEvent[]> {
  return scopedEvents(missionId, crewMemberId, store);
}

/** Mission- and crew-scoped read; cross-mission data is never returned. */
export async function listUnifiedObservations(
  missionId: string,
  crewMemberId: string,
  store: OfflineMissionStore = getOfflineMissionStore(),
): Promise<UnifiedObservation[]> {
  const events = await scopedEvents(missionId, crewMemberId, store);
  return collapseUnifiedObservationVersions(events).sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
}

/**
 * v9.4 cross-device import. Appends a cloud-received event to the encrypted
 * local store under its original stable ID. It is NOT queued for any upload
 * (imports never travel onward automatically). An existing ID is never
 * overwritten: identical content is a duplicate, different content a conflict.
 * Callers must have run checkRemoteObservationEvent (observation-sync.ts) first.
 */
export async function importUnifiedObservationEvent(
  event: { eventId: string; eventKind: "entry" | "status"; observation: UnifiedObservation },
  store: OfflineMissionStore = getOfflineMissionStore(),
): Promise<"inserted" | "duplicate" | "conflict"> {
  const issue = validateUnifiedObservation(event.observation);
  if (issue) throw new Error(issue);
  if (event.eventId !== `${event.observation.id}:${event.eventKind}`) throw new Error("Event ID does not match the observation.");
  if ((event.eventKind === "status") !== (event.observation.status === "erroneous"))
    throw new Error("Event kind does not match the observation status.");
  const id = `${LOCAL_PREFIX}${event.eventId}`;
  const existing = await store.get(id);
  const payload = { schemaVersion: SOURCE_VERSION, observation: event.observation };
  if (existing) {
    const existingObservation = (existing.payload as { observation?: UnifiedObservation } | null)?.observation;
    return existingObservation && canonicalJson(existingObservation) === canonicalJson(event.observation) ? "duplicate" : "conflict";
  }
  try {
    const result = await store.append({
      id,
      kind: "observation",
      mission: { missionId: event.observation.missionId, crewMemberId: event.observation.crewMemberId },
      eventTimestamp: event.observation.observedAt,
      createdAt: new Date().toISOString(),
      sourceId: SOURCE,
      sourceVersion: SOURCE_VERSION,
      sourcePriority: 50,
      classification: "medical_sensitive",
      payload,
    });
    return result.inserted ? "inserted" : "duplicate";
  } catch (error) {
    if (error instanceof Error && /already exists with different content/.test(error.message)) return "conflict";
    throw error;
  }
}

/**
 * Domain read-model view: reviewer-accepted, non-erroneous observations that
 * are not superseded by a non-erroneous correction. After an append-only
 * correction exactly one version (the latest) stays active in projections.
 */
export function domainReadableObservations(
  observations: readonly UnifiedObservation[],
): UnifiedObservation[] {
  const superseded = new Set(
    observations
      .filter((o) => o.supersedesId && o.status !== "erroneous" && isDomainReadable(o))
      .map((o) => o.supersedesId!),
  );
  return observations.filter((o) => isDomainReadable(o) && !superseded.has(o.id));
}
