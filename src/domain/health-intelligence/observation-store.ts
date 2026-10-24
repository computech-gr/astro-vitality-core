/**
 * Unified observation storage: encrypted, append-only, offline-first.
 * Corrections append a new event (erroneous status or a superseding entry);
 * stored events are never rewritten or deleted. No automatic cloud upload.
 */
import { getOfflineMissionStore, persistOfflineMissionEvent } from "@/infrastructure/offline";
import {
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
 * identical id therefore cannot duplicate a record.
 */
export function collapseUnifiedObservationVersions(
  versions: Array<{ observation: UnifiedObservation; storedAt: string }>,
): UnifiedObservation[] {
  const latest = new Map<string, { observation: UnifiedObservation; storedAt: string }>();
  for (const version of versions) {
    const previous = latest.get(version.observation.id);
    if (!previous || previous.storedAt <= version.storedAt) latest.set(version.observation.id, version);
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

/** Mission- and crew-scoped read; cross-mission data is never returned. */
export async function listUnifiedObservations(
  missionId: string,
  crewMemberId: string,
): Promise<UnifiedObservation[]> {
  const records = await getOfflineMissionStore().list(1000);
  const versions = records
    .filter(
      (record) =>
        record.sourceId === SOURCE &&
        record.mission.missionId === missionId &&
        record.mission.crewMemberId === crewMemberId,
    )
    .map((record) => {
      const payload = record.payload as { observation?: UnifiedObservation } | null;
      return payload?.observation
        ? { observation: payload.observation, storedAt: record.createdAt }
        : null;
    })
    .filter((version): version is { observation: UnifiedObservation; storedAt: string } =>
      Boolean(version && !validateUnifiedObservation(version.observation)),
    );
  return collapseUnifiedObservationVersions(versions).sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
}

/** Domain read-model view: reviewer-accepted, non-erroneous observations only. */
export function domainReadableObservations(
  observations: readonly UnifiedObservation[],
): UnifiedObservation[] {
  return observations.filter(isDomainReadable);
}
