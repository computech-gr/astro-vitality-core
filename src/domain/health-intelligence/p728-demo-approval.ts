/**
 * P72.8 direct Researcher DEMO SCIENTIFIC APPROVAL (pure, browser-safe).
 *
 * For explicitly synthetic demonstration missions the Researcher approves or
 * rejects submitted unknown biomarkers directly; no independently provisioned
 * source-validation receipt is involved (that requirement stays on production
 * scientific approval). Approval adds the term to the synthetic demo scope when
 * needed (the existing P61.5 Researcher authorization) and records the existing
 * P37 demo decision; Ground Medical activates or declines separately. These
 * rules mirror, never replace, the server checks that re-validate every write.
 */
import type { ActionFit } from "./p55-bulk-selection-engine";
import type { PreflightCategory } from "./p38-bulk-demo-preflight";
import { demoDecideFit } from "./p55-bulk-actions";
import { scopeAuthorizationFit } from "./p615-scope-authorization";

export const DEMO_SCIENTIFIC_APPROVAL_LABEL = "DEMO SCIENTIFIC APPROVAL — NOT CLINICALLY VALIDATED";

const ok: ActionFit = { kind: "actionable" };
const already = (reason: string): ActionFit => ({ kind: "already", reason });
const blocked = (reason: string): ActionFit => ({ kind: "blocked", reason });

export interface DemoApprovalRow {
  category: PreflightCategory;
  inScope: boolean;
  triageAction: string | null;
  reasons: readonly string[];
  unit: string;
}
export interface DemoApprovalCtx {
  submittedByCaller: boolean;
  canDecide: boolean;
  canAuthorize: boolean;
  /** P61.5 scope authorization is installed (it is on the shared backend). */
  authorizeInstalled: boolean;
  /** A recorded P72.8 Researcher decision for this term, if any. */
  recorded: "APPROVE" | "REJECT" | null;
}

/** Demo Scientific Approve: the existing demo-decision prerequisites, with the scope step included. */
export function demoApproveFit(r: DemoApprovalRow, ctx: DemoApprovalCtx): ActionFit {
  if (ctx.recorded === "REJECT") return blocked("A demo scientific rejection is recorded for this term.");
  if (ctx.recorded === "APPROVE") return already("A demo scientific approval is already recorded.");
  if (!r.inScope) {
    const s = scopeAuthorizationFit(r, {
      canAuthorize: ctx.canAuthorize,
      submittedByCaller: ctx.submittedByCaller,
      installed: ctx.authorizeInstalled,
    });
    if (s.kind === "blocked") return s;
  }
  return demoDecideFit({ ...r, inScope: true }, ctx);
}

/** Demo Scientific Reject: only terms without any demo decision; needs the P72.8 record path. */
export function demoRejectFit(
  r: Pick<DemoApprovalRow, "category" | "triageAction">,
  ctx: { canDecide: boolean; submittedByCaller: boolean; recordsInstalled: boolean; recorded: "APPROVE" | "REJECT" | null },
): ActionFit {
  if (ctx.recorded === "REJECT") return already("A demo scientific rejection is already recorded.");
  if (ctx.recorded === "APPROVE" || r.category === "already_active" || r.category === "already_decided")
    return blocked("This term already has a demo scientific approval; Ground Medical decides it.");
  if (!ctx.recordsInstalled)
    return blocked(
      "Recorded demo rejections need the pending P72.8 database change; until then use the individual “Reject review request” triage action.",
    );
  if (ctx.submittedByCaller) return blocked("You submitted this term; an independent Researcher must decide it.");
  if (r.triageAction !== "ACCEPT_FOR_REVIEW") return blocked("Accept it for scientific review first.");
  if (!ctx.canDecide) return blocked("This account has no scientific approver grant.");
  return ok;
}

/** Rationale rule shared with the server (8 to 2000 characters after trimming). */
export function rationaleProblem(text: string): string | null {
  const t = text.trim();
  if (t.length < 8) return "A scientific rationale of at least 8 characters is required.";
  if (t.length > 2000) return "The rationale must be at most 2000 characters.";
  return null;
}

/** One reference per line: trimmed, de-duplicated, sorted; at most 20 of up to 300 characters. */
export function parseEvidenceRefs(text: string): { refs: string[]; problem: string | null } {
  const refs = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))].sort();
  if (refs.length > 20) return { refs, problem: "At most 20 evidence references." };
  if (refs.some((r) => r.length > 300)) return { refs, problem: "Each evidence reference is at most 300 characters." };
  return { refs, problem: null };
}

/** Suggested evidence references for the selected terms: original request IDs and cited source digests. */
export function suggestedEvidenceRefs(
  rows: readonly { requestId: string | null; sourceDocumentSha256: readonly string[] }[],
): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.requestId) s.add(`request:${r.requestId}`);
    for (const d of r.sourceDocumentSha256) s.add(`source-document-sha256:${d}`);
  }
  return [...s].sort().slice(0, 20);
}

