import { describe, expect, test } from "bun:test";

import {
  buildPersonalBaseline,
  compareObservationToBaseline,
  ingestCanonicalObservation,
  selectBaselineComparator,
  type BaselinePolicy,
  type ObservationEnvelope,
} from "../../src/domain";
import {
  createLiveDashboardState,
  deriveDashboardMetricView,
  ingestDashboardObservation,
  setDashboardBaselineProfile,
} from "../../src/app/live-dashboard";

function heartRate(id: string, value: number, observedAt: string, tags = ["state:resting"]): ObservationEnvelope {
  const result = ingestCanonicalObservation({
    id,
    mission: { missionId: "mission-p10", crewMemberId: "crew-p10" },
    source: { sourceId: "device-p10", sourceType: "device" },
    metricCode: "phys.heart_rate",
    value: { number: value },
    unit: "bpm",
    observedAt,
    status: "final",
    quality: { level: "good", score: 0.98, artifactFlags: [] },
    provenance: { kind: "raw", capturedAt: observedAt, ingestionId: `ing-${id}`, inputObservationIds: [] },
    classification: "synthetic",
    tags,
    context: { tags },
  });
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(", "));
  return result.envelope;
}

const preflightPolicy: BaselinePolicy = {
  id: "policy-heart-rate-preflight-v1",
  metricCode: "phys.heart_rate",
  phase: "preflight",
  minimumObservations: 3,
  minimumCoverageHours: 2,
  acceptedQualityLevels: ["good"],
  acceptedStatuses: ["final"],
  requiredContextTags: ["state:resting"],
  algorithmId: "mean-sd-longitudinal",
  algorithmVersion: "1.0.0",
  scientificBaselineVersion: "1.1",
};

const preflightObservations = [
  heartRate("hr-1", 68, "2026-09-01T08:00:00Z"),
  heartRate("hr-2", 70, "2026-09-01T09:00:00Z"),
  heartRate("hr-3", 72, "2026-09-01T10:00:00Z"),
];

function buildPreflight() {
  return buildPersonalBaseline({
    id: "baseline-preflight-hr",
    baselineVersion: "preflight-v1",
    createdAt: "2026-09-02T00:00:00Z",
    policy: preflightPolicy,
    observations: preflightObservations,
  });
}

describe("P10 personal baseline engine", () => {
  test("builds an immutable versioned preflight distribution from quality-accepted observations", () => {
    const result = buildPreflight();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.immutable).toBe(true);
    expect(result.profile.kind).toBe("preflight_reference");
    expect(result.profile.statistics).toMatchObject({ count: 3, mean: 70, median: 70, minimum: 68, maximum: 72 });
    expect(result.profile.statistics.standardDeviation).toBeCloseTo(2);
    expect(result.profile.scientificBaselineVersion).toBe("1.1");
  });

  test("computes absolute, percentage and standardized personalized deltas without a clinical threshold", () => {
    const built = buildPreflight();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const comparison = compareObservationToBaseline(heartRate("hr-current", 76, "2026-09-02T08:00:00Z"), built.profile);
    expect(comparison.ok).toBe(true);
    if (!comparison.ok) return;
    expect(comparison.comparison.delta).toBe(6);
    expect(comparison.comparison.percentDelta).toBeCloseTo(8.571, 2);
    expect(comparison.comparison.standardizedDelta).toBeCloseTo(3);
  });

  test("fails closed when minimum data or required context is missing", () => {
    const insufficient = buildPersonalBaseline({
      id: "bad",
      baselineVersion: "v1",
      createdAt: "2026-09-02T00:00:00Z",
      policy: preflightPolicy,
      observations: preflightObservations.slice(0, 2),
    });
    expect(insufficient.ok).toBe(false);

    const built = buildPreflight();
    if (!built.ok) throw new Error("fixture baseline failed");
    const mismatch = compareObservationToBaseline(heartRate("hr-context", 74, "2026-09-02T08:00:00Z", ["state:exercise"]), built.profile);
    expect(mismatch).toEqual({ ok: false, reason: "context_mismatch" });
  });

  test("does not allow launch/transition data to replace the preflight baseline", () => {
    const result = buildPersonalBaseline({
      id: "transition",
      baselineVersion: "transition-v1",
      createdAt: "2026-09-02T00:00:00Z",
      policy: { ...preflightPolicy, phase: "launch_transition" },
      observations: preflightObservations,
    });
    expect(result.ok).toBe(false);
  });

  test("builds a rolling stable-mission baseline only from the configured latest window", () => {
    const observations = [
      heartRate("s1", 65, "2026-09-10T08:00:00Z"),
      heartRate("s2", 66, "2026-09-10T09:00:00Z"),
      heartRate("s3", 70, "2026-09-10T12:00:00Z"),
      heartRate("s4", 71, "2026-09-10T13:00:00Z"),
      heartRate("s5", 72, "2026-09-10T14:00:00Z"),
    ];
    const result = buildPersonalBaseline({
      id: "stable",
      baselineVersion: "stable-v1",
      createdAt: "2026-09-10T15:00:00Z",
      policy: { ...preflightPolicy, phase: "stable_mission", rollingWindowHours: 2 },
      observations,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.statistics.count).toBe(3);
    expect(result.profile.statistics.mean).toBe(71);
    expect(result.profile.immutable).toBe(false);
  });

  test("uses preflight through adaptation/recovery and prefers mission-adapted baseline only in stable mission", () => {
    const preflight = buildPreflight();
    if (!preflight.ok) throw new Error("fixture baseline failed");
    const stable = { ...preflight.profile, id: "stable-profile", baselineVersion: "stable-v1", phase: "stable_mission" as const, kind: "mission_adapted" as const, immutable: false, createdAt: "2026-09-20T00:00:00Z" };
    expect(selectBaselineComparator([preflight.profile, stable], "early_adaptation")?.id).toBe(preflight.profile.id);
    expect(selectBaselineComparator([preflight.profile, stable], "stable_mission")?.id).toBe(stable.id);
    expect(selectBaselineComparator([preflight.profile, stable], "return_recovery")?.id).toBe(preflight.profile.id);
  });

  test("feeds baseline deltas into the live dashboard without generating fake values or alerts", () => {
    const built = buildPreflight();
    if (!built.ok) throw new Error("fixture baseline failed");
    let state = createLiveDashboardState();
    state = setDashboardBaselineProfile(state, built.profile);
    state = ingestDashboardObservation(state, heartRate("hr-live", 74, "2026-09-02T08:00:00Z"), "2026-09-02T08:00:01Z");
    const view = deriveDashboardMetricView(state, "phys.heart_rate", "Heart rate", "2026-09-02T08:00:10Z");
    expect(view.value).toBe(74);
    expect(view.baselineStatus).toBe("available");
    expect(view.baseline?.delta).toBe(4);
  });
});
