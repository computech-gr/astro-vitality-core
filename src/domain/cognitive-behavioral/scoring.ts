import type {
  DailyBehavioralCheckIn,
  NasaTlxRawRatings,
  PsychomotorVigilanceResult,
  ReactionTimeTrial,
  TaskLinkedWorkloadCheckIn,
  WorkingMemoryResult,
  WorkingMemoryTrial,
} from "./contracts";

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function correctedReactionTime(trial: ReactionTimeTrial): number | undefined {
  if (trial.falseStart || typeof trial.rawReactionTimeMs !== "number") return undefined;
  const corrected = trial.rawReactionTimeMs - (trial.deviceInputLatencyMs ?? 0);
  return Number.isFinite(corrected) && corrected >= 0 ? corrected : undefined;
}

export function scorePsychomotorVigilance(input: {
  protocolId: string;
  protocolVersion: string;
  trials: readonly ReactionTimeTrial[];
  practiceRunNumber: number;
  lapseThresholdMs?: number;
}): PsychomotorVigilanceResult {
  const corrected = input.trials
    .map(correctedReactionTime)
    .filter((value): value is number => typeof value === "number");
  const result: PsychomotorVigilanceResult = {
    protocolId: input.protocolId,
    protocolVersion: input.protocolVersion,
    validResponses: corrected.length,
    falseStarts: input.trials.filter((trial) => trial.falseStart).length,
    practiceRunNumber: input.practiceRunNumber,
    interpretation: "measurement_only",
  };
  const medianReactionTimeMs = median(corrected);
  if (typeof medianReactionTimeMs === "number") result.medianReactionTimeMs = medianReactionTimeMs;
  const latencies = input.trials
    .map((trial) => trial.deviceInputLatencyMs)
    .filter((value): value is number => typeof value === "number");
  const medianInputLatencyMs = median(latencies);
  if (typeof medianInputLatencyMs === "number") result.deviceInputLatencyMs = medianInputLatencyMs;
  if (typeof input.lapseThresholdMs === "number") {
    result.lapseThresholdMs = input.lapseThresholdMs;
    result.lapses = corrected.filter((value) => value >= input.lapseThresholdMs!).length;
  }
  return result;
}


export function scoreWorkingMemory(input: {
  protocolId: string;
  protocolVersion: string;
  trials: readonly WorkingMemoryTrial[];
  practiceRunNumber: number;
}): WorkingMemoryResult {
  const answered = input.trials.filter((trial) => typeof trial.respondedMatch === "boolean");
  const correct = answered.filter((trial) => trial.respondedMatch === trial.expectedMatch);
  const reactionTimes = answered
    .map((trial) => trial.responseTimeMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const result: WorkingMemoryResult = {
    protocolId: input.protocolId,
    protocolVersion: input.protocolVersion,
    totalTrials: input.trials.length,
    answeredTrials: answered.length,
    correctTrials: correct.length,
    practiceRunNumber: input.practiceRunNumber,
    interpretation: "measurement_only",
  };
  if (answered.length > 0) result.accuracyPercent = (correct.length / answered.length) * 100;
  const medianReactionTimeMs = median(reactionTimes);
  if (typeof medianReactionTimeMs === "number") result.medianReactionTimeMs = medianReactionTimeMs;
  return result;
}

export function validateDailyBehavioralCheckIn(checkIn: DailyBehavioralCheckIn): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(checkIn.fatigueVas0To10) || checkIn.fatigueVas0To10 < 0 || checkIn.fatigueVas0To10 > 10) {
    issues.push("fatigueVas0To10 must be between 0 and 10");
  }
  if (!Number.isInteger(checkIn.sleepinessKss1To9) || checkIn.sleepinessKss1To9 < 1 || checkIn.sleepinessKss1To9 > 9) {
    issues.push("sleepinessKss1To9 must be an integer between 1 and 9");
  }
  if (
    typeof checkIn.stressVas0To10 === "number" &&
    (!Number.isFinite(checkIn.stressVas0To10) || checkIn.stressVas0To10 < 0 || checkIn.stressVas0To10 > 10)
  ) {
    issues.push("stressVas0To10 must be between 0 and 10 when supplied");
  }
  if (
    typeof checkIn.schedule.recentSleepHours === "number" &&
    (!Number.isFinite(checkIn.schedule.recentSleepHours) || checkIn.schedule.recentSleepHours < 0 || checkIn.schedule.recentSleepHours > 24)
  ) {
    issues.push("recentSleepHours must be between 0 and 24 when supplied");
  }
  return issues;
}

export function validateNasaTlxRawRatings(ratings: NasaTlxRawRatings): string[] {
  return Object.entries(ratings).flatMap(([dimension, value]) =>
    Number.isFinite(value) && value >= 0 && value <= 100
      ? []
      : [`NASA-TLX ${dimension} must be between 0 and 100`],
  );
}

export function validateTaskLinkedWorkload(checkIn: TaskLinkedWorkloadCheckIn): string[] {
  const issues = validateNasaTlxRawRatings(checkIn.ratings);
  if (!checkIn.taskLabel.trim()) issues.push("NASA-TLX workload must be linked to a named task or shift");
  return issues;
}
