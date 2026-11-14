/**
 * v9.4 cross-device observation sync — pure validation, planning, merge and
 * status logic shared by the browser and the authenticated server function.
 *
 * - The canonical observation envelope is transferred unchanged (value, unit,
 *   source metadata, timestamps, provenance, original IDs, correction metadata).
 *   Nothing is converted, re-interpreted, downgraded or overwritten.
 * - Events are identified by `${observationId}:entry|status`, the same stable
 *   IDs as the encrypted local store, so replays are idempotent duplicates and a
 *   different payload under the same ID is always a reported conflict.
 * - Importing an accepted observation is never a Ground Medical attestation and
 *   never a scientific approval; attestations stay in the review ledger and are
 *   bound to the record fingerprint (evidence-attestation.ts).
 */
import { classifyWithGovernedExtensions } from "./unknown-biomarker-review";
import type { EvaluatedDemoCatalog } from "./synthetic-demo-catalog";
import {
  canonicalJson,
  isUnifiedObservationSchema,
  validateUnifiedObservation,
  type UnifiedObservation,
} from "./observation-envelope";
import type { AttestationEvent } from "./evidence-attestation";

export const OBSERVATION_SYNC_BATCH_MAX = 50;
export const OBSERVATION_SYNC_PAGE_MAX = 100;
/**
 * Canonical observation JSON bound in UTF-8 bytes. Measured in bytes (not UTF-16 units) so that
 * Greek/non-Latin text cannot exceed the staged database ciphertext ceiling (24,000 base64 chars)
 * after the event wrapper, AES-GCM tag and base64 expansion.
 */
export const OBSERVATION_SYNC_PAYLOAD_MAX = 12_000;
export const OBSERVATION_SYNC_MIGRATION_REQUIRED =
  "Cloud observation sync unavailable: migration required";

export type SyncScope = {
  missionId: string;
  crewMemberId: string;
  provenance: "synthetic" | "real";
};

export interface ObservationSyncEvent {
  eventId: string;
  eventKind: "entry" | "status";
  observation: UnifiedObservation;
}

export type ObservationSyncErrorCode =
  "migration_required" | "forbidden" | "invalid" | "unavailable" | "disabled";

export function classifyObservationSyncError(code: string | undefined): ObservationSyncErrorCode {
  if (code === "PGRST202" || code === "PGRST205" || code === "42883" || code === "42P01")
    return "migration_required";
  if (code === "42501") return "forbidden";
  if (code === "22023" || code === "22P02") return "invalid";
  return "unavailable";
}

const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9-]{7,127}:(entry|status)$/;
/** Every canonical envelope field; the server-function input schema must accept exactly these (P62 parity test). */
export const OBSERVATION_SYNC_ALLOWED_FIELDS = [
  "schema",
  "id",
  "missionId",
  "crewMemberId",
  "metricId",
  "domain",
  "value",
  "originalUnit",
  "reportedUnit",
  "observedAt",
  "datePrecision",
  "collectionDate",
  "source",
  "provenance",
  "quality",
  "reviewState",
  "status",
  "statusReason",
  "supersedesId",
  "correction",
  "catalogBasis",
  "recordedAt",
] as const;
const ALLOWED_TOP = new Set<string>(OBSERVATION_SYNC_ALLOWED_FIELDS);
const ALLOWED_SOURCE = new Set(["kind", "label", "documentName", "documentSha256", "excerpt"]);
const ALLOWED_QUALITY = new Set(["reviewerConfirmed", "duplicateWarningAcknowledged"]);
const ALLOWED_CORRECTION = new Set([
  "intentId",
  "originalRecordId",
  "actorUserId",
  "actorRole",
  "reason",
  "decidedAt",
]);
const SOURCE_KINDS = new Set([
  "manual",
  "csv",
  "xlsx",
  "json",
  "fhir",
  "pdf_text",
  "ocr",
  "device",
  "self_assessment",
]);

const unknownKey = (obj: unknown, allowed: Set<string>) =>
  !!obj && typeof obj === "object" && Object.keys(obj as object).some((k) => !allowed.has(k));

