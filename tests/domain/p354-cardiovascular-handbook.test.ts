import { describe, expect, it } from "vitest";
import catalog from "../../data/scientific/cardiovascular-handbook.catalog.v1.json";

describe("P35.4 cardiovascular handbook intake", () => {
  it("preserves 96 reference-only source measurements in seven groups", () => {
    expect(catalog.metricCount).toBe(96);
    expect(catalog.metrics).toHaveLength(96);
    expect(new Set(catalog.metrics.map((item) => item.id)).size).toBe(96);
    expect(new Set(catalog.metrics.map((item) => item.group)).size).toBe(7);
    expect(catalog.metrics.every((item) => item.name && item.biology && item.context)).toBe(true);
  });
  it("cannot be used as clinical approval or an operational alert source", () => {
    expect(catalog.clinicalActivation).toBe(false);
    expect(catalog.reviewStatus).toBe("pending_independent_review");
    expect(
      catalog.metrics.every(
        (item) =>
          item.activation === "reference_only" &&
          item.reviewStatus === "pending_independent_review",
      ),
    ).toBe(true);
    expect(catalog.relationshipExamples.every((item) => item.activation === "research_only")).toBe(
      true,
    );
  });
});
