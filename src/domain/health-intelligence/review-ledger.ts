/**
 * Durable review ledgers over the encrypted local review-ledger store.
 * Every write re-checks the actor's role for the exact scope; every read
 * re-validates schema and scope, so foreign or malformed entries never surface.
 * Local-only: nothing here uploads. Cloud review sync (review-sync.ts) is an
 * explicit, user-initiated action that reads from and appends to this ledger.
 */
import { getReviewLedgerStore, type ReviewLedgerStore } from "@/infrastructure/offline/review-ledger-store";
import {
  canAttestEvidence,
  scopedAttestationEvents,
  type AttestationEvent,
} from "./evidence-attestation";
import {
  canRecordReviewerDecision,
  REQUIRED_SCIENTIFIC_GATE,
  type ReviewerDecision,
  type ReviewScope,
  type UnknownBiomarkerTerm,
} from "./unknown-biomarker-review";
import type { ObservationSyncReceipt } from "./observation-sync";

export interface ActorContext {
  actorUserId: string | null | undefined;
  rolesForScope: readonly string[];
}

const sameScope = (a: ReviewScope, b: ReviewScope) =>
  a.missionId === b.missionId && a.crewMemberId === b.crewMemberId && a.provenance === b.provenance;

// ---------- Evidence attestation ----------

export async function appendAttestationEvents(
  events: readonly AttestationEvent[],
  scope: ReviewScope,
  actor: ActorContext,
  store: ReviewLedgerStore = getReviewLedgerStore(),
): Promise<{ inserted: number; duplicates: number; failed: { eventId: string; recordId: string; message: string }[] }> {
  if (!actor.actorUserId || !canAttestEvidence(actor.rolesForScope))
    throw new Error("Only an authenticated Ground Medical member for this mission and crew member can attest evidence.");
  const valid = scopedAttestationEvents(events, scope);
  if (valid.length !== events.length || events.some((e) => e.actorUserId !== actor.actorUserId))
    throw new Error("Attestation events do not match the authorized scope or reviewer. Nothing was saved.");
  let inserted = 0;
  let duplicates = 0;
  const failed: { eventId: string; recordId: string; message: string }[] = [];
  // Each event is appended independently so a partial failure is reported per record, never hidden.
  for (const e of valid) {
    try {
      const result = await store.append({
        id: `evidence-attestation:${e.eventId}`,
        ledger: "evidence-attestation",
        missionId: scope.missionId,
        crewMemberId: scope.crewMemberId,
        provenance: scope.provenance,
        actorUserId: e.actorUserId,
        createdAt: e.decidedAt,
        payload: e,
      });
      if (result === "inserted") inserted++;
      else duplicates++;
    } catch (error) {
      failed.push({ eventId: e.eventId, recordId: e.recordId, message: error instanceof Error ? error.message : "storage error" });
    }
  }
  return { inserted, duplicates, failed };
}

export async function listAttestationEvents(scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()): Promise<AttestationEvent[]> {
  const entries = await store.list({ ledger: "evidence-attestation", ...scope });
  return scopedAttestationEvents(
    entries.filter((e) => sameScope(e, scope)).map((e) => e.payload),
    scope,
  );
}

// ---------- Unknown Biomarker review requests and decisions ----------

export const UNKNOWN_BIOMARKER_REQUEST_SCHEMA = "mitochondria.unknown-biomarker-review-request.v1";

export interface PendingReviewRequest {
  schema: typeof UNKNOWN_BIOMARKER_REQUEST_SCHEMA;
  requestId: string;
  scope: ReviewScope;
  terms: UnknownBiomarkerTerm[];
  createdBy: string;
  createdByRole: "crew_self" | "ground_medical";
  createdAt: string;
  status: typeof REQUIRED_SCIENTIFIC_GATE;
  catalogChangeApplied: false;
}

