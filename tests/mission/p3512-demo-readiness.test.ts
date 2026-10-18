import { describe, expect, it } from "vitest";
import { summarizeDemoAccess } from "@/domain/mission-access/demo-readiness";

describe("P35.12 read-only demo access readiness", () => {
  it("does not confuse operator membership with administrator, crew or reviewer access", () => {
    const result = summarizeDemoAccess({ configured: true, signedIn: true, memberships: [{ missionId: "m1", missionCode: "MISSION_TEST", role: "mission_operator" }] }, "MISSION_TEST");
    expect(result.checks.find((c) => c.label === "Mission Operator")?.status).toBe("verified membership");
    expect(result.checks.find((c) => c.label === "Administrator")?.status).toContain("not established");
    expect(result.checks.find((c) => c.label === "Ground Medical")?.status).toContain("independent");
    expect(result.checks.find((c) => c.label === "Synthetic demo isolation")?.status).toContain("do not mutate");
  });
  it("does not reveal membership details while signed out or pending", () => {
    expect(summarizeDemoAccess(null, "X").checks).toEqual([]);
    expect(summarizeDemoAccess({ configured: true, signedIn: false, memberships: [] }, "X").checks).toEqual([]);
  });
  it("scopes role evidence to the requested mission", () => {
    const result = summarizeDemoAccess({ configured: true, signedIn: true, memberships: [{ missionId: "m1", missionCode: "OTHER", role: "ground_medical" }] }, "TARGET");
    expect(result.checks.find((c) => c.label === "Ground Medical")?.status).toBe("independent reviewer required");
  });
});
