import type { MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import { DEMO_JOURNEY, isReservedDemoMission, type DemoJourneyEvidence } from "@/domain/mission-access/demo-journey";

export type DemoActor = "mission_operator" | "crew_self" | "ground_medical" | "researcher";
export type DemoRunbookItem = { step: number; label: string; href: string; actor: DemoActor; status: DemoJourneyEvidence; actorMembershipVisible: boolean; instructions: string };
export type DemoRunbook = { schema: "mitochondria.synthetic-demo-runbook.v1"; missionCode: string; reserved: boolean; readOnly: true; authorizationGranted: false; items: DemoRunbookItem[]; limitations: string[] };

/** Offline, non-authoritative guide. Never turn this export into an access token or audit receipt. */
export function buildDemoRunbook(missionCode: string, identity: MissionIdentitySnapshot | null, evidence: Record<string, DemoJourneyEvidence>): DemoRunbook {
  const memberships = identity?.signedIn ? identity.memberships.filter(m => m.missionCode === missionCode) : [];
  const items = DEMO_JOURNEY.map((step, index): DemoRunbookItem => {
    const actor: DemoActor = step.role ?? "mission_operator";
    return {
      step: index + 1, label: step.label, href: step.href, actor,
      status: isReservedDemoMission(missionCode) ? "not_checked" : evidence[step.href] ?? "not_checked",
      actorMembershipVisible: memberships.some(m => m.role === actor),
      instructions: actor === "crew_self" ? "Sign in separately as assigned Crew Self; review synthetic-only document evidence." :
        actor === "ground_medical" ? "Use independently authorized Ground Medical account; do not delegate decisions to operator." :
        actor === "researcher" ? "Use authorized Researcher account; keep research-only interpretation." :
        "Use authorized Mission Operator account; verify destination-specific permissions."
    };
  });
  return {
    schema: "mitochondria.synthetic-demo-runbook.v1", missionCode, reserved: isReservedDemoMission(missionCode),
    readOnly: true, authorizationGranted: false, items,
    limitations: [
      "Browser-only checklist is not proof of execution or backend acceptance.",
      "MISSION_TEST is reserved: do not write, import or create demo records in it.",
      "Administrator is not granted by Mission Operator membership.",
      "Clinical decisions, real-person measurements and real-device activation remain gated.",
      "Independent Ground Medical decisions require the authorized reviewer account."
    ]
  };
}

export function summarizeDemoActors(runbook: DemoRunbook) {
  const actors: readonly DemoActor[] = ["mission_operator", "crew_self", "ground_medical", "researcher"];
  return actors.map(actor => ({ actor, steps: runbook.items.filter(item => item.actor === actor).length, membershipVisible: runbook.items.some(item => item.actor === actor && item.actorMembershipVisible) }));
}
