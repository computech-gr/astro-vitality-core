import { describe, test, expect } from "bun:test";
import { validateAIDraft } from "@/domain/health-intelligence/ai-draft-validation";
const ev = [
  { id: "obs-0001", metric: "lab.ctx", value: "4", unit: "pg/mL", time: "2026-01-01T00:00:00Z", domain: "bone" },
  { id: "obs-0002", metric: "lab.p1np", value: "38.5", unit: "ng/mL", time: "2026-01-02T00:00:00Z", domain: "bone" },
];
const good =
  "Observed evidence\n- lab.ctx recorded 4 pg/mL on 2026-01-01 [obs-0001].\n- lab.p1np recorded 38.5 ng/mL [obs-0002].\nAI-generated, unverified, not clinically approved.";
describe("AI draft validation fails closed", () => {
  test("accepts fully cited draft", () => expect(validateAIDraft(good, ev).ok).toBe(true));
  test("rejects unknown observation ID", () =>
    expect(validateAIDraft(good + "\nSee [obs-9999].", ev).ok).toBe(false));
  test("rejects numbered references", () =>
    expect(validateAIDraft("lab.ctx was 4 pg/mL [1].", ev).ok).toBe(false));
  test("rejects uncited measurement line", () =>
    expect(validateAIDraft(good + "\nlab.ctx was 4 pg/mL.", ev).ok).toBe(false));
  test("rejects invented biomarker", () =>
    expect(validateAIDraft(good + "\nOsteocalcin may matter [obs-0001].", ev).ok).toBe(false));
  test("rejects reference-range language", () =>
    expect(validateAIDraft(good + "\nThis is low to normal [obs-0001].", ev).ok).toBe(false));
  test("rejects diagnosis", () =>
    expect(validateAIDraft(good + "\nConsistent with osteoporosis [obs-0001].", ev).ok).toBe(false));
  test("rejects fabricated value", () =>
    expect(validateAIDraft(good + "\nlab.ctx rose to 7.2 pg/mL [obs-0001].", ev).ok).toBe(false));
  test("rejects draft with no citations", () =>
    expect(validateAIDraft("Research note only.", ev).ok).toBe(false));
});