/**
 * Full check of one event for exactly this scope. Used before upload (client
 * and server) and before any local import. Returns a reason or null.
 */
export function checkObservationSyncEvent(
  event: ObservationSyncEvent,
  scope: SyncScope,
  /** Server callers pass the caller-scoped mission demo catalog read from the database. */
  demoCatalogs?: ReadonlyMap<string, EvaluatedDemoCatalog>,
): string | null {
  const o = event?.observation as UnifiedObservation | undefined;
  if (!o || typeof o !== "object") return "Missing observation payload.";
  if (!EVENT_ID.test(event.eventId ?? "")) return "Invalid event ID.";
  if (event.eventKind !== "entry" && event.eventKind !== "status") return "Invalid event kind.";
  if (event.eventId !== `${o.id}:${event.eventKind}`)
    return "Event ID does not match the observation ID and kind.";
  if (
    unknownKey(o, ALLOWED_TOP) ||
    unknownKey(o.source, ALLOWED_SOURCE) ||
    unknownKey(o.quality, ALLOWED_QUALITY) ||
    unknownKey(o.correction, ALLOWED_CORRECTION)
  )
    return "Unexpected field in observation payload.";
  if (!isUnifiedObservationSchema(o.schema)) return "Unknown observation schema.";
  const issue = validateUnifiedObservation(o);
  if (issue) return issue;
  if (o.missionId !== scope.missionId || o.crewMemberId !== scope.crewMemberId)
    return "Observation belongs to another mission or crew member.";
  if (o.provenance !== scope.provenance)
    return `Observation provenance is ${o.provenance}, not ${scope.provenance}.`;
  if ((event.eventKind === "status") !== (o.status === "erroneous"))
    return "Event kind does not match the observation status.";
  if (
    !o.source ||
    !SOURCE_KINDS.has(o.source.kind) ||
    typeof o.source.label !== "string" ||
    !o.source.label.trim()
  )
    return "Source metadata is missing.";
  if (new TextEncoder().encode(canonicalJson(o)).length > OBSERVATION_SYNC_PAYLOAD_MAX)
    return "Observation payload is too large to sync.";
  if (
    o.correction &&
    (o.correction.actorRole !== "ground_medical" ||
      o.correction.originalRecordId !== o.supersedesId)
  )
    return "Correction metadata is inconsistent.";
  // Exact catalog metric + unit pair; units are never converted.
  const r = classifyWithGovernedExtensions(
    {
      label: o.metricId,
      unit: o.originalUnit,
      identity: "canonical",
      includeRevoked: true,
      missionId: o.missionId,
      provenance: o.provenance,
    },
    undefined,
    undefined,
    demoCatalogs,
  );
  const c = r.classification;
  if (o.catalogBasis && r.syntheticDemo?.termId !== o.catalogBasis.termId)
    return "The synthetic demo catalog basis does not match this mission's demo catalog.";
  if (c.status !== "matched" || c.metricId !== o.metricId || c.domain !== o.domain)
    return `"${o.metricId}" with unit "${o.originalUnit}" is not an exact catalog metric/unit pair. Units are never converted.`;
  return null;
}

export type ImportDecision =
  | { action: "import" }
  | { action: "duplicate" }
  | { action: "conflict"; detail: string }
  | { action: "rejected"; detail: string };

/** Decide what to do with one cloud event against the local events. Local conflicts are never overwritten. */
export function decideRemoteImport(
  remote: ObservationSyncEvent,
  localByEventId: ReadonlyMap<string, UnifiedObservation>,
  scope: SyncScope,
): ImportDecision {
  const issue = checkObservationSyncEvent(remote, scope);
  if (issue) return { action: "rejected", detail: issue };
  const local = localByEventId.get(remote.eventId);
  if (!local) return { action: "import" };
  return canonicalJson(local) === canonicalJson(remote.observation)
    ? { action: "duplicate" }
    : {
        action: "conflict",
        detail:
          "Cloud version differs from this device's version; the local version was kept unchanged.",
      };
}

