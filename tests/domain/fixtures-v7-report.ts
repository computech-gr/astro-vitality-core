import type { ReportRow, UnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";

export const V7_SCOPE = { missionId: "mission-a", crewMemberId: "crew-a", provenance: "synthetic" as const };

export const v7Row = (id: string, badge: ReportRow["badge"], metricId: string, value: string, unit: string, at: string, evidence = "unified-intake · csv"): ReportRow => ({
  recordId: id, badge, metricId, metricLabel: metricId, value, unit, observedAt: at, provenance: "synthetic", status: "included", sourceLabel: "synthetic kit", evidence,
});

export function v7Report(rows: ReportRow[] = [
  v7Row("obs-1", "cardiovascular", "cv-001", "62", "bpm", "2026-10-01T07:30:00.000Z"),
  v7Row("obs-2", "cardiovascular", "cv-001", "61", "bpm", "2026-10-04T07:30:00.000Z"),
  v7Row("obs-3", "bone", "bone-001", "0.40", "ng/mL", "2026-10-01T07:30:00.000Z", "bone-health-history · entry obs-3"),
]): UnifiedHealthReport {
  const summary = (badge: "bone" | "immune" | "cardiovascular" | "behavioral") => {
    const r = rows.filter((x) => x.badge === badge);
    return { badge, included: r.length, pending: 0, excluded: 0, metrics: new Set(r.map((x) => x.metricId)).size, firstAt: r[0]?.observedAt ?? null, lastAt: r.at(-1)?.observedAt ?? null, missing: r.length === 0 };
  };
  return {
    scope: { ...V7_SCOPE },
    generatedAt: "2026-11-01T00:00:00Z",
    filters: { from: null, to: null, sources: ["bone", "immune", "cardiovascular", "behavioral"] },
    rows,
    exclusions: [],
    summaries: [summary("bone"), summary("immune"), summary("cardiovascular"), summary("behavioral")],
    coverage: { included: rows.length, pendingReview: 0, excluded: 0, duplicateProjections: 0, outOfFilter: 0, otherScopeIgnored: 0, otherProvenanceIgnored: 0, nonObservationMetadata: 0 },
    limitations: [],
  };
}
