import { describe, expect, test } from "bun:test";

import { canDeactivateMembership, missionTransitionOptions } from "@/infrastructure/mission-operations";

describe("P20 mission and crew operations", () => {
  test("mission lifecycle only exposes governed forward transitions", () => {
    expect(missionTransitionOptions("planning")).toEqual(["planning", "active", "aborted"]);
    expect(missionTransitionOptions("active")).toEqual(["active", "completed", "aborted"]);
    expect(missionTransitionOptions("completed")).toEqual(["completed"]);
    expect(missionTransitionOptions("aborted")).toEqual(["aborted"]);
  });

  test("the final active mission operator cannot be deactivated", () => {
    const memberships = [
      { id: "op-1", role: "mission_operator" as const, active: true },
      { id: "crew-1", role: "crew_self" as const, active: true },
    ];
    expect(canDeactivateMembership(memberships[0], memberships)).toBe(false);
    expect(canDeactivateMembership(memberships[1], memberships)).toBe(true);
    const withSecondOperator = [...memberships, { id: "op-2", role: "mission_operator" as const, active: true }];
    expect(canDeactivateMembership(withSecondOperator[0], withSecondOperator)).toBe(true);
  });
});
