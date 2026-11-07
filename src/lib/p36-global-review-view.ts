/** Pure, browser-safe grouping for the read-only Global Scientific Review panel. */
import type { GlobalReviewMission, GlobalReviewSubmission } from "./p36-global-review.server";

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
