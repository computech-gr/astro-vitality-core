import { describe, expect, test } from "bun:test";

import {
  generateSyntheticMissionDataset,
  replaySyntheticMission,
  SYNTHETIC_SCENARIOS,
  syntheticDatasetFingerprint,
} from "../../src/domain";

describe("P17 synthetic mission dataset", () => {
  test("same scenario and seed replay deterministically", () => {
    const first = generateSyntheticMissionDataset("mission_day_127_fatigue_recovery");
    const second = generateSyntheticMissionDataset("mission_day_127_fatigue_recovery");
    expect(first.events).toEqual(second.events);
    expect(syntheticDatasetFingerprint(first)).toBe(syntheticDatasetFingerprint(second));
  });

  test("seed override changes the deterministic stream", () => {
    const first = generateSyntheticMissionDataset("mission_day_127_fatigue_recovery");
    const second = generateSyntheticMissionDataset("mission_day_127_fatigue_recovery", 999);
    expect(syntheticDatasetFingerprint(first)).not.toBe(syntheticDatasetFingerprint(second));
  });

  test("every generated health observation is unmistakably synthetic", () => {
    const dataset = generateSyntheticMissionDataset("mission_day_127_fatigue_recovery");
    const observations = dataset.events.filter((event) => event.kind === "observation");
    expect(observations.length).toBeGreaterThan(20);
    for (const event of observations) {
      expect(event.envelope.observation.classification).toBe("synthetic");
      expect(event.envelope.observation.tags).toContain("synthetic:true");
      expect(event.envelope.metricDefinitionVersion).toBe("1.1");
    }
  });

  test("Mission Day 127 covers the controlled cross-domain demo story", () => {
    const dataset = generateSyntheticMissionDataset("mission_day_127_fatigue_recovery");
    const codes = new Set(dataset.summary.metricCodes);
    for (const code of [
      "phys.heart_rate",
      "phys.hrv_rmssd",
      "phys.spo2",
      "sleep.efficiency",
      "behavior.fatigue_state",
      "behavior.sleepiness_kss",
      "cognition.pvt_median_rt",
      "environment.co2",
      "radiation.dose_rate",
      "lab.glucose",
    ]) {
      expect(codes.has(code)).toBe(true);
    }
    expect(dataset.events.some((event) => event.kind === "connectivity" && event.state === "offline")).toBe(true);
    expect(dataset.events.some((event) => event.kind === "connectivity" && event.state === "online")).toBe(true);
    expect(dataset.summary.poorQualityObservations).toBeGreaterThan(0);
  });

  test("artifact scenario contains explicit quality faults and a real missing-data interval", () => {
    const dataset = generateSyntheticMissionDataset("sensor_artifact_dropout");
    const observations = dataset.events.filter((event) => event.kind === "observation");
    expect(observations.some((event) => event.envelope.observation.quality.level === "poor")).toBe(true);

    const missingWindowSpO2 = observations.filter((event) => {
      if (event.envelope.observation.metric.code !== "phys.spo2") return false;
      const minute = (new Date(event.occurredAt).getTime() - new Date(dataset.manifest.startsAt).getTime()) / 60_000;
      return minute >= 70 && minute <= 95;
    });
    expect(missingWindowSpO2).toHaveLength(0);
    expect(dataset.events.some((event) => event.kind === "annotation" && event.tags.includes("data_quality:missing"))).toBe(true);
  });

  test("CO2 context remains explicitly non-causal", () => {
    const dataset = generateSyntheticMissionDataset("co2_context_event");
    expect(dataset.events.some((event) => event.kind === "annotation" && event.tags.includes("guardrail:non-causal"))).toBe(true);
    expect(SYNTHETIC_SCENARIOS.co2_context_event.limitations.join(" ").toLowerCase()).toContain("no co2-to-cognition causality");
  });

  test("radiation context has no biological risk score", () => {
    const dataset = generateSyntheticMissionDataset("radiation_context_event");
    expect(dataset.summary.metricCodes).toContain("radiation.dose_rate");
    expect(dataset.events.some((event) => event.kind === "annotation" && event.tags.includes("guardrail:no-risk-score"))).toBe(true);
    expect(SYNTHETIC_SCENARIOS.radiation_context_event.limitations.join(" ").toLowerCase()).toContain("no biological radiation-risk score");
  });

  test("scripted replay preserves event order and supports partial replay", () => {
    const dataset = generateSyntheticMissionDataset("mission_day_127_fatigue_recovery");
    const ids: string[] = [];
    replaySyntheticMission(dataset, ({ event }) => ids.push(event.id), { fromIndex: 2, untilIndex: 8 });
    expect(ids).toEqual(dataset.events.slice(2, 8).map((event) => event.id));
  });
});
