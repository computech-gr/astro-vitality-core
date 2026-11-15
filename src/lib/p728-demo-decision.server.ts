/**
 * Server core for P72.8 DEMO SCIENTIFIC APPROVAL records. Calls the
 * caller-scoped functions staged in
 * supabase/pending/20261115020000_p728_demo_scientific_decision.sql as the
 * signed-in user (never the service role). Until the owner applies that change
 * the state read reports "not installed" and decisions fail closed with
 * "migration required"; the existing installed demo path is used instead.
 * Idempotency keys are derived from the caller, the term and the exact request.
 * Framework-free.
 */
import { classifyAuthorizationError, failure, type Rpc } from "./p36-scientific-authorization.server";
import { deterministicUuid, parseResults, termRef } from "./p38-bulk-demo.server";
import type { BatchResponse } from "@/domain/health-intelligence/p38-bulk-demo-batches";
import {
  parseDemoDecisionState,
  parseEvidenceRefs,
  rationaleProblem,
  type DemoDecisionState,
} from "@/domain/health-intelligence/p728-demo-approval";

export type DemoDecisionStateResult =
  | ({ ok: true } & DemoDecisionState)
  | { ok: false; message: string };

const MIGRATION_MESSAGE =
  "Recorded demo scientific decisions are not installed yet: the owner-approved P72.8 database change has not been applied. Nothing was recorded.";

export async function getDemoDecisionStateCore(rpc: Rpc, missionId: string): Promise<DemoDecisionStateResult> {
  const { data, error } = await rpc("p728_demo_review_records_v1", { p_mission_id: missionId });
  if (error) {
    const c = classifyAuthorizationError(error.code);
    if (c === "migration_required") return { ok: true, installed: false };
    if (c === "forbidden") return { ok: false, message: "This account cannot read demo scientific decisions for this mission." };
    return { ok: false, message: "Demo scientific decisions are unavailable. Nothing was changed." };
  }
  const s = parseDemoDecisionState(data, missionId);
  return s ? { ok: true, ...s } : { ok: false, message: "The demo decision response failed validation; nothing was assumed." };
}

function fail(code: string | undefined): BatchResponse {
  const c = classifyAuthorizationError(code);
  if (c === "migration_required") return failure(c, MIGRATION_MESSAGE);
  if (c === "forbidden")
    return failure(c, "This account or mission is not authorized for this demo decision. Nothing in the batch was recorded.");
  if (c === "invalid") return failure(c, "The request was refused as malformed. Nothing in it was recorded.");
  return failure(c, "The batch could not be completed. Nothing in it was recorded.");
}

/** The SQL reports record_id/demo_event_id; the shared batch parser expects event_id. */
const withEventId = (data: unknown) => {
  const o = data as Record<string, unknown> | null;
  if (!o || !Array.isArray(o["results"])) return data;
  return {
    ...o,
    results: (o["results"] as Record<string, unknown>[]).map((r) => ({
      ...r,
      event_id: (r["demo_event_id"] as string | null | undefined) ?? (r["record_id"] as string | null | undefined) ?? null,
    })),
  };
};

export interface ResearcherDecisionInput {
  missionId: string;
  decision: "APPROVE" | "REJECT";
  rationale: string;
  evidenceRefs: string[];
  items: { submissionId: string; termId: string; exactUnit: string; displayName: string; domain: string | null }[];
}

export async function researcherDemoDecideCore(rpc: Rpc, userId: string, d: ResearcherDecisionInput): Promise<BatchResponse> {
  const rationale = d.rationale.trim();
  const problem = rationaleProblem(rationale);
  if (problem) return failure("invalid", `${problem} Nothing was recorded.`);
  const refs = parseEvidenceRefs(d.evidenceRefs.join("\n"));
  if (refs.problem) return failure("invalid", `${refs.problem} Nothing was recorded.`);
  if (!d.items.length || d.items.length > 50) return failure("invalid", "A batch holds 1 to 50 terms. Nothing was recorded.");
  if (d.decision === "APPROVE" && d.items.some((i) => !i.domain || i.displayName.trim().length < 3))
    return failure("invalid", "Every approved term needs a display name and a domain. Nothing was recorded.");
  const items = await Promise.all(
    d.items.map(async (i) => ({
      submission_id: i.submissionId,
      term_id: i.termId,
      exact_unit: i.exactUnit,
      display_name: i.displayName.trim(),
      domain: i.domain,
      idempotency_key: await deterministicUuid(
        "p728-researcher", userId, d.missionId, d.decision, i.submissionId, i.termId,
        i.displayName.trim(), i.domain ?? "", i.exactUnit, rationale, refs.refs.join("\n"),
      ),
    })),
  );
  const { data, error } = await rpc("p728_demo_researcher_decide_v1", {
    p_mission_id: d.missionId,
    p_decision: d.decision,
    p_rationale: rationale,
    p_evidence_refs: refs.refs,
    p_items: items,
  });
  return error ? fail(error.code) : parseResults(withEventId(data), d.missionId, items.length, termRef);
}

export interface MedicalDecisionInput {
  missionId: string;
  decision: "ACTIVATE" | "DECLINE";
  rationale: string;
  items: { decisionEventId: string; expectedEntrySha256: string }[];
}

export async function medicalDemoDecideCore(rpc: Rpc, userId: string, d: MedicalDecisionInput): Promise<BatchResponse> {
  const rationale = d.rationale.trim();
  const problem = rationaleProblem(rationale);
  if (problem) return failure("invalid", `${problem.replace("scientific ", "")} Nothing was recorded.`);
  if (!d.items.length || d.items.length > 50) return failure("invalid", "A batch holds 1 to 50 proposals. Nothing was recorded.");
  const items = await Promise.all(
    d.items.map(async (i) => ({
      decision_event_id: i.decisionEventId,
      expected_entry_sha256: i.expectedEntrySha256,
      idempotency_key: await deterministicUuid("p728-medical", userId, d.missionId, d.decision, i.decisionEventId, i.expectedEntrySha256, rationale),
    })),
  );
  const { data, error } = await rpc("p728_demo_medical_decide_v1", {
    p_mission_id: d.missionId,
    p_decision: d.decision,
    p_rationale: rationale,
    p_items: items,
  });
  return error
    ? fail(error.code)
    : parseResults(withEventId(data), d.missionId, items.length, (r) => (typeof r["decision_event_id"] === "string" ? r["decision_event_id"] : null));
}
