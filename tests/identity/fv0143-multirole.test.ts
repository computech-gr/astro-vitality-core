import { describe, expect, test } from "bun:test";

import {
  consoleSelectionKey,
  orderConsoleMemberships,
  resolveConsoleSelection,
  rolesCompatible,
} from "@/domain/mission-access/role-compatibility";
import {
  assertNotRejected,
  pendingApprovalsFor,
  type MissionOperationsInvite,
} from "@/infrastructure/mission-operations";

describe("FV-01.4.3 role compatibility matrix (UI mirror)", () => {
  test("forbidden same-mission pairs", () => {
    expect(rolesCompatible("crew_self", "ground_medical")).toBe(false);
    expect(rolesCompatible("researcher", "crew_self")).toBe(false);
    expect(rolesCompatible("mission_operator", "ground_medical")).toBe(false);
  });
  test("allowed same-mission pairs", () => {
    expect(rolesCompatible("crew_self", "mission_operator")).toBe(true);
    expect(rolesCompatible("mission_operator", "researcher")).toBe(true);
    expect(rolesCompatible("ground_medical", "researcher")).toBe(true);
  });
});

describe("FV-01.4.3 F3 Ground & Research Console role resolution", () => {
  const both = [
    { missionId: "m1", role: "researcher" as const },
    { missionId: "m1", role: "ground_medical" as const },
    { missionId: "m1", role: "crew_self" as const },
  ];
  test("prefers Ground Medical regardless of load order and drops non-console roles", () => {
    expect(resolveConsoleSelection(both)?.role).toBe("ground_medical");
    expect(resolveConsoleSelection([...both].reverse())?.role).toBe("ground_medical");
    expect(orderConsoleMemberships(both).map((m) => m.role)).toEqual([
      "ground_medical",
      "researcher",
    ]);
  });
  test("keeps an explicit, still-valid role choice", () => {
    expect(resolveConsoleSelection(both, "m1::researcher")?.role).toBe("researcher");
  });
  test("falls back when the previous choice is no longer authorized", () => {
    expect(
      resolveConsoleSelection(
        [{ missionId: "m1", role: "researcher" as const }],
        "m1::ground_medical",
      )?.role,
    ).toBe("researcher");
    expect(resolveConsoleSelection([], "m1::researcher")).toBeUndefined();
    expect(consoleSelectionKey({ missionId: "m2", role: "researcher" })).toBe("m2::researcher");
  });
});

describe("FV-01.4.3 approval and refusal handling", () => {
  const base: MissionOperationsInvite = {
    id: "i1",
    role: "ground_medical",
    expires_at: "2030-01-01",
    created_at: "2026-01-01",
    active: true,
  };
  test("only open pending Ground Medical invites are listed; inviter or unbound invites cannot be approved", () => {
    const list = pendingApprovalsFor([
      { ...base, approval_state: "pending", issued_by_me: true, recipient_email: "r@x.test" },
      {
        ...base,
        id: "i2",
        approval_state: "pending",
        issued_by_me: false,
        recipient_email: "r@x.test",
      },
      { ...base, id: "i6", approval_state: "pending", issued_by_me: false, recipient_email: null },
      { ...base, id: "i3", approval_state: "approved" },
      { ...base, id: "i4", role: "researcher", approval_state: "not_required" },
      { ...base, id: "i5", approval_state: "pending", claimed_at: "2026-01-02" },
    ]);
    expect(list.map((i) => [i.id, i.canApprove])).toEqual([
      ["i1", false],
      ["i2", true],
    ]);
  });
  test("rejected results surface as errors, never as success", () => {
    expect(() =>
      assertNotRejected(
        { status: "rejected", message: "You cannot reactivate your own sensitive membership." },
        "x",
      ),
    ).toThrow("own sensitive");
    expect(() => assertNotRejected({ status: "updated" }, "x")).not.toThrow();
  });
});
