/** Pure, browser-safe grouping for the read-only Global Scientific Review panel. */
import type { GlobalReviewMission, GlobalReviewSubmission, GlobalReviewTerm } from "./p36-global-review.server";
import type { TriageEvent } from "./p36-global-triage-rules";

export const ALL_MISSIONS = "__all_authorized_missions__";

export interface CrewGroup { crewPseudonym: string; submissions: GlobalReviewSubmission[]; termCount: number; pendingTermCount: number }
export interface MissionGroup { missionId: string; missionCode: string; missionName: string; crews: CrewGroup[]; termCount: number; pendingTermCount: number }

const pending = (s: GlobalReviewSubmission) => s.terms.filter((t) => t.decision !== "APPROVE" && t.decision !== "REJECT").length;

/** "All missions" is offered only to an explicitly authorized global reviewer. */
export function canChooseAllMissions(missions: GlobalReviewMission[]) {
  return missions.some((m) => m.accessBasis === "global_scientific_review");
}

/** Missions to load for a selection; unknown selections resolve to nothing (fail closed). */
export function missionsForSelection(missions: GlobalReviewMission[], selection: string) {
  if (selection === ALL_MISSIONS) return canChooseAllMissions(missions) ? missions : [];
  return missions.filter((m) => m.missionId === selection);
}

export function groupByMissionAndCrew(submissions: GlobalReviewSubmission[]): MissionGroup[] {
  const missions = new Map<string, MissionGroup>();
  for (const s of submissions) {
    let m = missions.get(s.missionId);
    if (!m) { m = { missionId: s.missionId, missionCode: s.missionCode, missionName: s.missionName, crews: [], termCount: 0, pendingTermCount: 0 }; missions.set(s.missionId, m); }
    let c = m.crews.find((x) => x.crewPseudonym === s.crewPseudonym);
    if (!c) { c = { crewPseudonym: s.crewPseudonym, submissions: [], termCount: 0, pendingTermCount: 0 }; m.crews.push(c); }
    c.submissions.push(s);
    c.termCount += s.terms.length; m.termCount += s.terms.length;
    const p = pending(s); c.pendingTermCount += p; m.pendingTermCount += p;
  }
  const out = [...missions.values()].sort((a, b) => a.missionCode.localeCompare(b.missionCode) || a.missionId.localeCompare(b.missionId));
  for (const m of out) {
    m.crews.sort((a, b) => a.crewPseudonym.localeCompare(b.crewPseudonym));
    for (const c of m.crews) c.submissions.sort((a, b) => a.receivedSeq - b.receivedSeq);
  }
  return out;
}

/* ---------- Term-level dashboard, filtering and pagination ---------- */

export const ALL_CREWS = "__all_crews__";
/** Triage state (from triage history) — never scientific approval. */
export type ReviewState = "awaiting_triage" | "accepted" | "more_evidence" | "rejected";
export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  awaiting_triage: "Awaiting triage",
  accepted: "Accepted for scientific review",
  more_evidence: "More evidence requested",
  rejected: "Review request rejected",
};
export type ScientificState = "pending" | "approved" | "rejected";
export const SCIENTIFIC_STATE_LABEL: Record<ScientificState, string> = {
  pending: "Pending scientific decision", approved: "Scientifically approved", rejected: "Scientifically rejected",
};

export interface TermRow { key: string; submission: GlobalReviewSubmission; term: GlobalReviewTerm; state: ReviewState; scientific: ScientificState; triage: TriageEvent | null }

export function triageState(latest: TriageEvent | null | undefined): ReviewState {
  if (latest?.action === "ACCEPT_FOR_REVIEW") return "accepted";
  if (latest?.action === "REQUEST_MORE_EVIDENCE") return "more_evidence";
  if (latest?.action === "REJECT_REVIEW_REQUEST") return "rejected";
  return "awaiting_triage";
}

