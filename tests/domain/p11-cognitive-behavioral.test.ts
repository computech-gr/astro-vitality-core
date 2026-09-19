import { describe, expect, test } from "bun:test";

import {
  ingestDailyBehavioralCheckIn,
  scorePsychomotorVigilance,
  scoreWorkingMemory,
  validateDailyBehavioralCheckIn,
  validateTaskLinkedWorkload,
  type DailyBehavioralCheckIn,
  type TaskLinkedWorkloadCheckIn,
} from "../../src/domain";
import {
  assessmentElapsedSeconds,
  completeReadinessAssessment,
  createReadinessAssessmentState,
} from "../../src/app/readiness-assessment";

const checkIn: DailyBehavioralCheckIn = {
  id: "daily-1",
  mission: { missionId: "mission-p11", crewMemberId: "crew-p11" },
  recordedAt: "2026-09-19T08:00:00Z",
  fatigueVas0To10: 4,
  sleepinessKss1To9: 5,
  stressVas0To10: 3,
  schedule: { workRestState: "routine_work", recentSleepHours: 7.2, tags: ["schedule:day"] },
  privateToCrewHealth: true,
};

describe("P11 cognitive and behavioral module", () => {
  test("validates bounded state measures and rejects invalid values", () => {
    expect(validateDailyBehavioralCheckIn(checkIn)).toEqual([]);
    expect(validateDailyBehavioralCheckIn({ ...checkIn, sleepinessKss1To9: 10 })).toContain(
      "sleepinessKss1To9 must be an integer between 1 and 9",
    );
  });

  test("ingests fatigue, KSS sleepiness and stress as private canonical observations", () => {
    const result = ingestDailyBehavioralCheckIn(checkIn);
    expect(result.issues).toEqual([]);
    expect(result.observations.map((item) => item.observation.metric.code)).toEqual([
      "behavior.fatigue_state",
      "behavior.sleepiness_kss",
      "behavior.stress_state",
    ]);
    expect(result.observations.every((item) => item.observation.classification === "medical_sensitive")).toBe(true);
  });

  test("scores corrected reaction time and does not invent a lapse threshold", () => {
    const result = scorePsychomotorVigilance({
      protocolId: "p11-demo",
      protocolVersion: "1.0.0",
      practiceRunNumber: 2,
      trials: [
        { index: 1, stimulusPresentedAt: "2026-09-19T08:00:01Z", responseAt: "2026-09-19T08:00:01.310Z", rawReactionTimeMs: 310, deviceInputLatencyMs: 10, falseStart: false },
        { index: 2, stimulusPresentedAt: "2026-09-19T08:00:03Z", responseAt: "2026-09-19T08:00:03.420Z", rawReactionTimeMs: 420, deviceInputLatencyMs: 20, falseStart: false },
        { index: 3, stimulusPresentedAt: "2026-09-19T08:00:05Z", responseAt: "2026-09-19T08:00:05.100Z", falseStart: true },
      ],
    });
    expect(result.medianReactionTimeMs).toBe(350);
    expect(result.falseStarts).toBe(1);
    expect(result.lapses).toBeUndefined();
  });

  test("counts lapses only when a governed protocol explicitly supplies a threshold", () => {
    const result = scorePsychomotorVigilance({
      protocolId: "governed-protocol",
      protocolVersion: "1.0.0",
      practiceRunNumber: 3,
      lapseThresholdMs: 500,
      trials: [
        { index: 1, stimulusPresentedAt: "2026-09-19T08:00:01Z", rawReactionTimeMs: 300, falseStart: false },
        { index: 2, stimulusPresentedAt: "2026-09-19T08:00:03Z", rawReactionTimeMs: 520, falseStart: false },
      ],
    });
    expect(result.lapses).toBe(1);
    expect(result.lapseThresholdMs).toBe(500);
  });

  test("scores working-memory accuracy with explicit protocol and practice provenance", () => {
    const result = scoreWorkingMemory({
      protocolId: "2back-governed-fixture",
      protocolVersion: "1.0.0",
      practiceRunNumber: 4,
      trials: [
        { index: 1, expectedMatch: true, respondedMatch: true, responseTimeMs: 610 },
        { index: 2, expectedMatch: false, respondedMatch: false, responseTimeMs: 590 },
        { index: 3, expectedMatch: true, respondedMatch: false, responseTimeMs: 650 },
        { index: 4, expectedMatch: false },
      ],
    });
    expect(result.totalTrials).toBe(4);
    expect(result.answeredTrials).toBe(3);
    expect(result.correctTrials).toBe(2);
    expect(result.accuracyPercent).toBeCloseTo(66.67, 1);
    expect(result.practiceRunNumber).toBe(4);
  });

  test("keeps NASA-TLX task-linked and preserves all six raw dimensions", () => {
    const workload: TaskLinkedWorkloadCheckIn = {
      id: "tlx-1",
      mission: checkIn.mission,
      recordedAt: checkIn.recordedAt,
      taskLabel: "Docking simulation",
      ratings: {
        mental_demand: 60,
        physical_demand: 10,
        temporal_demand: 50,
        performance: 30,
        effort: 55,
        frustration: 20,
      },
      privateToCrewHealth: true,
      interpretation: "task_linked_context_only",
    };
    expect(validateTaskLinkedWorkload(workload)).toEqual([]);
    expect(validateTaskLinkedWorkload({ ...workload, taskLabel: "" })).toContain(
      "NASA-TLX workload must be linked to a named task or shift",
    );
    expect(Object.keys(workload.ratings)).toHaveLength(6);
  });

  test("supports a demo assessment flow under three minutes without deriving a readiness diagnosis", () => {
    const initial = createReadinessAssessmentState("2026-09-19T08:00:00Z");
    const completed = completeReadinessAssessment(initial, "2026-09-19T08:02:20Z");
    expect(assessmentElapsedSeconds(completed, completed.completedAt!)).toBe(140);
    expect(assessmentElapsedSeconds(completed, completed.completedAt!)).toBeLessThan(180);
    expect("readinessScore" in completed).toBe(false);
  });
});
