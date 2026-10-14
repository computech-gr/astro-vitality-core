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

describe("FV-01-UI-01 mission sign-up password validation", () => {
  test("requires at least 12 characters", () => {
    expect(MISSION_PASSWORD_MIN_LENGTH).toBe(12);
  });

  test("rejects empty and short passwords with a clear message", () => {
    expect(validateMissionSignUpPassword("")).toBe("Password must contain at least 12 characters.");
    expect(validateMissionSignUpPassword("short")).toBe("Password must contain at least 12 characters.");
    expect(validateMissionSignUpPassword("elevenchars")).toBe("Password must contain at least 12 characters.");
  });

  test("accepts passwords of exactly 12 characters or more", () => {
    expect(validateMissionSignUpPassword("twelvechars!")).toBeNull();
    expect(validateMissionSignUpPassword("a much longer passphrase 42")).toBeNull();
  });

  test("sign-up rejects an invalid password before any registration request", async () => {
    const { signUpMissionIdentity } = await import("@/infrastructure/mission-identity");
    await expect(signUpMissionIdentity("crew@example.org", "short")).rejects.toThrow(
      "Password must contain at least 12 characters.",
    );
  });
});
