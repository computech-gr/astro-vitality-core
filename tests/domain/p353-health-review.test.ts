import { describe, expect, it } from "vitest";
import { summarizeP353 } from "@/domain/health-intelligence/p353-review";
import type { ScientificEvidenceReport } from "@/domain/health-intelligence/live-evidence";

describe("P35.3 non-diagnostic projection", () => {
  it("does not fabricate alerts for empty evidence", () => {
    const report = { observations: [], metrics: [], patterns: [] } as unknown as ScientificEvidenceReport;
    expect(summarizeP353(report)).toEqual({ observationCount: 0, qualityBlocked: 0, coverageCount: 0, researchOnlyCount: 0, metrics: [] });
  });
  it("reports research-only coverage separately", () => {
    const report = { observations: [], metrics: [], patterns: [{ status: "research_only" }, { status: "evidence_present_not_interpreted" }] } as unknown as ScientificEvidenceReport;
    const summary = summarizeP353(report);
    expect(summary.researchOnlyCount).toBe(1);
    expect(summary.coverageCount).toBe(1);
    expect("alerts" in summary).toBe(false);
  });
});
