import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/p368b-ground-medical-review.tsx", "utf8");
const api = readFileSync("src/infrastructure/p368b-ground-medical-review.ts", "utf8");
const pg = readFileSync("tests/integration-pg/p368c-decisions.sql", "utf8");
const plan = readFileSync("docs/P36_8D_REPLAY_AND_CI_READINESS.md", "utf8");

describe("P36.8D replay readiness contract", () => {
  it("retains per-view idempotency key and a governed decision RPC", () => {
    expect(ui).toContain("decisionKey.current");
    expect(api).toContain("p368_decide_ground_medical_batch");
    expect(api).toContain("p_idempotency_key");
  });
  it("requires isolated replay evidence rather than claiming live acceptance", () => {
    expect(pg).toMatch(/replay|retry|idempoten/i);
    expect(plan).toContain("NOT_RUN");
    expect(plan).toContain("READY_FOR_LIVE_ACCEPTANCE");
  });
  it("forbids public replay controls and unauthorized live decisions", () => {
    expect(plan).toContain("do not add a public replay button");
    expect(plan).toContain("explicit owner authorization");
    expect(plan).toContain("new synthetic batch");
  });
});
