/**
 * v9 cloud review sync — pure payload, merge and status logic.
 *
 * Only approved review-event METADATA and required identifiers are ever sent:
 * attestation/revocation events and correction audit intents. Never measured
 * values, units, source documents/bytes, excerpts, AI drafts or secrets.
 * The server (pending migration) is the authority for actor, role and scope;
 * these helpers only shape data and merge results deterministically.
 */
import {
  EVIDENCE_ATTESTATION_SCHEMA,
  scopedAttestationEvents,
  type AttestationEvent,
} from "./evidence-attestation";
import type { UnifiedObservation } from "./observation-envelope";
import type { ReportScope } from "./unified-health-report";
import type { RemoteCorrectionIntent, SyncReceipt } from "./review-ledger";

export const REVIEW_SYNC_MIGRATION_REQUIRED = "Cloud review sync unavailable: migration required";
export const REVIEW_SYNC_BATCH_MAX = 500;

export interface AttestationSyncPayload {
  eventId: string;
  action: "attest" | "revoke";
  recordId: string;
  recordFingerprint: string;
  metricId: string;
  badge: string;
  actorUserId: string;
  reason: string;
  decidedAt: string;
  batchId: string;
  supersedesEventId: string | null;
}

export interface CorrectionSyncPayload {
  intentId: string;
  originalRecordId: string;
  correctedRecordId: string;
  metricId: string;
  actorUserId: string;
  reason: string;
  decidedAt: string;
}

/** Explicit allow-list projection: anything not listed is never sent. */
export function attestationSyncPayload(e: AttestationEvent): AttestationSyncPayload {
  return {
    eventId: e.eventId,
    action: e.action,
    recordId: e.recordId,
    recordFingerprint: e.recordFingerprint,
    metricId: e.metricId,
    badge: e.badge,
    actorUserId: e.actorUserId,
    reason: e.reason,
    decidedAt: e.decidedAt,
    batchId: e.batchId,
    supersedesEventId: e.supersedesEventId,
  };
}

export function correctionSyncPayload(o: UnifiedObservation): CorrectionSyncPayload | null {
  if (!o.correction || !o.supersedesId) return null;
  return {
    intentId: o.correction.intentId,
    originalRecordId: o.correction.originalRecordId,
    correctedRecordId: o.id,
    metricId: o.metricId,
    actorUserId: o.correction.actorUserId,
    reason: o.correction.reason,
    decidedAt: o.correction.decidedAt,
  };
}

const canonical = (p: AttestationSyncPayload) =>
  JSON.stringify([p.eventId, p.action, p.recordId, p.recordFingerprint, p.metricId, p.badge, p.actorUserId, p.reason.trim(), new Date(p.decidedAt).toISOString(), p.batchId, p.supersedesEventId]);

/** Rebuilds a full attestation event from a server row; rejects anything malformed or out of scope. */
export function remoteRowToAttestation(row: Record<string, unknown>, scope: ReportScope): AttestationEvent | null {
  const s = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : null);
  const action = s("action");
  if (action !== "attest" && action !== "revoke") return null;
  const candidate = {
    schema: EVIDENCE_ATTESTATION_SCHEMA,
    eventId: s("event_id"),
    action,
    recordId: s("record_id"),
    recordFingerprint: s("record_fingerprint"),
    metricId: s("metric_id"),
    badge: s("badge"),
    scope: { missionId: s("mission_id"), crewMemberId: s("crew_member_id"), provenance: s("provenance") },
    actorUserId: s("actor_user_id"),
    actorRole: "ground_medical",
    reason: s("reason"),
    confirmed: true,
    decidedAt: s("decided_at") ? new Date(s("decided_at")!).toISOString() : null,
    batchId: s("batch_id"),
    supersedesEventId: s("supersedes_event_id"),
    scientificCatalogStatus: "unchanged",
    catalogApprovalOverride: false,
  };
  if (!candidate.metricId || !candidate.badge || !candidate.batchId) return null;
  return scopedAttestationEvents([candidate], scope)[0] ?? null;
}

export function remoteRowToCorrection(row: Record<string, unknown>, scope: ReportScope): RemoteCorrectionIntent | null {
  const s = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : null);
  if (s("mission_id") !== scope.missionId || s("crew_member_id") !== scope.crewMemberId || s("provenance") !== scope.provenance) return null;
  const intentId = s("intent_id"), originalRecordId = s("original_record_id"), correctedRecordId = s("corrected_record_id");
  const actorUserId = s("actor_user_id"), reason = s("reason"), decidedAt = s("decided_at"), metricId = s("metric_id");
  if (!intentId || !originalRecordId || !correctedRecordId || !actorUserId || !reason || !decidedAt || !metricId) return null;
  return { intentId, originalRecordId, correctedRecordId, metricId, actorUserId, reason, decidedAt, serverReceivedAt: s("received_at") ?? decidedAt };
}

