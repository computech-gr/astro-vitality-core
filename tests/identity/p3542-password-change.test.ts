import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { validateMissionPasswordChange } from "@/infrastructure/mission-identity";

const ui = readFileSync("src/components/mission-identity.tsx", "utf8");
const infra = readFileSync("src/infrastructure/mission-identity.ts", "utf8");
const good = "Correct-Horse-42";

describe("P35.4.2 password change", () => {
  test("requires all three fields", () => {
    const msg = "Enter your current password, a new password and its confirmation.";
    expect(
      validateMissionPasswordChange({
        currentPassword: "",
        newPassword: good,
        confirmPassword: good,
      }),
    ).toBe(msg);
    expect(
      validateMissionPasswordChange({
        currentPassword: "old-password-1",
        newPassword: "",
        confirmPassword: good,
      }),
    ).toBe(msg);
    expect(
      validateMissionPasswordChange({
        currentPassword: "old-password-1",
        newPassword: good,
        confirmPassword: "",
      }),
    ).toBe(msg);
  });

  test("enforces minimum length, matching confirmation and a changed password", () => {
    expect(
      validateMissionPasswordChange({
        currentPassword: "x",
        newPassword: "short",
        confirmPassword: "short",
      }),
    ).toBe("Password must contain at least 12 characters.");
    expect(
      validateMissionPasswordChange({
        currentPassword: "x",
        newPassword: good,
        confirmPassword: `${good}!`,
      }),
    ).toBe("Passwords do not match.");
    expect(
      validateMissionPasswordChange({
        currentPassword: good,
        newPassword: good,
        confirmPassword: good,
      }),
    ).toBe("The new password must differ from the current password.");
    expect(
      validateMissionPasswordChange({
        currentPassword: "old-password-1",
        newPassword: good,
        confirmPassword: good,
      }),
    ).toBeNull();
  });

  test("UI has a required current-password field above the new password", () => {
    expect(ui).toContain('autoComplete="current-password"');
    expect(ui.indexOf('id="current-mission-password"')).toBeLessThan(
      ui.indexOf('id="new-mission-password"'),
    );
    expect(ui).toContain('setCurrentPassword("")');
  });

  test("verifies the current password for the same account before updating", () => {
    const verify = infra.indexOf(
      "signInWithPassword",
      infra.indexOf("export async function changeMissionPassword"),
    );
    const update = infra.indexOf("updateUser", verify);
    expect(verify).toBeGreaterThan(0);
    expect(update).toBeGreaterThan(verify);
    expect(infra).toContain("verifiedUserId !== user.id");
    expect(infra).toContain("current_password: input.currentPassword");
    expect(infra).toContain("passwordChangeInFlight");
  });

  test("never logs or stores passwords", () => {
    const fn = infra.slice(infra.indexOf("export async function changeMissionPassword"));
    expect(fn).not.toMatch(/console\.|localStorage|sessionStorage|\.from\(|\.rpc\(/);
  });
});
