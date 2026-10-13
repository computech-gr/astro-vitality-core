import { describe, expect, test } from "bun:test";
import { HEALTH_DOMAINS, getHealthDomain, projectDomainEvidence } from "../../src/domain/health-domains/registry";

describe("P26 governed health domains", () => {
  test("four unique linked domains with explicit scientific review states", () => {
    expect(HEALTH_DOMAINS).toHaveLength(4);
    expect(new Set(HEALTH_DOMAINS.map((domain) => domain.id)).size).toBe(4);
    expect(new Set(HEALTH_DOMAINS.map((domain) => domain.path)).size).toBe(4);
    expect(HEALTH_DOMAINS.every((domain) => domain.path.startsWith("/mission/") && domain.limitations.length >= 2)).toBe(true);
    expect(getHealthDomain("immune").reviewState).toBe("scientific_review_pending");
  });
  test("coverage is read-only and cannot infer missing immune biomarkers", () => {
    expect(projectDomainEvidence(getHealthDomain("immune"), ["lab.ctx"])).toEqual({ available: [], missing: [] });
    expect(projectDomainEvidence(getHealthDomain("cardiovascular"), ["phys.heart_rate", "unrelated"] ).available).toEqual(["phys.heart_rate"]);
  });
  test("research-only immune pattern never becomes operational", () => {
    expect(getHealthDomain("immune").patternIds).toContain("microbiome-immune-research-v1");
    expect(getHealthDomain("bone").reviewState).toBe("handbook_mapping_available");
  });
});
