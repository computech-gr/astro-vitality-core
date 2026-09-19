import type { ObservationEnvelope } from "../contracts";
import { getCanonicalMetric } from "../metric-registry";
import type {
  BaselineBuildResult,
  BaselineComparisonResult,
  BaselinePhase,
  BaselinePolicy,
  BaselineProfileKind,
  PersonalBaselineProfile,
} from "./contracts";

function hoursBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 3_600_000;
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle]!;
  return (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function sampleStandardDeviation(values: number[], mean: number): number | undefined {
  if (values.length < 2) return undefined;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function profileKindForPhase(phase: Exclude<BaselinePhase, "launch_transition">): BaselineProfileKind {
  if (phase === "preflight") return "preflight_reference";
  if (phase === "return_recovery") return "recovery_reference";
  return "mission_adapted";
}

function hasRequiredContext(envelope: ObservationEnvelope, requiredTags: readonly string[]): boolean {
  return requiredTags.every((tag) => envelope.context.tags.includes(tag) || envelope.observation.tags.includes(tag));
}

function eligibleForPolicy(envelope: ObservationEnvelope, policy: BaselinePolicy): boolean {
  const observation = envelope.observation;
  return (
    observation.metric.code === policy.metricCode &&
    typeof observation.value.number === "number" &&
    policy.acceptedQualityLevels.includes(observation.quality.level) &&
    policy.acceptedStatuses.includes(observation.status) &&
    hasRequiredContext(envelope, policy.requiredContextTags)
  );
}

function applyRollingWindow(observations: ObservationEnvelope[], rollingWindowHours?: number): ObservationEnvelope[] {
  if (rollingWindowHours === undefined || observations.length === 0) return observations;
  const latest = Date.parse(observations.at(-1)!.observation.observedAt);
  const earliestAllowed = latest - rollingWindowHours * 3_600_000;
  return observations.filter((item) => Date.parse(item.observation.observedAt) >= earliestAllowed);
}

export function buildPersonalBaseline(input: {
  id: string;
  baselineVersion: string;
  createdAt: string;
  policy: BaselinePolicy;
  observations: readonly ObservationEnvelope[];
}): BaselineBuildResult {
  const metric = getCanonicalMetric(input.policy.metricCode);
  if (!metric?.personalBaseline || metric.valueKind !== "number" || metric.dataShape !== "scalar") {
    return { ok: false, issues: [`Metric ${input.policy.metricCode} is not enabled for numeric personal baselines`] };
  }
  if (input.policy.phase === "launch_transition") {
    return { ok: false, issues: ["Launch/transition must use the immutable preflight comparator; it cannot create a replacement baseline"] };
  }
  if (input.policy.minimumObservations < 2 || !Number.isInteger(input.policy.minimumObservations)) {
    return { ok: false, issues: ["minimumObservations must be an integer of at least 2"] };
  }
  if (!(input.policy.minimumCoverageHours > 0)) {
    return { ok: false, issues: ["minimumCoverageHours must be positive"] };
  }
  if (input.policy.rollingWindowHours !== undefined && !["early_adaptation", "stable_mission"].includes(input.policy.phase)) {
    return { ok: false, issues: ["Rolling windows are allowed only for early-adaptation or stable-mission baselines"] };
  }

  const candidates = input.observations
    .filter((item) => eligibleForPolicy(item, input.policy))
    .sort((a, b) => Date.parse(a.observation.observedAt) - Date.parse(b.observation.observedAt));
  const accepted = applyRollingWindow(candidates, input.policy.rollingWindowHours);
  if (accepted.length < input.policy.minimumObservations) {
    return { ok: false, issues: [`Insufficient accepted observations: ${accepted.length}/${input.policy.minimumObservations}`] };
  }

  const first = accepted[0]!;
  const mission = first.observation.mission;
  if (accepted.some((item) => item.observation.mission.missionId !== mission.missionId || item.observation.mission.crewMemberId !== mission.crewMemberId)) {
    return { ok: false, issues: ["A personal baseline cannot mix missions or crew members"] };
  }
  const windowStart = first.observation.observedAt;
  const windowEnd = accepted.at(-1)!.observation.observedAt;
  const coverageHours = hoursBetween(windowStart, windowEnd);
  if (coverageHours < input.policy.minimumCoverageHours) {
    return { ok: false, issues: [`Insufficient baseline coverage: ${coverageHours.toFixed(2)}h/${input.policy.minimumCoverageHours}h`] };
  }

  const values = accepted.map((item) => item.observation.value.number!);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const standardDeviation = sampleStandardDeviation(values, mean);
  const phase = input.policy.phase;

  return {
    ok: true,
    profile: {
      id: input.id,
      baselineVersion: input.baselineVersion,
      mission,
      metricCode: input.policy.metricCode,
      phase,
      kind: profileKindForPhase(phase),
      immutable: phase === "preflight",
      windowStart,
      windowEnd,
      createdAt: input.createdAt,
      acceptedObservationIds: accepted.map((item) => item.observation.id),
      excludedObservationCount: input.observations.length - accepted.length,
      requiredContextTags: [...input.policy.requiredContextTags],
      acceptedQualityLevels: [...input.policy.acceptedQualityLevels],
      acceptedStatuses: [...input.policy.acceptedStatuses],
      algorithmId: input.policy.algorithmId,
      algorithmVersion: input.policy.algorithmVersion,
      scientificBaselineVersion: input.policy.scientificBaselineVersion,
      statistics: {
        count: values.length,
        mean,
        median: median(values),
        ...(standardDeviation !== undefined ? { standardDeviation } : {}),
        minimum: Math.min(...values),
        maximum: Math.max(...values),
      },
    },
  };
}

export function compareObservationToBaseline(
  envelope: ObservationEnvelope,
  profile: PersonalBaselineProfile,
): BaselineComparisonResult {
  const metric = getCanonicalMetric(envelope.observation.metric.code);
  if (!metric?.personalBaseline) return { ok: false, reason: "metric_not_baseline_enabled" };
  if (
    envelope.observation.metric.code !== profile.metricCode ||
    envelope.observation.mission.missionId !== profile.mission.missionId ||
    envelope.observation.mission.crewMemberId !== profile.mission.crewMemberId
  ) {
    return { ok: false, reason: "profile_mismatch" };
  }
  if (!hasRequiredContext(envelope, profile.requiredContextTags)) return { ok: false, reason: "context_mismatch" };
  const value = envelope.observation.value.number;
  if (typeof value !== "number") return { ok: false, reason: "non_numeric" };

  const expectedValue = profile.statistics.mean;
  const delta = value - expectedValue;
  const percentDelta = expectedValue !== 0 ? (delta / expectedValue) * 100 : undefined;
  const standardDeviation = profile.statistics.standardDeviation;
  const standardizedDelta = standardDeviation !== undefined && standardDeviation > 0 ? delta / standardDeviation : undefined;
  const baselineUncertainty = standardDeviation !== undefined ? standardDeviation / Math.sqrt(profile.statistics.count) : undefined;

  return {
    ok: true,
    profileId: profile.id,
    comparison: {
      baselineVersion: profile.baselineVersion,
      expectedValue,
      delta,
      ...(percentDelta !== undefined ? { percentDelta } : {}),
      ...(standardizedDelta !== undefined ? { standardizedDelta } : {}),
      ...(baselineUncertainty !== undefined ? { uncertainty: baselineUncertainty } : {}),
    },
  };
}

export function selectBaselineComparator(
  profiles: readonly PersonalBaselineProfile[],
  phase: BaselinePhase,
): PersonalBaselineProfile | undefined {
  const ordered = [...profiles].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const preflight = ordered.find((profile) => profile.kind === "preflight_reference");
  if (phase === "stable_mission") {
    return ordered.find((profile) => profile.phase === "stable_mission" && profile.kind === "mission_adapted") ?? preflight;
  }
  if (phase === "preflight") return preflight;
  if (phase === "launch_transition" || phase === "early_adaptation" || phase === "return_recovery") return preflight;
  return preflight;
}
