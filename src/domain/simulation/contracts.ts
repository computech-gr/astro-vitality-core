import type { ObservationEnvelope } from "../contracts";

export const SYNTHETIC_SCENARIO_IDS = [
  "mission_day_127_fatigue_recovery",
  "sensor_artifact_dropout",
  "co2_context_event",
  "radiation_context_event",
] as const;
export type SyntheticScenarioId = (typeof SYNTHETIC_SCENARIO_IDS)[number];

export const SYNTHETIC_EVENT_KINDS = ["observation", "annotation", "connectivity"] as const;
export type SyntheticEventKind = (typeof SYNTHETIC_EVENT_KINDS)[number];

export interface SyntheticScenarioManifest {
  id: SyntheticScenarioId;
  version: "1.0";
  displayName: string;
  description: string;
  scientificBaselineVersion: "1.1";
  syntheticOnly: true;
  seed: number;
  startsAt: string;
  durationMinutes: number;
  expectedFeatures: string[];
  limitations: string[];
}

export interface SyntheticAnnotationEvent {
  kind: "annotation";
  id: string;
  occurredAt: string;
  label: string;
  detail: string;
  tags: string[];
}

export interface SyntheticConnectivityEvent {
  kind: "connectivity";
  id: string;
  occurredAt: string;
  state: "online" | "offline";
  detail: string;
}

export interface SyntheticObservationEvent {
  kind: "observation";
  id: string;
  occurredAt: string;
  envelope: ObservationEnvelope;
}

export type SyntheticMissionEvent =
  | SyntheticObservationEvent
  | SyntheticAnnotationEvent
  | SyntheticConnectivityEvent;

export interface SyntheticMissionDataset {
  manifest: SyntheticScenarioManifest;
  generatedAt: string;
  events: SyntheticMissionEvent[];
  summary: {
    observations: number;
    annotations: number;
    connectivityEvents: number;
    poorQualityObservations: number;
    degradedQualityObservations: number;
    metricCodes: string[];
  };
}

export interface SyntheticReplayFrame {
  index: number;
  total: number;
  event: SyntheticMissionEvent;
}

export interface SyntheticReplayOptions {
  fromIndex?: number;
  untilIndex?: number;
}
