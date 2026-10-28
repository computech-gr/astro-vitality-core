import { describe, expect, test } from "bun:test";
import { applyBoneSharedObservationTimestamp, isBoneSharedObservationTimestamp, boneReviewIssue, selectBoneReviewRows } from "@/domain/bone-health/review-selection";
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

describe("confirmed per-file shared observation timestamp", () => {
  const timestamp = "2026-10-28T11:38:00+02:00";
  test("requires explicit confirmation and an exact timezone-qualified valid date", () => {
    const rows = [{ ...row, observedAt: "" }];
    expect(applyBoneSharedObservationTimestamp(rows, timestamp, false)).toBe(rows);
    for (const invalid of ["2026-10-28", "2026-10-28T11:38:00", "2026-02-30T11:38:00Z", "2026-10-28T24:00:00Z", "2026-10-28T11:38:00+24:00", "2026-10-28T11:38:00+02:60"]) {
      expect(isBoneSharedObservationTimestamp(invalid)).toBe(false);
      expect(applyBoneSharedObservationTimestamp(rows, invalid, true)).toBe(rows);
    }
    expect(isBoneSharedObservationTimestamp("2028-02-29T11:38:00.123Z")).toBe(true);
  });
  test("fills only missing unsaved dates and never verifies or modifies saved rows", () => {
    const saved = { ...row, saved: true, observedAt: "", selected: true };
    const dated = { ...row, selected: true };
    const result = applyBoneSharedObservationTimestamp([{ ...row, observedAt: " ", selected: true }, dated, saved], timestamp, true);
    expect(result[0]?.observedAt).toBe(timestamp);
    expect(result[0]?.selected).toBe(false);
    expect(result[1]).toBe(dated);
    expect(result[2]).toBe(saved);
  });
  test("does not modify another file's review or invent units and sources", () => {
    const other = [{ ...row, observedAt: "" }];
    const result = applyBoneSharedObservationTimestamp([{ ...row, observedAt: "", unit: "", sourceLabel: "" }], timestamp, true);
    expect(other[0]?.observedAt).toBe("");
    expect(result[0]?.unit).toBe("");
    expect(result[0]?.sourceLabel).toBe("");
    expect(result[0]?.selected).toBe(false);
    expect(boneReviewIssue(result[0] ?? row)).not.toBeNull();
  });
});