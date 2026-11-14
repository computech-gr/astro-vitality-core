/**
 * P72.2 — mission-level Ground Medical crew scope (pure).
 *
 * The database grants an active Ground Medical membership with no crew binding access to every
 * crew member actively assigned to that mission (observation sync and the caller-scoped crew
 * roster RPC both accept `crew_member_id is null`). Invitations cannot bind Ground Medical to a
 * crew member, so without this expansion an invited Ground Medical account could never select a
 * crew member in Examinations, Stored observations or the Full Health Report.
 *
 * Rules: only Ground Medical is expanded; only crew named by the caller-scoped roster of the SAME
 * mission are added; original memberships are kept unchanged; nothing is guessed and an unreadable
 * roster adds nothing. The server re-validates the exact mission + crew scope on every read/write.
 */
import type { MissionMembershipContext } from "@/infrastructure/mission-identity";

export interface MissionRosterEntry {
  missionId: string;
  crewMemberId: string;
  displayName: string;
}

/** Missions where the caller holds Ground Medical without a crew binding (roster reads needed). */
export function missionLevelGroundMedicalMissions(memberships: readonly MissionMembershipContext[]): string[] {
  return [...new Set(memberships.filter((m) => m.role === "ground_medical" && !m.crewMemberId).map((m) => m.missionId))];
}

export function expandMissionLevelGroundMedical(
  memberships: readonly MissionMembershipContext[],
  rosterByMission: ReadonlyMap<string, readonly MissionRosterEntry[]>,
): MissionMembershipContext[] {
  const out = [...memberships];
  const has = new Set(memberships.filter((m) => m.crewMemberId).map((m) => `${m.missionId}|${m.role}|${m.crewMemberId}`));
  for (const m of memberships) {
    if (m.role !== "ground_medical" || m.crewMemberId) continue;
    for (const r of rosterByMission.get(m.missionId) ?? []) {
      if (r.missionId !== m.missionId || !r.crewMemberId) continue;
      const key = `${m.missionId}|ground_medical|${r.crewMemberId}`;
      if (has.has(key)) continue;
      has.add(key);
      out.push({ ...m, crewMemberId: r.crewMemberId, ...(r.displayName ? { crewDisplayName: r.displayName } : {}) });
    }
  }
  return out;
}
