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

/**
 * P72.3 presentation context: the existing synthetic demonstration mission and its
 * crew member (owner-approved). Preselected only when the signed-in account already
 * holds the matching membership; it is never created or forced.
 */
export const P72_TARGET_MISSION = {
  missionId: "mission-9d8ce8f3e5554509a0885461f9ad2e1c",
  missionCode: "MITO_DEMO_2026",
  missionName: "MITOCHONDRIA 2026 - Synthetic Demonstration",
  crewMemberId: "crew-9806e7e611f44dc38dac5e23f7740f1a",
  crewDisplayName: "Alex Morgan",
  crewExternalRef: "DEMO-ASTRO-001",
} as const;

export const P72_TARGET_LABEL = `${P72_TARGET_MISSION.missionCode} — ${P72_TARGET_MISSION.crewDisplayName}`;

/** Researcher context is mission-level only: it never names a crew subject. */
export function p72TargetLabel(role: DemoRole): string {
  return role === "researcher" ? P72_TARGET_MISSION.missionCode : P72_TARGET_LABEL;
}

export interface P72RoleRoute {
  role: DemoRole;
  membershipRole: MissionRole;
  consolePath: "/mission/experience" | "/mission/scientific-review" | "/mission/ground";
  consoleLabel: string;
  maskedAccount: string;
}

export const P72_ROLE_ROUTES: Record<DemoRole, P72RoleRoute> = {
  // P72.3: the Astronaut button opens the same Ground Medical console as Medical.
  astronaut: { role: "astronaut", membershipRole: "ground_medical", consolePath: "/mission/ground", consoleLabel: "Ground Medical Console", maskedAccount: "ma•••@computech.gr" },
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

/** The exact target-mission membership this role needs (crew-scoped roles also need the target crew). */
export function p72TargetMembership(role: DemoRole, memberships: readonly MissionMembershipContext[]): MissionMembershipContext | undefined {
  const want = P72_ROLE_ROUTES[role].membershipRole;
  return memberships.find(
    (m) =>
      m.missionId === P72_TARGET_MISSION.missionId &&
      m.role === want &&
      (want === "researcher" || m.crewMemberId === P72_TARGET_MISSION.crewMemberId),
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
