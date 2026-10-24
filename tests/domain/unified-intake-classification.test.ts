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
