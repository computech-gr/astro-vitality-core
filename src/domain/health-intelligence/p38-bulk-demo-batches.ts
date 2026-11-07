/**
 * P38 bulk SYNTHETIC DEMO batching (pure, browser-safe).
 *
 * Splits a selection into bounded batches (each is one transactional server
 * call), runs them in order with progress reporting, stops at the first failed
 * batch (that batch wrote nothing) and lets the caller retry the remaining
 * batches; retry is safe because the server derives deterministic idempotency
 * keys. Also computes Ground Medical activation eligibility for pending demo
 * proposals (no duplicate keys, never the decider, never already active).
 */
import { normalizeCatalogText } from "./catalog-lifecycle";

export const BULK_BATCH_SIZE = 50;
export type BulkItemStatus = "recorded" | "duplicate" | "skipped" | "rejected" | "stale";
export interface BulkItemResult {
  ref: string;
  termId: string;
  status: BulkItemStatus;
  detail: string | null;
  eventId: string | null;
}
export type BatchResponse =
  { ok: true; results: BulkItemResult[] } | { ok: false; code?: string; message: string };

export function chunk<T>(items: readonly T[], size = BULK_BATCH_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > BULK_BATCH_SIZE)
    throw new Error("batch size must be 1 to 50");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface BulkProgress {
  batchesDone: number;
  batchesTotal: number;
  itemsDone: number;
  itemsTotal: number;
}
export interface BulkRunResult<T> {
  results: BulkItemResult[];
  /** Items of the failed batch and every later batch; resend them to retry. */
  remaining: T[];
  failure: string | null;
  progress: BulkProgress;
}

/** Sequential bounded batches; a failed batch stops the run and is reported with everything after it. */
export async function runBulkBatches<T>(
  items: readonly T[],
  send: (batch: T[]) => Promise<BatchResponse>,
  onProgress?: (p: BulkProgress) => void,
  size = BULK_BATCH_SIZE,
): Promise<BulkRunResult<T>> {
  const batches = chunk(items, size);
  const results: BulkItemResult[] = [];
  const progress: BulkProgress = {
    batchesDone: 0,
    batchesTotal: batches.length,
    itemsDone: 0,
    itemsTotal: items.length,
  };
  onProgress?.({ ...progress });
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    let r: BatchResponse;
    try {
      r = await send(batch);
    } catch {
      r = { ok: false, message: "The batch could not be sent; nothing in it was recorded." };
    }
    if (!r.ok || r.results.length !== batch.length)
      return {
        results,
        remaining: batches.slice(i).flat(),
        failure: r.ok ? "The batch response failed validation; nothing was assumed." : r.message,
        progress,
      };
    results.push(...r.results);
    progress.batchesDone++;
    progress.itemsDone += batch.length;
    onProgress?.({ ...progress });
  }
  return { results, remaining: [], failure: null, progress };
}

export function summarizeBulk(results: readonly BulkItemResult[]) {
  const s: Record<BulkItemStatus, number> = {
    recorded: 0,
    duplicate: 0,
    skipped: 0,
    rejected: 0,
    stale: 0,
  };
  for (const r of results) s[r.status]++;
  return s;
}

// --- Ground Medical activation eligibility ----------------------------------------
export interface PendingDemoProposal {
  decisionEventId: string;
  submissionId: string;
  termId: string;
  demoId: string;
  entrySha256: string;
  entry: { displayName: string; aliases: readonly string[]; unit: string; domain: string };
  decidedByCaller: boolean;
  activationEventId: string | null;
  revocationEventId: string | null;
}
export type ActivationCategory =
  "eligible" | "already_active" | "revoked" | "decided_by_caller" | "not_authorized" | "conflict";
export interface ActivationRow {
  proposal: PendingDemoProposal;
  category: ActivationCategory;
  reason: string;
}
const keysOf = (e: PendingDemoProposal["entry"]) =>
  [...new Set([e.displayName, ...e.aliases].filter((a) => a.trim()))].map(
    (a) => `${normalizeCatalogText(a)}|${e.unit.trim()}`,
  );

/**
 * Mirrors the server activation rules so the preview shows what will be skipped:
 * already active or revoked decisions, the caller's own decisions, crew scope
 * outside the caller's membership, and label+unit keys already owned by an active
 * entry or by an earlier proposal in the same preview (decision order).
 */
export function activationPreview(
  proposals: readonly PendingDemoProposal[],
  callerMayActivate: (p: PendingDemoProposal) => boolean,
): ActivationRow[] {
  const owned = new Map<string, string>();
  for (const p of proposals)
    if (p.activationEventId && !p.revocationEventId)
      for (const k of keysOf(p.entry)) owned.set(k, p.demoId);
  return proposals.map((p) => {
    if (p.revocationEventId)
      return { proposal: p, category: "revoked", reason: "Revoked; history is kept." };
    if (p.activationEventId)
      return { proposal: p, category: "already_active", reason: "Already active; skipped." };
    if (p.decidedByCaller)
      return {
        proposal: p,
        category: "decided_by_caller",
        reason: "You recorded this decision; another Ground Medical member must activate it.",
      };
    if (!callerMayActivate(p))
      return {
        proposal: p,
        category: "not_authorized",
        reason: "Your Ground Medical membership does not cover this submission.",
      };
    const keys = keysOf(p.entry);
    const clash = keys.map((k) => owned.get(k)).find((v) => v && v !== p.demoId);
    if (clash)
      return {
        proposal: p,
        category: "conflict",
        reason: `Same label and exact unit as ${clash}; it would not be activated.`,
      };
    for (const k of keys) owned.set(k, p.demoId);
    return { proposal: p, category: "eligible", reason: "Ready for activation." };
  });
}
