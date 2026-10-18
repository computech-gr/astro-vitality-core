import { describe, expect, it } from "bun:test";
import { buildSyntheticDemoDataset } from "../../src/domain/mission-access/synthetic-demo-dataset";
import { buildSyntheticDomainPreview, SYNTHETIC_DEMO_DOMAINS } from "../../src/domain/mission-access/synthetic-domain-preview";

describe("P35.17 synthetic preview", () => {
  const fixture = buildSyntheticDemoDataset("MISSION_TEST");
  it("shows all four domains without changing reserved mission", () => {
    expect(SYNTHETIC_DEMO_DOMAINS).toHaveLength(4);
    expect(SYNTHETIC_DEMO_DOMAINS.reduce((total, domain) => total + buildSyntheticDomainPreview(fixture, domain).observationCount, 0)).toBe(18);
  });
  it("projects the three timepoints and six cardiovascular values", () => {
    const preview = buildSyntheticDomainPreview(fixture, "cardiovascular");
    expect(preview.timepoints).toHaveLength(3);
    expect(preview.observationCount).toBe(6);
    expect(preview.rows).toHaveLength(2);
  });
  it("fails closed on data not marked synthetic-only", () => {
    const tampered = { ...fixture, synthetic: false };
    expect(buildSyntheticDomainPreview(tampered, "bone").observationCount).toBe(0);
  });
  it("excludes records without synthetic provenance", () => {
    const altered = { ...fixture, observations: fixture.observations.map((item, i) => i === 0 ? {...item, provenance: "real" as never} : item) };
    expect(buildSyntheticDomainPreview(altered, "bone").observationCount).toBe(2);
  });
});
