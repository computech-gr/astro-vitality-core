import type { MissionIdentitySnapshot } from "@/infrastructure/mission-identity";

export type DemoReadiness = {
  summary: string;
  checks: { label: string; status: string }[];
};

/** Display-only access evidence. Never use as an authorization decision. */
export function summarizeDemoAccess(identity: MissionIdentitySnapshot | null, missionCode: string): DemoReadiness {
  if (!identity) return { summary: "Checking authenticated mission membership.", checks: [] };
  if (!identity.signedIn) return { summary: "Sign-in required.", checks: [] };
  const memberships = identity.memberships.filter((m) => m.missionCode === missionCode);
  const roles = new Set(memberships.map((m) => m.role));
  const checks = [
    { label: "Mission Operator", status: roles.has("mission_operator") ? "verified membership" : "not verified" },
    { label: "Crew Self", status: roles.has("crew_self") ? "verified membership" : "separate Crew Self context required" },
    { label: "Ground Medical", status: roles.has("ground_medical") ? "verified membership; independent reviewer rules still apply" : "independent reviewer required" },
    { label: "Researcher", status: roles.has("researcher") ? "verified membership" : "not verified" },
    { label: "Administrator", status: "not established by mission roles; privileged backend verification required" },
    { label: "Synthetic demo isolation", status: missionCode === "MISSION_TEST" ? "reserved MISSION_TEST; do not mutate" : "verify dedicated synthetic mission before writes" },
  ];
  return { summary: `Mission ${missionCode}: ${memberships.length} active membership context(s) visible to this identity. Links do not imply authorization.`, checks };
}
