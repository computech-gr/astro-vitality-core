import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";

async function extractText(path: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false, useWorkerFetch: false });
  const doc = await task.promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      parts.push(c.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join(""));
    }
    return parts.join("\n");
  } finally { await task.destroy(); }
}

describe("P22 selectable-text PDF table rows", () => {
  it("recognizes both synthetic fixture measurements for unchecked review, inventing no dates", async () => {
    const text = await extractText("tests/fixtures/p3661-synthetic-lab-report.pdf");
    const { matches } = parseBoneCorrectedText(text, "synthetic.pdf");
    expect(matches.map((m) => [m.variableId, m.value, m.unit])).toEqual([["bone-002", 42.5, "nmol"], ["bone-003", 3.1, "nmol"]]);
    expect(matches.every((m) => !m.selected && m.reviewRequired && m.observedAt === "")).toBe(true);
  });
  it("never treats headings or metadata as measurements", () => {
    const r = parseBoneCorrectedText("SYNTHETIC TEST REPORT\nReport ID bone-002 2026 x\nPatient: Synthetic 42 years\nCollected 2026-10-01", "s");
    expect(r.matches).toEqual([]);
  });
  it("accepts ID-led whitespace and pipe table rows, keeping reported unit and specimen", () => {
    const r = parseBoneCorrectedText("ID Analyte Result Unit Specimen\nbone-002 NTX 42.5 nmol urine\nbone-003 | Pyridinoline (PYD) | 3.1 | nmol", "s");
    expect(r.matches.map((m) => [m.variableId, m.value, m.unit, m.specimen])).toEqual([["bone-002", 42.5, "nmol", "urine"], ["bone-003", 3.1, "nmol", ""]]);
    expect(r.errors).toEqual([]);
  });
  it("rejects an ID-led row whose analyte does not match the catalog ID", () => {
    const r = parseBoneCorrectedText("bone-002 Pyridinoline 3.1 nmol", "s");
    expect(r.matches).toEqual([]);
    expect(r.errors.length).toBe(1);
  });
});
