/** Pure, browser-safe grouping for the read-only Global Scientific Review panel. */
import type { GlobalReviewMission, GlobalReviewSubmission, GlobalReviewTerm } from "./p36-global-review.server";
import type { TriageEvent } from "./p36-global-triage.server";

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

export interface TermFilter { query: string; crew: string; state: ReviewState | "all"; classification: string }
export type TermSort = "label" | "term" | "unit" | "received";

export function filterTerms(rows: TermRow[], f: TermFilter): TermRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) =>
    (f.crew === ALL_CREWS || r.submission.crewPseudonym === f.crew)
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
