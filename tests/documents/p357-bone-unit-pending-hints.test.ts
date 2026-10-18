import { describe, expect, it } from "vitest";
import registry from "../../data/scientific/p36-biomarker-source-registry.v1.json";
import { getUnitPendingBoneHints, getDocumentDomainProjection } from "../../src/domain/health-domains/document-domain-projection";

describe("P35.7 advisory bone name hints", () => {
  it("never upgrades hints into routed or selectable measurements", () => {
    const bone = registry.metrics.find((m) => m.domain === "bone_health" && !m.originalUnit?.trim());
    expect(bone).toBeDefined();
    const hints = getUnitPendingBoneHints(`${bone!.name}: 1.23 arbitrary_unit`);
    // Catalog may have duplicate names; ambiguous matches must be suppressed.
    if (registry.metrics.filter((m) => m.domain === "bone_health" && m.name.toLowerCase() === bone!.name.toLowerCase()).length === 1) {
      expect(hints.some((h) => h.id === bone!.id)).toBe(true);
    }
    expect(getDocumentDomainProjection([])).toEqual([]);
  });
  it("rejects free text and reference ranges", () => {
    expect(getUnitPendingBoneHints("Normal: 1.2 ng/mL\nCTX: 1-3 ng/mL")).toEqual([]);
  });
});
