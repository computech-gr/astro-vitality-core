import { describe, expect, it } from "bun:test";
import { extractUniversalDocumentRows } from "@/domain/bone-health/universal-document-rows";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import { CARDIOVASCULAR_MEASUREMENT_PROFILE as profile } from "@/domain/health-measurements/profiles";

const table = [
  "Variable ID | Result | Unit | Observation (UTC) | Source",
  "cv-001 | 62 | bpm | 2026-10-02T08:00:00Z | SYNTHETIC Demo Device",
  "cv-005 | 118 | mmHg | 2026-10-02T08:00:00Z | SYNTHETIC Demo Device",
  "cv-006 | 76 | mmHg | 2026-10-02T08:00:00Z | SYNTHETIC Demo Device",
  "cv-027 | 48 | ms | 2026-10-02T08:00:00Z | SYNTHETIC Demo Device",
  "cv-065 | 98 | % | 2026-10-02T08:00:00Z | SYNTHETIC Demo Device",
].join("\n");

describe("P34 original cardiovascular PDF table", () => {
  it("recognizes explicit catalog IDs without redundant analyte column", () => {
    const result = extractUniversalDocumentRows(table, profile);
    expect(result.rows.map(r => [r.variableId, r.value, r.unit])).toEqual([
      ["cv-001", 62, "bpm"], ["cv-005", 118, "mmHg"],
      ["cv-006", 76, "mmHg"], ["cv-027", 48, "ms"], ["cv-065", 98, "%"],
    ]);
    expect(result.rows.every(r => r.observedAt === "2026-10-02T08:00:00.000Z")).toBe(true);
    expect(result.held).toEqual([]);
  });
  it("integrates with document review without legacy extra-number errors", () => {
    const result = parseBoneCorrectedText(table, "original-cardio.pdf", profile);
    expect(result.matches).toHaveLength(5);
    expect(result.errors).toEqual([]);
    expect(result.matches.every(m => !m.selected && m.reviewRequired)).toBe(true);
  });
  it("rejects unrecognized catalog IDs and mismatched units", () => {
    const result = extractUniversalDocumentRows("Variable ID | Result | Unit | Observation (UTC) | Source\ncv-999 | 62 | bpm | 2026-10-02T08:00:00Z | Synthetic\ncv-001 | 62 | mmHg | 2026-10-02T08:00:00Z | Synthetic", profile);
    expect(result.rows).toHaveLength(0);
    expect(result.held).toHaveLength(2);
  });
});
