/**
 * P72 homepage role access (browser-safe). The three homepage buttons keep
 * their one-click synthetic demo for anonymous visitors; a signed-in mapped
 * mission account goes straight to its normal console instead.
 *
 * Full account emails live only in the server module (p72-role-access.server.ts);
 * the browser sees masked labels. Navigation is not authorization: every console
 * still enforces its own mission membership and database permissions.
 */
import type { MissionMembershipContext, MissionRole } from "@/infrastructure/mission-identity";
import type { DemoRole } from "@/domain/public-demo/workflow";

export const P72_TARGET_MISSION = {
  missionId: "mission-3fd366c331ed46afb0645cced1d45294",
  missionCode: "MISSION_TEST",
  missionName: "Mitochondria validation mission",
  crewMemberId: "crew-43f5fe4d102f40d19ced676dabd3b672",
  crewDisplayName: "Astronaut Test 01",
  crewExternalRef: "ASTRO-TEST-001",
} as const;

export const P72_TARGET_LABEL = `${P72_TARGET_MISSION.missionName} — ${P72_TARGET_MISSION.crewDisplayName}`;

export interface P72RoleRoute {
  role: DemoRole;
  membershipRole: MissionRole;
  consolePath: "/mission/experience" | "/mission/scientific-review" | "/mission/ground";
  consoleLabel: string;
  maskedAccount: string;
}

export const P72_ROLE_ROUTES: Record<DemoRole, P72RoleRoute> = {
  astronaut: { role: "astronaut", membershipRole: "crew_self", consolePath: "/mission/experience", consoleLabel: "Astronaut Mission Console", maskedAccount: "th•••@gmail.com" },
  researcher: { role: "researcher", membershipRole: "researcher", consolePath: "/mission/scientific-review", consoleLabel: "Researcher Scientific Console", maskedAccount: "ni•••@gmail.com" },
  medical: { role: "medical", membershipRole: "ground_medical", consolePath: "/mission/ground", consoleLabel: "Ground Medical Console", maskedAccount: "ma•••@computech.gr" },
};

/** Same masking the server applies; keeps full addresses out of the browser bundle. */
export function maskAccountEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "•••";
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}

export function isP72Role(value: unknown): value is DemoRole {
  return value === "astronaut" || value === "researcher" || value === "medical";
}

/** The exact target-mission membership this role needs (astronaut also needs the target crew). */
export function p72TargetMembership(role: DemoRole, memberships: readonly MissionMembershipContext[]): MissionMembershipContext | undefined {
  const want = P72_ROLE_ROUTES[role].membershipRole;
  return memberships.find(
    (m) =>
      m.missionId === P72_TARGET_MISSION.missionId &&
      m.role === want &&
      (want !== "crew_self" || m.crewMemberId === P72_TARGET_MISSION.crewMemberId),
  );
}

export type P72EntryDecision =
  | { kind: "demo" }
  | { kind: "console"; path: P72RoleRoute["consolePath"]; membership: MissionMembershipContext | undefined }
  | { kind: "wrong_account"; signedInAs: string | null };

/**
 * Signed-out or demo visitors → synthetic demo (one click). A signed-in mapped account →
 * its normal console (with the target mission preselected when it holds that membership).
 * Any other signed-in account is told which account the role expects; it is never switched silently.
 */
export function decideP72Entry(input: {
  role: DemoRole;
  standardSession: boolean;
  mappedAccount: boolean;
  signedInAs: string | null;
  memberships: readonly MissionMembershipContext[];
}): P72EntryDecision {
  if (!input.standardSession) return { kind: "demo" };
  if (!input.mappedAccount) return { kind: "wrong_account", signedInAs: input.signedInAs };
  return { kind: "console", path: P72_ROLE_ROUTES[input.role].consolePath, membership: p72TargetMembership(input.role, input.memberships) };
}

/** Only the three console paths may be used as a post-sign-in destination. */
export function safeP72Next(value: unknown): P72RoleRoute["consolePath"] | undefined {
  return Object.values(P72_ROLE_ROUTES).find((r) => r.consolePath === value)?.consolePath;
}
