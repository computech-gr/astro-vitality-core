import type { MissionContextRef, ObservationEnvelope } from "../contracts";

export const COGNITIVE_TASK_KINDS = ["psychomotor_vigilance", "working_memory"] as const;
export type CognitiveTaskKind = (typeof COGNITIVE_TASK_KINDS)[number];

export const BEHAVIORAL_MEASURE_KINDS = [
  "fatigue_vas",
  "sleepiness_kss",
  "stress_vas",
  "mood_affect",
  "nasa_tlx",
] as const;
export type BehavioralMeasureKind = (typeof BEHAVIORAL_MEASURE_KINDS)[number];

export const NASA_TLX_DIMENSIONS = [
  "mental_demand",
  "physical_demand",
  "temporal_demand",
  "performance",
  "effort",
  "frustration",
] as const;
export type NasaTlxDimension = (typeof NASA_TLX_DIMENSIONS)[number];

export interface AssessmentScheduleContext {
  workRestState?: "rest" | "routine_work" | "critical_task" | "exercise" | "eva";
  taskLabel?: string;
  plannedShiftStart?: string;
  recentSleepHours?: number;
  timezoneOffsetMinutes?: number;
  tags: string[];
}

export interface CognitiveTaskProtocol {
  id: string;
  version: string;
  kind: CognitiveTaskKind;
  displayName: string;
  durationSeconds: number;
  practiceAware: true;
  sourceIds: readonly string[];
  scientificBaselineVersion: "1.1";
  operationalValidationStatus: "demo_only" | "scientifically_governed";
  lapseThresholdMs?: number;
}

export interface ReactionTimeTrial {
  index: number;
  stimulusPresentedAt?: string;
  responseAt?: string;
  rawReactionTimeMs?: number;
  deviceInputLatencyMs?: number;
  falseStart: boolean;
}

export interface PsychomotorVigilanceResult {
  protocolId: string;
  protocolVersion: string;
  validResponses: number;
  falseStarts: number;
  medianReactionTimeMs?: number;
  lapses?: number;
  lapseThresholdMs?: number;
  practiceRunNumber: number;
  deviceInputLatencyMs?: number;
  interpretation: "measurement_only";
}


export interface WorkingMemoryTrial {
  index: number;
  expectedMatch: boolean;
  respondedMatch?: boolean;
  responseTimeMs?: number;
}

export interface WorkingMemoryResult {
  protocolId: string;
  protocolVersion: string;
  totalTrials: number;
  answeredTrials: number;
  correctTrials: number;
  accuracyPercent?: number;
  medianReactionTimeMs?: number;
  practiceRunNumber: number;
  interpretation: "measurement_only";
}

export interface DailyBehavioralCheckIn {
  id: string;
  mission: MissionContextRef;
  recordedAt: string;
  fatigueVas0To10: number;
  sleepinessKss1To9: number;
  stressVas0To10?: number;
  schedule: AssessmentScheduleContext;
  privateToCrewHealth: true;
}

export type NasaTlxRawRatings = Record<NasaTlxDimension, number>;

export interface TaskLinkedWorkloadCheckIn {
  id: string;
  mission: MissionContextRef;
  recordedAt: string;
  taskLabel: string;
  ratings: NasaTlxRawRatings;
  privateToCrewHealth: true;
  interpretation: "task_linked_context_only";
}

export interface CognitiveBehavioralObservationBatch {
  observations: ObservationEnvelope[];
  issues: string[];
}
