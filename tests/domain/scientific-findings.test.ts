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

describe("scientific findings reported precision", () => {
  it("reports first-to-last differences at the recorded precision without floating-point artefacts", () => {
    const decimals = buildScientificFindings({ ...base, rows: [row("a", "6.1", "2026-10-01T09:00:00Z"), row("b", "6.3", "2026-10-02T09:00:00Z"), row("c", "5.9", "2026-10-03T09:00:00Z")] });
    expect(decimals.metrics[0]?.delta).toBe(-0.2);
    const hundredths = buildScientificFindings({ ...base, rows: [row("a", "0.4", "2026-10-20T09:00:00Z"), row("b", "0.44", "2026-10-22T09:00:00Z")] });
    expect(hundredths.metrics[0]?.delta).toBe(0.04);
    const unchanged = buildScientificFindings({ ...base, rows: [row("a", "-1.5", "2026-10-20T09:00:00Z"), row("b", "-1.5", "2026-10-22T09:00:00Z")] });
    expect(Object.is(unchanged.metrics[0]?.delta, 0)).toBe(true);
  });
});


describe("Nikolas governed canonical signal coverage", () => {
  it("matches reviewed canonical IDs but does not infer a relationship from partial coverage", () => {
    const cv = { ...row("rmssd", "48", "2026-10-02T08:00:00Z"), metricId: "cv-027", metricLabel: "RMSSD", unit: "ms" };
    const sleep = { ...row("sleep", "6.5", "2026-10-03T07:00:00Z"), badge: "behavioral" as const, metricId: "BSC-001", metricLabel: "Total sleep time", unit: "h" };
    const result = buildScientificFindings({ ...base, rows: [cv, sleep] });
    const context = result.crossDomain.find((c) => c.domains.includes("cardiovascular"));
    expect(context?.evidenceIds).toEqual(["rmssd", "sleep"]);
    expect(context?.missingSignals).toContain("workload");
    expect(context?.statement).toContain("No cross-domain association inferred");
  });
});
