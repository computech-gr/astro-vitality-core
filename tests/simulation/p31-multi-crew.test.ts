import { describe, expect, test } from "bun:test";
import { generateP31MultiCrewMission, P31_CREW, P31_MISSION_ID } from "../../src/domain/simulation/multi-crew";

describe("P31 deterministic multi-crew mission", () => {
  test("replay is deterministic and includes four distinct crew", () => {
    const a = generateP31MultiCrewMission();
    const b = generateP31MultiCrewMission();
    expect(a).toEqual(b);
    expect(a.summary.crewCount).toBe(4);
    expect(new Set(a.crew.map((c) => c.crewId)).size).toBe(4);
    expect(P31_CREW).toHaveLength(4);
  });
  test("all observations are synthetic, scoped, and have crew-isolated sources", () => {
    const replay = generateP31MultiCrewMission();
    const ids = new Set<string>();
    for (const row of replay.timeline) {
      expect(ids.has(row.event.id)).toBe(false);
      ids.add(row.event.id);
      if (row.event.kind !== "observation") continue;
      const obs = row.event.envelope.observation;
      expect(obs.classification).toBe("synthetic");
      expect(obs.mission.missionId).toBe(P31_MISSION_ID);
      expect(obs.mission.crewMemberId).toBe(row.crewId);
      expect(obs.source.sourceId).toContain(row.crewId);
      expect(obs.tags).toContain("synthetic:true");
    }
  });
  test("timeline is ordered and retains quality/connectivity faults", () => {
    const replay = generateP31MultiCrewMission();
    expect(replay.summary.observationCount).toBeGreaterThan(30);
    expect(replay.summary.poorQualityCount).toBeGreaterThan(0);
    expect(replay.summary.offlineTransitions).toBeGreaterThan(0);
    expect(replay.timeline.map((x) => x.event.occurredAt)).toEqual(
      [...replay.timeline.map((x) => x.event.occurredAt)].sort(),
    );
  });
});
