import { describe, expect, test } from "bun:test";
import { boneReportedFieldSuggestions, filterReportedSuggestions } from "@/domain/bone-health/reported-field-suggestions";
import type { BoneHealthEntry } from "@/domain/bone-health/history";

const scope = { authorized: true, missionId: "mission-1", crewMemberId: "crew-1", dataOrigin: "synthetic", variableId: "bone-001" };
const row: BoneHealthEntry = { id: "example", missionId: scope.missionId, crewMemberId: scope.crewMemberId,
  variableId: scope.variableId, dataOrigin: "synthetic", value: 1, observedAt: "2026-10-27T12:34:56.789Z",
  unit: "Custom µg / L", specimen: "Serum (original)", assayMethod: "LC–MS/MS v2", sourceLabel: "Synthetic Lab", notes: "" };

describe("Bone reported metadata suggestions", () => {
  test("units include selected handbook hints and exact scoped historical units", () => {
    expect(boneReportedFieldSuggestions([row], scope)).toEqual({
      unit: ["Custom µg / L", "ng/L", "pg/mL"], specimen: ["Serum (original)"], assayMethod: ["LC–MS/MS v2"],
    });
  });
  for (const [field, value] of [["missionId", "mission-2"], ["crewMemberId", "crew-2"], ["dataOrigin", "real"], ["variableId", "bone-002"], ["status", "erroneous"]] as const) {
    test(`history excludes mismatching ${field}`, () => {
      expect(boneReportedFieldSuggestions([{ ...row, [field]: value }], scope)).toEqual({ unit: ["ng/L", "pg/mL"], specimen: [], assayMethod: [] });
    });
  }
  test("authorization loss excludes history even if previously loaded", () => {
    expect(boneReportedFieldSuggestions([row], { ...scope, authorized: false })).toEqual({ unit: ["ng/L", "pg/mL"], specimen: [], assayMethod: [] });
  });
  test("missing provenance excludes history", () => {
    expect(boneReportedFieldSuggestions([row], { ...scope, dataOrigin: "" }).assayMethod).toEqual([]);
  });
  test("variable change uses only the new variable handbook units", () => {
    expect(boneReportedFieldSuggestions([row], { ...scope, variableId: "bone-013" }).unit).toEqual(["mg/dL", "mmol/L"]);
  });
  test("case-insensitive filtering preserves exact strings without normalization", () => {
    const values = ["  µg / L  ", "ug/L", "LC–MS/MS v2", "  µg / L  ", " "];
    expect(filterReportedSuggestions(values, " µG ")).toEqual(["  µg / L  "]);
    expect(filterReportedSuggestions(values, "ms/ms")).toEqual(["LC–MS/MS v2"]);
    expect(values[0]).toBe("  µg / L  ");
  });
  test("custom input without a match has no automatic replacement", () => {
    expect(filterReportedSuggestions(["pg/mL", "ng/L"], "CUSTOM exact unit")).toEqual([]);
  });
  test("no historical measurements means no fabricated specimen or assay defaults", () => {
    const suggestions = boneReportedFieldSuggestions([], scope);
    expect(suggestions.specimen).toEqual([]);
    expect(suggestions.assayMethod).toEqual([]);
  });
});