import { describe, expect, it } from "bun:test";
import { extractFiveColumnLabCandidates } from "@/domain/health-intelligence/universal-intake-parser";
describe("P36.7 five-column PDF candidates", () => {
 it("extracts dated five-column rows without inventing an observation timestamp", () => {
  const rows=extractFiveColumnLabCandidates("Resting heart rate    81    bpm    2026-11-05    Review input\nSleep efficiency    76    %    2026-11-06    Review input");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({label:"Resting heart rate",value:"81",unit:"bpm",observedAt:""});
 });
 it("keeps ambiguous units as literal text, not conversions", () => {
  expect(extractFiveColumnLabCandidates("25(OH) Vitamin D    9.31    ng/mL ή nmol/L    2026-11-05    Unvalidated")[0]?.unit).toBe("ng/mL ή nmol/L");
 });
 it("rejects absent numeric results and reference-range prose", () => {
  expect(extractFiveColumnLabCandidates("PTH    —    pg/mL    2026-11-06    Unvalidated\nNormal range    4-10    mg/L    2026-11-06    Review input")).toHaveLength(0);
 });
});
