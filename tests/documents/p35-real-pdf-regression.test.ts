import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { geometryLinesToText, reconstructGeometryLines, type PdfTextItem } from "@/domain/bone-health/pdf-geometry";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import { recognizeClinicalLabRows } from "@/domain/bone-health/clinical-lab-rows";
import { IMMUNE_MEASUREMENT_PROFILE as profile, MEASUREMENT_PROFILES } from "@/domain/health-measurements/profiles";

describe("P35 actual clinical PDF bytes", () => {
  it("extracts all five actual readings, exact PDF Unicode units and traceability without dates or verification", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync("fixtures/synthetic/p35/realistic-clinical-lab.pdf")), isEvalSupported: false });
    try {
      const doc = await task.promise, items: PdfTextItem[] = [];
      for (let page = 1; page <= doc.numPages; page++) {
        for (const item of (await (await doc.getPage(page)).getTextContent()).items) {
          if (!("str" in item) || !item.str.trim()) continue;
          items.push({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, width: item.width, height: item.height || 10, page });
        }
      }
      const lines = reconstructGeometryLines(items), text = geometryLinesToText(lines);
      const result = parseBoneCorrectedText(text, "realistic-clinical-lab.pdf", profile, lines.map(l => l.page));
      // Actual PDF.js text uses Greek μ U+03BC, not micro sign µ U+00B5.
      expect(result.matches.map(r => [r.variableId, r.value, r.unit])).toEqual([
        ["IMM-001", 6.2, "10³/μL"], ["IMM-002", 3.4, "10³/μL"], ["IMM-003", 2.1, "10³/μL"],
        ["IMM-006", 1.62, "ratio"], ["IMM-007", 1.8, "mg/L"],
      ]);
      expect(result.matches.every(r => r.observedAt === "" && r.selected === false && r.reviewRequired)).toBe(true);
      expect(result.matches.every(r => r.page === 1 && r.sourceLabel === "realistic-clinical-lab.pdf" && text.includes(r.rawLine))).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.held).toEqual([]);
      for (const domain of ["bone", "cardiovascular", "behavioral"] as const) {
        expect(parseBoneCorrectedText(text, "x.pdf", MEASUREMENT_PROFILES[domain]).matches).toHaveLength(0);
      }
    } finally { await task.destroy(); }
  });
  it("holds missing units, reference-only rows and extra readings with page/line evidence", () => {
    const r = recognizeClinicalLabRows("WBC | 6.2\nCRP | 0.0 – 5.0\nNLR | 1.62 | ratio | 2.3", profile, [2, 3, 4]);
    expect(r.rows).toHaveLength(0);
    expect(r.held.map(h => [h.line, h.page])).toEqual([[1, 2], [2, 3], [3, 4]]);
  });
  it("does not resolve aliases that identify two catalog entries", () => {
    const r = recognizeClinicalLabRows("WBC | 6.2 | 10³/µL", { ...profile, variables: [...profile.variables, { id: "IMM-999", name: "WBC" }] });
    expect(r.rows).toHaveLength(0);
    expect(r.held[0]?.reason).toContain("Ambiguous");
  });
  it("enforces declared exact unit bindings without conversion", () => {
    const r = recognizeClinicalLabRows("CRP | 1.8 | mg/L", { ...profile, catalogUnit: () => "mg/dL" });
    expect(r.rows).toHaveLength(0);
    expect(r.held[0]?.reason).toContain("catalog-defined unit");
  });
});