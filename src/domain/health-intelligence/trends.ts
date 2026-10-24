import type { TrendDetectionPolicy, TrendEvidence, TrendSample } from "./contracts";

function hasRequiredContext(sample: TrendSample, required: readonly string[]) {
  return required.every((tag) => sample.contextTags.includes(tag));
}

function sampleMagnitude(sample: TrendSample, policy: TrendDetectionPolicy): number | undefined {
  if (
    typeof policy.standardizedDeltaMagnitude === "number" &&
    typeof sample.standardizedDelta === "number"
  ) {
    return Math.abs(sample.standardizedDelta) >= policy.standardizedDeltaMagnitude
      ? sample.standardizedDelta
      : undefined;
  }
  if (typeof policy.percentDeltaMagnitude === "number" && typeof sample.percentDelta === "number") {
    return Math.abs(sample.percentDelta) >= policy.percentDeltaMagnitude
      ? sample.percentDelta
      : undefined;
  }
  return undefined;
}

/**
 * Detects persistence only from an explicitly supplied governed policy.
 * P12 ships no universal medical or physiological thresholds.
 */
export function detectSustainedTrend(
  samples: readonly TrendSample[],
  policy: TrendDetectionPolicy,
): TrendEvidence | undefined {
  if (
    typeof policy.standardizedDeltaMagnitude !== "number" &&
    typeof policy.percentDeltaMagnitude !== "number"
  ) {
    return undefined;
  }

  const ordered = samples
    .filter((sample) => sample.metricCode === policy.metricCode)
    .filter((sample) => policy.acceptedQualityLevels.includes(sample.qualityLevel))
    .filter((sample) => hasRequiredContext(sample, policy.requiredContextTags))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

  if (ordered.length < policy.minimumSamples) return undefined;
  const windowEnd = Date.parse(ordered.at(-1)!.observedAt);
  const inWindow = ordered.filter(
    (sample) => windowEnd - Date.parse(sample.observedAt) <= policy.windowMs,
  );
  if (inWindow.length < policy.minimumSamples) return undefined;

  let run: TrendSample[] = [];
  for (const sample of inWindow) {
    const magnitude = sampleMagnitude(sample, policy);
    if (typeof magnitude !== "number") {
      run = [];
      continue;
    }
    const sign = Math.sign(magnitude);
    const previous = run.at(-1);
    const previousMagnitude = previous ? sampleMagnitude(previous, policy) : undefined;
    if (
      previous &&
      typeof previousMagnitude === "number" &&
      Math.sign(previousMagnitude) !== sign
    ) {
      run = [sample];
    } else {
      run.push(sample);
    }
  }

  if (run.length < policy.minimumConsecutive) return undefined;
  const latest = run.at(-1)!;
  const latestMagnitude = sampleMagnitude(latest, policy)!;
  const direction = latestMagnitude > 0 ? "higher_than_baseline" : "lower_than_baseline";
  const qualityLevel = run.some((sample) => sample.qualityLevel !== "good") ? "degraded" : "good";

  return {
    evidenceId: `trend:${policy.id}:${latest.observationId}`,
    metricCode: policy.metricCode,
    observationIds: run.map((sample) => sample.observationId),
    sourceIds: [...new Set(run.map((sample) => sample.sourceId))],
    domain: latest.domain,
    direction,
    windowStart: run[0]!.observedAt,
    windowEnd: latest.observedAt,
    qualityLevel,
    magnitude: latestMagnitude,
    policyId: policy.id,
    policyAuthority: policy.authority,
    explanation: `Sustained ${direction.replaceAll("_", " ")} under governed policy ${policy.id}.`,
  };
}