export interface MergeResult {
  /** Union by stable event ID; local wins on conflict (never silently replaced). */
  events: AttestationEvent[];
  /** Remote-only events that must be appended locally. */
  imported: AttestationEvent[];
  conflicts: { eventId: string; detail: string }[];
}

/**
 * Deterministic append-only merge. Absence from a (possibly limited) remote
 * page is never treated as deletion: local events are always kept.
 */
export function mergeAttestationEvents(local: readonly AttestationEvent[], remote: readonly AttestationEvent[]): MergeResult {
  const byId = new Map(local.map((e) => [e.eventId, e]));
  const imported: AttestationEvent[] = [];
  const conflicts: { eventId: string; detail: string }[] = [];
  for (const r of remote) {
    const l = byId.get(r.eventId);
    if (!l) {
      byId.set(r.eventId, r);
      imported.push(r);
    } else if (canonical(attestationSyncPayload(l)) !== canonical(attestationSyncPayload(r))) {
      conflicts.push({ eventId: r.eventId, detail: "Cloud event with the same ID has different content; local event kept." });
    }
  }
  const events = [...byId.values()].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt) || a.eventId.localeCompare(b.eventId));
  return { events, imported, conflicts };
}

export type ServerItemStatus = "inserted" | "duplicate" | "conflict" | "rejected";
export interface ServerItemResult {
  kind: "attestation" | "correction";
  id: string;
  status: ServerItemStatus;
  receivedAt: string | null;
  detail: string | null;
}

/** Receipts are only produced for server-confirmed outcomes; rejected items stay pending/failed. */
export function receiptsFromServer(results: readonly ServerItemResult[], recordedAt: string): SyncReceipt[] {
  return results
    .filter((r) => r.status !== "rejected")
    .map((r) => ({
      kind: r.kind,
      eventId: r.id,
      status: r.status === "conflict" ? ("conflict" as const) : ("synced" as const),
      serverReceivedAt: r.receivedAt,
      recordedAt,
      ...(r.detail ? { detail: r.detail } : {}),
    }));
}

export interface SyncCounts {
  pending: number;
  synced: number;
  failed: number;
  conflict: number;
  /** Local events authored by another reviewer on this device; only their author can push them. */
  otherAuthor: number;
  lastSyncedAt: string | null;
}

export function syncCounts(
  localAttestations: readonly AttestationEvent[],
  localCorrections: readonly CorrectionSyncPayload[],
  receipts: readonly SyncReceipt[],
  failedIds: ReadonlySet<string>,
  actorUserId: string | null,
): SyncCounts {
  const receiptFor = new Map(receipts.map((r) => [`${r.kind}:${r.eventId}`, r]));
  const c: SyncCounts = { pending: 0, synced: 0, failed: 0, conflict: 0, otherAuthor: 0, lastSyncedAt: null };
  const items = [
    ...localAttestations.map((e) => ({ key: `attestation:${e.eventId}`, id: e.eventId, actor: e.actorUserId })),
    ...localCorrections.map((p) => ({ key: `correction:${p.intentId}`, id: p.intentId, actor: p.actorUserId })),
  ];
  for (const item of items) {
    const r = receiptFor.get(item.key);
    if (r?.status === "conflict") c.conflict++;
    else if (r) c.synced++;
    else if (failedIds.has(item.id)) c.failed++;
    else if (actorUserId && item.actor !== actorUserId) c.otherAuthor++;
    else c.pending++;
  }
  for (const r of receipts) if (!c.lastSyncedAt || r.recordedAt > c.lastSyncedAt) c.lastSyncedAt = r.recordedAt;
  return c;
}

/** Items the current reviewer may push: own events, not yet receipted. */
export function pendingForPush(
  localAttestations: readonly AttestationEvent[],
  localCorrections: readonly CorrectionSyncPayload[],
  receipts: readonly SyncReceipt[],
  actorUserId: string,
) {
  const done = new Set(receipts.map((r) => `${r.kind}:${r.eventId}`));
  // Revocations must reach the server after the attestation they supersede.
  const attestations = [...localAttestations]
    .filter((e) => e.actorUserId === actorUserId && !done.has(`attestation:${e.eventId}`))
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt) || (a.action === b.action ? a.eventId.localeCompare(b.eventId) : a.action === "attest" ? -1 : 1))
    .map(attestationSyncPayload)
    .slice(0, REVIEW_SYNC_BATCH_MAX);
  const corrections = localCorrections
    .filter((p) => p.actorUserId === actorUserId && !done.has(`correction:${p.intentId}`))
    .slice(0, REVIEW_SYNC_BATCH_MAX);
  return { attestations, corrections };
}
