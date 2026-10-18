import { describe, expect, it } from "vitest";
import { DEMO_JOURNEY, getDemoJourneyAccess, isReservedDemoMission } from "@/domain/mission-access/demo-journey";
import type { MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
const identity: MissionIdentitySnapshot = { configured: true, signedIn: true, memberships: [{ missionId: "m1", missionCode: "FV01-TEST-B", role: "mission_operator" }] };
describe("P35.13 guided demo navigation", () => {
  it("retains all ten unique canonical journey destinations", () => { expect(DEMO_JOURNEY).toHaveLength(10); expect(new Set(DEMO_JOURNEY.map(s => s.href)).size).toBe(10); expect(DEMO_JOURNEY.find(s => s.label === "Mission documents")?.href).toBe("/mission/documents"); });
  it("does not misrepresent operator as crew or independent reviewer", () => { expect(getDemoJourneyAccess(identity, "FV01-TEST-B", DEMO_JOURNEY[2])).toBe("separate account required"); expect(getDemoJourneyAccess(identity, "FV01-TEST-B", DEMO_JOURNEY[9])).toBe("separate account required"); });
  it("does not use cross-mission roles", () => { const other: MissionIdentitySnapshot = { configured: true, signedIn: true, memberships: [...identity.memberships, { missionId: "m2", missionCode: "OTHER", role: "ground_medical" }] }; expect(getDemoJourneyAccess(other, "FV01-TEST-B", DEMO_JOURNEY[9])).toBe("separate account required"); });
  it("recognizes role evidence without granting authorization", () => { const crew: MissionIdentitySnapshot = { configured: true, signedIn: true, memberships: [{ missionId: "m1", missionCode: "FV01-TEST-B", role: "crew_self" }] }; expect(getDemoJourneyAccess(crew, "FV01-TEST-B", DEMO_JOURNEY[2])).toBe("membership visible"); });
  it("hides role evidence from signed-out identities", () => { expect(getDemoJourneyAccess(null, "FV01-TEST-B", DEMO_JOURNEY[2])).toBe("sign-in required"); });
  it("protects reserved mission identifier case-insensitively", () => { expect(isReservedDemoMission(" mission_test ")).toBe(true); expect(isReservedDemoMission("FV01-TEST-B")).toBe(false); });
});
