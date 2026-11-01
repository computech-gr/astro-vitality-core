import { describe, expect, test } from "bun:test";
import registry from "../../data/scientific/p36-biomarker-source-registry.v1.json";
import {
  classifyIntakeDocument,
  classifyIntakeObservation,
} from "../../src/domain/health-domains/unified-intake-classification";

describe("research-only unified intake classification", () => {
  test("matches an exact catalog name and source unit but still requires review", () => {
    const metric = registry.metrics.find((m) => m.domain === "cardiovascular" && m.originalUnit);
    expect(metric).toBeDefined();
    const result = classifyIntakeObservation({ label: metric!.name, unit: metric!.originalUnit });
    expect(result.reviewRequired).toBe(true);
    expect(["matched", "ambiguous"]).toContain(result.status);
  });
  test("unknown names never become clinical or approved observations", () => {
    expect(
      classifyIntakeObservation({ label: "Unrecognized test xyz", unit: "mg/dL" }).status,
    ).toBe("unclassified");
  });
  test("incorrect units are not silently converted", () => {
    const metric = registry.metrics.find((m) => m.originalUnit);
    expect(metric).toBeDefined();
    expect(
      classifyIntakeObservation({ label: metric!.name, unit: "not-the-catalog-unit" }).status,
    ).toBe("unit_review_required");
  });
  test("multi-domain summary never authorizes a write", () => {
    const result = classifyIntakeDocument([{ label: "Unrecognized test xyz", unit: "mg/dL" }]);
    expect(result.requiresHumanReview).toBe(true);
    expect(result.automaticallyApproved).toBe(false);
    expect(result.observations).toHaveLength(1);
  });
});


describe("reviewed crew CSV aliases", () => {
  test("heart rate maps to the P36 cardiovascular HR metric", () => {
    expect(classifyIntakeObservation({ label: "Heart rate", unit: "bpm" })).toMatchObject({ status: "matched", metricId: "cv-001", domain: "cardiovascular", reviewRequired: true });
  });
  test("HRV RMSSD maps to the existing P36 RMSSD metric", () => {
    expect(classifyIntakeObservation({ label: "HRV RMSSD", unit: "ms" })).toMatchObject({ status: "matched", metricId: "cv-027", domain: "cardiovascular", reviewRequired: true });
  });
  test("unit mismatch stays review-only", () => {
    expect(classifyIntakeObservation({ label: "HRV RMSSD", unit: "bpm" }).status).toBe("unit_review_required");
  });
  test("behavioral labels absent from P36 remain unclassified", () => {
    for (const label of ["Sleep duration", "Fatigue", "Sleepiness KSS", "Reaction time median"])
      expect(classifyIntakeObservation({ label, unit: "score" }).status).toBe("unclassified");
  });
});
