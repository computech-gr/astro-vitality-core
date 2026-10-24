import { describe, expect, test } from "bun:test";
import { selectStaticChecks } from "../../scripts/medical-v3-static-checks.mjs";

describe("medical release static verification boundaries", () => {
  test("does not execute database, remote authentication or unconfigured staging checks", () => {
    expect(selectStaticChecks([
      "verify-fv01-pg-integration.mjs",
      "verify-medical-governance-v3.mjs",
      "verify-medical-v3-synthetic-completion.mjs",
      "verify-remote-auth-config.mjs",
      "verify-medical-v3-staging-target.mjs",
    ])).toEqual([]);
  });
  test("retains authentic private evidence and sealed submission gates", () => {
    expect(selectStaticChecks([
      "verify-submission-gate.mjs",
      "verify-p3664-owner-risk.mjs",
      "verify-p3663-activation.mjs",
    ])).toEqual([
      "verify-p3663-activation.mjs",
      "verify-p3664-owner-risk.mjs",
      "verify-submission-gate.mjs",
    ]);
  });
});