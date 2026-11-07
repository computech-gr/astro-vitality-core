import { describe, expect, test } from "bun:test";
import { reviewTablePage, scientificDisplayStatus, type ReviewTableRow } from "../../src/domain/health-intelligence/p36-review-table";
const rows: ReviewTableRow[] = Array.from({ length: 209 }, (_, i) => ({ id: `term-${i}`, name: `Biomarker ${i}`, unit: i % 2 ? "mg/L" : "mg/l", domain: i % 2 ? "Bone" : "Immune", candidates: [String(i)], evidence: "Incomplete", decision: "Pending Scientific Review", activation: "Blocked", origin: i < 12 ? "Documentary" : "Cloud" }));
describe("read-only review inventory", () => {
  test("209 terms remain in inventory through pagination", () => {
    const ids = Array.from({ length: 21 }, (_, p) => reviewTablePage(rows, "", "", "", "", p).rows).flat().map((r) => r.id);
    expect(new Set(ids).size).toBe(209);
    expect(rows.length).toBe(209);
  });
  test("combined filters cannot widen the chosen inventory", () => {
    expect(reviewTablePage(rows, "Biomarker", "Bone", "Pending Scientific Review", "Incomplete", 0).total).toBe(104);
    expect(reviewTablePage(rows, "", "Bone", "Approved", "", 0).total).toBe(0);
  });
  test("search resets safely to a bounded last page", () => {
    const result = reviewTablePage(rows, "208", "", "", "", 999);
    expect(result.page).toBe(0);
    expect(result.rows.map((r) => r.id)).toEqual(["term-208"]);
  });
  test("filtering never normalizes exact units or rewrites source data", () => {
    const before = JSON.stringify(rows);
    reviewTablePage(rows, "mg/l", "", "", "", 0);
    expect(JSON.stringify(rows)).toBe(before);
    expect(rows[0]?.unit).toBe("mg/l");
    expect(rows[1]?.unit).toBe("mg/L");
  });
});