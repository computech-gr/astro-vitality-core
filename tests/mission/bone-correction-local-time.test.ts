import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { utcIsoToLocalDatetimeInput } from "@/domain/bone-health/local-datetime";

const source = readFileSync("src/components/bone-health-entry.tsx", "utf8");
describe("bone correction time and source picker", () => {
  test("UTC instant round-trips through local datetime input", () => {
    const iso = "2026-10-27T12:34:00.000Z";
    expect(new Date(utcIsoToLocalDatetimeInput(iso)).toISOString()).toBe(iso);
  });
  test("invalid timestamp never becomes a plausible correction time", () => {
    expect(utcIsoToLocalDatetimeInput("not-a-date")).toBe("");
  });
  test("correction uses timezone-aware conversion and source suggestions", () => {
    expect(source).toContain("setObservedAt(utcIsoToLocalDatetimeInput(row.observedAt))");
    expect(source).not.toContain("row.observedAt.slice(0, 16)");
    expect(source).toContain("<BoneSourceCombobox");
    expect(source).toContain("row.dataOrigin === dataOrigin");
  });
});
