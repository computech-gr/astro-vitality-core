import { describe, expect, it, test } from "bun:test";
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
describe("native datetime-local conversion", () => {
  it("round-trips device local input to UTC and back without changing the instant", async () => {
    const { boneLocalInputToIso, boneIsoToLocalInput } = await import("@/domain/bone-health/review-selection");
    const iso = boneLocalInputToIso("2026-10-28T09:18");
    expect(iso).toBe(new Date(2026, 9, 28, 9, 18).toISOString());
    expect(boneIsoToLocalInput(iso)).toBe("2026-10-28T09:18");
  });
  it("rejects calendar rollover and malformed input instead of inventing a date", async () => {
    const { boneLocalInputToIso, boneIsoToLocalInput } = await import("@/domain/bone-health/review-selection");
    expect(boneLocalInputToIso("2026-02-30T07:18")).toBe("");
    expect(boneLocalInputToIso("")).toBe("");
    expect(boneLocalInputToIso("2026-10-28 09:18")).toBe("");
    expect(boneIsoToLocalInput("not a date")).toBe("");
    expect(boneIsoToLocalInput("")).toBe("");
  });
  it("shared fill with converted value still touches only missing unsaved rows and never verifies", async () => {
    const { boneLocalInputToIso, applyBoneSharedObservationTimestamp } = await import("@/domain/bone-health/review-selection");
    const base = { variableId: "bone-001", value: 1, unit: "ng/mL", sourceLabel: "s", specimen: "", assayMethod: "", notes: "" };
    const rows = [
      { ...base, id: "a", observedAt: "", selected: true, saved: false },
      { ...base, id: "b", observedAt: "2026-01-01T00:00:00Z", selected: true, saved: false },
      { ...base, id: "c", observedAt: "", selected: false, saved: true },
    ] as never[];
    const iso = boneLocalInputToIso("2026-10-28T09:18");
    const out = applyBoneSharedObservationTimestamp(rows, iso, true) as Array<{ id: string; observedAt: string; selected: boolean }>;
    expect(out[0]).toMatchObject({ observedAt: iso, selected: false });
    expect(out[1]!.observedAt).toBe("2026-01-01T00:00:00Z");
    expect(out[2]!.observedAt).toBe("");
    expect(applyBoneSharedObservationTimestamp(rows, iso, false)).toBe(rows);
  });
});
