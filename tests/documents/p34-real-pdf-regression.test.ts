import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { reconstructGeometryLines, geometryLinesToText, type PdfTextItem } from "@/domain/bone-health/pdf-geometry";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import { CARDIOVASCULAR_MEASUREMENT_PROFILE as profile } from "@/domain/health-measurements/profiles";

// P34: the two user-supplied PDFs, read through PDF.js text geometry exactly as in the browser.
async function parse(name: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(`fixtures/synthetic/p34/${name}`)), isEvalSupported: false, useWorkerFetch: false });
  const doc = await task.promise;
  try {
    const items: PdfTextItem[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      for (const item of (await (await doc.getPage(i)).getTextContent()).items) {
        if (!("str" in item) || !item.str.trim()) continue;
        items.push({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, width: item.width ?? 0, height: item.height > 0 ? item.height : 10, page: i });
      }
    }
    const lines = reconstructGeometryLines(items);
    return parseBoneCorrectedText(geometryLinesToText(lines), name, profile, lines.map(l => l.page));
  } finally { await task.destroy(); }
}
const expected = [["cv-001", 62, "bpm"], ["cv-005", 118, "mmHg"], ["cv-006", 76, "mmHg"], ["cv-027", 48, "ms"], ["cv-065", 98, "%"]];

describe("P34 actual PDF regression", () => {
  it("original five-column PDF: 5/5 with ID, value, unit, explicit UTC time and reported source", async () => {
    const r = await parse("original-cardio-five-column.pdf");
    expect(r.matches.map(m => [m.variableId, m.value, m.unit])).toEqual(expected);
    expect(r.matches.every(m => m.observedAt === "2026-10-02T08:00:00.000Z")).toBe(true);
    expect(r.matches.every(m => m.sourceLabel === "SYNTHETIC Demo Device (original-cardio-five-column.pdf)")).toBe(true);
    expect(r.matches.every(m => m.selected === false && m.reviewRequired)).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it("simple P32 PDF: 5/5 rows, no timestamp invented from prose", async () => {
    const r = await parse("p32-cardio-simple.pdf");
    expect(r.matches.map(m => [m.variableId, m.value, m.unit])).toEqual(expected);
    expect(r.matches.every(m => m.observedAt === "")).toBe(true);
    expect(r.matches.every(m => m.sourceLabel === "p32-cardio-simple.pdf" && !m.selected)).toBe(true);
  });
});
