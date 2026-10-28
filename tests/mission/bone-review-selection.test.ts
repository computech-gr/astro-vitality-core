import { describe, expect, test } from "bun:test";
import { boneReviewIssue, selectBoneReviewRows } from "@/domain/bone-health/review-selection";
import type { ReviewRow } from "@/domain/bone-health/file-queue";

const row: ReviewRow = { id: "unsaved", variableId: "bone-001", value: 12, unit: "custom-unit", observedAt: "2026-10-28T09:18:00+02:00", sourceLabel: "Reported lab", specimen: "", assayMethod: "", notes: "", selected: false };
describe("per-file human verification eligibility", () => {
  test("verify all selects valid unsaved rows without modifying saved receipts or another file", () => {
    const saved = { ...row, id: "saved", saved: true };
    const otherFile = [{ ...row, id: "other-file" }];
    const selected = selectBoneReviewRows([row, saved], true);
    expect(selected.map(r => r.selected)).toEqual([true, false]);
    expect(selected[1]).toBe(saved);
    expect(otherFile[0]?.selected).toBe(false);
    expect(selected[0]?.unit).toBe("custom-unit");
    expect(selected[0]?.observedAt).toBe("2026-10-28T09:18:00+02:00");
  });
  test("invalid values, units, dates, source and catalog IDs cannot be bulk verified", () => {
    const invalid = [{ ...row, value: NaN }, { ...row, unit: "" }, { ...row, observedAt: "invalid" }, { ...row, sourceLabel: "" }, { ...row, variableId: "bone-999" }];
    expect(selectBoneReviewRows(invalid, true).map(r => r.selected)).toEqual([false, false, false, false, false]);
    for (const candidate of invalid) expect(boneReviewIssue(candidate)).not.toBeNull();
  });
  test("unverify all clears unsaved selections and retains successful receipts", () => {
    const saved = { ...row, saved: true, selected: false };
    const result = selectBoneReviewRows([{ ...row, selected: true }, saved], false);
    expect(result[0]?.selected).toBe(false);
    expect(result[1]).toBe(saved);
  });
});