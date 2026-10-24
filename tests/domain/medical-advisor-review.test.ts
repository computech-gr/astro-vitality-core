import { describe, test, expect } from "bun:test";
import { buildHealthHistoryReport } from "@/domain/health-intelligence/health-history-report";
import {
  createAdvisorDraft,
  approveAdvisorDraft,
  isApprovedForReport,
  buildAIDraftingPrompt,
} from "@/domain/health-intelligence/medical-advisor-review";
import {
  UNIFIED_OBSERVATION_SCHEMA,
  type UnifiedObservation,
} from "@/domain/health-intelligence/observation-envelope";
const o: UnifiedObservation = {
  schema: UNIFIED_OBSERVATION_SCHEMA,
  id: "obs-0001",
  missionId: "m",
  crewMemberId: "c",
  metricId: "lab.ctx",
  domain: "bone",
  value: "4",
  originalUnit: "pg/mL",
  observedAt: "2026-01-01T00:00:00Z",
  recordedAt: "2026-01-01T00:00:00Z",
  source: { kind: "manual", label: "Lab" },
  provenance: "synthetic",
  quality: { reviewerConfirmed: true },
  reviewState: "accepted",
};
describe("medical advisor research draft", () => {
  test("Alex Morgan two-observation session review requires rationale and becomes stale after correction", () => {
    const first: UnifiedObservation = { ...o, id: "synthetic-v3-hr-001", missionId: "m1", crewMemberId: "c1", metricId: "cv-001", domain: "cardiovascular", value: "62", originalUnit: "bpm", observedAt: "2026-10-01T10:00:00Z" };
    const second: UnifiedObservation = { ...first, id: "synthetic-v3-hr-002", value: "66", observedAt: "2026-10-02T10:00:00Z" };
    const report = buildHealthHistoryReport([first, second], "m1", "c1", "synthetic");
    const text = "cv-001 recorded 62 bpm at 2026-10-01T10:00:00Z. [synthetic-v3-hr-001]\ncv-001 recorded 66 bpm at 2026-10-02T10:00:00Z. [synthetic-v3-hr-002]";
    const draft = createAdvisorDraft(report, text, "human-authored");
    expect(() => approveAdvisorDraft(draft, report, "Synthetic test reviewer", text, "", true)).toThrow();
    const approved = approveAdvisorDraft(draft, report, "Synthetic test reviewer", text, "Checked both exact fixture IDs, values, units and dates; research-only test, not human medical acceptance.", true);
    expect(approved.evidenceIds).toEqual(["synthetic-v3-hr-001", "synthetic-v3-hr-002"]);
    expect(isApprovedForReport(approved, report)).toBe(true);
    const changed = buildHealthHistoryReport([{ ...first, value: "63" }, second], "m1", "c1", "synthetic");
    expect(isApprovedForReport(approved, changed)).toBe(false);
  });
  test("only authorized ground medical reviewer may approve", () => {
    const r = buildHealthHistoryReport([o], "m", "c", "synthetic");
    const d = createAdvisorDraft(r, "Hypothesis [obs-0001]", "manual-ai-transfer");
    expect(() => approveAdvisorDraft(d, r, "reviewer", "edited", "checked", false)).toThrow();
    expect(
      isApprovedForReport(approveAdvisorDraft(d, r, "reviewer", "edited", "checked", true), r),
    ).toBe(true);
  });
  test("changes in evidence invalidate review", () => {
    const r = buildHealthHistoryReport([o], "m", "c", "synthetic");
    const d = createAdvisorDraft(r, "draft", "human-authored");
    const approved = approveAdvisorDraft(d, r, "reviewer", "reviewed", "reason", true);
    const changed = buildHealthHistoryReport([{ ...o, value: "5" }], "m", "c", "synthetic");
    expect(isApprovedForReport(approved, changed)).toBe(false);
  });
  test("prompt contains provenance and source IDs", () => {
    const r = buildHealthHistoryReport([o], "m", "c", "synthetic");
    expect(buildAIDraftingPrompt(r)).toContain("obs-0001");
  });
});
