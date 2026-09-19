import { describe, expect, test } from "bun:test";
import { canGroundAccess, deidentifyMissionEvents, type GroundMissionEvent, type GroundPrincipal } from "@/domain/ground-research";
const base = (role: GroundPrincipal["role"]): GroundPrincipal => ({ userId:"u1", missionId:"m1", role, ...(role==="crew_self"?{crewMemberId:"c1"}:{}) });

describe("P15 ground/research boundary", () => {
 test("role separation is fail-closed", () => {
  expect(canGroundAccess(base("crew_self"),"research_export")).toBe(false);
  expect(canGroundAccess(base("researcher"),"identified_health")).toBe(false);
  expect(canGroundAccess(base("mission_operator"),"identified_health")).toBe(false);
  expect(canGroundAccess(base("ground_medical"),"identified_health")).toBe(true);
  expect(canGroundAccess(base("researcher"),"research_export")).toBe(true);
 });
 test("research export strips direct identifiers and pseudonymizes participants", async () => {
  const event: GroundMissionEvent = { id:"e1", mission:{missionId:"m1",crewMemberId:"c1"}, kind:"observation", occurredAt:"2026-09-19T12:00:00Z", sourceId:"wearable:demo", sourceVersion:"1", classification:"medical_sensitive", payload:{metric:"hr",value:72,displayName:"Astronaut A",email:"a@example.test"}, payloadHash:"abc" };
  const rows=await deidentifyMissionEvents([event],"mission-research-salt-123456");
  expect(rows[0]?.participantId.startsWith("p_")).toBe(true);
  expect(JSON.stringify(rows[0]?.payload)).not.toContain("Astronaut A");
  expect(JSON.stringify(rows[0]?.payload)).not.toContain("a@example.test");
  expect(rows[0]?.classification).toBe("deidentified");
 });
});
