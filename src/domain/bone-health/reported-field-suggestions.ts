import type { BoneHealthEntry } from "./history";
import { boneUnitSuggestions } from "./unit-suggestions";

export type BoneReportedField = "unit" | "specimen" | "assayMethod";

/** Presentation hints only; never normalize reported values or authorize a save. */
export function filterReportedSuggestions(values: readonly string[], query: string): string[] {
  const search = query.trim().toLocaleLowerCase();
  return [...new Set(values.filter(value => value.trim().length > 0))]
    .filter(value => value.toLocaleLowerCase().includes(search))
    .sort((a, b) => a.localeCompare(b));
}

export function boneReportedFieldSuggestions(
  history: readonly BoneHealthEntry[],
  scope: { authorized: boolean; missionId: string; crewMemberId: string; dataOrigin: string; variableId: string },
): Record<BoneReportedField, string[]> {
  const rows = scope.authorized && scope.missionId && scope.crewMemberId &&
    (scope.dataOrigin === "synthetic" || scope.dataOrigin === "real")
    ? history.filter(row => row.missionId === scope.missionId &&
      row.crewMemberId === scope.crewMemberId && row.dataOrigin === scope.dataOrigin &&
      row.variableId === scope.variableId && row.status !== "erroneous")
    : [];
  return {
    unit: filterReportedSuggestions([...boneUnitSuggestions(scope.variableId), ...rows.map(row => row.unit)], ""),
    specimen: filterReportedSuggestions(rows.map(row => row.specimen), ""),
    assayMethod: filterReportedSuggestions(rows.map(row => row.assayMethod), ""),
  };
}