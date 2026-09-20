import { describe, expect, test } from "bun:test";

import { parseMissionAuthSettings } from "@/infrastructure/mission-auth-readiness";

describe("P20 secure bootstrap and auth readiness", () => {
  test("detects an explicitly disabled email provider", () => {
    expect(parseMissionAuthSettings({ external: { email: false }, disable_signup: false })).toEqual({
      emailProviderEnabled: false,
      signupAllowed: true,
    });
  });

  test("preserves an explicit enabled provider and signup policy", () => {
    expect(parseMissionAuthSettings({ external: { email: true }, disable_signup: true })).toEqual({
      emailProviderEnabled: true,
      signupAllowed: false,
    });
  });

  test("does not invent readiness when the settings shape is unknown", () => {
    expect(parseMissionAuthSettings({ provider: "unknown" })).toEqual({});
  });
});
