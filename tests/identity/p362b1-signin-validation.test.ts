import { describe, expect, it } from "vitest";
import {
  validateMissionSignInInput,
  missionSignInErrorMessage,
} from "@/infrastructure/mission-identity";
describe("P36.2B1 sign-in UX", () => {
  it("validates input", () => {
    expect(validateMissionSignInInput("", "x")).toMatch(/email address/);
    expect(validateMissionSignInInput("invalid", "x")).toMatch(/valid email/);
    expect(validateMissionSignInInput("a@example.org", "")).toMatch(/password/);
    expect(validateMissionSignInInput("a@example.org", "x")).toBeNull();
  });
  it("does not enumerate accounts", () => {
    expect(missionSignInErrorMessage({ message: "Invalid login credentials" })).toBe(
      missionSignInErrorMessage({ message: "User not found" }),
    );
  });
  it("distinguishes recoverable failures", () => {
    expect(missionSignInErrorMessage({ status: 429 })).toMatch(/Too many/);
    expect(missionSignInErrorMessage({ message: "Failed to fetch" })).toMatch(/connect/);
  });
});
