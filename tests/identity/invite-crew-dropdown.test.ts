import { describe, expect, test } from "bun:test";

import { eligibleInviteCrew, type MissionOperationsCrew } from "@/infrastructure/mission-operations";

const crew: MissionOperationsCrew[] = [
  { crew_member_id: "crew-a", display_name: "Crew A", external_ref: "FV01-CREW-A", status: "active" },
  { crew_member_id: "crew-b", display_name: "Crew B", external_ref: null, status: "candidate" },
  { crew_member_id: "crew-c", display_name: "Crew C", status: "inactive" },
];

describe("Operator invite crew dropdown", () => {
  test("lists only active crew members of the selected mission", () => {
    const eligible = eligibleInviteCrew(crew);
    expect(eligible.map((member) => member.crew_member_id)).toEqual(["crew-a"]);
  });

  test("returns an empty list when no active crew exists", () => {
    expect(eligibleInviteCrew(crew.slice(1))).toEqual([]);
    expect(eligibleInviteCrew([])).toEqual([]);
  });

  test("keeps the internal crew member id separate from display label data", () => {
    const [member] = eligibleInviteCrew(crew);
    expect(member.crew_member_id).toBe("crew-a");
    expect(member.display_name).toBe("Crew A");
    expect(member.external_ref).toBe("FV01-CREW-A");
  });
});

describe("Operator invite crew dropdown source guardrails", () => {
  test("the identity page uses the RLS-protected workspace loader, not a raw table query", async () => {
    const { readFileSync } = await import("node:fs");
    const ui = readFileSync("src/components/mission-identity.tsx", "utf8");
    expect(ui).toContain("loadInviteCrewOptions");
    expect(ui).not.toContain('.from("crew_members")');
    expect(ui).not.toContain('.from("mission_crew_assignments")');
  });

  test("crew selection is cleared and reloaded when mission or role changes", async () => {
    const { readFileSync } = await import("node:fs");
    const ui = readFileSync("src/components/mission-identity.tsx", "utf8");
    expect(ui).toContain('setInviteCrewMemberId("")');
    expect(ui).toContain("[inviteMissionId, inviteRole]");
    expect(ui).toContain('inviteRole === "crew_self"');
  });

  test("invite creation stays disabled without a valid selected crew member", async () => {
    const { readFileSync } = await import("node:fs");
    const ui = readFileSync("src/components/mission-identity.tsx", "utf8");
    expect(ui).toContain("!inviteCrewOptions.some((member) => member.crew_member_id === inviteCrewMemberId)");
  });
});
