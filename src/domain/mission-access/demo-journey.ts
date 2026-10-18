import type { MissionIdentitySnapshot } from "@/infrastructure/mission-identity";

export type DemoJourneyRole = "mission_operator" | "crew_self" | "ground_medical" | "researcher";
export type DemoJourneyStep = { label: string; href: string; purpose: string; role?: DemoJourneyRole };
export const DEMO_JOURNEY: readonly DemoJourneyStep[] = [
  { label: "Mission identity", href: "/mission/identity", purpose: "Verify the signed-in identity and active mission membership." },
  { label: "Mission workspace", href: "/mission/experience", purpose: "Select the mission and crew context." },
  { label: "Mission documents", href: "/mission/documents", purpose: "Review synthetic lab evidence with Crew Self authorization.", role: "crew_self" },
  { label: "Device integration", href: "/mission/devices", purpose: "Inspect simulated-device capabilities and collection boundaries." },
  { label: "Bone health", href: "/mission/bone-health", purpose: "Inspect synthetic-only local bone evidence." },
  { label: "Cardiovascular health", href: "/mission/cardiovascular-health", purpose: "Inspect cardiovascular research evidence." },
  { label: "Immune changes", href: "/mission/immune-health", purpose: "Inspect draft proposals and missing evidence." },
  { label: "Behavioral health", href: "/mission/behavioral-health", purpose: "Inspect behavioral and sleep research evidence." },
  { label: "Health intelligence", href: "/mission/intelligence", purpose: "Review non-diagnostic research intelligence." },
  { label: "Ground & research", href: "/mission/ground", purpose: "Independent Ground Medical membership is required for decisions.", role: "ground_medical" },
];

/** Advisory only: the destination and database independently enforce authorization. */
export function getDemoJourneyAccess(identity: MissionIdentitySnapshot | null, missionCode: string, step: DemoJourneyStep): "check destination access" | "membership visible" | "separate account required" | "sign-in required" {
  if (!identity?.signedIn) return "sign-in required";
  if (!step.role) return "check destination access";
  return identity.memberships.some(m => m.missionCode === missionCode && m.role === step.role) ? "membership visible" : "separate account required";
}

export function isReservedDemoMission(code: string): boolean { return code.trim().toUpperCase() === "MISSION_TEST"; }
