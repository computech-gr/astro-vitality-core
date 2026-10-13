import { describe, expect, it } from "bun:test";
import { MISSION_WORKFLOWS, workflowsForRole } from "../../src/domain/mission-experience/workflows";

describe("P33 role-aware mission workspace", () => {
  it("does not expose operational links without verified role", () => expect(workflowsForRole(undefined)).toEqual([]));
  it("does not show research export to crew self", () => expect(workflowsForRole("crew_self").some((x) => x.id === "ground")).toBe(false));
  it("does not show crew administration to researcher", () => expect(workflowsForRole("researcher").some((x) => x.id === "operations")).toBe(false));
  it("links only to distinct mission routes", () => {
    expect(new Set(MISSION_WORKFLOWS.map((x) => x.href)).size).toBe(MISSION_WORKFLOWS.length);
    expect(MISSION_WORKFLOWS.every((x) => x.href.startsWith("/mission/"))).toBe(true);
  });
  it("makes synthetic simulation explicit", () => expect(MISSION_WORKFLOWS.find((x) => x.id === "simulation")?.detail).toContain("fictional"));
});