export function scientificState(decision: GlobalReviewTerm["decision"]): ScientificState {
  return decision === "APPROVE" ? "approved" : decision === "REJECT" ? "rejected" : "pending";
}

/** One row per submitted term; a term repeated across receipts stays distinct by receipt. */
export function flattenTerms(submissions: GlobalReviewSubmission[], triage: Map<string, TriageEvent> = new Map()): TermRow[] {
  return submissions.flatMap((s) => s.terms.map((t) => {
    const key = `${s.submissionId}:${t.termId}`;
    const latest = triage.get(key) ?? null;
    return { key, submission: s, term: t, state: triageState(latest), scientific: scientificState(t.decision), triage: latest };
  }));
}

export function crewOptions(submissions: GlobalReviewSubmission[]) {
  const n = new Map<string, number>();
  for (const s of submissions) n.set(s.crewPseudonym, (n.get(s.crewPseudonym) ?? 0) + s.terms.length);
  return [...n.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([crewPseudonym, termCount]) => ({ crewPseudonym, termCount }));
}

export const ALL_REQUESTS = "__all_requests__";
export interface TermFilter { query: string; crew: string; state: ReviewState | "all"; classification: string; request?: string }
export type TermSort = "label" | "term" | "unit" | "received";

export function filterTerms(rows: TermRow[], f: TermFilter): TermRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) =>
    (f.crew === ALL_CREWS || r.submission.crewPseudonym === f.crew)
    && (!f.request || f.request === ALL_REQUESTS || r.submission.submissionId === f.request)
    && (f.state === "all" || r.state === f.state)
    && (f.classification === "all" || r.term.classification === f.classification)
    && (!q || [r.term.termId, r.term.exactUnit, r.submission.requestId, ...r.term.originalLabels, ...r.term.candidateMetricIds]
      .some((s) => s.toLowerCase().includes(q))));
}

export function sortTerms(rows: TermRow[], by: TermSort): TermRow[] {
  const key = (r: TermRow) => by === "label" ? (r.term.originalLabels[0] ?? "").toLowerCase()
    : by === "unit" ? r.term.exactUnit.toLowerCase() : by === "term" ? r.term.termId : String(r.submission.receivedSeq).padStart(16, "0");
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)) || a.key.localeCompare(b.key));
}

/** Clamps the page so a narrower filter never shows an empty page past the end. */
export function paginate<T>(rows: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { page: current, pages, items: rows.slice((current - 1) * size, current * size) };
}

/**
 * Cloud-submitted metadata only; device-local requests and dossiers are counted elsewhere.
 * Triage counts and scientific approval are separate: acceptance is never approval,
 * and every term stays activation-blocked because no governed activation path exists.
 */
export function dashboardCounts(rows: TermRow[]) {
  const c = { submittedTerms: rows.length, pending: 0, awaitingTriage: 0, accepted: 0, moreEvidence: 0, rejected: 0, approved: 0, activationBlocked: rows.length };
  for (const r of rows) {
    if (r.state === "awaiting_triage") c.awaitingTriage++;
    else if (r.state === "accepted") c.accepted++;
    else if (r.state === "more_evidence") c.moreEvidence++;
    else c.rejected++;
    if (r.scientific === "approved") c.approved++;
    if (r.scientific === "pending") c.pending++;
  }
  return c;
}

/* ---------- P72.7 request-level view (one row per submitted ubr-* request) ---------- */

/**
 * Initial mission selection: the only authorized mission, otherwise the only one
 * holding submissions. Selection is navigation, never authorization — every read is
 * still re-authorized by the server; ambiguous cases stay unselected.
 */
export function defaultMissionSelection(missions: GlobalReviewMission[]): string {
  if (missions.length === 1) return missions[0]!.missionId;
  const withSubmissions = missions.filter((m) => m.submissionCount > 0);
  return withSubmissions.length === 1 ? withSubmissions[0]!.missionId : "";
}