// --- Server state (strict parse; fails closed) ---------------------------------------------

export type DemoRecordType =
  | "RESEARCHER_DEMO_APPROVE"
  | "RESEARCHER_DEMO_REJECT"
  | "MEDICAL_DEMO_ACTIVATE"
  | "MEDICAL_DEMO_DECLINE";
const RECORD_TYPES: readonly DemoRecordType[] = [
  "RESEARCHER_DEMO_APPROVE",
  "RESEARCHER_DEMO_REJECT",
  "MEDICAL_DEMO_ACTIVATE",
  "MEDICAL_DEMO_DECLINE",
];
export interface DemoDecisionRecord {
  recordId: string;
  recordType: DemoRecordType;
  submissionId: string;
  termId: string;
  demoEventId: string | null;
  rationale: string;
  evidenceRefs: string[];
  actorRole: "researcher" | "ground_medical";
  recordedByCaller: boolean;
  recordedAt: string;
}
export type DemoDecisionState =
  | { installed: false }
  | {
      installed: true;
      classified: boolean;
      problem: string | null;
      canDecide: boolean;
      canActivate: boolean;
      records: DemoDecisionRecord[];
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TERM = /^ubt-[0-9a-f]{8}$/;

export function parseDemoDecisionState(data: unknown, missionId: string): DemoDecisionState | null {
  const o = data as Record<string, unknown> | null;
  if (!o || o["mission_id"] !== missionId || !Array.isArray(o["records"])) return null;
  if (typeof o["classified"] !== "boolean" || typeof o["can_decide"] !== "boolean" || typeof o["can_activate"] !== "boolean")
    return null;
  const problem = o["problem"];
  if (problem !== null && typeof problem !== "string") return null;
  const records: DemoDecisionRecord[] = [];
  for (const r of o["records"] as Record<string, unknown>[]) {
    const type = r["record_type"] as DemoRecordType;
    const refs = r["evidence_refs"];
    const role = r["actor_role"];
    const demo = r["demo_event_id"];
    if (
      typeof r["record_id"] !== "string" || !UUID.test(r["record_id"]) ||
      !RECORD_TYPES.includes(type) ||
      typeof r["submission_id"] !== "string" || !UUID.test(r["submission_id"]) ||
      typeof r["term_id"] !== "string" || !TERM.test(r["term_id"]) ||
      (demo !== null && (typeof demo !== "string" || !UUID.test(demo))) ||
      (type === "RESEARCHER_DEMO_REJECT") !== (demo === null) ||
      typeof r["rationale"] !== "string" ||
      !Array.isArray(refs) || !refs.every((x) => typeof x === "string") ||
      (role !== "researcher" && role !== "ground_medical") ||
      type.startsWith("RESEARCHER_") !== (role === "researcher") ||
      r["label"] !== DEMO_SCIENTIFIC_APPROVAL_LABEL ||
      typeof r["recorded_by_caller"] !== "boolean" ||
      typeof r["recorded_at"] !== "string"
    )
      return null;
    records.push({
      recordId: r["record_id"],
      recordType: type,
      submissionId: r["submission_id"],
      termId: r["term_id"],
      demoEventId: demo as string | null,
      rationale: r["rationale"],
      evidenceRefs: refs as string[],
      actorRole: role,
      recordedByCaller: r["recorded_by_caller"],
      recordedAt: r["recorded_at"],
    });
  }
  return {
    installed: true,
    classified: o["classified"],
    problem: problem as string | null,
    canDecide: o["can_decide"],
    canActivate: o["can_activate"],
    records,
  };
}

/** The P72.8 record path is in force for this mission (installed, classified, no provenance problem). */
export function demoRecordsActive(s: DemoDecisionState | null): boolean {
  return !!s && s.installed && s.classified && s.problem === null;
}

/** Latest Researcher / Ground Medical decision per submitted term ("submissionId:termId"). */
export function recordedDecisions(s: DemoDecisionState | null) {
  const researcher = new Map<string, "APPROVE" | "REJECT">();
  const medical = new Map<string, "ACTIVATE" | "DECLINE">();
  if (s?.installed)
    for (const r of s.records) {
      const k = `${r.submissionId}:${r.termId}`;
      if (r.recordType === "RESEARCHER_DEMO_APPROVE") researcher.set(k, "APPROVE");
      if (r.recordType === "RESEARCHER_DEMO_REJECT") researcher.set(k, "REJECT");
      if (r.recordType === "MEDICAL_DEMO_ACTIVATE") medical.set(k, "ACTIVATE");
      if (r.recordType === "MEDICAL_DEMO_DECLINE") medical.set(k, "DECLINE");
    }
  return { researcher, medical };
}