function stableId(prefix: string, text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}-${hash.toString(16).padStart(8, "0")}`;
}

/** Deterministic: the same candidates for the same scope always produce the same request ID. */
export function reviewRequestIdFor(scope: ReviewScope, terms: readonly UnknownBiomarkerTerm[]): string {
  const keys = terms.flatMap((t) => t.observations.map((o) => `${t.termId}:${o.observationKey}`)).sort();
  return stableId("ubr", JSON.stringify([scope.missionId, scope.crewMemberId, scope.provenance, keys]));
}

export function canSubmitReviewRequest(rolesForScope: readonly string[]): "crew_self" | "ground_medical" | null {
  if (rolesForScope.includes("ground_medical")) return "ground_medical";
  if (rolesForScope.includes("crew_self")) return "crew_self";
  return null;
}

export async function savePendingReviewRequest(
  scope: ReviewScope,
  terms: readonly UnknownBiomarkerTerm[],
  actor: ActorContext,
  createdAt: string,
  store: ReviewLedgerStore = getReviewLedgerStore(),
): Promise<{ request: PendingReviewRequest; result: "inserted" | "duplicate" }> {
  const role = canSubmitReviewRequest(actor.rolesForScope);
  if (!actor.actorUserId || !role) throw new Error("Only the crew member or Ground Medical for this exact scope can register a review request.");
  if (!terms.length) throw new Error("There are no review-only candidates to register.");
  const request: PendingReviewRequest = {
    schema: UNKNOWN_BIOMARKER_REQUEST_SCHEMA,
    requestId: reviewRequestIdFor(scope, terms),
    scope: { ...scope },
    terms: terms.map((t) => ({ ...t })),
    createdBy: actor.actorUserId,
    createdByRole: role,
    createdAt: new Date(createdAt).toISOString(),
    status: REQUIRED_SCIENTIFIC_GATE,
    catalogChangeApplied: false,
  };
  const result = await store.append({
    id: `unknown-biomarker-request:${request.requestId}`,
    ledger: "unknown-biomarker-request",
    ...scope,
    actorUserId: actor.actorUserId,
    createdAt: request.createdAt,
    payload: request,
  });
  return { request, result };
}

export async function appendReviewerDecision(
  decision: ReviewerDecision,
  actor: ActorContext,
  store: ReviewLedgerStore = getReviewLedgerStore(),
): Promise<"inserted" | "duplicate"> {
  if (!actor.actorUserId || !canRecordReviewerDecision(actor.rolesForScope) || decision.reviewerUserId !== actor.actorUserId)
    throw new Error("Only the authenticated Ground Medical reviewer for this scope can record decisions.");
  if (decision.scientificStatus !== REQUIRED_SCIENTIFIC_GATE || decision.catalogChangeApplied !== false)
    throw new Error("Reviewer decisions can never approve or apply catalog changes.");
  return store.append({
    id: `unknown-biomarker-decision:${decision.decisionId}`,
    ledger: "unknown-biomarker-decision",
    ...decision.scope,
    actorUserId: actor.actorUserId,
    createdAt: decision.decidedAt,
    payload: decision,
  });
}

const isRequest = (x: unknown, scope: ReviewScope): x is PendingReviewRequest => {
  const r = x as Partial<PendingReviewRequest> | null;
  return !!r && r.schema === UNKNOWN_BIOMARKER_REQUEST_SCHEMA && typeof r.requestId === "string" && !!r.scope && sameScope(r.scope, scope) &&
    Array.isArray(r.terms) && r.status === REQUIRED_SCIENTIFIC_GATE && r.catalogChangeApplied === false;
};
const isDecision = (x: unknown, scope: ReviewScope): x is ReviewerDecision => {
  const d = x as Partial<ReviewerDecision> | null;
  return !!d && typeof d.decisionId === "string" && typeof d.termId === "string" && d.reviewerRole === "ground_medical" &&
    d.scientificStatus === REQUIRED_SCIENTIFIC_GATE && d.catalogChangeApplied === false && !!d.scope && sameScope(d.scope, scope) &&
    Number.isFinite(Date.parse(d.decidedAt ?? ""));
};

export async function listUnknownBiomarkerReviewState(scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()) {
  const [requests, decisions] = await Promise.all([
    store.list({ ledger: "unknown-biomarker-request", ...scope }),
    store.list({ ledger: "unknown-biomarker-decision", ...scope }),
  ]);
  return {
    requests: requests.map((e) => e.payload).filter((p) => isRequest(p, scope)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    decisions: decisions
      .map((e) => e.payload)
      .filter((p) => isDecision(p, scope))
      .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt) || a.sequence - b.sequence),
  };
}

// ---------- v9 cloud review sync (local side) ----------

export interface SyncReceipt {
  kind: "attestation" | "correction";
  eventId: string;
  status: "synced" | "conflict";
  serverReceivedAt: string | null;
  recordedAt: string;
  detail?: string;
}

const isReceipt = (x: unknown): x is SyncReceipt => {
  const r = x as Partial<SyncReceipt> | null;
  return !!r && (r.kind === "attestation" || r.kind === "correction") && typeof r.eventId === "string" && (r.status === "synced" || r.status === "conflict") && typeof r.recordedAt === "string";
};

/** Append-only receipts; a conflict receipt is permanent and never overwritten by a later success. */
export async function appendSyncReceipts(receipts: readonly SyncReceipt[], scope: ReviewScope, actorUserId: string, store: ReviewLedgerStore = getReviewLedgerStore()) {
  let inserted = 0;
  for (const r of receipts) {
    if (!isReceipt(r)) continue;
    const result = await store.append({
      id: `review-sync-receipt:${r.kind}:${r.eventId}`,
      ledger: "review-sync-receipt",
      ...scope,
      actorUserId,
      createdAt: r.recordedAt,
      payload: r,
    });
    if (result === "inserted") inserted++;
  }
  return inserted;
}

export async function listSyncReceipts(scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()): Promise<SyncReceipt[]> {
  const entries = await store.list({ ledger: "review-sync-receipt", ...scope });
  return entries.filter((e) => sameScope(e, scope)).map((e) => e.payload).filter(isReceipt);
}

/**
 * Remote attestation events were authorized by the server (auth.uid() actor,
 * exact mission/crew Ground Medical membership); locally they are re-validated
 * for schema and scope and appended under the same entry ID, so an event
 * already known locally is an idempotent duplicate, never a second attestation.
 */
export async function importRemoteAttestationEvents(events: readonly AttestationEvent[], scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()) {
  const valid = scopedAttestationEvents(events, scope);
  let inserted = 0;
  for (const e of valid) {
    const result = await store.append({
      id: `evidence-attestation:${e.eventId}`,
      ledger: "evidence-attestation",
      ...scope,
      actorUserId: e.actorUserId,
      createdAt: e.decidedAt,
      payload: e,
    });
    if (result === "inserted") inserted++;
  }
  return { inserted, rejected: events.length - valid.length };
}

export interface RemoteCorrectionIntent {
  intentId: string;
  originalRecordId: string;
  correctedRecordId: string;
  metricId: string;
  actorUserId: string;
  reason: string;
  decidedAt: string;
  serverReceivedAt: string;
}

const isRemoteIntent = (x: unknown): x is RemoteCorrectionIntent => {
  const r = x as Partial<RemoteCorrectionIntent> | null;
  return !!r && typeof r.intentId === "string" && typeof r.originalRecordId === "string" && typeof r.correctedRecordId === "string" && typeof r.actorUserId === "string";
};

export async function importRemoteCorrectionIntents(intents: readonly RemoteCorrectionIntent[], scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()) {
  let inserted = 0;
  for (const i of intents) {
    if (!isRemoteIntent(i)) continue;
    const result = await store.append({
      id: `remote-correction-intent:${i.intentId}`,
      ledger: "remote-correction-intent",
      ...scope,
      actorUserId: i.actorUserId,
      createdAt: i.decidedAt,
      payload: i,
    });
    if (result === "inserted") inserted++;
  }
  return inserted;
}

export async function listRemoteCorrectionIntents(scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()): Promise<RemoteCorrectionIntent[]> {
  const entries = await store.list({ ledger: "remote-correction-intent", ...scope });
  return entries.filter((e) => sameScope(e, scope)).map((e) => e.payload).filter(isRemoteIntent);
}

// ---------- v9.4 observation sync receipts and sync-run log ----------

const isObservationReceipt = (x: unknown): x is ObservationSyncReceipt => {
  const r = x as Partial<ObservationSyncReceipt> | null;
  return (
    !!r &&
    typeof r.eventId === "string" &&
    typeof r.contentSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(r.contentSha256) &&
    (r.status === "synced" || r.status === "conflict") &&
    (r.direction === "uploaded" || r.direction === "downloaded" || r.direction === "already_in_cloud") &&
    typeof r.recordedAt === "string"
  );
};

/** Append-only; the first receipt for an event wins (a conflict is never later replaced by "synced"). */
export async function appendObservationSyncReceipts(receipts: readonly ObservationSyncReceipt[], scope: ReviewScope, actorUserId: string, store: ReviewLedgerStore = getReviewLedgerStore()) {
  let inserted = 0;
  for (const r of receipts) {
    if (!isObservationReceipt(r)) continue;
    const result = await store.append({
      id: `observation-sync-receipt:${r.eventId}`,
      ledger: "observation-sync-receipt",
      ...scope,
      actorUserId,
      createdAt: r.recordedAt,
      payload: r,
    });
    if (result === "inserted") inserted++;
  }
  return inserted;
}

export async function listObservationSyncReceipts(scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()): Promise<ObservationSyncReceipt[]> {
  const entries = await store.list({ ledger: "observation-sync-receipt", ...scope });
  return entries.filter((e) => sameScope(e, scope)).map((e) => e.payload).filter(isObservationReceipt);
}

export interface SyncRunRecord {
  at: string;
  actorUserId: string;
  observations: { status: string; message: string };
  reviews: { status: string; message: string };
}

const isSyncRun = (x: unknown): x is SyncRunRecord => {
  const r = x as Partial<SyncRunRecord> | null;
  return !!r && typeof r.at === "string" && typeof r.actorUserId === "string" && !!r.observations && !!r.reviews;
};

export async function appendSyncRun(run: SyncRunRecord, scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()) {
  return store.append({ id: `sync-run:${run.actorUserId}:${run.at}`, ledger: "sync-run", ...scope, actorUserId: run.actorUserId, createdAt: run.at, payload: run });
}

export async function listSyncRuns(scope: ReviewScope, store: ReviewLedgerStore = getReviewLedgerStore()): Promise<SyncRunRecord[]> {
  const entries = await store.list({ ledger: "sync-run", ...scope });
  return entries
    .filter((e) => sameScope(e, scope))
    .map((e) => e.payload)
    .filter(isSyncRun)
    .sort((a, b) => a.at.localeCompare(b.at));
}
