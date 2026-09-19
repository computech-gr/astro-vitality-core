import type {
  DailyBehavioralCheckIn,
  PsychomotorVigilanceResult,
  ReactionTimeTrial,
  TaskLinkedWorkloadCheckIn,
} from "@/domain";

export type ReadinessStep = "context" | "check_in" | "vigilance" | "review";

export interface ReadinessAssessmentState {
  startedAt: string;
  step: ReadinessStep;
  checkIn?: DailyBehavioralCheckIn;
  trials: ReactionTimeTrial[];
  vigilanceResult?: PsychomotorVigilanceResult;
  workload?: TaskLinkedWorkloadCheckIn;
  completedAt?: string;
  issues: string[];
}
