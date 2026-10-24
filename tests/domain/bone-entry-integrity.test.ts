import { describe, expect, test } from "vitest";

import {
  collapseBoneEntryVersions,
  findPotentialDuplicates,
  validateBoneEntry,
  type BoneHealthEntry,
} from "../../src/domain/bone-health/history";
import { parseBoneImport } from "../../src/domain/bone-health/import";
import { boneUnitSuggestions } from "../../src/domain/bone-health/unit-suggestions";

const baseEntry: BoneHealthEntry = {
  id: "entry-1",
  missionId: "mission-1",
  crewMemberId: "crew-1",
  variableId: "bone-001",
  value: 0.42,
  unit: "ng/mL",
  observedAt: "2026-10-01T09:00:00.000Z",
  sourceLabel: "Demo Lab",
  specimen: "serum",
  assayMethod: "",
  notes: "",
  dataOrigin: "synthetic",
};

describe("D2 — CSV import review defaults", () => {
  test("parsed candidates start unchecked so every row needs explicit confirmation", () => {
    const result = parseBoneImport(
      "variable,value,unit,observed_at,source\nbone-001,0.42,ng/mL,2026-10-01T09:00:00Z,Demo Lab\n",
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.selected).toBe(false);
  });
});

describe("D3 — duplicate warnings never block legitimate repeats", () => {
  test("flags same variable, instant and value", () => {
    const matches = findPotentialDuplicates([baseEntry], {
      variableId: "bone-001",
      observedAt: "2026-10-01T09:00:00.000Z",
      value: 0.42,
    });
    expect(matches).toHaveLength(1);
  });

  test("ignores different values and erroneous records", () => {
    expect(
      findPotentialDuplicates([baseEntry], {
        variableId: "bone-001",
        observedAt: "2026-10-01T09:00:00.000Z",
        value: 0.43,
      }),
    ).toHaveLength(0);
    expect(
      findPotentialDuplicates([{ ...baseEntry, status: "erroneous" }], {
        variableId: "bone-001",
        observedAt: "2026-10-01T09:00:00.000Z",
        value: 0.42,
      }),
    ).toHaveLength(0);
  });
});

describe("D4 — append-only correction and supersession", () => {
  test("newest stored version of an entry wins without rewriting history", () => {
    const collapsed = collapseBoneEntryVersions([
      { entry: baseEntry, storedAt: "2026-10-01T10:00:00.000Z" },
      {
        entry: { ...baseEntry, status: "erroneous", statusReason: "wrong unit" },
        storedAt: "2026-10-02T10:00:00.000Z",
      },
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.status).toBe("erroneous");
  });

  test("validation accepts correction metadata and rejects unknown statuses", () => {
    expect(
      validateBoneEntry({ ...baseEntry, status: "erroneous", statusReason: "typo" }),
    ).toBeNull();
    expect(validateBoneEntry({ ...baseEntry, supersedesId: "entry-0" })).toBeNull();
    expect(validateBoneEntry({ ...baseEntry, status: "deleted" as never })).toBe(
      "Unknown entry status.",
    );
  });
});

describe("R2 — non-binding handbook unit suggestions", () => {
  test("offers source units for known variables and none for unknown ones", () => {
    expect(boneUnitSuggestions("bone-001")).toEqual(["pg/mL", "ng/L"]);
    expect(boneUnitSuggestions("bone-999")).toEqual([]);
  });
});
