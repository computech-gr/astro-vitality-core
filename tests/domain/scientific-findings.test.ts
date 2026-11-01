import { describe, expect, it } from "bun:test";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import type { UnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";

const base: UnifiedHealthReport = {
  scope: { missionId: "m1", crewMemberId: "c1", provenance: "synthetic" },
  generatedAt: "2026-11-01T00:00:00Z", filters: { from: null, to: null, sources: [] },
  rows: [], exclusions: [], summaries: [],
  coverage: { included: 0, pendingReview: 0, excluded: 0, duplicateProjections: 0, outOfFilter: 0, otherScopeIgnored: 0, otherProvenanceIgnored: 0, nonObservationMetadata: 0 },
  limitations: [],
};
const row = (id: string, value: string, at: string) => ({
  recordId: id, badge: "cardiovascular" as const, metricId: "cv-001", metricLabel: "Heart rate",
  value, unit: "bpm", observedAt: at, provenance: "synthetic" as const,
  status: "included" as const, sourceLabel: "CSV", evidence: id,
});
describe("scientific findings research boundaries", () => {
  it("does not invent findings when report is empty", () => {
    const result = buildScientificFindings(base);
    expect(result.metrics).toEqual([]);
    expect(result.crossDomain).toEqual([]);
  });
  it("requires distinct comparable time points for descriptive delta", () => {
    const single = buildScientificFindings({ ...base, rows: [row("a", "67", "2026-11-01T08:00:00Z")] });
    expect(single.metrics[0]?.delta).toBeNull();
    const paired = buildScientificFindings({ ...base, rows: [row("a", "67", "2026-11-01T08:00:00Z"), row("b", "72", "2026-11-02T08:00:00Z")] });
    expect(paired.metrics[0]?.delta).toBe(5);
    expect(paired.metrics[0]?.evidenceIds).toEqual(["a", "b"]);
    expect(paired.crossDomain).toEqual([]);
  });
  it("does not compute numeric changes from nonnumeric values", () => {
    const result = buildScientificFindings({ ...base, rows: [row("a", "unknown", "2026-11-01T08:00:00Z"), row("b", "72", "2026-11-02T08:00:00Z")] });
    expect(result.metrics[0]?.delta).toBeNull();
  });
});
