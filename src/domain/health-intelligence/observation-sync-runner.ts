/**
 * v9.4 observation sync run: explicit upload, then download + append-only
 * import. Dependency-injected (no React, no network) so the two-device
 * scenario, replay, conflict and partial-failure paths are unit-testable.
 * Only server-confirmed outcomes become receipts; everything else stays
 * pending or failed, and nothing is ever reported as synced without one.
 */
import type { UnifiedObservation } from "./observation-envelope";
import {
  decideRemoteImport,
  observationContentSha256,
  OBSERVATION_SYNC_MIGRATION_REQUIRED,
  OBSERVATION_SYNC_PAGE_MAX,
  planObservationPush,
  type ObservationSyncErrorCode,
  type ObservationSyncEvent,
  type ObservationSyncReceipt,
  type SyncScope,
} from "./observation-sync";

type Failure = { ok: false; code: ObservationSyncErrorCode; message: string };
export type PushResponse =
  | { ok: true; results: { id: string; status: "inserted" | "duplicate" | "conflict" | "rejected"; fingerprint: string | null; receivedAt: string | null; detail: string | null }[] }
  | Failure;
export type PullResponse =
  | {
      ok: true;
      events: { eventId: string; eventKind: "entry" | "status"; observation: UnifiedObservation; fingerprint: string; receivedAt: string | null; receivedSeq: number }[];
      problems: { eventId: string; receivedSeq: number; problem: string }[];
      lastSeq: number;
      hasMore: boolean;
    }
  | Failure;

export interface ObservationSyncRunDeps {
  listLocal: () => Promise<ObservationSyncEvent[]>;
  listReceipts: () => Promise<ObservationSyncReceipt[]>;
  appendReceipts: (r: ObservationSyncReceipt[]) => Promise<void>;
  importEvent: (e: ObservationSyncEvent) => Promise<"inserted" | "duplicate" | "conflict">;
  push: (args: { scope: SyncScope; events: ObservationSyncEvent[]; realDataConfirmed: boolean }) => Promise<PushResponse>;
  pull: (args: { scope: SyncScope; afterSeq: number; limit: number }) => Promise<PullResponse>;
  now: () => string;
}

export interface ObservationSyncRunResult {
  status: "ok" | "partial" | "failed" | "skipped";
  code: ObservationSyncErrorCode | null;
  message: string;
  uploaded: { inserted: number; alreadyInCloud: number; conflict: number; rejected: number; notSent: number };
  downloaded: { imported: number; alreadyLocal: number; conflict: number; rejected: number };
  failedIds: string[];
  conflicts: { eventId: string; detail: string }[];
  finishedAt: string;
}

const failureMessage = (f: Failure) =>
  f.code === "migration_required" ? `${OBSERVATION_SYNC_MIGRATION_REQUIRED}. Observations stay on this device; nothing was synced.` : f.message;

