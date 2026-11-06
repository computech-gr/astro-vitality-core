import { describe, expect, test } from "bun:test";
import { buildCrewChoices, canHoldLocalRequests, rolesForScope } from "@/domain/health-intelligence/p36-crew-choices";
import type { MissionMembershipContext } from "@/infrastructure/mission-identity";

const roster = [
  { missionId: "M1", crewMemberId: "C1", displayName: "Alpha" },
  { missionId: "M1", crewMemberId: "C2", displayName: "Bravo" },
  { missionId: "M2", crewMemberId: "C9", displayName: "Other mission" },
];

describe("p36 crew choices", () => {
  test("mission-level Ground Medical / Researcher see the caller-readable mission roster", () => {
    const m: MissionMembershipContext[] = [{ missionId: "M1", role: "ground_medical" }, { missionId: "M1", role: "researcher" }];
    const c = buildCrewChoices(m, roster, "M1");
    expect(c.map((x) => x.crewId)).toEqual(["C1", "C2"]);
    expect(c[0]!.name).toBe("Alpha");
    expect(c[0]!.roles.sort()).toEqual(["ground_medical", "researcher"]);
  });

  test("crew-bound members never gain other crew from the roster", () => {
    const m: MissionMembershipContext[] = [{ missionId: "M1", role: "crew_self", crewMemberId: "C1", crewDisplayName: "Alpha" }];
    expect(buildCrewChoices(m, roster, "M1").map((x) => x.crewId)).toEqual(["C1"]);
  });

  test("other missions, operator roles and no mission yield nothing", () => {
    const m: MissionMembershipContext[] = [{ missionId: "M2", role: "ground_medical" }, { missionId: "M1", role: "mission_operator" }];
    expect(buildCrewChoices(m, roster, "M1")).toEqual([]);
    expect(buildCrewChoices(m, roster, null)).toEqual([]);
  });

  test("roster rows for another mission are ignored even for a mission-level reviewer", () => {
    const m: MissionMembershipContext[] = [{ missionId: "M1", role: "researcher" }];
    expect(buildCrewChoices(m, roster, "M1").some((x) => x.crewId === "C9")).toBe(false);
  });

  test("scope roles include mission-level reviewers but not other crews' crew_self", () => {
    const m: MissionMembershipContext[] = [{ missionId: "M1", role: "researcher" }, { missionId: "M1", role: "crew_self", crewMemberId: "C2" }];
    expect(rolesForScope(m, "M1", "C1")).toEqual(["researcher"]);
    expect(rolesForScope(m, "M1", "C2").sort()).toEqual(["crew_self", "researcher"]);
  });

  test("Researcher-only accounts never hold device-local requests", () => {
    expect(canHoldLocalRequests([{ missionId: "M1", role: "researcher" }], null)).toBe(false);
    expect(canHoldLocalRequests([{ missionId: "M1", role: "ground_medical" }], null)).toBe(true);
    expect(canHoldLocalRequests([{ missionId: "M1", role: "ground_medical" }], "M2")).toBe(false);
  });
});
