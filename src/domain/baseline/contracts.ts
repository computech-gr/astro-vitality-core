import type {
  DataQualityLevel,
  MissionContextRef,
  ObservationStatus,
  PersonalBaselineComparison,
} from "../contracts";

export const BASELINE_PHASES = [
  "preflight",
  "launch_transition",
  "early_adaptation",
  "stable_mission",
  "return_recovery",
] as const;
export type BaselinePhase = (typeof BASELINE_PHASES)[number];

export type BaselineProfileKind =
  | "preflight_reference"
  | "mission_adapted"
  | "recovery_reference";

export interface BaselinePolicy {
  id: string;
  metricCode: string;
  phase: BaselinePhase;
  minimumObservations: number;
  minimumCoverageHours: number;
  acceptedQualityLevels: DataQualityLevel[];
  acceptedStatuses: ObservationStatus[];
  requiredContextTags: string[];
  rollingWindowHours?: number;
  algorithmId: string;
  algorithmVersion: string;
  scientificBaselineVersion: "1.1";
}

export interface BaselineStatistics {
  count: number;
  mean: number;
  median: number;
  standardDeviation?: number;
  minimum: number;
  maximum: number;
}

export interface PersonalBaselineProfile {
  id: string;
  baselineVersion: string;
  mission: MissionContextRef;
  metricCode: string;
  phase: Exclude<BaselinePhase, "launch_transition">;
  kind: BaselineProfileKind;
  immutable: boolean;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  acceptedObservationIds: string[];
  excludedObservationCount: number;
  requiredContextTags: string[];
  acceptedQualityLevels: DataQualityLevel[];
  acceptedStatuses: ObservationStatus[];
  algorithmId: string;
  algorithmVersion: string;
  scientificBaselineVersion: "1.1";
  statistics: BaselineStatistics;
}

export type BaselineBuildResult =
  | { ok: true; profile: PersonalBaselineProfile }
  | { ok: false; issues: string[] };

export type BaselineComparisonResult =
  | {
      ok: true;
      profileId: string;
      comparison: PersonalBaselineComparison;
    }
  | { ok: false; reason: "metric_not_baseline_enabled" | "profile_mismatch" | "context_mismatch" | "non_numeric" };
