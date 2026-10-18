import type { SyntheticDemoDataset, SyntheticDemoDomain } from "@/domain/mission-access/synthetic-demo-dataset";

/** Local, read-only visualization. No health inference, network calls or canonical persistence. */
export type SyntheticPreviewDomain = SyntheticDemoDomain;
export const SYNTHETIC_DEMO_DOMAINS: readonly SyntheticPreviewDomain[] = ["bone", "cardiovascular", "immune", "behavioral"];
export function buildSyntheticDomainPreview(dataset: SyntheticDemoDataset, domain: SyntheticPreviewDomain) {
  const observations = dataset.synthetic && dataset.exportOnly && !dataset.importAuthorized
    ? dataset.observations.filter(item => item.domain === domain && item.provenance === "synthetic_generated" && item.quality === "illustrative_only")
    : [];
  const timepoints = [...new Set(observations.map(item => item.day))].sort((a, b) => a - b);
  const metrics = [...new Set(observations.map(item => item.metric))].sort();
  const rows = metrics.map(metric => {
    const matching = observations.filter(item => item.metric === metric);
    const unit = matching[0]?.unit ?? "unspecified";
    return { metric, unit, values: timepoints.map(day => matching.find(item => item.day === day)?.value ?? null) };
  });
  return { domain, metricCount: rows.length, observationCount: observations.length, timepoints, rows, syntheticOnly: true as const };
}
