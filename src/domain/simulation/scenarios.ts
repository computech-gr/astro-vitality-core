import type { SyntheticScenarioId, SyntheticScenarioManifest } from "./contracts";

export const SYNTHETIC_SCENARIOS: Readonly<Record<SyntheticScenarioId, SyntheticScenarioManifest>> = {
  mission_day_127_fatigue_recovery: {
    id: "mission_day_127_fatigue_recovery",
    version: "1.0",
    displayName: "Mission Day 127 — fatigue / recovery",
    description:
      "Controlled end-to-end challenge scenario: wearable physiology, sleep history, short cognition, cabin CO2, radiation context, one periodic laboratory result, sensor quality degradation, network loss and recovery after a countermeasure window.",
    scientificBaselineVersion: "1.1",
    syntheticOnly: true,
    seed: 1272026,
    startsAt: "2026-09-19T08:00:00.000Z",
    durationMinutes: 480,
    expectedFeatures: [
      "progressive fatigue/recovery pattern",
      "CO2 context without causal claim",
      "radiation context event",
      "wearable artifact window",
      "SpO2 missing-data window",
      "offline then reconnect sequence",
      "periodic lab context",
    ],
    limitations: [
      "Synthetic demonstration data are not physiological truth and are not clinical reference ranges.",
      "Values are designed to exercise software behavior, not to diagnose or predict astronaut health.",
      "CO2 and cognition are represented only as shared context; no causal inference is encoded.",
    ],
  },
  sensor_artifact_dropout: {
    id: "sensor_artifact_dropout",
    version: "1.0",
    displayName: "Sensor artifact & dropout",
    description: "Quality-control scenario with motion/contact artifacts, degraded samples and a temporary missing-data interval.",
    scientificBaselineVersion: "1.1",
    syntheticOnly: true,
    seed: 17001,
    startsAt: "2026-09-19T08:00:00.000Z",
    durationMinutes: 120,
    expectedFeatures: ["degraded wearable quality", "poor-quality artifact samples", "missing SpO2 interval"],
    limitations: ["Synthetic quality faults only; no health deterioration is implied."],
  },
  co2_context_event: {
    id: "co2_context_event",
    version: "1.0",
    displayName: "CO2 contextual event",
    description: "Habitat CO2 context rises and later resolves while cognitive/physiological data remain separately represented.",
    scientificBaselineVersion: "1.1",
    syntheticOnly: true,
    seed: 17002,
    startsAt: "2026-09-19T08:00:00.000Z",
    durationMinutes: 180,
    expectedFeatures: ["CO2 context rise", "explicit non-causal annotation", "resolution"],
    limitations: ["No CO2-to-cognition causality or operational threshold is encoded."],
  },
  radiation_context_event: {
    id: "radiation_context_event",
    version: "1.0",
    displayName: "Radiation context event",
    description: "Short synthetic dose-rate context event with detector provenance retained on the common mission timeline.",
    scientificBaselineVersion: "1.1",
    syntheticOnly: true,
    seed: 17003,
    startsAt: "2026-09-19T08:00:00.000Z",
    durationMinutes: 180,
    expectedFeatures: ["dose-rate rise", "detector provenance", "return to synthetic background"],
    limitations: ["No biological radiation-risk score is produced."],
  },
};

export function getSyntheticScenario(id: SyntheticScenarioId): SyntheticScenarioManifest {
  return SYNTHETIC_SCENARIOS[id];
}
