import { describe, expect, test } from "bun:test";

import {
  canEditCrewDisplayName,
  crewDisplayNameUpdate,
  crewMemberUpdateParams,
  validateCrewDisplayName,
} from "@/infrastructure/mission-operations";

describe("FV-01.4.2D crew display name editing", () => {
  test("validates trimmed 2-100 character names", () => {
    expect(validateCrewDisplayName(" ")).not.toBeNull();
    expect(validateCrewDisplayName(" a ")).not.toBeNull();
    expect(validateCrewDisplayName("x".repeat(101))).not.toBeNull();
    expect(validateCrewDisplayName("ab")).toBeNull();
    expect(validateCrewDisplayName(`  ${"x".repeat(100)}  `)).toBeNull();
    expect(validateCrewDisplayName("  FV01 Test Crew B ")).toBeNull();
  });

  test("rejects unchanged names", () => {
    expect(validateCrewDisplayName(" FV01-CREW-B ", "FV01-CREW-B")).toBe("Display name is unchanged.");
    expect(validateCrewDisplayName("FV01 Test Crew B", "FV01-CREW-B")).toBeNull();
  });

  test("edit control only for missions where the user is a Mission Operator", () => {
    expect(canEditCrewDisplayName(["mission-b"], "mission-b")).toBe(true);
    expect(canEditCrewDisplayName(["mission-a"], "mission-b")).toBe(false);
    expect(canEditCrewDisplayName([], "mission-b")).toBe(false);
    expect(canEditCrewDisplayName(["mission-b"], "")).toBe(false);
  });

  test("display-name update preserves external reference, status, crew ID and mission", () => {
    const params = crewMemberUpdateParams(crewDisplayNameUpdate("mission-b", "crew-b", "  FV01 Test Crew B "));
    expect(params).toEqual({
      p_mission_id: "mission-b",
      p_crew_member_id: "crew-b",
      p_display_name: "FV01 Test Crew B",
      p_external_ref: null,
      p_status: null,
    });
  });

  test("existing status-only updates are unchanged", () => {
    expect(crewMemberUpdateParams({ missionId: "m", crewMemberId: "c", status: "inactive" })).toEqual({
      p_mission_id: "m",
      p_crew_member_id: "c",
      p_display_name: null,
      p_external_ref: null,
      p_status: "inactive",
    });
  });
});
