/**
 * Authorized crew choices for the P36 dynamic review workspace (pure).
 *
 * - Crew-bound memberships contribute only their own exact crew member.
 * - Mission-level Ground Medical / Researcher memberships (crewMemberId null)
 *   contribute every crew member of the caller-readable mission roster.
 * - Nothing is guessed: a crew member appears only when an authorized
 *   membership or roster row names its exact ID. The server re-validates the
 *   exact scope (active assignment + membership) on every read and write.
 */
import type { MissionMembershipContext } from "@/infrastructure/mission-identity";

export interface RosterCrewMember {
  missionId: string;
  crewMemberId: string;
  displayName: string;
}

export interface CrewChoice {
  missionId: string;
  crewId: string;
  name: string;
  roles: string[];
}

const MISSION_LEVEL_ROLES = new Set(["ground_medical", "researcher"]);

export function buildCrewChoices(
  memberships: readonly MissionMembershipContext[],
  roster: readonly RosterCrewMember[],
  missionId: string | null,
): CrewChoice[] {
  if (!missionId) return [];
  const byCrew = new Map<string, CrewChoice>();
  const add = (crewId: string, name: string, role: string) => {
    const cur = byCrew.get(crewId) ?? { missionId, crewId, name, roles: [] };
    if (cur.name === crewId && name !== crewId) cur.name = name;
    if (!cur.roles.includes(role)) cur.roles.push(role);
    byCrew.set(crewId, cur);
  };
  const missionLevelRoles: string[] = [];
  for (const m of memberships) {
    if (m.missionId !== missionId) continue;
    if (m.crewMemberId) add(m.crewMemberId, m.crewDisplayName ?? m.crewMemberId, m.role);
    else if (MISSION_LEVEL_ROLES.has(m.role) && !missionLevelRoles.includes(m.role)) missionLevelRoles.push(m.role);
  }
  if (missionLevelRoles.length) {
    for (const r of roster) {
      if (r.missionId !== missionId || !r.crewMemberId) continue;
      for (const role of missionLevelRoles) add(r.crewMemberId, r.displayName || r.crewMemberId, role);
    }
  }
  return [...byCrew.values()].sort((a, b) => a.name.localeCompare(b.name) || a.crewId.localeCompare(b.crewId));
}

/** Roles the account holds for one exact scope (crew-bound or mission-level). */
export function rolesForScope(
  memberships: readonly MissionMembershipContext[],
  missionId: string,
  crewMemberId: string,
): string[] {
  return [
    ...new Set(
      memberships
        .filter(
          (m) =>
            m.missionId === missionId &&
            (m.crewMemberId === crewMemberId || (!m.crewMemberId && MISSION_LEVEL_ROLES.has(m.role))),
        )
        .map((m) => m.role),
    ),
  ];
}

/** True when the account may hold device-local requests or submit metadata anywhere in this mission. */
export function canHoldLocalRequests(memberships: readonly MissionMembershipContext[], missionId: string | null): boolean {
  return memberships.some(
    (m) => (missionId === null || m.missionId === missionId) && (m.role === "crew_self" || m.role === "ground_medical"),
  );
}
