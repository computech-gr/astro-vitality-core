import { describe, expect, it } from "bun:test";
import { reconstructGeometryLines, geometryLinesToText, type PdfTextItem } from "@/domain/bone-health/pdf-geometry";
import { extractUniversalDocumentRows, strictIsoDateTime } from "@/domain/bone-health/universal-document-rows";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import { CARDIOVASCULAR_MEASUREMENT_PROFILE, IMMUNE_MEASUREMENT_PROFILE } from "@/domain/health-measurements/profiles";

const item = (str: string, x: number, y: number, page = 1): PdfTextItem => ({
  str, x, y, width: str.length * 4.5, height: 12, page,
});

describe("P33 PDF geometry reconstruction", () => {
  it("groups items into lines by y and splits cells on column gaps", () => {
    const lines = reconstructGeometryLines([
      item("IMM-001", 10, 100), item("White blood cell count (total leukocytes)", 80, 100),
      item("6.1", 300, 100), item("10^9/L", 340, 100),
      item("IMM-002", 10, 80), item("Neutrophil count (absolute)", 80, 80),
      item("3.4", 300, 80), item("10^9/L", 340, 80),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.cells.map(c => c.text)).toEqual(["IMM-001", "White blood cell count (total leukocytes)", "6.1", "10^9/L"]);
  });
  it("chains vertically centered wrapped rows into one line and rejoins words with spaces", () => {
    // One logical row scattered across a 27px y-band (vertical-align: middle).
    const lines = reconstructGeometryLines([
      item("White blood cell", 80, 113.6), item("whole", 400, 106.9), item("2026-10-", 480, 106.9),
      item("IMM-001", 10, 100.2), item("count (total", 80, 100.2), item("6.1", 260, 100.2),
      item("blood", 400, 93.5), item("01T09:00:00Z", 480, 93.5), item("leukocytes)", 80, 86.8),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.cells.map(c => c.text)).toEqual([
      "IMM-001", "White blood cell count (total leukocytes)", "6.1", "whole blood", "2026-10- 01T09:00:00Z",
    ]);
  });
  it("merges indented continuation lines but never left-aligned prose or new ID rows", () => {
    const lines = reconstructGeometryLines([
      item("BSC-001", 10, 100), item("Total sleep time (main sleep", 80, 100), item("6,5", 300, 100), item("h", 340, 100),
      item("+ naps)", 80, 87),
      item("BSC-002", 10, 70), item("Sleep efficiency", 80, 70), item("88", 300, 70), item("%", 340, 70),
      item("Collected 2026-10-03 — report-level note only.", 10, 40),
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0]?.cells[1]?.text).toBe("Total sleep time (main sleep + naps)");
    expect(lines[2]?.cells[0]?.text).toContain("Collected 2026-10-03");
  });
  it("keeps page numbers per reconstructed line", () => {
    const lines = reconstructGeometryLines([item("IMM-001 x", 10, 100, 1), item("IMM-002 y", 10, 100, 2)]);
    expect(lines.map(l => l.page)).toEqual([1, 2]);
    expect(geometryLinesToText(lines)).toBe("IMM-001 x\nIMM-002 y");
  });
});

describe("P33 header-mapped table interpretation", () => {
  it("binds columns by header labels in any order and never uses reference intervals", () => {
    const text = [
      "Result | Unit | Analyte | Catalog ID | Reference interval | Collected",
      "6.1 | 10^9/L | White blood cell count (total leukocytes) | IMM-001 | 4.0–11.0 | 2026-10-01T09:00:00Z",
    ].join("\n");
    const { rows, held } = extractUniversalDocumentRows(text, IMMUNE_MEASUREMENT_PROFILE);
    expect(held).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variableId: "IMM-001", value: 6.1, unit: "10^9/L", observedAt: "2026-10-01T09:00:00.000Z" });
  });
  it("recognizes Greek header labels", () => {
    const text = "Αποτέλεσμα | Μονάδα | Εξέταση | Κωδικός | Ημερομηνία\n62 | bpm | HR | cv-001 | 2026-10-02T08:00:00Z";
    const { rows } = extractUniversalDocumentRows(text, CARDIOVASCULAR_MEASUREMENT_PROFILE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variableId: "cv-001", value: 62, unit: "bpm", observedAt: "2026-10-02T08:00:00.000Z" });
  });
  it("holds rows whose reported unit differs from a catalog-defined unit, never converting", () => {
    const text = "Catalog ID | Analyte | Result | Unit\n" +
      "cv-001 | HR | 62 | bps\n" + // wrong unit → held
      "cv-005 | SBP | 118 | mmHg"; // catalog unit → accepted
    const { rows, held } = extractUniversalDocumentRows(text, CARDIOVASCULAR_MEASUREMENT_PROFILE);
    expect(rows.map(r => r.variableId)).toEqual(["cv-005"]);
    expect(held).toHaveLength(1);
    expect(held[0]?.reason).toContain("differs from catalog unit");
    expect(held[0]?.reason).toContain("never converted");
  });
  it("holds unknown IDs, analyte mismatches, column-count drift and non-numeric results with reasons", () => {
    const text = "Catalog ID | Analyte | Result | Unit\n" +
      "IMM-999 | Unknown analyte | 5 | mg/L\n" +
      "IMM-001 | Hemoglobin | 13.2 | g/dL\n" +
      "IMM-002 | Neutrophil count (absolute) | 3.4\n" +
      "IMM-003 | Lymphocyte count (absolute) | many | 10^9/L";
    const { rows, held } = extractUniversalDocumentRows(text, IMMUNE_MEASUREMENT_PROFILE);
    expect(rows).toEqual([]);
    expect(held).toHaveLength(4);
    expect(held.map(h => h.reason)).toEqual([
      'unknown catalog ID "IMM-999"',
      "catalog ID/analyte mismatch; manual review required",
      "column count (3) differs from the table header (4); manual mapping required",
      "result is not a single finite number",
    ]);
  });
  it("prefills only strict header-tied ISO datetimes; bare dates stay for review", () => {
    const text = "Catalog ID | Analyte | Result | Unit | Collected\n" +
      "IMM-001 | White blood cell count (total leukocytes) | 6.1 | 10^9/L | 2026-10-01\n" +
      "IMM-002 | Neutrophil count (absolute) | 3.4 | 10^9/L | 2026-10-01T09:00:00Z";
    const { rows } = extractUniversalDocumentRows(text, IMMUNE_MEASUREMENT_PROFILE);
    expect(rows[0]?.observedAt).toBe("");
    expect(rows[0]?.trailingContext).toContain("requires review");
    expect(rows[1]?.observedAt).toBe("2026-10-01T09:00:00.000Z");
  });
  it("strictIsoDateTime rejects impossible calendar dates and missing timezones", () => {
    expect(strictIsoDateTime("2026-02-30T10:00:00Z")).toBe("");
    expect(strictIsoDateTime("2026-10-01T09:00:00")).toBe("");
    expect(strictIsoDateTime("2026-10-01")).toBe("");
    expect(strictIsoDateTime("2026-10-01T09:00:00+02:00")).toBe("2026-10-01T07:00:00.000Z");
  });
  it("never treats comparison symbols or reference prose as measurements, even with a catalog ID", () => {
    const { rows, held } = extractUniversalDocumentRows(
      "IMM-001 < 6.1 10^9/L\nIMM-001 White blood cell count 6.1 10^9/L reference range 4.0-11.0",
      IMMUNE_MEASUREMENT_PROFILE,
    );
    expect(rows).toEqual([]);
    expect(held).toHaveLength(2);
  });
  it("keeps trailing report metadata as uninterpreted context, never as result or specimen", () => {
    const { rows } = extractUniversalDocumentRows("IMM-007 C-reactive protein 1.2 mg/L serum 2026-10-01T09:00:00Z Accession 88421", IMMUNE_MEASUREMENT_PROFILE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.specimen).toBe("serum");
    expect(rows[0]?.observedAt).toBe("");
    expect(rows[0]?.trailingContext).toBe("2026-10-01T09:00:00Z Accession 88421");
  });
  it("parseBoneCorrectedText surfaces held rows and suppresses duplicate line diagnostics", () => {
    const r = parseBoneCorrectedText("IMM-001 Hemoglobin 13.2 g/dL", "report.pdf", IMMUNE_MEASUREMENT_PROFILE);
    expect(r.matches).toEqual([]);
    expect(r.errors.filter(e => e.includes("Line 1"))).toHaveLength(1);
    expect(r.errors[0]).toContain("human confirmation");
  });
});
