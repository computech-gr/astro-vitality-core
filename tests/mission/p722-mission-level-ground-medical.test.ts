import { describe, expect, it } from "bun:test";
import { expandMissionLevelGroundMedical, missionLevelGroundMedicalMissions } from "@/domain/mission-access/mission-level-ground-medical";
import type { MissionMembershipContext } from "@/infrastructure/mission-identity";

const T = "mission-3fd366c331ed46afb0645cced1d45294";
const CREW = "crew-43f5fe4d102f40d19ced676dabd3b672";
const roster = new Map([
  [T, [{ missionId: T, crewMemberId: CREW, displayName: "Astronaut Test 01" }]],
  ["M2", [{ missionId: "M2", crewMemberId: "C9", displayName: "Other" }]],
]);

describe("P72.2 mission-level Ground Medical crew scope", () => {
  it("an invited Ground Medical membership without crew binding gains its own mission's roster crew", () => {
    const m: MissionMembershipContext[] = [{ missionId: T, missionCode: "MISSION_TEST", role: "ground_medical" }];
    const out = expandMissionLevelGroundMedical(m, roster);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(m[0]!);
    expect(out[1]).toEqual({ missionId: T, missionCode: "MISSION_TEST", role: "ground_medical", crewMemberId: CREW, crewDisplayName: "Astronaut Test 01" });
  });

  it("never expands Researcher, operator or crew-bound memberships, nor crosses missions", () => {
    const m: MissionMembershipContext[] = [
      { missionId: T, role: "researcher" },
      { missionId: T, role: "mission_operator" },
      { missionId: "M2", role: "ground_medical", crewMemberId: "C1" },
    ];
    expect(expandMissionLevelGroundMedical(m, roster)).toEqual(m);
    expect(missionLevelGroundMedicalMissions(m)).toEqual([]);
    const wrong = new Map([[T, [{ missionId: "M2", crewMemberId: "C9", displayName: "Other" }]]]);
    expect(expandMissionLevelGroundMedical([{ missionId: T, role: "ground_medical" }], wrong)).toHaveLength(1);
  });

  it("an unreadable roster adds nothing and an existing crew-bound entry is not duplicated", () => {
    expect(expandMissionLevelGroundMedical([{ missionId: T, role: "ground_medical" }], new Map())).toHaveLength(1);
    const m: MissionMembershipContext[] = [{ missionId: T, role: "ground_medical" }, { missionId: T, role: "ground_medical", crewMemberId: CREW }];
    expect(expandMissionLevelGroundMedical(m, roster)).toHaveLength(2);
    expect(missionLevelGroundMedicalMissions(m)).toEqual([T]);
  });
});