export async function runObservationSync(
  input: { scope: SyncScope; canUpload: boolean; realDataConfirmed: boolean },
  deps: ObservationSyncRunDeps,
): Promise<ObservationSyncRunResult> {
  const { scope } = input;
  const result: ObservationSyncRunResult = {
    status: "ok",
    code: null,
    message: "",
    uploaded: { inserted: 0, alreadyInCloud: 0, conflict: 0, rejected: 0, notSent: 0 },
    downloaded: { imported: 0, alreadyLocal: 0, conflict: 0, rejected: 0 },
    failedIds: [],
    conflicts: [],
    finishedAt: deps.now(),
  };
  const failed = new Set<string>();
  const notes: string[] = [];
  const done = (status: ObservationSyncRunResult["status"], message: string, code: ObservationSyncErrorCode | null = null) => {
    result.status = status;
    result.code = code;
    result.message = message;
    result.failedIds = [...failed];
    result.finishedAt = deps.now();
    return result;
  };

  // ---- 1. Upload (explicit; REAL data needs confirmation) ----
  const uploadAllowed = input.canUpload && (scope.provenance === "synthetic" || input.realDataConfirmed);
  if (input.canUpload && !uploadAllowed) notes.push("upload skipped: confirm REAL data upload first");
  if (uploadAllowed) {
    const attempted = new Set<string>();
    for (let round = 0; round < 200; round++) {
      const plan = await planObservationPush(await deps.listLocal(), await deps.listReceipts(), scope);
      for (const i of plan.invalid) if (!attempted.has(i.eventId)) {
        attempted.add(i.eventId);
        failed.add(i.eventId);
        result.uploaded.notSent++;
        result.conflicts.length < 0 || notes.length < 6 ? notes.push(`not sent ${i.eventId}: ${i.reason}`) : null;
      }
      const batch = plan.send.filter((e) => !attempted.has(e.eventId));
      if (!batch.length) break;
      for (const e of batch) attempted.add(e.eventId);
      const res = await deps.push({ scope, events: batch, realDataConfirmed: input.realDataConfirmed });
      if (!res.ok) return done(result.uploaded.inserted ? "partial" : "failed", failureMessage(res), res.code);
      const at = deps.now();
      const byId = new Map(batch.map((e) => [e.eventId, e]));
      const receipts: ObservationSyncReceipt[] = [];
      for (const r of res.results) {
        const e = byId.get(r.id);
        if (!e) continue;
        byId.delete(r.id);
        const contentSha256 = await observationContentSha256(e.observation);
        if (r.status === "inserted" || r.status === "duplicate") {
          if (r.status === "inserted") result.uploaded.inserted++;
          else result.uploaded.alreadyInCloud++;
          receipts.push({ eventId: r.id, contentSha256, status: "synced", direction: r.status === "inserted" ? "uploaded" : "already_in_cloud", serverFingerprint: r.fingerprint, serverReceivedAt: r.receivedAt, recordedAt: at });
        } else if (r.status === "conflict") {
          result.uploaded.conflict++;
          const detail = r.detail ?? "Cloud event with the same ID has different content.";
          result.conflicts.push({ eventId: r.id, detail });
          receipts.push({ eventId: r.id, contentSha256, status: "conflict", direction: "uploaded", serverFingerprint: r.fingerprint, serverReceivedAt: r.receivedAt, recordedAt: at, detail });
        } else {
          result.uploaded.rejected++;
          failed.add(r.id);
        }
      }
      for (const id of byId.keys()) {
        // No server confirmation: stays failed (retryable), never synced.
        result.uploaded.rejected++;
        failed.add(id);
      }
      if (receipts.length) await deps.appendReceipts(receipts);
      if (!plan.remaining) break;
    }
  }

  // ---- 2. Download (full cursor scan; append-only import) ----
  let afterSeq = 0;
  for (let page = 0; page < 500; page++) {
    const res = await deps.pull({ scope, afterSeq, limit: OBSERVATION_SYNC_PAGE_MAX });
    if (!res.ok) {
      const uploadedSomething = result.uploaded.inserted + result.uploaded.alreadyInCloud > 0;
      return done(uploadedSomething || result.downloaded.imported ? "partial" : "failed", `${notes.length ? `${notes.join("; ")}; ` : ""}download failed: ${failureMessage(res)}`, res.code);
    }
    for (const p of res.problems) {
      result.downloaded.rejected++;
      failed.add(p.eventId || `seq-${p.receivedSeq}`);
    }
    const local = new Map((await deps.listLocal()).map((e) => [e.eventId, e.observation]));
    const at = deps.now();
    const receipts: ObservationSyncReceipt[] = [];
    const ordered = [...res.events].sort((a, b) => (a.eventKind === b.eventKind ? a.receivedSeq - b.receivedSeq : a.eventKind === "entry" ? -1 : 1));
    for (const remote of ordered) {
      const event: ObservationSyncEvent = { eventId: remote.eventId, eventKind: remote.eventKind, observation: remote.observation };
      const decision = decideRemoteImport(event, local, scope);
      const contentSha256 = await observationContentSha256(remote.observation);
      if (decision.action === "rejected") {
        result.downloaded.rejected++;
        failed.add(remote.eventId);
        continue;
      }
      if (decision.action === "conflict") {
        result.downloaded.conflict++;
        result.conflicts.push({ eventId: remote.eventId, detail: decision.detail });
        const localObs = local.get(remote.eventId)!;
        receipts.push({ eventId: remote.eventId, contentSha256: await observationContentSha256(localObs), status: "conflict", direction: "downloaded", serverFingerprint: remote.fingerprint, serverReceivedAt: remote.receivedAt, recordedAt: at, detail: decision.detail });
        continue;
      }
      if (decision.action === "import") {
        const outcome = await deps.importEvent(event);
        if (outcome === "conflict") {
          result.downloaded.conflict++;
          result.conflicts.push({ eventId: remote.eventId, detail: "Local store refused the cloud version (different content); local kept." });
          continue;
        }
        if (outcome === "inserted") result.downloaded.imported++;
        else result.downloaded.alreadyLocal++;
        local.set(remote.eventId, remote.observation);
      } else result.downloaded.alreadyLocal++;
      receipts.push({ eventId: remote.eventId, contentSha256, status: "synced", direction: "downloaded", serverFingerprint: remote.fingerprint, serverReceivedAt: remote.receivedAt, recordedAt: at });
    }
    if (receipts.length) await deps.appendReceipts(receipts);
    afterSeq = res.lastSeq;
    if (!res.hasMore) break;
  }

  const u = result.uploaded, d = result.downloaded;
  const summary =
    `uploaded ${u.inserted} new, ${u.alreadyInCloud} already in cloud` +
    (u.conflict ? `, ${u.conflict} conflict` : "") +
    (u.rejected ? `, ${u.rejected} rejected` : "") +
    (u.notSent ? `, ${u.notSent} not sent (failed validation)` : "") +
    `; downloaded ${d.imported} new, ${d.alreadyLocal} already on this device` +
    (d.conflict ? `, ${d.conflict} conflict (local kept)` : "") +
    (d.rejected ? `, ${d.rejected} rejected` : "");
  const problems = u.rejected + u.notSent + d.rejected + u.conflict + d.conflict;
  return done(problems ? "partial" : "ok", `${notes.length ? `${notes.join("; ")}; ` : ""}${summary}.`);
}
