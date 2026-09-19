# P17 — Simulation & Synthetic Mission Dataset

P17 provides deterministic, public-safe mission scenarios for repeatable demos and regression testing. It implements the roadmap requirement for a sensor-stream generator, controlled anomalies, CO2/radiation events, missing-data/artifact cases and repeatable scripted scenarios.

## Scientific/product source alignment

The primary end-to-end scenario follows the controlled P0/Architecture story: Mission Day 127 combines wearable physiology, sleep history, a short cognitive measure, cabin CO2, radiation context and a periodic laboratory observation. A progressive fatigue/recovery story is represented alongside data-quality problems, an offline interval and later reconnect.

The generator is constrained by Scientific Baseline v1.1. Synthetic values are **not** clinical reference ranges, operational thresholds, diagnoses or evidence that a correlation is causal.

## Scenario catalogue

- `mission_day_127_fatigue_recovery` — integrated challenge demo scenario.
- `sensor_artifact_dropout` — motion/contact artifact plus missing SpO2 interval.
- `co2_context_event` — CO2 rises and resolves on a shared timeline; cognition remains contextual and explicitly non-causal.
- `radiation_context_event` — dose-rate context with detector provenance; no biological risk scoring.

The public manifest is stored at `data/synthetic/scenario-manifests.v1.json`.

## Determinism

Each scenario has a fixed seed and fixed starting timestamp. `generateSyntheticMissionDataset()` must produce the same event sequence and `syntheticDatasetFingerprint()` for the same scenario/seed. A seed override deliberately produces a different sequence.

## Canonical model

Synthetic observations are not a parallel schema. They pass through P4 canonical ingestion, unit normalization and validation. Every generated observation:

- uses an existing reviewed metric code;
- has `classification: synthetic`;
- includes `synthetic:true` tags;
- retains source/provenance metadata;
- carries explicit data quality;
- is rejected if canonical ingestion rejects it.

## Data-quality cases

The generator deliberately creates quality conditions for software testing:

- poor/degraded wearable samples during an artifact interval;
- a missing SpO2 interval with no imputation;
- explicit annotations separating sensor/data quality from health interpretation.

## Environmental and radiation context

CO2 and radiation are represented on the same mission timeline as health observations. P17 does not introduce environmental operational thresholds, CO2-to-cognition causality or a biological radiation-risk score.

## Connectivity and offline demo

Mission Day 127 includes deterministic `offline` and `online` control events so P14 local persistence and P15 store-and-forward behavior can be demonstrated with the same replay. P17 does not bypass authentication or write directly to the backend.

## UI

`/mission/simulation` exposes the scenario catalogue, deterministic fingerprint, event/sample counts, quality counts, representative canonical observations and JSON export. Mission → Mission Scenario routes to this page.

## Safety boundary

Synthetic data must never be presented as real astronaut data. Generated records remain classified as synthetic through local storage, sync and research/demo workflows. No clinical or flight decision should be made from these fixtures.
