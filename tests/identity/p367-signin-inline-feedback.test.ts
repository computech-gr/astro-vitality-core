import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("P36.7 mission sign-in feedback", () => {
  const source = readFileSync("src/components/mission-identity.tsx", "utf8");
  it("shows credential errors next to sign-in form, not in global message", () => {
    expect(source).toContain('id="mission-signin-error"');
    expect(source).toContain('setSignInError(error instanceof Error ? error.message');
    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-invalid={Boolean(signInError)}');
  });
  it("clears password on failed sign-in and does not clear email", () => {
    const failed = source.split('async function signIn()')[1].split('async function signUp()')[0];
    expect(failed).toContain('setPassword("");');
    expect(failed).not.toContain('setEmail("");');
  });
});
