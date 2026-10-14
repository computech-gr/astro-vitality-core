import type { MissionRole } from "@/infrastructure/mission-identity";

export interface MissionWorkflow {
  id: string;
  title: string;
  detail: string;
  href: string;
  roles: readonly MissionRole[];
  category: "observe" | "act" | "review";
}

/** Navigation is not authorization: every destination enforces its own permissions. */
export const MISSION_WORKFLOWS: readonly MissionWorkflow[] = [
  { id: "live", title: "Observe live measurements", detail: "Check source quality, stale signals and device availability before interpretation.", href: "/mission/live", roles: ["crew_self", "mission_operator", "ground_medical"], category: "observe" },
  { id: "devices", title: "Check device connections", detail: "Confirm browser permissions and supported sensor capabilities.", href: "/mission/devices", roles: ["crew_self", "mission_operator"], category: "observe" },
  { id: "records", title: "Review recorded evidence", detail: "Inspect mission-scoped records and data quality without inferring missing values.", href: "/mission/records", roles: ["crew_self", "mission_operator", "ground_medical"], category: "review" },
  { id: "guidance", title: "Self-assessment and guidance", detail: "Voluntary, session-only checklist and reviewed non-diagnostic protocol guidance.", href: "/mission/guidance", roles: ["crew_self"], category: "act" },
  { id: "offline", title: "Offline operations", detail: "Inspect encrypted local records, sync state and records needing human review.", href: "/mission/offline", roles: ["crew_self", "mission_operator"], category: "act" },
  { id: "alerts", title: "Review explainable alerts", detail: "Inspect quality, provenance and limitations; alerts are not diagnoses.", href: "/mission/alerts", roles: ["crew_self", "ground_medical", "mission_operator"], category: "review" },
  { id: "ground", title: "Ground and research workspace", detail: "Medical access and privacy-restricted research exports remain role separated.", href: "/mission/ground", roles: ["ground_medical", "researcher"], category: "review" },
  { id: "operations", title: "Mission and crew operations", detail: "Manage authorized mission memberships and crew assignments.", href: "/mission/operations", roles: ["mission_operator"], category: "act" },
  { id: "simulation", title: "Synthetic mission demonstration", detail: "Explore four fictional crew profiles, never live astronaut health data.", href: "/mission/simulation", roles: ["crew_self", "ground_medical", "mission_operator", "researcher"], category: "observe" },
];

export function workflowsForRole(role: MissionRole | undefined): readonly MissionWorkflow[] {
  return role ? MISSION_WORKFLOWS.filter((item) => item.roles.includes(role)) : [];
}
