// FV-01.4.3 role compatibility policy — PROPOSED, awaiting final owner approval.
// UI mirror only. The database (mission_roles_compatible + membership trigger)
// is the enforcing authority; this module must never be used to grant access.
export type MissionAccessRole = "crew_self" | "ground_medical" | "mission_operator" | "researcher";

const FORBIDDEN_SAME_MISSION: ReadonlyArray<readonly [MissionAccessRole, MissionAccessRole]> = [
  ["crew_self", "ground_medical"],
  ["crew_self", "researcher"],
  ["ground_medical", "mission_operator"],
];

export function rolesCompatible(a: MissionAccessRole, b: MissionAccessRole): boolean {
  if (a === b) return true;
  return !FORBIDDEN_SAME_MISSION.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Console roles in deterministic priority: the most capable authorized role first. */
export const CONSOLE_ROLE_PRIORITY: readonly MissionAccessRole[] = ["ground_medical", "researcher"];

export interface ConsoleMembership {
  missionId: string;
  role: MissionAccessRole;
}

export function consoleSelectionKey(m: ConsoleMembership): string {
  return `${m.missionId}::${m.role}`;
}

/** Eligible console memberships, ordered by mission then role priority (never by load order). */
export function orderConsoleMemberships<T extends ConsoleMembership>(memberships: readonly T[]): T[] {
  return memberships
    .filter((m) => CONSOLE_ROLE_PRIORITY.includes(m.role))
    .slice()
    .sort((a, b) => a.missionId.localeCompare(b.missionId) || CONSOLE_ROLE_PRIORITY.indexOf(a.role) - CONSOLE_ROLE_PRIORITY.indexOf(b.role));
}

/** Keeps a still-valid previous selection; otherwise the highest-priority role of the first mission. */
export function resolveConsoleSelection<T extends ConsoleMembership>(memberships: readonly T[], previousKey?: string): T | undefined {
  const ordered = orderConsoleMemberships(memberships);
  return ordered.find((m) => consoleSelectionKey(m) === previousKey) ?? ordered[0];
}
