import { describe, expect, test } from "bun:test";

import {
  HEALTH_SIGNAL_DOMAINS,
  type CanonicalObservation,
  type PersonalBaselineDefinition,
  type ScientificSignalDefinition,
  validateCanonicalObservation,
  validatePersonalBaselineDefinition,
  validateScientificSignalDefinition,
} from "../../src/domain/index";

const observation: CanonicalObservation = {
  id: "obs-synthetic-001",
  mission: { missionId: "mission-synthetic-001", crewMemberId: "crew-synthetic-001" },
  source: { sourceId: "device-synthetic-001", sourceType: "device", adapterId: "synthetic-adapter", adapterVersion: "1.0.0" },
  metric: {
    code: "heart_rate",
    displayName: "Heart rate",
    domain: "physiological",
    valueKind: "number",
    unit: "beats/min",
    unitSystem: "custom",
  },
  value: { number: 72 },
  observedAt: "2026-09-19T12:00:00Z",
  status: "final",
  quality: { level: "good", score: 0.98, artifactFlags: [] },
  provenance: {
    kind: "raw",
    capturedAt: "2026-09-19T12:00:01Z",
    ingestionId: "ingestion-synthetic-001",
    inputObservationIds: [],
  },
  classification: "synthetic",
  tags: ["synthetic-test-fixture"],
};

describe("P3 health-signal taxonomy", () => {
  test("covers biological, cognitive, behavioral, psychological, environmental and radiation context", () => {
    for (const domain of ["biological", "cognitive", "behavioral", "psychological", "environmental", "radiation"] as const) {
      expect(HEALTH_SIGNAL_DOMAINS).toContain(domain);
    }
  });
});

describe("canonical observation validation", () => {
  test("accepts a valid synthetic raw observation", () => {
    expect(validateCanonicalObservation(observation)).toEqual({ valid: true, issues: [] });
  });

  test("rejects ambiguous values, missing numeric units and out-of-range quality scores", () => {
    const result = validateCanonicalObservation({
      ...observation,
      metric: { ...observation.metric, unit: undefined },
      value: { number: 72, text: "seventy two" },
      quality: { ...observation.quality, score: 1.2 },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["value", "metric.unit", "quality.score"]));
  });

  test("requires complete provenance for derived observations", () => {
    const result = validateCanonicalObservation({
      ...observation,
      provenance: { ...observation.provenance, kind: "derived" },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["provenance.derivationMethod", "provenance.inputObservationIds"]));
  });
});

describe("scientific governance contracts", () => {
  test("requires evidence and an explicit non-diagnostic boundary", () => {
    const definition: ScientificSignalDefinition = {
      id: "signal-heart-rate-v1",
      metric: observation.metric,
      description: "Synthetic example definition used to test the governance contract.",
      intendedUse: "Demonstrate a research-oriented signal definition contract.",
      limitations: ["Synthetic fixture only", "No clinical threshold or diagnosis"],
      evidence: [{ citationId: "nasa-standard-measures", url: "https://www.nasa.gov/reference/standard-measures/" }],
      reviewState: "evidence_review",
      version: "1.0.0",
      nonDiagnostic: true,
    };
    expect(validateScientificSignalDefinition(definition)).toEqual({ valid: true, issues: [] });
    expect(validateScientificSignalDefinition({ ...definition, evidence: [] }).valid).toBe(false);
  });

  test("requires explicit individual-baseline provenance metadata", () => {
    const baseline: PersonalBaselineDefinition = {
      id: "baseline-heart-rate-v1",
      metricCode: "heart_rate",
      strategy: "individual_longitudinal",
      minimumObservations: 10,
      minimumCoverageHours: 24,
      algorithmId: "placeholder-baseline-algorithm",
      algorithmVersion: "0.0.0-research",
      qualityPolicyId: "quality-policy-placeholder",
      version: "1.0.0",
    };
    expect(validatePersonalBaselineDefinition(baseline)).toEqual({ valid: true, issues: [] });
  });
});
