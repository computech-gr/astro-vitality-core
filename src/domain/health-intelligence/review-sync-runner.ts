/**
 * v9 review-metadata sync run, extracted unchanged in semantics from the
 * Stored Observations panel so the combined v9.4 "Sync observations &
 * reviews" action can run it after the observation step and so it is
 * testable without a DOM. Metadata only (review-sync.ts allow-lists).
 */
import type { UnifiedObservation } from "./observation-envelope";
import {
  appendSyncReceipts,
  importRemoteAttestationEvents,
  importRemoteCorrectionIntents,
  listAttestationEvents,
  listSyncReceipts,
} from "./review-ledger";
import {
  correctionSyncPayload,
  mergeAttestationEvents,
  pendingForPush,
  receiptsFromServer,
  remoteRowToAttestation,
  remoteRowToCorrection,
  REVIEW_SYNC_MIGRATION_REQUIRED,
  type AttestationSyncPayload,
  type CorrectionSyncPayload,
  type ReviewSyncErrorCode,
  type ServerItemResult,
} from "./review-sync";
import { getReviewLedgerStore, type ReviewLedgerStore } from "@/infrastructure/offline/review-ledger-store";
import type { SyncScope } from "./observation-sync";

type Failure = { ok: false; code: ReviewSyncErrorCode; message: string };
export interface ReviewSyncRunDeps {
  push: (a: { scope: SyncScope; attestations: AttestationSyncPayload[]; corrections: CorrectionSyncPayload[] }) => Promise<{ ok: true; results: ServerItemResult[] } | Failure>;
  pull: (a: { scope: SyncScope; kind: "attestation" | "correction"; afterSeq: number; limit: number }) => Promise<{ ok: true; rows: Record<string, string | number | null>[]; lastSeq: number; hasMore: boolean } | Failure>;
  store?: ReviewLedgerStore;
  now: () => string;
}

export interface ReviewSyncRunResult {
  status: "ok" | "partial" | "failed";
  code: ReviewSyncErrorCode | null;
  message: string;
  imported: number;
  conflicts: number;
  failedIds: string[];
  finishedAt: string;
}

export async function runReviewSync(
  input: { scope: SyncScope; actorUserId: string; canPush: boolean; history: readonly UnifiedObservation[] },
  deps: ReviewSyncRunDeps,
): Promise<ReviewSyncRunResult> {
  const { scope } = input;
  const store = deps.store ?? getReviewLedgerStore();
  const now = deps.now();
  const notes: string[] = [];
  const failed = new Set<string>();
  const out = (status: ReviewSyncRunResult["status"], message: string, code: ReviewSyncErrorCode | null, imported = 0, conflicts = 0): ReviewSyncRunResult => ({
    status, code, message, imported, conflicts, failedIds: [...failed], finishedAt: deps.now(),
  });
  const corrections = input.history
    .filter((o) => o.missionId === scope.missionId && o.crewMemberId === scope.crewMemberId && o.provenance === scope.provenance)
    .map(correctionSyncPayload)
    .filter((p): p is CorrectionSyncPayload => p !== null);

  let pushed = 0;
  if (input.canPush) {
    const push = pendingForPush(await listAttestationEvents(scope, store), corrections, await listSyncReceipts(scope, store), input.actorUserId);
    if (push.attestations.length || push.corrections.length) {
      const result = await deps.push({ scope, attestations: push.attestations, corrections: push.corrections });
      if (!result.ok)
        return out("failed", result.code === "migration_required" ? `${REVIEW_SYNC_MIGRATION_REQUIRED}. Local events are kept on this device; nothing was synced.` : `${result.message} Local events are kept.`, result.code);
      await appendSyncReceipts(receiptsFromServer(result.results, now), scope, input.actorUserId, store);
      for (const r of result.results) if (r.status === "rejected") failed.add(r.id);
      const by = (s: string) => result.results.filter((r) => r.status === s).length;
      pushed = by("inserted");
      notes.push(`sent ${result.results.length}: ${by("inserted")} new, ${by("duplicate")} already in cloud, ${by("conflict")} conflict, ${by("rejected")} rejected${by("rejected") ? ` (${result.results.find((r) => r.status === "rejected")?.detail ?? "server validation"})` : ""}`);
    } else notes.push("nothing new to send");
  }

  let imported = 0;
  let conflicts = 0;
  for (const kind of ["attestation", "correction"] as const) {
    let afterSeq = 0;
    for (let page = 0; page < 20; page++) {
      const res = await deps.pull({ scope, kind, afterSeq, limit: 500 });
      if (!res.ok) {
        const msg = res.code === "migration_required" ? `${REVIEW_SYNC_MIGRATION_REQUIRED}. Local events are kept on this device.` : `${notes.join("; ")}${notes.length ? "; " : ""}${res.message}`;
        return out(pushed || imported ? "partial" : "failed", msg, res.code, imported, conflicts);
      }
      if (kind === "attestation") {
        const remote = res.rows.map((r) => remoteRowToAttestation(r, scope)).filter((e): e is NonNullable<typeof e> => e !== null);
        const merged = mergeAttestationEvents(await listAttestationEvents(scope, store), remote);
        conflicts += merged.conflicts.length;
        imported += (await importRemoteAttestationEvents(merged.imported, scope, store)).inserted;
        await appendSyncReceipts(
          [
            ...remote.filter((e) => !merged.conflicts.some((c) => c.eventId === e.eventId)).map((e) => ({ kind: "attestation" as const, eventId: e.eventId, status: "synced" as const, serverReceivedAt: null, recordedAt: now })),
            ...merged.conflicts.map((c) => ({ kind: "attestation" as const, eventId: c.eventId, status: "conflict" as const, serverReceivedAt: null, recordedAt: now, detail: c.detail })),
          ],
          scope,
          input.actorUserId,
          store,
        );
      } else {
        const remote = res.rows.map((r) => remoteRowToCorrection(r, scope)).filter((e): e is NonNullable<typeof e> => e !== null);
        imported += await importRemoteCorrectionIntents(remote, scope, store);
        await appendSyncReceipts(remote.map((c) => ({ kind: "correction" as const, eventId: c.intentId, status: "synced" as const, serverReceivedAt: c.serverReceivedAt, recordedAt: now })), scope, input.actorUserId, store);
      }
      afterSeq = res.lastSeq;
      if (!res.hasMore) break;
    }
  }
  notes.push(`received ${imported} new event(s) from the cloud${conflicts ? `, ${conflicts} conflict(s) kept locally` : ""}`);
  return out(failed.size || conflicts ? "partial" : "ok", `${notes.join("; ")}.`, null, imported, conflicts);
}
