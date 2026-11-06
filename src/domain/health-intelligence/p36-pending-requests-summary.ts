/**
 * Consolidated pending-review summary (pure, read-only).
 *
 * Groups locally stored requests AND authorized cloud submissions by their
 * exact mission/crew/provenance scope, joins each local request with its
 * local handoff receipt and (when read) the authorized cloud inventory, and
 * reports totals, batches, statuses and genuine duplicates under the governed
 * identity rules (normalized label + exact unit → termId).
 *
 * Statuses:
 *  - LOCAL_ONLY    no receipt on this device and not present in the cloud read
 *  - SUBMITTED     receipt exists; cloud inventory not (yet) verified
 *  - SYNCHRONIZED  the authorized cloud read contains this exact request
 *                  (matching submission ID and payload digest when a receipt exists)
 *  - FAILED        a receipt exists but the successful cloud read does not contain
 *                  the receipted submission/digest (never silently treated as synced)
 *  - CONFLICT      the server refused a changed payload for an existing request
 *
 * Boundaries:
 *  - Nothing is deleted, merged or rewritten; duplicates are REPORTED only.
 *  - A receipt or cloud copy proves metadata receipt, never scientific approval.
 *  - Counts come from the data; batch sizes are never assumed.
 *  - Entries that fail validation are listed as rejected, never shown as terms.
 */
import { buildReconciliationView, type HandoffRow } from "./catalog-reconciliation-handoff";
import { REQUIRED_SCIENTIFIC_GATE, termIdFor, type ReviewScope } from "./unknown-biomarker-review";
import type { PendingReviewRequest } from "./review-ledger";
import type { CloudSubmission, HandoffReceipt } from "./p36-cloud-handoff";
import { canonicalJson } from "./observation-envelope";

export type RequestSummaryStatus = "LOCAL_ONLY" | "SUBMITTED" | "SYNCHRONIZED" | "FAILED" | "CONFLICT";
export const REQUEST_STATUSES: readonly RequestSummaryStatus[] = ["LOCAL_ONLY", "SUBMITTED", "SYNCHRONIZED", "FAILED", "CONFLICT"];

export interface SummaryTerm {
  termId: string;
  label: string;
  exactUnit: string;
}

export interface RequestSummary {
  requestId: string;
  /** "local" = stored on this device; "cloud" = only present in the authorized cloud read. */
  origin: "local" | "cloud";
  createdAt: string;
  createdByRole: "crew_self" | "ground_medical" | null;
  termCount: number;
  terms: SummaryTerm[];
  status: RequestSummaryStatus;
  statusDetail: string;
  receipt: { submissionId: string; receivedAt: string; payloadSha256: string; status: "SUBMITTED" | "CONFLICT" } | null;
  cloud: { submissionId: string; receivedAt: string; payloadSha256: string } | null;
}

export interface ScopeTermInventory extends SummaryTerm {
  legacy: boolean;
  requestIds: string[];
  statuses: RequestSummaryStatus[];
}

export interface ScopeSummary {
  scope: ReviewScope;
  requests: RequestSummary[];
  uniqueTermIds: string[];
  legacyTermIds: string[];
  dynamicTermIds: string[];
  legacyTerms: ScopeTermInventory[];
  additionalTerms: ScopeTermInventory[];
  cloudRead: "verified" | "unavailable" | "not_read";
  cloudMessage: string;
  rejectedRequests: { requestId: string; reason: string }[];
}

export interface DuplicateTermReport {
  termId: string;
  /** Every distinct (scope, request) that contains this exact term identity. */
  occurrences: { scope: ReviewScope; requestId: string }[];
}

export interface PendingRequestsSummary {
  totalRequests: number;
  totalUniqueTerms: number;
  /** Size of the original documentary handoff batch (derived from the bundled rows). */
  legacyDocumentaryTotal: number;
  /** Original-batch terms present in requests/cloud submissions. */
  legacyBatchTermCount: number;
  /** Terms beyond the original batch, any status. */
  dynamicBatchTermCount: number;
  /** Terms beyond the original batch that are in a SUBMITTED or SYNCHRONIZED request. */
  dynamicSubmittedTermCount: number;
  byStatus: Record<RequestSummaryStatus, number>;
  scopes: ScopeSummary[];
  duplicates: DuplicateTermReport[];
}

export type CloudInventory = { ok: true; submissions: readonly CloudSubmission[] } | { ok: false; message: string };

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

interface ParsedCloud {
  submission: CloudSubmission;
  requestId: string;
  terms: SummaryTerm[];
}