export interface ObservationSyncReceipt {
  eventId: string;
  /** Local SHA-256 of the canonical observation JSON this receipt confirms. */
  contentSha256: string;
  status: "synced" | "conflict";
  direction: "uploaded" | "downloaded" | "already_in_cloud";
  serverFingerprint: string | null;
  serverReceivedAt: string | null;
  recordedAt: string;
  detail?: string;
}

export async function observationContentSha256(o: UnifiedObservation): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(o)),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Local events not yet confirmed by the cloud, in upload order: entries
 * before status marks, then by observation ID (deterministic). Events that
 * fail validation are returned separately and never sent.
 */
export async function planObservationPush(
  local: readonly ObservationSyncEvent[],
  receipts: readonly ObservationSyncReceipt[],
  scope: SyncScope,
): Promise<{
  send: ObservationSyncEvent[];
  invalid: { eventId: string; reason: string }[];
  remaining: number;
}> {
  const confirmed = new Map(receipts.map((r) => [r.eventId, r]));
  const send: ObservationSyncEvent[] = [];
  const invalid: { eventId: string; reason: string }[] = [];
  const ordered = [...local].sort((a, b) =>
    a.eventKind === b.eventKind
      ? a.eventId.localeCompare(b.eventId)
      : a.eventKind === "entry"
        ? -1
        : 1,
  );
  for (const e of ordered) {
    if (e.observation.provenance !== scope.provenance) continue;
    const r = confirmed.get(e.eventId);
    if (r && r.contentSha256 === (await observationContentSha256(e.observation))) continue;
    if (r?.status === "conflict") continue;
    const reason = checkObservationSyncEvent(e, scope);
    if (reason) invalid.push({ eventId: e.eventId, reason });
    else send.push(e);
  }
  return {
    send: send.slice(0, OBSERVATION_SYNC_BATCH_MAX),
    invalid,
    remaining: Math.max(0, send.length - OBSERVATION_SYNC_BATCH_MAX),
  };
}

export interface ObservationSyncCounts {
  local: number;
  pending: number;
  synced: number;
  failed: number;
  conflict: number;
  lastSyncedAt: string | null;
}

export async function observationSyncCounts(
  local: readonly ObservationSyncEvent[],
  receipts: readonly ObservationSyncReceipt[],
  failedIds: ReadonlySet<string>,
  scope: SyncScope,
): Promise<ObservationSyncCounts> {
  const byId = new Map(receipts.map((r) => [r.eventId, r]));
  const c: ObservationSyncCounts = {
    local: 0,
    pending: 0,
    synced: 0,
    failed: 0,
    conflict: 0,
    lastSyncedAt: null,
  };
  for (const e of local) {
    if (e.observation.provenance !== scope.provenance) continue;
    c.local++;
    const r = byId.get(e.eventId);
    if (r?.status === "conflict") c.conflict++;
    else if (r && r.contentSha256 === (await observationContentSha256(e.observation))) c.synced++;
    else if (failedIds.has(e.eventId)) c.failed++;
    else c.pending++;
  }
  for (const r of receipts)
    if (!c.lastSyncedAt || r.recordedAt > c.lastSyncedAt) c.lastSyncedAt = r.recordedAt;
  return c;
}

export interface ReviewReconciliation {
  /** Review events whose record exists locally. */
  matched: number;
  /** Review events for records absent on this device (shown as Not on this device, never Attested). */
  absentRecordIds: string[];
}

/** Attestations for records this device does not hold are reported, never displayed as Attested. */
export function reconcileReviewEvents(
  history: readonly UnifiedObservation[],
  events: readonly AttestationEvent[],
): ReviewReconciliation {
  const ids = new Set(history.map((o) => o.id));
  const absent = new Set<string>();
  let matched = 0;
  for (const e of events) {
    if (ids.has(e.recordId)) matched++;
    else absent.add(e.recordId);
  }
  return { matched, absentRecordIds: [...absent].sort() };
}
