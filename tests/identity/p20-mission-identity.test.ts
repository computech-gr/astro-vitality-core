import { describe, expect, test } from "bun:test";

import {
  MISSION_PASSWORD_MIN_LENGTH,
  validateMissionSignUpPassword,
  type MissionMembershipContext,
} from "@/infrastructure/mission-identity";

function sensorEligible(membership?: MissionMembershipContext) {
  return Boolean(membership?.role === "crew_self" && membership.crewMemberId);
}

describe("P20 mission identity", () => {
  test("only crew-self memberships with a crew member are eligible for live physiological mission binding", () => {
    expect(sensorEligible({ missionId: "m1", role: "crew_self", crewMemberId: "c1" })).toBe(true);
    expect(sensorEligible({ missionId: "m1", role: "crew_self" })).toBe(false);
    expect(sensorEligible({ missionId: "m1", role: "mission_operator" })).toBe(false);
    expect(sensorEligible({ missionId: "m1", role: "researcher" })).toBe(false);
  });
});