/** Minimal synthetic demo lifecycle facts per submitted term (read-only). */
export interface DemoTermFact { submissionId: string; termId: string; activationEventId: string | null; revocationEventId: string | null }

export type RequestStatus = "awaiting_triage" | "triage_in_progress" | "pending_scientific_decision" | "scientific_decisions_recorded";
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  awaiting_triage: "Awaiting triage",
  triage_in_progress: "Triage in progress",
  pending_scientific_decision: "Triaged · pending scientific decision",
  scientific_decisions_recorded: "Scientific decisions recorded",
};

export interface RequestSummary {
  submissionId: string;
  requestId: string;
  missionId: string;
  missionCode: string;
  missionName: string;
  crewPseudonym: string;
  submittedRole: string;
  receivedAt: string;
  receivedSeq: number;
  payloadSha256: string;
  termCount: number;
  triage: Record<ReviewState, number>;
  scientific: Record<ScientificState, number>;
  /** Synthetic demo facts (never scientific approval); null when the lifecycle was unavailable. */
  demo: { decided: number; active: number; revoked: number } | null;
  status: RequestStatus;
}

/** Status from recorded facts only: visibility or triage acceptance is never approval. */
export function requestStatus(termCount: number, triage: Record<ReviewState, number>, scientific: Record<ScientificState, number>): RequestStatus {
  if (termCount > 0 && scientific.pending === 0) return "scientific_decisions_recorded";
  if (triage.awaiting_triage === termCount) return "awaiting_triage";
  if (triage.awaiting_triage > 0) return "triage_in_progress";
  return "pending_scientific_decision";
}

/**
 * One summary per submitted request, keeping the original ubr-* ID, receipt time and
 * originating role exactly as received. Missions by code, requests by receipt order.
 */
export function summarizeRequests(
  submissions: GlobalReviewSubmission[],
  triage: Map<string, TriageEvent> = new Map(),
  demo: Map<string, readonly DemoTermFact[] | null> = new Map(),
): RequestSummary[] {
  const out = submissions.map((s): RequestSummary => {
    const t: Record<ReviewState, number> = { awaiting_triage: 0, accepted: 0, more_evidence: 0, rejected: 0 };
    const sc: Record<ScientificState, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const term of s.terms) {
      t[triageState(triage.get(`${s.submissionId}:${term.termId}`))]++;
      sc[scientificState(term.decision)]++;
    }
    const facts = demo.has(s.missionId) ? demo.get(s.missionId) ?? null : null;
    let d: RequestSummary["demo"] = null;
    if (facts) {
      const termIds = new Set(s.terms.map((x) => x.termId));
      const mine = facts.filter((f) => f.submissionId === s.submissionId && termIds.has(f.termId));
      d = {
        decided: mine.length,
        active: mine.filter((f) => f.activationEventId && !f.revocationEventId).length,
        revoked: mine.filter((f) => f.revocationEventId).length,
      };
    }
    return {
      submissionId: s.submissionId, requestId: s.requestId, missionId: s.missionId, missionCode: s.missionCode,
      missionName: s.missionName, crewPseudonym: s.crewPseudonym, submittedRole: s.submittedRole, receivedAt: s.receivedAt,
      receivedSeq: s.receivedSeq, payloadSha256: s.payloadSha256, termCount: s.terms.length, triage: t, scientific: sc,
      demo: d, status: requestStatus(s.terms.length, t, sc),
    };
  });
  return out.sort((a, b) => a.missionCode.localeCompare(b.missionCode) || a.missionId.localeCompare(b.missionId) || a.receivedSeq - b.receivedSeq);
}

/** Originating role as shown to reviewers (exact stored value kept in the receipt). */
export function originatingRoleLabel(role: string): string {
  return role === "ground_medical" ? "Ground Medical" : role === "crew_self" ? "Astronaut (crew self)" : role === "researcher" ? "Researcher" : role.replaceAll("_", " ");
}
