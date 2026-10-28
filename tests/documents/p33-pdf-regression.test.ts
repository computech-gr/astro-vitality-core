import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { reconstructGeometryLines, geometryLinesToText, type PdfTextItem } from "@/domain/bone-health/pdf-geometry";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import {
  BEHAVIORAL_MEASUREMENT_PROFILE,
  CARDIOVASCULAR_MEASUREMENT_PROFILE,
  IMMUNE_MEASUREMENT_PROFILE,
  type MeasurementProfile,
} from "@/domain/health-measurements/profiles";

// P33 end-to-end regression: real PDF bytes → PDF.js text-item geometry →
// reconstructed rows → catalog-bound review candidates. Fixtures are synthetic
// reconstructions of the P28 reports (originals were never committed) plus a
// P33 unsupported-layout document. No OCR, network or storage is involved.

async function extractFixture(path: string): Promise<{ text: string; pages: number; linePages: number[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false, useWorkerFetch: false });
  const doc = await task.promise;
  try {
    const items: PdfTextItem[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        items.push({
          str: item.str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          width: "width" in item && typeof item.width === "number" ? item.width : 0,
          height: "height" in item && typeof item.height === "number" && item.height > 0 ? item.height : 10,
          page: i,
        });
      }
    }
    const lines = reconstructGeometryLines(items);
    return { text: geometryLinesToText(lines), pages: doc.numPages, linePages: lines.map(l => l.page) };
  } finally {
    await task.destroy();
  }
}

async function parseFixture(name: string, profile: MeasurementProfile) {
  const { text, pages, linePages } = await extractFixture(`fixtures/synthetic/p33/${name}`);
  return { ...parseBoneCorrectedText(text, name, profile, linePages), pages, text };
}

const triple = (m: { variableId: string; value: number; unit: string }) => [m.variableId, m.value, m.unit];

describe("P33 end-to-end PDF regression (synthetic fixtures)", () => {
  it("P28 immune report: all 5 observations recognized with header-tied dates, reference intervals ignored", async () => {
    const r = await parseFixture("p28-immune-report.pdf", IMMUNE_MEASUREMENT_PROFILE);
    expect(r.pages).toBe(1);
    expect(r.matches.map(triple)).toEqual([
      ["IMM-001", 6.1, "10^9/L"],
      ["IMM-002", 3.4, "10^9/L"],
      ["IMM-003", 1.9, "10^9/L"],
      ["IMM-007", 1.2, "mg/L"],
      ["IMM-030", 72, "nmol/L"],
    ]);
    expect(r.matches.every(m => m.observedAt === "2026-10-01T09:00:00.000Z")).toBe(true);
    expect(r.matches.every(m => !m.selected && m.reviewRequired && m.page === 1)).toBe(true);
    expect(r.matches.map(m => m.specimen)).toEqual(["whole blood", "whole blood", "whole blood", "serum", "serum"]);
    // Reference interval numbers never became results or extra rows.
    expect(r.matches).toHaveLength(5);
    expect(r.held).toEqual([]);
  });

  it("P28 cardiovascular report: all 5 observations recognized from Greek headers in swapped column order", async () => {
    const r = await parseFixture("p28-cardiovascular-report.pdf", CARDIOVASCULAR_MEASUREMENT_PROFILE);
    expect(r.matches.map(triple)).toEqual([
      ["cv-001", 62, "bpm"],
      ["cv-005", 118, "mmHg"],
      ["cv-006", 76, "mmHg"],
      ["cv-027", 48, "ms"],
      ["cv-065", 98, "%"],
    ]);
    expect(r.matches.every(m => m.observedAt === "2026-10-02T08:00:00.000Z")).toBe(true);
    expect(r.held).toEqual([]);
  });

  it("P28 behavioral report: all 4 observations recognized; wrapped name and decimal comma; dates stay for review", async () => {
    const r = await parseFixture("p28-behavioral-report.pdf", BEHAVIORAL_MEASUREMENT_PROFILE);
    expect(r.matches.map(triple)).toEqual([
      ["BSC-001", 6.5, "h"],
      ["BSC-002", 88, "%"],
      ["BSC-004", 14, "min"],
      ["BSC-015", 4, "score"],
    ]);
    // The report-level "Collected 2026-10-03" note is not tied to rows: no invented dates.
    expect(r.matches.every(m => m.observedAt === "")).toBe(true);
    expect(r.held).toEqual([]);
  });

  it("unsupported layout fails closed: zero matches, explicit held/error reasons, no fabrication", async () => {
    const r = await parseFixture("p33-unsupported-layout.pdf", IMMUNE_MEASUREMENT_PROFILE);
    expect(r.matches).toEqual([]);
    const diagnostics = [...r.errors, ...r.held.map(h => h.reason)].join("\n");
    expect(diagnostics).toContain("IMM-999"); // unknown catalog ID
    expect(diagnostics).toMatch(/comparison symbols|reference/); // <script> and prose refused
    expect(r.text).toContain("UNSUPPORTED LAYOUT"); // raw source text preserved
  });

  it("existing Bone fixture still yields exactly its two catalog matches", async () => {
    const { text, linePages } = await extractFixture("tests/fixtures/p3661-synthetic-lab-report.pdf");
    const r = parseBoneCorrectedText(text, "p3661-synthetic-lab-report.pdf", undefined, linePages);
    expect(r.matches.map(triple)).toEqual([
      ["bone-002", 42.5, "nmol"],
      ["bone-003", 3.1, "nmol"],
    ]);
    expect(r.matches.every(m => !m.selected && m.reviewRequired && m.observedAt === "")).toBe(true);
  });

  it("14 expected P28 observations across the three domain reports, all synthetic and review-bound", async () => {
    const counts = await Promise.all([
      parseFixture("p28-immune-report.pdf", IMMUNE_MEASUREMENT_PROFILE),
      parseFixture("p28-cardiovascular-report.pdf", CARDIOVASCULAR_MEASUREMENT_PROFILE),
      parseFixture("p28-behavioral-report.pdf", BEHAVIORAL_MEASUREMENT_PROFILE),
    ]);
    expect(counts.map(r => r.matches.length)).toEqual([5, 5, 4]);
    const all = counts.flatMap(r => r.matches);
    expect(all).toHaveLength(14);
    expect(all.every(m => m.selected === false && m.reviewRequired === true)).toBe(true);
  });
});