function parseCloud(s: CloudSubmission, scope: ReviewScope): ParsedCloud | { error: string } {
  try {
    const p = JSON.parse(s.payloadCanonical) as {
      requestId?: unknown;
      scope?: unknown;
      scientificStatus?: unknown;
      catalogChangeApplied?: unknown;
      terms?: { termId?: unknown; originalLabels?: unknown; exactUnit?: unknown }[];
    };
    if (typeof p.requestId !== "string") return { error: "cloud submission without request ID" };
    if (canonicalJson(p.scope) !== canonicalJson(scope)) return { error: "cloud submission scope mismatch" };
    if (p.scientificStatus !== REQUIRED_SCIENTIFIC_GATE || p.catalogChangeApplied !== false)
      return { error: "cloud submission claims approval" };
    if (!Array.isArray(p.terms) || !p.terms.length) return { error: "cloud submission without terms" };
    const terms: SummaryTerm[] = [];
    for (const t of p.terms) {
      const label = Array.isArray(t.originalLabels) && typeof t.originalLabels[0] === "string" ? t.originalLabels[0] : "";
      const unit = typeof t.exactUnit === "string" ? t.exactUnit : "";
      if (typeof t.termId !== "string" || termIdFor(label, unit) !== t.termId)
        return { error: "cloud term identity does not match its label and exact unit" };
      terms.push({ termId: t.termId, label, exactUnit: unit });
    }
    return { submission: s, requestId: p.requestId, terms };
  } catch {
    return { error: "cloud submission is not readable" };
  }
}

export interface ScopeInput {
  scope: ReviewScope;
  requests: readonly PendingReviewRequest[];
  receipts: readonly HandoffReceipt[];
  /** Authorized cloud inventory for this exact scope, if it was read. */
  cloud?: CloudInventory;
}

