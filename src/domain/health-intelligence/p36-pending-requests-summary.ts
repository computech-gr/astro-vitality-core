/**
 * Consolidated pending-review summary (pure, read-only).
 *
 * Groups locally stored and submitted Unknown Biomarker review requests by
 * their exact mission/crew/provenance scope, joins each request with its
 * local handoff receipts, and reports totals, batches and genuine duplicates
 * under the governed identity rules (normalized label + exact unit → termId).
 *
 * Boundaries:
 *  - Nothing is deleted, merged or rewritten; duplicates are REPORTED only.
 *  - A receipt proves a server receipt event, never scientific approval.
 *  - Counts come from the data; batch sizes are never assumed or hardcoded.
 *  - Requests that fail validation are listed as rejected, never shown as terms.
 */
import { buildReconciliationView, type HandoffRow } from "./catalog-reconciliation-handoff";
import { REQUIRED_SCIENTIFIC_GATE, termIdFor, type ReviewScope } from "./unknown-biomarker-review";
import type { PendingReviewRequest } from "./review-ledger";
import type { HandoffReceipt } from "./p36-cloud-handoff";
import { canonicalJson } from "./observation-envelope";

export type RequestSummaryStatus = "LOCAL_ONLY" | "SUBMITTED" | "CONFLICT";

export interface RequestSummary {
  requestId: string;
  createdAt: string;
  createdByRole: "crew_self" | "ground_medical";
  termCount: number;
  status: RequestSummaryStatus;
  /** Latest matching receipt for this exact request, if any. */
  receipt: { submissionId: string; receivedAt: string; payloadSha256: string; status: "SUBMITTED" | "CONFLICT" } | null;
}

export interface ScopeSummary {
  scope: ReviewScope;
  requests: RequestSummary[];
  uniqueTermIds: string[];
  legacyTermIds: string[];
  dynamicTermIds: string[];
  rejectedRequests: { requestId: string; reason: string }[];
}

export interface DuplicateTermReport {
  termId: string;
  /** Every request (across all scopes) that contains this exact term identity. */
  occurrences: { scope: ReviewScope; requestId: string }[];
}

export interface PendingRequestsSummary {
  totalRequests: number;
  totalUniqueTerms: number;
  /** Terms whose identity matches the original legacy handoff batch. */
  legacyBatchTermCount: number;
  /** Terms beyond the legacy batch (the later submitted batch(es)). */
  dynamicBatchTermCount: number;
  byStatus: Record<RequestSummaryStatus, number>;
  scopes: ScopeSummary[];
  duplicates: DuplicateTermReport[];
}

const sameScope = (a: ReviewScope, b: ReviewScope) =>
  a.missionId === b.missionId && a.crewMemberId === b.crewMemberId && a.provenance === b.provenance;

function validRequest(r: PendingReviewRequest, scope: ReviewScope): string | null {
  if (!r || typeof r !== "object") return "Not a pending request";
  if (r.status !== REQUIRED_SCIENTIFIC_GATE || r.catalogChangeApplied !== false)
    return "Request claims approval or an applied catalog change";
  if (!r.scope || !sameScope(r.scope, scope)) return "Request belongs to a different scope";
  if (!Array.isArray(r.terms) || r.terms.length === 0) return "Request has no terms";
  for (const t of r.terms) {
    if (
      typeof t?.termId !== "string" ||
      termIdFor(t.originalLabels?.[0] ?? t.normalizedLabel ?? "", t.originalUnit ?? "") !== t.termId
    )
      return "A term ID does not match its label and exact unit (tampered or corrupted)";
  }
  return null;
}

export interface ScopeInput {
  scope: ReviewScope;
  requests: readonly PendingReviewRequest[];
  receipts: readonly HandoffReceipt[];
}

export function buildPendingRequestsSummary(
  inputs: readonly ScopeInput[],
  legacyRows: readonly HandoffRow[] = buildReconciliationView().rows,
): PendingRequestsSummary {
  const legacyIds = new Set(legacyRows.map((r) => r.termId));
  const scopes: ScopeSummary[] = [];
  const termOccurrences = new Map<string, { scope: ReviewScope; requestId: string }[]>();
  const byStatus: Record<RequestSummaryStatus, number> = { LOCAL_ONLY: 0, SUBMITTED: 0, CONFLICT: 0 };
  let totalRequests = 0;

  for (const input of inputs) {
    const requests: RequestSummary[] = [];
    const unique = new Set<string>();
    const legacy = new Set<string>();
    const dynamic = new Set<string>();
    const rejected: ScopeSummary["rejectedRequests"] = [];

    for (const r of [...input.requests].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const reason = validRequest(r, input.scope);
      if (reason) {
        rejected.push({ requestId: String(r?.requestId ?? "unknown"), reason });
        continue;
      }
      const receipt = input.receipts
        .filter((x) => x.requestId === r.requestId && sameScope(x.scope, input.scope))
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .at(-1);
      const status: RequestSummaryStatus = receipt?.status === "CONFLICT" ? "CONFLICT" : receipt ? "SUBMITTED" : "LOCAL_ONLY";
      byStatus[status]++;
      totalRequests++;
      requests.push({
        requestId: r.requestId,
        createdAt: r.createdAt,
        createdByRole: r.createdByRole,
        termCount: r.terms.length,
        status,
        receipt: receipt
          ? { submissionId: receipt.submissionId, receivedAt: receipt.receivedAt, payloadSha256: receipt.payloadSha256, status: receipt.status }
          : null,
      });
      for (const t of r.terms) {
        unique.add(t.termId);
        (legacyIds.has(t.termId) ? legacy : dynamic).add(t.termId);
        const list = termOccurrences.get(t.termId) ?? [];
        list.push({ scope: input.scope, requestId: r.requestId });
        termOccurrences.set(t.termId, list);
      }
    }

    scopes.push({
      scope: input.scope,
      requests,
      uniqueTermIds: [...unique].sort(),
      legacyTermIds: [...legacy].sort(),
      dynamicTermIds: [...dynamic].sort(),
      rejectedRequests: rejected,
    });
  }

  const allUnique = new Set(termOccurrences.keys());
  const duplicates: DuplicateTermReport[] = [...termOccurrences.entries()]
    .filter(([, occurrences]) => new Set(occurrences.map((o) => o.requestId)).size > 1)
    .map(([termId, occurrences]) => ({ termId, occurrences }))
    .sort((a, b) => a.termId.localeCompare(b.termId));

  return {
    totalRequests,
    totalUniqueTerms: allUnique.size,
    legacyBatchTermCount: [...allUnique].filter((id) => legacyIds.has(id)).length,
    dynamicBatchTermCount: [...allUnique].filter((id) => !legacyIds.has(id)).length,
    byStatus,
    scopes,
    duplicates,
  };
}

/** Stable scope label for grouping; display names are resolved by the caller. */
export function scopeKey(scope: ReviewScope): string {
  return canonicalJson([scope.missionId, scope.crewMemberId, scope.provenance]);
}
