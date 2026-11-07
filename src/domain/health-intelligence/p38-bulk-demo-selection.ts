/**
 * P38/P54 Researcher bulk selection rules (pure, browser-safe).
 *
 * The single eligibility rule used by Select All Eligible, Select Page, the
 * bulk preview and retry reselection: a term is decidable only when the
 * preflight classifies it as eligible, it is inside the owner-authorized demo
 * scope and the caller did not submit it (independence). Nothing here writes,
 * approves or activates; Ground Medical activation remains separate.
 */
import type { BulkItemResult } from "./p38-bulk-demo-batches";
import type { PreflightRow } from "./p38-bulk-demo-preflight";

export interface ScopeTermLike {
  submittedByCaller: boolean;
}

export const isDecidable = (r: PreflightRow, scope: ReadonlyMap<string, ScopeTermLike>) =>
  r.category === "eligible" && r.inScope && !scope.get(r.key)?.submittedByCaller;

export interface BulkSelectionCounts {
  eligible: number;
  awaitingTriage: number;
  readyForDecision: number;
  submittedByCaller: number;
}

/** Workflow counts over every submitted term (all pages). */
export function bulkSelectionCounts(rows: readonly PreflightRow[], scope: ReadonlyMap<string, ScopeTermLike>): BulkSelectionCounts {
  const eligible = rows.filter((r) => isDecidable(r, scope));
  return {
    eligible: eligible.length,
    awaitingTriage: eligible.filter((r) => r.triageAction !== "ACCEPT_FOR_REVIEW").length,
    readyForDecision: eligible.filter((r) => r.triageAction === "ACCEPT_FOR_REVIEW").length,
    submittedByCaller: rows.filter((r) => r.category === "eligible" && r.inScope && scope.get(r.key)?.submittedByCaller).length,
  };
}

/** Keys to reselect for a retry: only failed items that are still decidable now (after reload). */
export function retrySelection(
  results: readonly BulkItemResult[],
  rows: readonly PreflightRow[],
  scope: ReadonlyMap<string, ScopeTermLike>,
): { keys: string[]; notRetryable: number } {
  const failed = new Set(results.filter((r) => r.status === "rejected" || r.status === "stale").map((r) => r.ref));
  const keys = rows.filter((r) => failed.has(r.key) && isDecidable(r, scope)).map((r) => r.key);
  return { keys, notRetryable: failed.size - keys.length };
}