export function buildPendingRequestsSummary(
  inputs: readonly ScopeInput[],
  legacyRows: readonly HandoffRow[] = buildReconciliationView().rows,
): PendingRequestsSummary {
  const legacyIds = new Set(legacyRows.map((r) => r.termId));
  const scopes: ScopeSummary[] = [];
  const termOccurrences = new Map<string, Map<string, { scope: ReviewScope; requestId: string }>>();
  const termStatuses = new Map<string, Set<RequestSummaryStatus>>();
  const byStatus = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<RequestSummaryStatus, number>;
  let totalRequests = 0;

  for (const input of inputs) {
    const requests: RequestSummary[] = [];
    const rejected: ScopeSummary["rejectedRequests"] = [];
    const inventory = new Map<string, ScopeTermInventory>();
    const cloudParsed: ParsedCloud[] = [];
    let cloudRead: ScopeSummary["cloudRead"] = "not_read";
    let cloudMessage = "Cloud inventory not read for this scope.";
    if (input.cloud?.ok) {
      cloudRead = "verified";
      cloudMessage = `${input.cloud.submissions.length} authorized cloud submission(s) read.`;
      for (const s of input.cloud.submissions) {
        const parsed = parseCloud(s, input.scope);
        if ("error" in parsed) rejected.push({ requestId: s.submissionId, reason: parsed.error });
        else cloudParsed.push(parsed);
      }
    } else if (input.cloud && !input.cloud.ok) {
      cloudRead = "unavailable";
      cloudMessage = input.cloud.message;
    }

    const record = (req: RequestSummary) => {
      byStatus[req.status]++;
      totalRequests++;
      requests.push(req);
      for (const t of req.terms) {
        const cur =
          inventory.get(t.termId) ?? { ...t, legacy: legacyIds.has(t.termId), requestIds: [], statuses: [] };
        if (!cur.requestIds.includes(req.requestId)) cur.requestIds.push(req.requestId);
        if (!cur.statuses.includes(req.status)) cur.statuses.push(req.status);
        inventory.set(t.termId, cur);
        const occ = termOccurrences.get(t.termId) ?? new Map();
        occ.set(canonicalJson([scopeKey(input.scope), req.requestId]), { scope: input.scope, requestId: req.requestId });
        termOccurrences.set(t.termId, occ);
        const st = termStatuses.get(t.termId) ?? new Set();
        st.add(req.status);
        termStatuses.set(t.termId, st);
      }
    };

    const localIds = new Set<string>();
    for (const r of [...input.requests].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const reason = validRequest(r, input.scope);
      if (reason) {
        rejected.push({ requestId: String(r?.requestId ?? "unknown"), reason });
        continue;
      }
      localIds.add(r.requestId);
      const receipt = input.receipts
        .filter((x) => x.requestId === r.requestId && sameScope(x.scope, input.scope))
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .at(-1);
      const cloudMatches = cloudParsed.filter((c) => c.requestId === r.requestId);
      const exact = receipt
        ? cloudMatches.find((c) => c.submission.submissionId === receipt.submissionId && c.submission.payloadSha256 === receipt.payloadSha256)
        : cloudMatches[0];
      let status: RequestSummaryStatus;
      let statusDetail: string;
      if (receipt?.status === "CONFLICT") {
        status = "CONFLICT";
        statusDetail = "The server refused a changed payload; the original server copy and local evidence are unchanged.";
      } else if (exact && cloudRead === "verified") {
        status = "SYNCHRONIZED";
        statusDetail = receipt
          ? "The authorized cloud read contains this exact submission and digest."
          : "The authorized cloud read contains this request (no local receipt on this device).";
      } else if (receipt && cloudRead === "verified") {
        status = "FAILED";
        statusDetail = "A receipt exists, but the authorized cloud read does not contain the receipted submission and digest. Retry from the submission panel.";
      } else if (receipt) {
        status = "SUBMITTED";
        statusDetail = cloudRead === "unavailable" ? `Receipt recorded; cloud verification unavailable: ${cloudMessage}` : "Receipt recorded; cloud verification not yet read.";
      } else {
        status = "LOCAL_ONLY";
        statusDetail = "Stored on this device only — not visible to other devices or reviewers.";
      }
      record({
        requestId: r.requestId,
        origin: "local",
        createdAt: r.createdAt,
        createdByRole: r.createdByRole,
        termCount: r.terms.length,
        terms: r.terms.map((t) => ({ termId: t.termId, label: t.originalLabels?.[0] ?? t.normalizedLabel, exactUnit: t.originalUnit })),
        status,
        statusDetail,
        receipt: receipt
          ? { submissionId: receipt.submissionId, receivedAt: receipt.receivedAt, payloadSha256: receipt.payloadSha256, status: receipt.status }
          : null,
        cloud: exact ? { submissionId: exact.submission.submissionId, receivedAt: exact.submission.receivedAt, payloadSha256: exact.submission.payloadSha256 } : null,
      });
    }

    // Requests submitted from another device (or another authorized account) for this scope.
    const seenCloud = new Set<string>();
    for (const c of cloudParsed) {
      if (localIds.has(c.requestId)) continue;
      const key = canonicalJson([c.requestId, c.submission.submissionId]);
      if (seenCloud.has(key)) continue;
      seenCloud.add(key);
      record({
        requestId: c.requestId,
        origin: "cloud",
        createdAt: c.submission.receivedAt,
        createdByRole: null,
        termCount: c.terms.length,
        terms: c.terms,
        status: "SYNCHRONIZED",
        statusDetail: "Present in the authorized cloud read; registered on another device or by another authorized account.",
        receipt: null,
        cloud: { submissionId: c.submission.submissionId, receivedAt: c.submission.receivedAt, payloadSha256: c.submission.payloadSha256 },
      });
    }

    const all = [...inventory.values()].sort((a, b) => a.label.localeCompare(b.label) || a.termId.localeCompare(b.termId));
    scopes.push({
      scope: input.scope,
      requests,
      uniqueTermIds: all.map((t) => t.termId).sort(),
      legacyTermIds: all.filter((t) => t.legacy).map((t) => t.termId).sort(),
      dynamicTermIds: all.filter((t) => !t.legacy).map((t) => t.termId).sort(),
      legacyTerms: all.filter((t) => t.legacy),
      additionalTerms: all.filter((t) => !t.legacy),
      cloudRead,
      cloudMessage,
      rejectedRequests: rejected,
    });
  }

  const allUnique = [...termOccurrences.keys()];
  const duplicates: DuplicateTermReport[] = [...termOccurrences.entries()]
    .filter(([, occ]) => occ.size > 1)
    .map(([termId, occ]) => ({ termId, occurrences: [...occ.values()] }))
    .sort((a, b) => a.termId.localeCompare(b.termId));

  return {
    totalRequests,
    totalUniqueTerms: allUnique.length,
    legacyDocumentaryTotal: legacyIds.size,
    legacyBatchTermCount: allUnique.filter((id) => legacyIds.has(id)).length,
    dynamicBatchTermCount: allUnique.filter((id) => !legacyIds.has(id)).length,
    dynamicSubmittedTermCount: allUnique.filter(
      (id) => !legacyIds.has(id) && [...(termStatuses.get(id) ?? [])].some((s) => s === "SUBMITTED" || s === "SYNCHRONIZED"),
    ).length,
    byStatus,
    scopes,
    duplicates,
  };
}

/** Stable scope label for grouping; display names are resolved by the caller. */
export function scopeKey(scope: ReviewScope): string {
  return canonicalJson([scope.missionId, scope.crewMemberId, scope.provenance]);
}
