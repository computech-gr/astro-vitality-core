import { describe, expect, it } from "vitest";
import { DEMO_JOURNEY, canRecordDemoJourneyEvidence, summarizeDemoJourneyEvidence } from "@/domain/mission-access/demo-journey";
describe("P35.14 safe manual demo execution", () => {
  it("protects reserved mission from checklist marking", () => {
    expect(canRecordDemoJourneyEvidence("MISSION_TEST")).toBe(false);
    expect(canRecordDemoJourneyEvidence(" mission_test ")).toBe(false);
    expect(canRecordDemoJourneyEvidence("FV01-DEMO-NEW")).toBe(true);
    expect(canRecordDemoJourneyEvidence(" ")).toBe(false);
  });
  it("keeps all ten steps and counts status without authorizing", () => {
    expect(DEMO_JOURNEY).toHaveLength(10);
    expect(summarizeDemoJourneyEvidence(["observed", "blocked", "not_checked"]))
      .toEqual({ observed: 1, blocked: 1, remaining: 8, total: 10 });
  });
  it("defaults to all unchecked", () => {
    expect(summarizeDemoJourneyEvidence([])).toEqual({ observed: 0, blocked: 0, remaining: 10, total: 10 });
  });
});
