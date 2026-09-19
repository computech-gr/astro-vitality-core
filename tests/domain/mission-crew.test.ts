import { describe, expect, test } from "bun:test";

import { validateCrewAssignment, validateCrewMember, validateMission } from "../../src/domain/index";

const now = "2026-09-19T12:00:00Z";

describe("P3 mission and crew identity contracts", () => {
  test("accepts a synthetic crew member", () => {
    expect(validateCrewMember({ id: "crew-synthetic-001", displayName: "Synthetic Crew 01", status: "active", createdAt: now, updatedAt: now })).toEqual({ valid: true, issues: [] });
  });

  test("accepts a valid mission envelope", () => {
    expect(validateMission({ id: "mission-synthetic-001", code: "SYN-001", name: "Synthetic Mission", status: "planning", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z", createdAt: now, updatedAt: now })).toEqual({ valid: true, issues: [] });
  });

  test("rejects inverted mission dates", () => {
    const result = validateMission({ id: "m1", code: "M1", name: "Synthetic", status: "planning", startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-10-01T00:00:00Z", createdAt: now, updatedAt: now });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain("endsAt");
  });

  test("validates a mission-scoped crew assignment", () => {
    expect(validateCrewAssignment({ id: "assignment-synthetic-001", missionId: "mission-synthetic-001", crewMemberId: "crew-synthetic-001", role: "medical_officer", activeFrom: "2026-10-01T00:00:00Z" })).toEqual({ valid: true, issues: [] });
  });

  test("rejects assignment intervals that run backwards", () => {
    const result = validateCrewAssignment({ id: "a1", missionId: "m1", crewMemberId: "c1", role: "crew", activeFrom: "2026-10-02T00:00:00Z", activeUntil: "2026-10-01T00:00:00Z" });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain("activeUntil");
  });
});
