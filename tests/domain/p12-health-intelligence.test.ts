import { describe, expect, test } from "bun:test";

import {
  detectSustainedTrend,
  evaluateIntelligencePattern,
  REVIEWED_INTELLIGENCE_PATTERNS_V1_1,
  type PatternEvidenceInput,
  type TrendDetectionPolicy,
  type TrendSample,
} from "../../src/domain";

const mission = { missionId: "mission-p12", crewMemberId: "crew-p12" };

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
    observedAt: "2026-09-19T12:00:00Z",
    qualityLevel: "good",
    qualityScore: 0.95,
    contextTags: ["mission:stable"],
    missingContext: [],
    confounders: [],
    explanation: `${metricCode} changed relative to its governed personal context`,
    ...overrides,
  };
}

const sleepPattern = REVIEWED_INTELLIGENCE_PATTERNS_V1_1.find(
  (pattern) => pattern.id === "sleep-fatigue-cognition-v1",
)!;
const co2Pattern = REVIEWED_INTELLIGENCE_PATTERNS_V1_1.find(
  (pattern) => pattern.id === "co2-cognition-context-v1",
)!;
const researchPattern = REVIEWED_INTELLIGENCE_PATTERNS_V1_1.find(
  (pattern) => pattern.id === "microbiome-immune-research-v1",
)!;

describe("P12 Health Intelligence v1", () => {
  test("trend detection requires an explicitly supplied governed policy and does not ship a universal threshold", () => {
    const samples: TrendSample[] = [
      { observationId: "hr1", metricCode: "phys.heart_rate", observedAt: "2026-09-19T08:00:00Z", qualityLevel: "good", sourceId: "ble", domain: "physiological", contextTags: ["state:resting"], standardizedDelta: 1.2 },
      { observationId: "hr2", metricCode: "phys.heart_rate", observedAt: "2026-09-19T08:10:00Z", qualityLevel: "good", sourceId: "ble", domain: "physiological", contextTags: ["state:resting"], standardizedDelta: 1.4 },
      { observationId: "hr3", metricCode: "phys.heart_rate", observedAt: "2026-09-19T08:20:00Z", qualityLevel: "good", sourceId: "ble", domain: "physiological", contextTags: ["state:resting"], standardizedDelta: 1.6 },
    ];
    const noThresholdPolicy: TrendDetectionPolicy = {
      id: "no-threshold",
      metricCode: "phys.heart_rate",
      windowMs: 60 * 60 * 1000,
      minimumSamples: 3,
      minimumConsecutive: 3,
      acceptedQualityLevels: ["good"],
      requiredContextTags: ["state:resting"],
      algorithmVersion: "1.0.0",
      authority: "test fixture",
    };
    expect(detectSustainedTrend(samples, noThresholdPolicy)).toBeUndefined();

    const governed = detectSustainedTrend(samples, {
      ...noThresholdPolicy,
      id: "externally-governed-fixture",
      standardizedDeltaMagnitude: 1,
    });
    expect(governed?.observationIds).toEqual(["hr1", "hr2", "hr3"]);
    expect(governed?.policyAuthority).toBe("test fixture");
  });

  test("matches reviewed sleep-fatigue-cognition evidence and explains evidence plus uncertainty", () => {
    const result = evaluateIntelligencePattern({
      mission,
      pattern: sleepPattern,
      evaluatedAt: "2026-09-19T12:05:00Z",
      evidence: [
        evidence("sleep", "sleep.efficiency", "sleep_circadian", "lower_than_baseline", "watch"),
        evidence("fatigue", "behavior.fatigue_state", "behavioral", "higher_than_baseline", "assessment"),
        evidence("pvt", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment"),
      ],
    });
    expect(result.matched).toBe(true);
    expect(result.finding?.attention).toBe("review");
    expect(result.finding?.contributingEvidence).toHaveLength(3);
    expect(result.finding?.whyFlagged.length).toBeGreaterThan(0);
    expect(result.finding?.confidence.independentDomains).toBe(3);
    expect(result.finding?.nonDiagnostic).toBe(true);
    expect("diagnosis" in (result.finding ?? {})).toBe(false);
    expect("recommendedAction" in (result.finding ?? {})).toBe(false);
  });

  test("missing context and confounders explicitly reduce confidence instead of being silently ignored", () => {
    const clean = evaluateIntelligencePattern({
      mission,
      pattern: sleepPattern,
      evaluatedAt: "2026-09-19T12:05:00Z",
      evidence: [
        evidence("sleep-clean", "sleep.efficiency", "sleep_circadian", "lower_than_baseline", "watch"),
        evidence("fatigue-clean", "behavior.fatigue_state", "behavioral", "higher_than_baseline", "assessment"),
        evidence("pvt-clean", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment"),
      ],
    });
    const uncertain = evaluateIntelligencePattern({
      mission,
      pattern: sleepPattern,
      evaluatedAt: "2026-09-19T12:06:00Z",
      evidence: [
        evidence("sleep-uncertain", "sleep.efficiency", "sleep_circadian", "lower_than_baseline", "watch", { missingContext: ["light timing"], confounders: ["schedule shift"] }),
        evidence("fatigue-uncertain", "behavior.fatigue_state", "behavioral", "higher_than_baseline", "assessment", { qualityLevel: "degraded" }),
        evidence("pvt-uncertain", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment"),
      ],
    });
    expect(uncertain.finding!.confidence.score).toBeLessThan(clean.finding!.confidence.score);
    expect(uncertain.finding!.missingData).toContain("Missing context: light timing");
    expect(uncertain.finding!.confounders).toContain("schedule shift");
    expect(uncertain.finding!.uncertainty.length).toBeGreaterThan(0);
  });

  test("poor or unknown evidence fails closed into DATA QUALITY instead of a health alert", () => {
    const result = evaluateIntelligencePattern({
      mission,
      pattern: sleepPattern,
      evaluatedAt: "2026-09-19T12:05:00Z",
      evidence: [
        evidence("sleep-poor", "sleep.efficiency", "sleep_circadian", "lower_than_baseline", "watch", { qualityLevel: "poor" }),
        evidence("fatigue-poor", "behavior.fatigue_state", "behavioral", "higher_than_baseline", "assessment", { qualityLevel: "unknown" }),
        evidence("pvt-poor", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment", { qualityLevel: "poor" }),
      ],
    });
    expect(result.matched).toBe(false);
    expect(result.finding?.attention).toBe("data_quality");
    expect(result.reasons).toContain("data_quality_block");
  });

  test("keeps CO2 and cognition contextual and explicitly non-causal", () => {
    const result = evaluateIntelligencePattern({
      mission,
      pattern: co2Pattern,
      evaluatedAt: "2026-09-19T12:05:00Z",
      evidence: [
        evidence("co2", "environment.co2", "environmental", "higher_than_baseline", "habitat"),
        evidence("cog", "cognition.pvt_median_rt", "cognitive", "higher_than_baseline", "assessment"),
      ],
    });
    expect(result.matched).toBe(true);
    expect(result.finding?.confidence.level).not.toBe("high");
    expect(result.finding?.interpretationGuardrails.join(" ")).toContain("Do not state that CO2 caused");
    expect(result.finding?.uncertainty.join(" ")).toContain("contextual");
  });

  test("research-only relationships cannot become operational review alerts", () => {
    const result = evaluateIntelligencePattern({
      mission,
      pattern: researchPattern,
      evaluatedAt: "2026-09-19T12:05:00Z",
      evidence: [],
    });
    expect(result.matched).toBe(false);
    expect(result.finding?.attention).toBe("research_only");
    expect(result.finding?.confidence.level).toBe("low");
  });
});
