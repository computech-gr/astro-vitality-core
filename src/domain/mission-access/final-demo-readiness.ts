import { DEMO_MISSION_CODE } from "./demo-mission-activation";
import type { MissionIdentitySnapshot } from "@/infrastructure/mission-identity";

export type FinalGate = { id: string; label: string; state: "local_verified" | "observed_membership" | "pending_owner" | "pending_independent"; evidence: string };
/** Never infer Administrator rights from operator membership or an offline artifact. */
export function buildFinalDemoReadiness(identity: MissionIdentitySnapshot | null, currentMissionCode: string): FinalGate[] {
  const codes = identity?.signedIn ? (identity.memberships ?? []).map(m => m.missionCode) : [];
  const isolated = codes.includes(DEMO_MISSION_CODE);
  return [
    { id: "offline", label: "Offline four-domain demo", state: "local_verified", evidence: "Deterministic 18-observation fixture; not Cloud evidence" },
    { id: "mission", label: "Dedicated demo mission", state: isolated ? "observed_membership" : "pending_owner", evidence: isolated ? "Mission membership visible to current account; independently verify mission isolation" : "Owner must explicitly create and verify MITO_DEMO_2026" },
    { id: "selection", label: "Demo mission selected", state: isolated && currentMissionCode === DEMO_MISSION_CODE ? "observed_membership" : "pending_owner", evidence: "Select the isolated mission; never mutate MISSION_TEST" },
    { id: "admin", label: "Administrator backend access", state: "pending_owner", evidence: "Requires reviewed server authorization and RLS; operator is not administrator" },
    { id: "pipeline", label: "PDF / CSV / wearable to canonical timeline", state: "pending_independent", evidence: "Run real role-separated synthetic E2E with unit, quality, provenance and idempotency checks" },
    { id: "ground", label: "Independent Ground Medical acceptance", state: "pending_independent", evidence: "Separate reviewer, audited decisions and replay evidence required" },
    { id: "science", label: "Scientific review and security gates", state: "pending_independent", evidence: "Nikolas review, FV-01.13, P32 and P34 not certified by this demo" },
    { id: "device", label: "Real-device validation", state: "pending_independent", evidence: "Real-origin evidence must remain isolated; no clinical claims" },
    { id: "release", label: "NASA submission demo acceptance", state: "pending_independent", evidence: "Owner approval, desktop/mobile run and signed acceptance record required" },
  ];
}
export function buildFinalHandoff(identity: MissionIdentitySnapshot | null, currentMissionCode: string) {
  return { schema: "mitochondria.final-demo-handoff.v1", missionCode: currentMissionCode, syntheticOnly: true, clinicalApproval: false, adminAuthorizationVerified: false, gates: buildFinalDemoReadiness(identity, currentMissionCode), warning: "Planning handoff only. Not evidence of Cloud activation or independent acceptance." };
}
