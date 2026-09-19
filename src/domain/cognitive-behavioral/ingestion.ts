import { ingestCanonicalObservation } from "../ingestion";
import type { CognitiveBehavioralObservationBatch, DailyBehavioralCheckIn, PsychomotorVigilanceResult } from "./contracts";
import { validateDailyBehavioralCheckIn } from "./scoring";

function assessmentObservation(input: {
  id: string;
  mission: DailyBehavioralCheckIn["mission"];
  metricCode: string;
  value: number;
  observedAt: string;
  ingestionId: string;
  tags: string[];
}) {
  return ingestCanonicalObservation({
    id: input.id,
    mission: input.mission,
    source: { sourceId: "p11-assessment", sourceType: "assessment", adapterId: "p11-cognitive-behavioral" },
    metricCode: input.metricCode,
    value: { number: input.value },
    unit: "1",
    observedAt: input.observedAt,
    status: "final",
    quality: { level: "good", artifactFlags: [] },
    provenance: {
      kind: "manual",
      capturedAt: input.observedAt,
      ingestionId: input.ingestionId,
      inputObservationIds: [],
    },
    classification: "medical_sensitive",
    tags: input.tags,
    context: { tags: input.tags },
  });
}

export function ingestDailyBehavioralCheckIn(checkIn: DailyBehavioralCheckIn): CognitiveBehavioralObservationBatch {
  const issues = validateDailyBehavioralCheckIn(checkIn);
  if (issues.length) return { observations: [], issues };
  const tags = [
    "assessment:p11-daily",
    `work_rest:${checkIn.schedule.workRestState ?? "unspecified"}`,
    ...checkIn.schedule.tags,
  ];
  const drafts = [
    ["behavior.fatigue_state", checkIn.fatigueVas0To10, "fatigue"],
    ["behavior.sleepiness_kss", checkIn.sleepinessKss1To9, "sleepiness"],
    ...(typeof checkIn.stressVas0To10 === "number"
      ? [["behavior.stress_state", checkIn.stressVas0To10, "stress"] as const]
      : []),
  ] as const;
  const observations = [];
  for (const [metricCode, value, suffix] of drafts) {
    const result = assessmentObservation({
      id: `${checkIn.id}-${suffix}`,
      mission: checkIn.mission,
      metricCode,
      value,
      observedAt: checkIn.recordedAt,
      ingestionId: `${checkIn.id}-${suffix}`,
      tags,
    });
    if (!result.ok) {
      issues.push(...result.issues.map((issue) => `${metricCode}: ${issue.message}`));
      continue;
    }
    observations.push(result.envelope);
  }
  return { observations, issues };
}

export function ingestPsychomotorVigilanceResult(input: {
  id: string;
  mission: DailyBehavioralCheckIn["mission"];
  recordedAt: string;
  result: PsychomotorVigilanceResult;
  tags?: string[];
}): CognitiveBehavioralObservationBatch {
  const issues: string[] = [];
  const observations = [];
  const tags = ["assessment:p11-pvt", `protocol:${input.result.protocolId}`, ...(input.tags ?? [])];
  if (typeof input.result.medianReactionTimeMs === "number") {
    const medianResult = ingestCanonicalObservation({
      id: `${input.id}-median-rt`,
      mission: input.mission,
      source: { sourceId: "p11-pvt", sourceType: "assessment", adapterId: "p11-cognitive-behavioral" },
      metricCode: "cognition.pvt_median_rt",
      value: { number: input.result.medianReactionTimeMs },
      unit: "ms",
      observedAt: input.recordedAt,
      status: "final",
      quality: { level: input.result.validResponses > 0 ? "good" : "poor", artifactFlags: [] },
      provenance: {
        kind: "derived",
        capturedAt: input.recordedAt,
        ingestionId: `${input.id}-median-rt`,
        inputObservationIds: [],
        derivationMethod: "median corrected reaction time",
        algorithmVersion: input.result.protocolVersion,
      },
      classification: "medical_sensitive",
      tags,
      context: { tags },
    });
    if (medianResult.ok) observations.push(medianResult.envelope);
    else issues.push(...medianResult.issues.map((issue) => issue.message));
  }
  if (typeof input.result.lapses === "number") {
    const lapseResult = ingestCanonicalObservation({
      id: `${input.id}-lapses`,
      mission: input.mission,
      source: { sourceId: "p11-pvt", sourceType: "assessment", adapterId: "p11-cognitive-behavioral" },
      metricCode: "cognition.pvt_lapses",
      value: { number: input.result.lapses },
      unit: "count",
      observedAt: input.recordedAt,
      status: "final",
      quality: { level: "good", artifactFlags: [] },
      provenance: {
        kind: "derived",
        capturedAt: input.recordedAt,
        ingestionId: `${input.id}-lapses`,
        inputObservationIds: [],
        derivationMethod: `protocol lapse threshold ${input.result.lapseThresholdMs} ms`,
        algorithmVersion: input.result.protocolVersion,
      },
      classification: "medical_sensitive",
      tags,
      context: { tags },
    });
    if (lapseResult.ok) observations.push(lapseResult.envelope);
    else issues.push(...lapseResult.issues.map((issue) => issue.message));
  }
  return { observations, issues };
}
