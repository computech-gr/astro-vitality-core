import { describe, expect, it } from "vitest";
import registry from "../../data/scientific/p36-biomarker-source-registry.v1.json";
import { getDocumentDomainProjection } from "../../src/domain/health-domains/document-domain-projection";

describe("P35.6 read-only document domain projection", () => {
  it("returns no classification for unknown and proposed-only IDs", () => {
    expect(getDocumentDomainProjection([{ id: "IMM-001", selected: true }, { id: "unknown", selected: true }])).toEqual([]);
  });
  it("projects exact existing metric IDs without duplication or cross-domain guessing", () => {
    const first = registry.metrics.find((metric) => metric.domain === "cardiovascular");
    const second = registry.metrics.find((metric) => metric.domain === "bone_health");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const result = getDocumentDomainProjection([
      { id: first!.id, selected: true },
      { id: second!.id, selected: false },
    ]);
    expect(result.map((entry) => entry.id)).toEqual(["bone", "cardiovascular"]);
    expect(result.find((entry) => entry.id === "cardiovascular")?.selectedCount).toBe(1);
    expect(result.find((entry) => entry.id === "bone")?.selectedCount).toBe(0);
  });
});
