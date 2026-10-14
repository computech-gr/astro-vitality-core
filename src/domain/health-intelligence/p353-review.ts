import type { ScientificEvidenceReport } from "./live-evidence";

/** Display-only projection. Never infer thresholds, diagnoses or activate alerts. */
export function summarizeP353(report: ScientificEvidenceReport) {
  return {
    observationCount: report.observations.length,
    qualityBlocked: report.metrics.filter((m) => m.status === "quality_blocked").length,
    coverageCount: report.patterns.filter((p) => p.status === "evidence_present_not_interpreted").length,
    researchOnlyCount: report.patterns.filter((p) => p.status === "research_only").length,
    metrics: report.metrics.map((m) => ({
      metricCode: m.metricCode,
      unit: m.unit,
      count: m.count,
      latestValue: m.latest.value,
      latestAt: m.latest.observedAt,
      quality: m.latest.quality,
      state: m.status,
      descriptiveMean: m.baseline?.mean ?? null,
    })),
  };
}
