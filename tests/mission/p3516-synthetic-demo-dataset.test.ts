import { describe, expect, it } from "vitest";
import { buildSyntheticDemoDataset, summarizeSyntheticDemoDataset } from "@/domain/mission-access/synthetic-demo-dataset";
import { isReservedDemoMission } from "@/domain/mission-access/demo-journey";
describe("P35.16 offline multi-domain synthetic demo data", () => {
  it("covers all four health domains with three fictional timepoints", () => {
    const dataset = buildSyntheticDemoDataset("DEMO-ISOLATED");
    const summary = summarizeSyntheticDemoDataset(dataset);
    expect(summary.domains).toBe(4);
    expect(summary.timepoints).toBe(3);
    expect(summary.total).toBe(18);
    expect(summary.byDomain.every(x => x.count > 0)).toBe(true);
  });
  it("is deterministic and explicitly disallows import", () => {
    const first = buildSyntheticDemoDataset("DEMO-ISOLATED");
    expect(buildSyntheticDemoDataset("DEMO-ISOLATED")).toEqual(first);
    expect(first.synthetic).toBe(true);
    expect(first.exportOnly).toBe(true);
    expect(first.importAuthorized).toBe(false);
  });
  it("uses only fictional provenance, identity and nonclinical quality", () => {
    const dataset = buildSyntheticDemoDataset("DEMO-ISOLATED");
    expect(dataset.observations.every(o => o.provenance === "synthetic_generated" && o.quality === "illustrative_only" && o.subjectId === "FICTIONAL-CREW-01")).toBe(true);
  });
  it("preserves the reserved mission gate", () => {
    expect(isReservedDemoMission(" MISSION_TEST ")).toBe(true);
    expect(isReservedDemoMission("DEMO-ISOLATED")).toBe(false);
  });
});
