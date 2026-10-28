import { describe, expect, it } from "bun:test";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import { IMMUNE_MEASUREMENT_PROFILE } from "@/domain/health-measurements/profiles";
const report = `ORBITAL RESEARCH LABORATORY
Test performed Result Reported unit Illustrative range
Leukocytes (WBC) 6.2 10³/µL 4.0 – 10.5
Absolute neutrophils 3.4 10³/µL 1.8 – 7.5
Absolute lymphocytes 2.1 10³/µL 1.0 – 4.0
Neutrophil / lymphocyte ratio 1.62 ratio —
C-reactive protein (CRP) 1.8 mg/L 0.0 – 5.0
Collected (UTC) 28 Oct 2026, 08:15 UTC`;
describe("P35 real-world analyte-only clinical report", () => {
  it("extracts five exact analyte rows without IDs and never invents dates", () => {
    const r = parseBoneCorrectedText(report, "realistic.pdf", IMMUNE_MEASUREMENT_PROFILE);
    expect(r.matches.map(m => [m.variableId,m.value,m.unit])).toEqual([
      ["IMM-001",6.2,"10³/µL"],["IMM-002",3.4,"10³/µL"],
      ["IMM-003",2.1,"10³/µL"],["IMM-006",1.62,"ratio"],["IMM-007",1.8,"mg/L"],
    ]);
    expect(r.matches.every(m => !m.observedAt && !m.selected && m.reviewRequired)).toBe(true);
  });
  it("does not promote prose or reference ranges", () => {
    const r = parseBoneCorrectedText("WBC 4.0 – 10.5\nC-reactive protein (CRP) 1.8 mg/L 0.0 – 5.0\nCRP in notes is not a result", "x.pdf", IMMUNE_MEASUREMENT_PROFILE);
    expect(r.matches.map(m => m.variableId)).toEqual(["IMM-007"]);
  });
});
