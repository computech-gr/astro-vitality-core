import type { DataQuality } from "../../domain";

export const ENVIRONMENTAL_METRIC_CODES = [
  "environment.co2",
  "environment.oxygen_fraction",
  "environment.oxygen_partial_pressure",
  "environment.cabin_pressure",
  "environment.temperature",
  "environment.relative_humidity",
  "environment.noise_exposure",
  "environment.light_exposure",
  "environment.carbon_monoxide",
] as const;

export type EnvironmentalMetricCode = (typeof ENVIRONMENTAL_METRIC_CODES)[number];

export const RADIATION_METRIC_CODES = [
  "radiation.absorbed_dose",
  "radiation.dose_equivalent",
  "radiation.dose_rate",
] as const;

export type RadiationMetricCode = (typeof RADIATION_METRIC_CODES)[number];

export interface EnvironmentalTelemetryRecord {
  id: string;
  metricCode: EnvironmentalMetricCode | string;
  observedAt: string;
  value: number;
  unit: string;
  quality?: DataQuality;
  compartment?: string;
  location?: string;
  cursor?: string;
}

export interface EnvironmentalTelemetrySource {
  sourceId: string;
  displayName: string;
  manufacturer?: string;
  model?: string;
  transport: "mqtt" | "websocket" | "rest";
}

export interface EnvironmentalTelemetryClient {
  source(): Promise<EnvironmentalTelemetrySource>;
  availableMetricCodes(): Promise<string[]>;
  records(options: {
    metricCodes: string[];
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<EnvironmentalTelemetryRecord>;
  health(): Promise<{ available: boolean; message?: string }>;
}

export interface RadiationDosimeterRecord {
  id: string;
  metricCode: RadiationMetricCode;
  observedAt: string;
  value: number;
  unit: string;
  quality?: DataQuality;
  detectorType?: string;
  radiationField?: string;
  location?: string;
  cursor?: string;
}

export interface RadiationDosimeterSource {
  sourceId: string;
  displayName: string;
  manufacturer?: string;
  model?: string;
}

export interface RadiationDosimeterClient {
  source(): Promise<RadiationDosimeterSource>;
  availableMetricCodes(): Promise<string[]>;
  records(options: {
    metricCodes: RadiationMetricCode[];
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<RadiationDosimeterRecord>;
  health(): Promise<{ available: boolean; message?: string }>;
}
