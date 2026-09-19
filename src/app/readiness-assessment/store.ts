import type {
  DailyBehavioralCheckIn,
  PsychomotorVigilanceResult,
  ReactionTimeTrial,
  TaskLinkedWorkloadCheckIn,
} from "@/domain";
import type { ReadinessAssessmentState, ReadinessStep } from "./contracts";

export function createReadinessAssessmentState(startedAt: string): ReadinessAssessmentState {
  return { startedAt, step: "context", trials: [], issues: [] };
}

export function setReadinessStep(state: ReadinessAssessmentState, step: ReadinessStep): ReadinessAssessmentState {
  return { ...state, step };
}

export function recordDailyCheckIn(
  state: ReadinessAssessmentState,
  checkIn: DailyBehavioralCheckIn,
): ReadinessAssessmentState {
  return { ...state, checkIn, step: "vigilance" };
}

export function addVigilanceTrial(
  state: ReadinessAssessmentState,
  trial: ReactionTimeTrial,
): ReadinessAssessmentState {
  return { ...state, trials: [...state.trials, trial] };
}

export function recordVigilanceResult(
  state: ReadinessAssessmentState,
  result: PsychomotorVigilanceResult,
): ReadinessAssessmentState {
  return { ...state, vigilanceResult: result, step: "review" };
}

export function recordTaskLinkedWorkload(
  state: ReadinessAssessmentState,
  workload: TaskLinkedWorkloadCheckIn,
): ReadinessAssessmentState {
  return { ...state, workload };
}

export function completeReadinessAssessment(
  state: ReadinessAssessmentState,
  completedAt: string,
): ReadinessAssessmentState {
  return { ...state, completedAt };
}

export function assessmentElapsedSeconds(state: ReadinessAssessmentState, now: string): number {
  return Math.max(0, (Date.parse(state.completedAt ?? now) - Date.parse(state.startedAt)) / 1000);
}
