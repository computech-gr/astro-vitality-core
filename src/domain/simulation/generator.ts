import { ingestCanonicalObservation } from "../ingestion";
import type { CanonicalObservationDraft, DataQuality, MissionContextRef, SourceRef } from "../contracts";
import type {
  SyntheticAnnotationEvent,
  SyntheticConnectivityEvent,
  SyntheticMissionDataset,
  SyntheticMissionEvent,
  SyntheticScenarioId,
  SyntheticScenarioManifest,
} from "./contracts";
import { SeededRandom } from "./prng";
import { getSyntheticScenario } from "./scenarios";

const mission: MissionContextRef = {
  missionId: "synthetic-mission-127",
  crewMemberId: "synthetic-crew-01",
};

const wearable: SourceRef = {
  sourceId: "synthetic-wearable-01",
  sourceType: "device",
  manufacturer: "Synthetic",
  model: "Mission Wearable Simulator",
  adapterId: "org.mitochondria.synthetic.wearable",
  adapterVersion: "1.0.0",
};

const habitat: SourceRef = {
  sourceId: "synthetic-habitat-01",
  sourceType: "environment",
  manufacturer: "Synthetic",
  model: "Habitat Telemetry Simulator",
  adapterId: "org.mitochondria.synthetic.environment",
  adapterVersion: "1.0.0",
};

const assessment: SourceRef = {
  sourceId: "synthetic-assessment-01",
  sourceType: "assessment",
  manufacturer: "Synthetic",
  model: "Readiness Assessment Simulator",
  adapterId: "org.mitochondria.synthetic.assessment",
  adapterVersion: "1.0.0",
};

const laboratory: SourceRef = {
  sourceId: "synthetic-lab-01",
  sourceType: "laboratory",
  manufacturer: "Synthetic",
  model: "Lab Import Fixture",
  adapterId: "org.mitochondria.synthetic.lab",
  adapterVersion: "1.0.0",
};

