import { describe, expect, test } from "bun:test";

import {
  P18_KNOWN_LIMITATIONS,
  P18_VALIDATION_PLAN,
  summarizeValidation,
  validateEvidence,
  type ValidationEvidence,
} from "../../src/domain";

const evidence = (statusById: Record<string, ValidationEvidence["status"]>): ValidationEvidence[] =>
  P18_VALIDATION_PLAN.map((criterion) => ({
    criterionId: criterion.id,
    status: statusById[criterion.id] ?? "pass",
    checkedAt: "2026-09-19T20:00:00Z",
    evidence: `validated ${criterion.id}`,
  }));

describe("P18 validation and usability governance", () => {
  test("requires every critical validation area before closure", () => {
    const result = summarizeValidation(evidence({ "A11Y-001": "pending_human" }));
    expect(result.readyForP18Closure).toBe(false);
    expect(result.criticalPending).toContain("A11Y-001");
  });

  test("allows documented noncritical battery limitation without fabricating a hardware result", () => {
    const result = summarizeValidation(evidence({ "BAT-001": "known_limitation" }));
    expect(result.readyForP18Closure).toBe(true);
    expect(result.knownLimitations).toBe(1);
    expect(P18_KNOWN_LIMITATIONS.some((item) => item.title.toLowerCase().includes("battery"))).toBe(true);
  });

  test("rejects pass evidence without timestamp and evidence text", () => {
    expect(validateEvidence([{ criterionId: "SCI-001", status: "pass" }])).toContain(
      "SCI-001 cannot pass without evidence and checkedAt",
    );
  });

  test("keeps scientific review distinct from clinical validation", () => {
    const scientific = P18_VALIDATION_PLAN.find((item) => item.id === "SCI-001");
    expect(scientific?.acceptance.toLowerCase()).toContain("non-diagnostic");
    expect(P18_KNOWN_LIMITATIONS[0]?.statement.toLowerCase()).toContain("not clinically validated");
  });

  test("covers roadmap validation categories", () => {
    const areas = new Set(P18_VALIDATION_PLAN.map((item) => item.area));
    for (const area of ["scientific_review", "scenario_review", "accessibility", "cognitive_load", "latency", "battery", "critical_workflow"] as const) {
      expect(areas.has(area)).toBe(true);
    }
  });
});
