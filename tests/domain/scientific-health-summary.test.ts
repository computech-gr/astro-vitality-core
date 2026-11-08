import { describe, expect, it } from "bun:test";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import {
  buildScientificHealthSummary,
  scientificHealthSummaryPlainText,
} from "../../src/domain/health-intelligence/scientific-health-summary";
import type { UnifiedHealthReport, ReportRow } from "../../src/domain/health-intelligence/unified-health-report";

const summary = (badge: "bone" | "cardiovascular" | "immune" | "behavioral", included: number) => ({
  badge, included, pending: 0, excluded: 0, metrics: included ? 1 : 0, firstAt: included ? "2026-10-01T08:00:00.000Z" : null, lastAt: included ? "2026-10-05T08:00:00.000Z" : null, missing: included === 0,
});
const r = (id: string, badge: ReportRow["badge"], metricId: string, value: string, unit: string, at: string, evidence: string): ReportRow => ({
  recordId: id, badge, metricId, metricLabel: metricId, value, unit, observedAt: at, provenance: "synthetic", status: "included", sourceLabel: "test", evidence,
});
const rows = [
  r("b1", "bone", "bone-001", "300", "pg/mL", "2026-10-01T08:00:00.000Z", "bone-health-history · entry b1"),
  r("b2", "bone", "bone-001", "360", "pg/mL", "2026-10-05T08:00:00.000Z", "bone-health-history · entry b2"),
  r("h1", "cardiovascular", "cv-001", "60", "bpm", "2026-10-01T08:00:00.000Z", "unified-intake · csv"),
  r("i1", "immune", "IMM-030", "30", "ng/mL", "2026-10-01T08:00:00.000Z", "unified-intake · csv"),
  r("i2", "immune", "IMM-030", "25", "ng/mL", "2026-10-05T08:00:00.000Z", "unified-intake · csv"),
];
const report: UnifiedHealthReport = {
  scope: { missionId: "m", crewMemberId: "c", provenance: "synthetic" },
  generatedAt: "2026-11-01T00:00:00Z",
  filters: { from: null, to: null, sources: ["bone", "immune", "cardiovascular", "behavioral"] },
  rows, exclusions: [],
  summaries: [summary("bone", 2), summary("immune", 2), summary("cardiovascular", 1), summary("behavioral", 0)],
  coverage: { included: 5, pendingReview: 2, excluded: 0, duplicateProjections: 0, outOfFilter: 0, otherScopeIgnored: 0, otherProvenanceIgnored: 0, nonObservationMetadata: 0 },
  limitations: [],
};

describe("scientific health summary", () => {
  const findings = buildScientificFindings(report);
  const s = buildScientificHealthSummary(report, findings, null);

  it("separates stored, reviewer-accepted intake and validated interpretation tiers", () => {
    const count = (tier: string) => s.evidenceTiers.find((t) => t.tier === tier)?.count;
    expect(count("stored_observation")).toBe(2);
    expect(count("reviewer_accepted_intake")).toBe(3);
    expect(count("validated_interpretation")).toBe(0);
  });

  it("splits supported descriptive changes from insufficient evidence", () => {
    expect(s.supported).toHaveLength(2);
    expect(s.insufficient).toEqual(["cv-001 (cv-001): 1 observation(s) — fewer than two comparable time points."]);
  });

  it("quotes only handbook text for the observed direction and lists gaps instead of inventing biology", () => {
    expect(s.implications).toHaveLength(1);
    expect(s.implications[0]!.metricId).toBe("bone-001");
    expect(s.implications[0]!.statement).toContain("Possibly more intense osteoclastic resorption.");
    expect(s.implications[0]!.evidenceIds).toEqual(["b1", "b2"]);
    expect(s.implicationGaps.some((g) => g.startsWith("IMM-030"))).toBe(true);
  });

  it("explains module rows absent from Medical Intake and keeps follow-up qualified", () => {
    const bone = s.reconciliation.find((x) => x.domain === "Bone")!;
    expect(bone.storedObservations).toBe(2);
    expect(bone.medicalIntakeAccepted).toBe(0);
    expect(bone.explanation).toContain("Health module entries");
    expect(s.followUp.at(-1)).toContain("not recommendations, diagnoses, treatment or fitness-for-duty");
    expect(s.uncertainty.some((u) => u.includes("2 intake record(s) await human review"))).toBe(true);
  });

  it("produces no diagnostic or risk language and keeps TXT consistent with screen sections", () => {
    const text = scientificHealthSummaryPlainText(s);
    for (const h of ["1. What was measured", "2. Supported versus insufficient", "3. Possible biological implications", "4. Governed cross-domain", "5. Missing data", "6. Qualified Ground Medical"]) expect(text).toContain(h);
    expect(text).not.toMatch(/\bdiagnosed\b|risk score:|fit for duty|abnormal|normal range/i);
  });

  it("states nothing for an empty scope", () => {
    const empty = { ...report, rows: [], summaries: report.summaries.map((x) => summary(x.badge as "bone", 0)), coverage: { ...report.coverage, included: 0, pendingReview: 0 } };
    const e = buildScientificHealthSummary(empty, buildScientificFindings(empty), null);
    expect(e.measured).toEqual([]);
    expect(e.implications).toEqual([]);
    expect(e.supported).toEqual([]);
  });
});
