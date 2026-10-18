import { describe, expect, test } from "bun:test";
import { buildFinalDemoReadiness, buildFinalHandoff } from "../../src/domain/mission-access/final-demo-readiness";
import type { MissionIdentitySnapshot } from "../../src/infrastructure/mission-identity";
const user: MissionIdentitySnapshot = { configured: true, signedIn: true, memberships: [{ missionId: "demo", missionCode: "MITO_DEMO_2026", role: "mission_operator" }] };
describe("P35.22 governed final acceptance", () => {
  test("signed-out state never observes demo membership", () => expect(buildFinalDemoReadiness({ ...user, signedIn: false }, "MITO_DEMO_2026").find(g => g.id === "mission")?.state).toBe("pending_owner"));
  test("operator sees only membership, not admin rights", () => { const gates=buildFinalDemoReadiness(user, "MITO_DEMO_2026"); expect(gates.find(g=>g.id==="mission")?.state).toBe("observed_membership"); expect(gates.find(g=>g.id==="admin")?.state).toBe("pending_owner"); });
  test("MISSION_TEST never counts as selected demo", () => expect(buildFinalDemoReadiness(user, "MISSION_TEST").find(g=>g.id==="selection")?.state).toBe("pending_owner"));
  test("medical and scientific gates cannot be self-certified", () => expect(buildFinalDemoReadiness(user, "MITO_DEMO_2026").filter(g=>["ground","science","device"].includes(g.id)).every(g=>g.state==="pending_independent")).toBe(true));
  test("handoff never claims clinical or admin approval", () => {const x=buildFinalHandoff(user,"MITO_DEMO_2026");expect(x.clinicalApproval).toBe(false);expect(x.adminAuthorizationVerified).toBe(false);expect(x.syntheticOnly).toBe(true);});
  test("missing identity fails closed", () => expect(buildFinalDemoReadiness(null,"MITO_DEMO_2026").find(g=>g.id==="mission")?.state).toBe("pending_owner"));
});
