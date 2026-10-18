import { describe, expect, it } from "vitest";
import { buildDemoRunbook, summarizeDemoActors } from "@/domain/mission-access/demo-runbook";

describe("P35.15 operational demo runbook", () => {
  const identity = { configured: true, signedIn: true, memberships: [{ missionId: "id", missionCode: "DEMO-ONE", role: "mission_operator" as const }] };
  it("preserves all ten navigation steps and does not grant administrator", () => {
    const report = buildDemoRunbook("DEMO-ONE", identity, {});
    expect(report.items).toHaveLength(10);
    expect(report.authorizationGranted).toBe(false);
    expect(report.readOnly).toBe(true);
    expect(report.items.every(item => item.href.startsWith("/mission/"))).toBe(true);
  });
  it("enforces separate Ground Medical and Crew Self handoffs", () => {
    const report = buildDemoRunbook("DEMO-ONE", identity, {});
    expect(report.items.find(item => item.actor === "crew_self")?.actorMembershipVisible).toBe(false);
    expect(report.items.find(item => item.actor === "ground_medical")?.actorMembershipVisible).toBe(false);
    expect(summarizeDemoActors(report).find(item => item.actor === "mission_operator")?.membershipVisible).toBe(true);
  });
  it("never exports completion claims for reserved MISSION_TEST", () => {
    const report = buildDemoRunbook(" mission_test ", identity, { "/mission/identity": "observed" });
    expect(report.reserved).toBe(true);
    expect(report.items.every(item => item.status === "not_checked")).toBe(true);
  });
  it("keeps statuses browser-local and does not claim backend acceptance", () => {
    const report = buildDemoRunbook("DEMO-ONE", identity, { "/mission/identity": "observed" });
    expect(report.items[0].status).toBe("observed");
    expect(report.limitations.join(" ")).toContain("not proof");
  });
});
