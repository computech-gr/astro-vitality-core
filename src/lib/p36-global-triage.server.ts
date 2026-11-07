/**
 * Server core for P36 Global Scientific Triage. Calls the caller-scoped RPCs
 * staged in supabase/pending/20261107040000_p36_global_triage.sql as the
 * signed-in user. Triage is not scientific approval: nothing here writes the
 * scientific authorization ledger, submitted metadata or any catalog.
 * Responses are re-validated against a fixed whitelist. Framework-free.
 */
import { classifyAuthorizationError, failure, type Rpc } from "./p36-scientific-authorization.server";
import type { GlobalReviewProvenance } from "./p36-global-review.server";

export const TRIAGE_ACTIONS = ["ACCEPT_FOR_REVIEW", "REQUEST_MORE_EVIDENCE", "REJECT_REVIEW_REQUEST"] as const;
export type TriageAction = (typeof TRIAGE_ACTIONS)[number];
export const EVIDENCE_REQUIREMENTS = ["identity", "unit", "method", "specimen", "protocol", "source_validation", "other"] as const;
export type EvidenceRequirement = (typeof EVIDENCE_REQUIREMENTS)[number];

export interface TriageEvent {
  eventId: string;
  submissionId: string;
  termId: string;
  action: TriageAction;
  reason: string | null;
  evidenceRequirements: EvidenceRequirement[];
  previousEventId: string | null;
  recordedAt: string;
  recordedByCaller: boolean;
}

export interface TriageAppendInput {
  missionId: string;
  provenance: GlobalReviewProvenance;
  submissionId: string;
  termId: string;
  action: TriageAction;
  reason: string | null;
  evidenceRequirements: EvidenceRequirement[];
  expectedPreviousEventId: string | null;
  idempotencyKey: string;
}

const MIGRATION_MESSAGE = "Triage actions are not installed yet: the owner-approved database change has not been applied. Nothing was recorded.";
const EVENT_KEYS = "access_basis,action,event_id,evidence_requirements,previous_event_id,reason,recorded_at,recorded_by_caller,submission_id,term_id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isAction = (v: unknown): v is TriageAction => TRIAGE_ACTIONS.includes(v as TriageAction);
const isReq = (v: unknown): v is EvidenceRequirement => EVIDENCE_REQUIREMENTS.includes(v as EvidenceRequirement);

function fail(code: string | undefined) {
  const c = classifyAuthorizationError(code);
  if (c === "migration_required") return failure(c, MIGRATION_MESSAGE);
  if (c === "forbidden") return failure(c, "This account is not authorized to record triage for that mission. Nothing was recorded.");
  return failure(c);
}

export function cleanTriageEvent(r: unknown): TriageEvent | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (Object.keys(o).sort().join(",") !== EVENT_KEYS) return null;
  const reqs = o["evidence_requirements"];
  if (typeof o["event_id"] !== "string" || !UUID.test(o["event_id"]) || typeof o["submission_id"] !== "string" || !UUID.test(o["submission_id"])
    || typeof o["term_id"] !== "string" || !/^ubt-[0-9a-f]{8}$/.test(o["term_id"]) || !isAction(o["action"])
    || (o["reason"] !== null && typeof o["reason"] !== "string") || !Array.isArray(reqs) || !reqs.every(isReq)
    || (o["previous_event_id"] !== null && (typeof o["previous_event_id"] !== "string" || !UUID.test(o["previous_event_id"])))
    || typeof o["recorded_at"] !== "string" || typeof o["recorded_by_caller"] !== "boolean") return null;
  return {
    eventId: o["event_id"], submissionId: o["submission_id"], termId: o["term_id"], action: o["action"],
    reason: o["reason"] as string | null, evidenceRequirements: reqs as EvidenceRequirement[],
    previousEventId: o["previous_event_id"] as string | null, recordedAt: o["recorded_at"], recordedByCaller: o["recorded_by_caller"],
  };
}

export async function listTriageCore(rpc: Rpc, missionId: string, provenance: GlobalReviewProvenance) {
  const { data, error } = await rpc("p36_global_triage_list_v1", { p_mission_id: missionId, p_provenance: provenance });
  if (error) return fail(error.code);
  const o = data as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o["can_triage"] !== "boolean" || !Array.isArray(o["events"]))
    return failure("integrity", "Triage history failed verification. Nothing is shown.");
  const events: TriageEvent[] = [];
  for (const row of o["events"]) {
    const e = cleanTriageEvent(row);
    if (!e) return failure("integrity", "Triage history failed verification. Nothing is shown.");
    events.push(e);
  }
  return { ok: true as const, canTriage: o["can_triage"], events };
}

/** Client-side mirror of the database rules, so obviously invalid requests never leave the browser. */
export function triageInputProblem(i: Pick<TriageAppendInput, "action" | "reason" | "evidenceRequirements">): string | null {
  const reason = i.reason?.trim() ?? "";
  if (i.action !== "ACCEPT_FOR_REVIEW" && !reason) return "A documented reason is required.";
  if (reason && (reason.length < 8 || reason.length > 2000)) return "The reason must be 8 to 2000 characters.";
  if (i.action === "REQUEST_MORE_EVIDENCE" && !i.evidenceRequirements.length) return "Name at least one missing evidence requirement.";
  if (i.action !== "REQUEST_MORE_EVIDENCE" && i.evidenceRequirements.length) return "Evidence requirements apply only to evidence requests.";
  return null;
}

export async function appendTriageCore(rpc: Rpc, i: TriageAppendInput) {
  const problem = triageInputProblem(i);
  if (problem) return failure("invalid", problem);
  const { data, error } = await rpc("p36_global_triage_append_v1", {
    p_mission_id: i.missionId, p_provenance: i.provenance, p_submission_id: i.submissionId, p_term_id: i.termId,
    p_action: i.action, p_reason: i.reason?.trim() || null, p_evidence_requirements: i.evidenceRequirements,
    p_expected_previous_event_id: i.expectedPreviousEventId, p_idempotency_key: i.idempotencyKey,
  });
  if (error) return fail(error.code);
  const o = data as Record<string, unknown> | null;
  const status = o?.["status"];
  if (status === "recorded" || status === "duplicate") {
    if (typeof o?.["event_id"] !== "string") return failure("integrity", "The triage receipt failed verification.");
    return { ok: true as const, status, eventId: o["event_id"] };
  }
  if (status === "stale") return failure("invalid", "Another triage decision was recorded first. Reload the history and review again.");
  if (status === "rejected") return failure("invalid", typeof o?.["detail"] === "string" ? `Not recorded: ${o["detail"]}.` : "Not recorded.");
  return failure("integrity", "The triage receipt failed verification.");
}

/** Latest event per submitted term, following the append-only chain. */
export function latestTriageByTerm(events: TriageEvent[]): Map<string, TriageEvent> {
  const superseded = new Set(events.map((e) => e.previousEventId).filter((v): v is string => !!v));
  const out = new Map<string, TriageEvent>();
  for (const e of events) if (!superseded.has(e.eventId)) out.set(`${e.submissionId}:${e.termId}`, e);
  return out;
}
