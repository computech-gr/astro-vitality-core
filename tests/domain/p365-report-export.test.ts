import { describe, expect, test } from "bun:test";
import { reportExportBasename } from "../../src/domain/health-intelligence/report-export-identity";
import { reportPageCuts } from "../../src/domain/health-intelligence/report-pdf";

const scope = { missionId: "mission-immutable", crewMemberId: "crew-immutable", provenance: "synthetic" as const, generatedAt: "2026-10-28T18:42:00Z" };
describe("P36.5 report export rules", () => {
  test("exact sanitized authorized mission/astronaut filename", () => {
    expect(reportExportBasename({ ...scope, missionName: "Artemis / II", crewDisplayName: "Alex Morgan" })).toBe("MITOCHONDRIA_Artemis_II_Alex_Morgan_Unified_Health_Report_SYNTHETIC_2026-10-28");
  });
  test("missing and blank names fall back to immutable identifiers", () => {
    expect(reportExportBasename({ ...scope, missionName: " ", crewDisplayName: null })).toBe("MITOCHONDRIA_mission_immutable_crew_immutable_Unified_Health_Report_SYNTHETIC_2026-10-28");
  });
  test("unsafe path tokens cannot escape the filename", () => {
    expect(reportExportBasename({ ...scope, missionName: "../../Mission:<A>", crewDisplayName: "Alex\\Morgan?*" })).toBe("MITOCHONDRIA_Mission_A_Alex_Morgan_Unified_Health_Report_SYNTHETIC_2026-10-28");
  });
  test("A4 pagination never cuts a fitting measurement row", () => {
    expect(reportPageCuts(2500, 1000, [{ top: 950, bottom: 1100 }, { top: 1900, bottom: 2000 }])).toEqual([0, 950, 1900, 2500]);
  });
  test("oversized indivisible report items fail rather than clip", () => {
    expect(() => reportPageCuts(2000, 1000, [{ top: 0, bottom: 1500 }])).toThrow("exceeds one A4 page");
  });
});