function at(start: string, minute: number): string {
  return new Date(new Date(start).getTime() + minute * 60_000).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function quality(level: DataQuality["level"], score: number, flags: string[] = []): DataQuality {
  return { level, score, artifactFlags: flags };
}

function observation(
  manifest: SyntheticScenarioManifest,
  index: number,
  metricCode: string,
  value: number,
  unit: string,
  minute: number,
  source: SourceRef,
  sampleQuality: DataQuality,
  tags: string[],
): SyntheticMissionEvent {
  const observedAt = at(manifest.startsAt, minute);
  const draft: CanonicalObservationDraft = {
    id: `synthetic:${manifest.id}:${index}:${metricCode}`,
    mission,
    source,
    metricCode,
    value: { number: value },
    unit,
    observedAt,
    status: "final",
    quality: sampleQuality,
    provenance: {
      kind: "raw",
      capturedAt: observedAt,
      ingestionId: `synthetic-ingest:${manifest.id}:${index}`,
      inputObservationIds: [],
      algorithmVersion: "p17.1.0",
    },
    classification: "synthetic",
    tags: ["synthetic:true", `scenario:${manifest.id}`, ...tags],
    context: { tags: ["synthetic:true", ...tags], completeness: 1 },
    reviewStatus: "validated",
  };
  const result = ingestCanonicalObservation(draft);
  if (!result.ok) {
    throw new Error(`Synthetic generator produced invalid ${metricCode}: ${result.issues.map((issue) => issue.message).join("; ")}`);
  }
  return { kind: "observation", id: draft.id, occurredAt: observedAt, envelope: result.envelope };
}

function annotation(
  manifest: SyntheticScenarioManifest,
  id: string,
  minute: number,
  label: string,
  detail: string,
  tags: string[] = [],
): SyntheticAnnotationEvent {
  return { kind: "annotation", id: `synthetic:${manifest.id}:${id}`, occurredAt: at(manifest.startsAt, minute), label, detail, tags };
}

function connectivity(
  manifest: SyntheticScenarioManifest,
  id: string,
  minute: number,
  state: "online" | "offline",
  detail: string,
): SyntheticConnectivityEvent {
  return { kind: "connectivity", id: `synthetic:${manifest.id}:${id}`, occurredAt: at(manifest.startsAt, minute), state, detail };
}

function trajectory(minute: number, manifest: SyntheticScenarioManifest) {
  const normalized = minute / Math.max(1, manifest.durationMinutes);
  const fatigueRamp = normalized < 0.65 ? normalized / 0.65 : Math.max(0, 1 - (normalized - 0.65) / 0.35);
  return fatigueRamp;
}

function includeScenarioMetric(id: SyntheticScenarioId, metricCode: string): boolean {
  if (id === "sensor_artifact_dropout") return ["phys.heart_rate", "phys.spo2"].includes(metricCode);
  if (id === "co2_context_event") return ["phys.heart_rate", "cognition.pvt_median_rt", "environment.co2"].includes(metricCode);
  if (id === "radiation_context_event") return ["phys.heart_rate", "radiation.dose_rate"].includes(metricCode);
  return true;
}

export function generateSyntheticMissionDataset(
  scenarioId: SyntheticScenarioId,
  seedOverride?: number,
): SyntheticMissionDataset {
  const baseManifest = getSyntheticScenario(scenarioId);
  const manifest = seedOverride === undefined ? baseManifest : { ...baseManifest, seed: seedOverride };
  const rng = new SeededRandom(manifest.seed);
  const events: SyntheticMissionEvent[] = [];
  let index = 0;

  const pushMetric = (
    metricCode: string,
    value: number,
    unit: string,
    minute: number,
    source: SourceRef,
    sampleQuality: DataQuality,
    tags: string[] = [],
  ) => {
    if (!includeScenarioMetric(scenarioId, metricCode)) return;
    events.push(observation(manifest, index++, metricCode, value, unit, minute, source, sampleQuality, tags));
  };

  events.push(annotation(manifest, "start", 0, "Synthetic scenario start", "All data in this scenario are deterministic synthetic demonstration data.", ["demo:synthetic"]));

  const step = scenarioId === "mission_day_127_fatigue_recovery" ? 5 : 5;
  for (let minute = 0; minute <= manifest.durationMinutes; minute += step) {
    const fatigue = trajectory(minute, manifest);
    const artifactWindow = scenarioId === "sensor_artifact_dropout" ? minute >= 35 && minute <= 60 : minute >= 140 && minute <= 160;
    const missingSpo2 = scenarioId === "sensor_artifact_dropout" ? minute >= 70 && minute <= 95 : minute >= 185 && minute <= 215;
    const co2Event = scenarioId === "co2_context_event" ? minute >= 60 && minute <= 125 : minute >= 180 && minute <= 255;
    const radiationEvent = scenarioId === "radiation_context_event" ? minute >= 70 && minute <= 100 : minute >= 285 && minute <= 315;

    const hrQuality = artifactWindow ? quality("poor", 0.25, ["motion_artifact", "contact_quality_low"]) : quality("good", 0.96);
    const hr = rounded(64 + 12 * fatigue + rng.jitter(2.2));
    pushMetric("phys.heart_rate", hr, "bpm", minute, wearable, hrQuality, artifactWindow ? ["artifact:motion"] : ["state:resting"]);

    if (minute % 15 === 0) {
      const hrv = rounded(clamp(49 - 16 * fatigue + rng.jitter(2.5), 18, 70));
      pushMetric("phys.hrv_rmssd", hrv, "ms", minute, wearable, artifactWindow ? quality("degraded", 0.55, ["rr_quality_degraded"]) : quality("good", 0.93), ["posture:resting", "time_of_day:matched"]);
    }

    if (!missingSpo2) {
      const spo2 = rounded(clamp(97.2 - 0.6 * fatigue + rng.jitter(0.35), 94, 100));
      pushMetric("phys.spo2", spo2, "%", minute, wearable, quality("good", 0.94), ["site:finger"]);
    }

    const co2Base = 760 + rng.jitter(35);
    const co2 = rounded(co2Base + (co2Event ? 650 * Math.sin(((minute - (scenarioId === "co2_context_event" ? 60 : 180)) / (scenarioId === "co2_context_event" ? 65 : 75)) * Math.PI) : 0), 0);
    pushMetric("environment.co2", Math.max(450, co2), "ppm", minute, habitat, quality("good", 0.98), ["compartment:habitat-a", "interpretation:context_only"]);

    if (minute % 10 === 0) {
      const doseRate = rounded(0.42 + rng.jitter(0.04) + (radiationEvent ? 1.6 : 0), 2);
      pushMetric("radiation.dose_rate", Math.max(0, doseRate), "uSv/h", minute, habitat, quality("good", 0.97), ["detector:synthetic-dosimeter", "radiation_field:unspecified_demo"]);
    }
  }

  if (scenarioId === "mission_day_127_fatigue_recovery" || scenarioId === "co2_context_event") {
    const cognitionMinute = Math.round(manifest.durationMinutes * 0.58);
    pushMetric("sleep.efficiency", 76, "%", 5, wearable, quality("good", 0.91), ["sleep_window:previous_night", "vendor_algorithm:synthetic"]);
    pushMetric("behavior.fatigue_state", 7.1, "1", cognitionMinute, assessment, quality("good", 1), ["instrument:synthetic_vas", "private:true"]);
    pushMetric("behavior.sleepiness_kss", 6, "1", cognitionMinute, assessment, quality("good", 1), ["instrument:kss", "private:true"]);
    pushMetric("cognition.pvt_median_rt", 318, "ms", cognitionMinute + 2, assessment, quality("good", 0.95), ["protocol:p17-demo-pvt", "practice_run:3", "device_latency:recorded"]);
  }

  if (scenarioId === "mission_day_127_fatigue_recovery") {
    pushMetric("lab.glucose", 93, "mg/dL", 30, laboratory, quality("good", 0.99), ["sample:periodic", "fasting:false", "lab:synthetic"]);
    events.push(connectivity(manifest, "offline", 330, "offline", "Synthetic network-loss event. Local monitoring and persistence should continue."));
    events.push(annotation(manifest, "countermeasure", 345, "Recovery protocol window", "Synthetic recovery/workload countermeasure begins; no treatment claim is encoded.", ["protocol:demo-only"]));
    events.push(connectivity(manifest, "online", 420, "online", "Synthetic connectivity restored; queued records may be synchronized idempotently."));
  }

  if (scenarioId === "co2_context_event") {
    events.push(annotation(manifest, "co2-guardrail", 70, "CO2 contextual event", "CO2 and cognitive signals share a timeline; this scenario encodes no causal inference.", ["guardrail:non-causal"]));
  }

  if (scenarioId === "radiation_context_event") {
    events.push(annotation(manifest, "radiation-guardrail", 75, "Radiation context event", "Dose-rate context is preserved without biological risk scoring.", ["guardrail:no-risk-score"]));
  }

  if (scenarioId === "sensor_artifact_dropout") {
    events.push(annotation(manifest, "artifact", 35, "Wearable artifact begins", "Motion/contact artifact should be distinguished from health deterioration.", ["data_quality:artifact"]));
    events.push(annotation(manifest, "dropout", 70, "SpO2 dropout begins", "Missing safety-relevant data remain visibly missing; no silent imputation.", ["data_quality:missing"]));
  }

  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const observationEvents = events.filter((event) => event.kind === "observation");
  const metricCodes = [...new Set(observationEvents.map((event) => event.envelope.observation.metric.code))].sort();

  return {
    manifest,
    generatedAt: manifest.startsAt,
    events,
    summary: {
      observations: observationEvents.length,
      annotations: events.filter((event) => event.kind === "annotation").length,
      connectivityEvents: events.filter((event) => event.kind === "connectivity").length,
      poorQualityObservations: observationEvents.filter((event) => event.envelope.observation.quality.level === "poor").length,
      degradedQualityObservations: observationEvents.filter((event) => event.envelope.observation.quality.level === "degraded").length,
      metricCodes,
    },
  };
}
