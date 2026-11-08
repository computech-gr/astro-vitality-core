/**
 * P55 bounded bulk triage over the EXISTING caller-scoped single-term RPC
 * p36_global_triage_append_v1 (installed with the P36 global triage change).
 * No new database function and no service role: each item is one call as the
 * signed-in user, so the database still enforces the triage grant, review
 * scope, per-term serialization, expected-predecessor concurrency and the
 * accept/reject rules. Idempotency keys are derived here from the caller, the
 * term and the exact request, so a retried batch returns "duplicate" instead of
 * writing twice. Only ACCEPT_FOR_REVIEW and REQUEST_MORE_EVIDENCE are offered in
 * bulk; rejecting a review request stays an individual decision. Triage is
 * never scientific approval and never activates anything. Framework-free.
 */
import { classifyAuthorizationError, failure, type Rpc } from "./p36-scientific-authorization.server";
import { triageInputProblem, type EvidenceRequirement } from "./p36-global-triage-rules";
import { deterministicUuid } from "./p38-bulk-demo.server";
import type { BatchResponse, BulkItemResult } from "@/domain/health-intelligence/p38-bulk-demo-batches";

export type BulkTriageAction = "ACCEPT_FOR_REVIEW" | "REQUEST_MORE_EVIDENCE";
export interface BulkTriageInput {
  missionId: string;
  action: BulkTriageAction;
  reason: string | null;
  evidenceRequirements: EvidenceRequirement[];
  items: { submissionId: string; termId: string; expectedPreviousEventId: string | null }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALREADY_ACCEPTED = "already accepted for scientific review";

/** Caller-wide refusals stop the batch; earlier items are idempotent on retry. */
function batchFailure(code: string | undefined): BatchResponse | null {
  const c = classifyAuthorizationError(code);
  if (c === "migration_required")
    return failure(c, "Triage actions are not installed yet: the owner-approved database change has not been applied. Nothing more was recorded.");
  if (c === "forbidden")
    return failure(c, "This account is not authorized to record triage for that mission. Nothing more was recorded.");
  return null;
}

export async function bulkTriageCore(rpc: Rpc, userId: string, d: BulkTriageInput): Promise<BatchResponse> {
  const reason = d.reason?.trim() || null;
  const reqs = d.action === "REQUEST_MORE_EVIDENCE" ? [...new Set(d.evidenceRequirements)].sort() : [];
  const problem = triageInputProblem({ action: d.action, reason, evidenceRequirements: reqs });
  if (problem) return failure("invalid", `${problem} Nothing was recorded.`);
  if (!d.items.length || d.items.length > 50) return failure("invalid", "A batch holds 1 to 50 terms. Nothing was recorded.");
  const results: BulkItemResult[] = [];
  for (const i of d.items) {
    const ref = `${i.submissionId}:${i.termId}`;
    const key = await deterministicUuid(
      "p55-bulk-triage", userId, d.missionId, i.submissionId, i.termId, d.action,
      reason ?? "", reqs.join(","), i.expectedPreviousEventId ?? "GENESIS",
    );
    const { data, error } = await rpc("p36_global_triage_append_v1", {
      p_mission_id: d.missionId, p_provenance: "synthetic", p_submission_id: i.submissionId, p_term_id: i.termId,
      p_action: d.action, p_reason: reason, p_evidence_requirements: reqs,
      p_expected_previous_event_id: i.expectedPreviousEventId, p_idempotency_key: key,
    });
    if (error) {
      const stop = batchFailure(error.code);
      if (stop) return stop;
      results.push({ ref, termId: i.termId, status: "rejected", detail: "The database refused this item; nothing was recorded for it.", eventId: null });
      continue;
    }
    const o = (data ?? null) as Record<string, unknown> | null;
    const status = o?.["status"];
    const detail = typeof o?.["detail"] === "string" ? (o["detail"] as string) : null;
    const eventId = typeof o?.["event_id"] === "string" ? (o["event_id"] as string) : null;
    if (status === "recorded" || status === "duplicate") {
      if (!eventId || !UUID.test(eventId)) return failure("integrity", "The batch response failed validation; nothing was assumed.");
      results.push({ ref, termId: i.termId, status, detail: null, eventId });
    } else if (status === "stale") {
      results.push({ ref, termId: i.termId, status: "stale", detail: detail ?? "another triage decision was recorded first", eventId: null });
    } else if (status === "rejected") {
      results.push({ ref, termId: i.termId, status: detail === ALREADY_ACCEPTED ? "skipped" : "rejected", detail, eventId: null });
    } else return failure("integrity", "The batch response failed validation; nothing was assumed.");
  }
  return { ok: true, results };
}
