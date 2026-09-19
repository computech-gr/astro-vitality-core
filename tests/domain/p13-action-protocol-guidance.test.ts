import { describe, expect, test } from "bun:test";

import {
  acknowledgeAction,
  createActionGuidancePlan,
  createGovernedEscalationAction,
  evaluateIntelligencePattern,
  PROTOCOL_LIBRARY_V1_1,
  REVIEWED_INTELLIGENCE_PATTERNS_V1_1,
  type PatternEvidenceInput,
} from "../../src/domain";

const mission = { missionId: "mission-p13", crewMemberId: "crew-p13" };

function evidence(
  evidenceId: string,
  metricCode: string,
  domain: PatternEvidenceInput["domain"],
  direction: PatternEvidenceInput["direction"],
  sourceId: string,
  overrides: Partial<PatternEvidenceInput> = {},
): PatternEvidenceInput {
  return {
    evidenceId,
    metricCode,
    observationIds: [`obs-${evidenceId}`],
    sourceIds: [sourceId],
    domain,
    direction,
    observedAt: "2026-09-19T15:00:00Z",
    qualityLevel: "good",
    qualityScore: 0.95,
    contextTags: ["mission:stable"],
    missingContext: [],
    confounders: [],
    explanation: `${metricCode} changed relative to its governed personal context`,
    ...overrides,
  };
}

function findingFor(patternId: string, items: PatternEvidenceInput[]) {
  const pattern = REVIEWED_INTELLIGENCE_PATTERNS_V1_1.find((entry) => entry.id === patternId)!;
  return evaluateIntelligencePattern({
    mission,
    pattern,
    evidence: items,
    evaluatedAt: "2026-09-19T15:05:00Z",
  }).finding!;
}

describe("P13 Action & Protocol Guidance", () => {
  test("ships only reviewed bounded action categories and keeps medical escalation separately governed", () => {
    expect(PROTOCOL_LIBRARY_V1_1.map((item) => item.actionClass)).toEqual([
      "repeat-quality-check",
      "recovery-workload-review",
      "hydration-nutrition-review",
      "exercise-review",
      "environmental-review",
      "medical-escalation",
    ]);
    expect(PROTOCOL_LIBRARY_V1_1.find((item) => item.actionClass === "medical-escalation")?.status).toBe("governed_trigger_required");
  });

  test("maps a reviewed sleep/fatigue/cognition finding to repeat measurement plus recovery/workload review", () => {
    const finding = findingFor("sleep-fatigue-cognition-v1", [
      evidence("sleep", "sleep.efficiency", "sleep_circadian", "lower_than_baseline", "watch"),
      evidence("fatigue", "behavior.fatigue_state", "behavioral", "higher_than_baseline", "assessment"),
      evidence("pvt", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment"),
    ]);
    const plan = createActionGuidancePlan({ finding, generatedAt: "2026-09-19T15:06:00Z" });
    expect(plan.severity).toBe("action");
    expect(plan.actions.map((item) => item.actionClass)).toEqual(["repeat-quality-check", "recovery-workload-review"]);
    expect(plan.actions.every((item) => item.nonDiagnostic && item.requiresAcknowledgement)).toBe(true);
    expect(plan.actions[0]?.evidenceIds.length).toBeGreaterThan(0);
  });

  test("routes all-poor evidence to DATA QUALITY and repeat measurement instead of medical interpretation", () => {
    const finding = findingFor("sleep-fatigue-cognition-v1", [
      evidence("sleep", "sleep.efficiency", "sleep_circadian", "lower_than_baseline", "watch", { qualityLevel: "poor" }),
      evidence("fatigue", "behavior.fatigue_state", "behavioral", "higher_than_baseline", "assessment", { qualityLevel: "unknown" }),
      evidence("pvt", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment", { qualityLevel: "poor" }),
    ]);
    const plan = createActionGuidancePlan({ finding, generatedAt: "2026-09-19T15:06:00Z" });
    expect(plan.severity).toBe("data_quality");
    expect(plan.actions.map((item) => item.actionClass)).toEqual(["repeat-quality-check"]);
  });

  test("keeps contextual CO2/cognition guidance at WATCH and preserves non-causal environmental review", () => {
    const finding = findingFor("co2-cognition-context-v1", [
      evidence("co2", "environment.co2", "environmental", "higher_than_baseline", "habitat"),
      evidence("cog", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment"),
    ]);
    const plan = createActionGuidancePlan({ finding, generatedAt: "2026-09-19T15:06:00Z" });
    expect(plan.severity).toBe("watch");
    expect(plan.actions.map((item) => item.actionClass)).toEqual(["repeat-quality-check", "environmental-review"]);
    expect(plan.actions.find((item) => item.actionClass === "environmental-review")?.steps.join(" ")).not.toContain("diagnose");
  });

  test("research-only findings fail closed and never produce operational action cards", () => {
    const finding = findingFor("microbiome-immune-research-v1", []);
    const plan = createActionGuidancePlan({ finding, generatedAt: "2026-09-19T15:06:00Z" });
    expect(plan.severity).toBe("info");
    expect(plan.actions).toEqual([]);
    expect(plan.blockedReasons.join(" ")).toContain("Research-only");
  });

  test("medical escalation cannot be inferred and requires explicit authority/versioned trigger", () => {
    const finding = findingFor("sleep-fatigue-cognition-v1", [
      evidence("sleep", "sleep.efficiency", "sleep_circadian", "lower_than_baseline", "watch"),
      evidence("fatigue", "behavior.fatigue_state", "behavioral", "higher_than_baseline", "assessment"),
      evidence("pvt", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment"),
    ]);
    expect(createActionGuidancePlan({ finding, generatedAt: "2026-09-19T15:06:00Z" }).actions.some((item) => item.actionClass === "medical-escalation")).toBe(false);
    expect(() => createGovernedEscalationAction({
      finding,
      trigger: { id: "trigger-1", authority: "", version: "", reasonCode: "", findingId: finding.id, activatedAt: "2026-09-19T15:07:00Z" },
      generatedAt: "2026-09-19T15:07:00Z",
    })).toThrow();

    const escalation = createGovernedEscalationAction({
      finding,
      trigger: { id: "trigger-2", authority: "mission-medical-rule", version: "2026.1", reasonCode: "EXTERNAL_RULE_FIXTURE", findingId: finding.id, activatedAt: "2026-09-19T15:07:00Z" },
      generatedAt: "2026-09-19T15:07:00Z",
    });
    expect(escalation.severity).toBe("escalate");
    expect(escalation.actionClass).toBe("medical-escalation");
  });

  test("acknowledgements preserve actor, protocol version, finding and state without creating medical conclusions", () => {
    const finding = findingFor("sleep-fatigue-cognition-v1", [
      evidence("sleep", "sleep.efficiency", "sleep_circadian", "lower_than_baseline", "watch"),
      evidence("fatigue", "behavior.fatigue_state", "behavioral", "higher_than_baseline", "assessment"),
      evidence("pvt", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment"),
    ]);
    const action = createActionGuidancePlan({ finding, generatedAt: "2026-09-19T15:06:00Z" }).actions[0]!;
    const acknowledgement = acknowledgeAction({ action, actorId: "crew-p13", state: "acknowledged", acknowledgedAt: "2026-09-19T15:08:00Z" });
    expect(acknowledgement.findingId).toBe(finding.id);
    expect(acknowledgement.protocolVersion).toBe(action.protocolVersion);
    expect(acknowledgement.state).toBe("acknowledged");
  });
});
