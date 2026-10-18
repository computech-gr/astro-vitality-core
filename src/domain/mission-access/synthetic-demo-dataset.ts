/** Fictional, offline-only demo fixture. NOT a canonical measurement import format. */
export type SyntheticDemoDomain = "bone" | "cardiovascular" | "immune" | "behavioral";
export type SyntheticDemoObservation = {
  recordId: string; subjectId: string; domain: SyntheticDemoDomain;
  metric: string; value: number; unit: string; day: number;
  provenance: "synthetic_generated"; quality: "illustrative_only";
};
export type SyntheticDemoDataset = {
  schema: "mitochondria.synthetic-demo-dataset.v1";
  missionCode: string; subjectId: "FICTIONAL-CREW-01";
  synthetic: true; exportOnly: true; importAuthorized: false;
  observations: SyntheticDemoObservation[];
  limitations: readonly string[];
};
const FIXTURES: readonly {domain: SyntheticDemoDomain; metric: string; unit: string; values: readonly [number, number, number]}[] = [
  {domain:"bone", metric:"bone_turnover_marker_illustrative",unit:"arbitrary_demo_units",values:[0.4,0.42,0.41]},
  {domain:"cardiovascular",metric:"resting_heart_rate",unit:"beats/min",values:[64,66,65]},
  {domain:"cardiovascular",metric:"heart_rate_variability_rmssd",unit:"ms",values:[37,39,38]},
  {domain:"immune",metric:"immune_demo_signal",unit:"arbitrary_demo_units",values:[1.1,1.0,1.2]},
  {domain:"behavioral",metric:"sleep_duration",unit:"hours",values:[7.2,6.9,7.4]},
  {domain:"behavioral",metric:"self_reported_fatigue_demo",unit:"illustrative_scale",values:[2,3,2]},
];
/** Same input always yields same values; no dates, names, PII, randomness or external calls. */
export function buildSyntheticDemoDataset(missionCode: string): SyntheticDemoDataset {
  const code = missionCode.trim();
  const observations = FIXTURES.flatMap((fixture, fixtureIndex) => fixture.values.map((value, index) => ({
    recordId: `SYN-${fixtureIndex + 1}-${index + 1}`, subjectId: "FICTIONAL-CREW-01",
    domain: fixture.domain, metric: fixture.metric, value, unit: fixture.unit, day: index * 7,
    provenance: "synthetic_generated" as const, quality: "illustrative_only" as const,
  })));
  return {
    schema: "mitochondria.synthetic-demo-dataset.v1", missionCode: code,
    subjectId: "FICTIONAL-CREW-01", synthetic: true, exportOnly: true, importAuthorized: false,
    observations,
    limitations: [
      "Entirely fabricated fixture for offline demonstration, not astronaut or patient data.",
      "No clinical ranges, diagnoses, risk scores, trend conclusions or approved scientific claims.",
      "Arbitrary demo units are not approved biomarker units or ingestion mappings.",
      "Export does not authorize Cloud import, Ground Medical review or mission mutation.",
    ],
  };
}
export function summarizeSyntheticDemoDataset(dataset: SyntheticDemoDataset) {
  const domains: readonly SyntheticDemoDomain[] = ["bone", "cardiovascular", "immune", "behavioral"];
  return {
    total: dataset.observations.length,
    domains: domains.length,
    timepoints: new Set(dataset.observations.map(item => item.day)).size,
    byDomain: domains.map(domain => ({domain, count: dataset.observations.filter(item => item.domain === domain).length})),
  };
}
