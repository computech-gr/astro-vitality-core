import { describe, expect, test } from "bun:test";
import { classifyIntakeObservation } from "../../src/domain/health-domains/unified-intake-classification";
import {
  editIntakeReviewRow,
  intakeSelectionCounts,
  isIntakeRowEligible,
  setIntakeReviewSelection,
  type IntakeReviewRow,
} from "../../src/domain/health-intelligence/intake-review-selection";

const row = (key: string, label = "HR", unit = "bpm"): IntakeReviewRow => ({
  key,
  label,
  unit,
  value: "62",
  observedAt: "2026-10-01T10:00:00Z",
  classification: classifyIntakeObservation({ label, unit }),
  selected: false,
});

describe("unified intake review selection", () => {
  test("select all includes only catalog-matched eligible rows with accurate counts", () => {
    const ambiguous = {
      ...row("ambiguous"),
      classification: {
        status: "ambiguous" as const,
        candidateMetricIds: ["a", "b"],
        originalLabel: "HR",
        originalUnit: "bpm",
        reviewRequired: true as const,
      },
    };
    const rows = [
      row("one"),
      row("two"),
      row("unknown", "Unknown"),
      row("unit", "HR", "wrong"),
      ambiguous,
    ];
    const result = setIntakeReviewSelection(rows, true);
    expect(result.rows.map((r) => r.selected)).toEqual([true, true, false, false, false]);
    expect(intakeSelectionCounts(result.rows)).toEqual({
      selected: 2,
      eligible: 2,
      excluded: 3,
      allSelected: true,
      partiallySelected: false,
    });
    expect(result.reviewerConfirmed).toBe(false);
    expect(result.duplicateAcknowledged).toBe(false);
    expect(rows.every((r) => !r.selected)).toBe(true);
  });
  test("deselect all clears selection and review confirmation", () => {
    const result = setIntakeReviewSelection([{ ...row("one"), selected: true }], false);
    expect(result.rows[0]?.selected).toBe(false);
    expect(result.reviewerConfirmed).toBe(false);
  });
  test("individual selection preserves other rows and exposes partial selection", () => {
    const result = editIntakeReviewRow([row("one"), row("two")], "one", { selected: true });
    expect(result.rows.map((r) => r.selected)).toEqual([true, false]);
    expect(intakeSelectionCounts(result.rows).partiallySelected).toBe(true);
    expect(result.reviewerConfirmed).toBe(false);
  });
  test("measurement edits invalidate human confirmation and ineligible selection", () => {
    for (const patch of [{ value: "66" }, { unit: "wrong" }, { observedAt: "" }]) {
      const result = editIntakeReviewRow([{ ...row("one"), selected: true }], "one", patch);
      expect(result.reviewerConfirmed).toBe(false);
      expect(result.duplicateAcknowledged).toBe(false);
      expect(result.rows[0]?.selected).toBe(patch.value === "66");
    }
  });
  test("invalid values and missing timestamps cannot be bulk selected", () => {
    for (const patch of [
      { value: "NaN" },
      { value: "62 bpm" },
      { observedAt: "" },
      { observedAt: "invalid" },
    ]) {
      expect(isIntakeRowEligible({ ...row("one"), ...patch })).toBe(false);
    }
    expect(intakeSelectionCounts([]).allSelected).toBe(false);
    expect(intakeSelectionCounts([row("unknown", "Unknown")]).eligible).toBe(0);
  });
});
