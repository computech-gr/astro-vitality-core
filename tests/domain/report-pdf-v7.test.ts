import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createReportPdf,
  PDF_LAYOUT,
  pdfExportErrorMessage,
  planRenderBands,
  reportPageCuts,
  type ReportPdfDeps,
} from "../../src/domain/health-intelligence/report-pdf";
import { buildScientificFindings, scientificFindingsPlainText } from "../../src/domain/health-intelligence/scientific-findings";
import { buildScientificHealthSummary, scientificHealthSummaryPlainText } from "../../src/domain/health-intelligence/scientific-health-summary";
import { summarizeAttestations } from "../../src/domain/health-intelligence/evidence-attestation";
import { v7Report, v7Row } from "./fixtures-v7-report";

/** Fake browser: a report of `height` CSS px with one block per table row. */
function fakeDeps(height: number, opts: { emptyBand?: boolean } = {}) {
  const renders: Array<{ y: number; height: number }> = [];
  const pages: number[] = [];
  const blocks = Array.from({ length: Math.floor(height / 40) }, (_, i) => ({ top: i * 40, bottom: i * 40 + 36 }));
  const canvas = (w: number, h: number) => ({
    width: w, height: h, fillStyle: "",
    getContext: () => ({ drawImage: () => undefined, fillStyle: "", fillRect: () => undefined }),
    toDataURL: () => "data:image/jpeg;base64,AAAA",
  });
  const deps: ReportPdfDeps = {
    async render(_el, o) {
      const y = o.y as number;
      const h = o.height as number;
      renders.push({ y, height: h });
      const onclone = o.onclone as (doc: Document, el: HTMLElement) => void;
      // Minimal clone stand-ins so the real prepare/measure code runs.
      const el = {
        getBoundingClientRect: () => ({ top: 0, height }),
        scrollHeight: height,
        querySelectorAll: () => blocks.map((b) => ({ getBoundingClientRect: () => ({ top: b.top, bottom: b.bottom, height: b.bottom - b.top }) })),
      } as unknown as HTMLElement;
      const doc = {
        styleSheets: [], head: { appendChild: () => undefined }, documentElement: { style: {} }, body: { style: {}, replaceChildren: () => undefined },
        createElement: () => ({ appendChild: () => undefined }),
      } as unknown as Document;
      onclone(doc, el);
      return opts.emptyBand && renders.length > 1 ? canvas(0, 0) : canvas(Math.round(PDF_LAYOUT.width * PDF_LAYOUT.scale), Math.round(h * PDF_LAYOUT.scale));
    },
    createPdf: () => ({
      setProperties: () => undefined,
      addPage: () => undefined,
      addImage: (_d, _f, _x, _y, _w, h) => { pages.push(h); },
      output: () => new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: "application/pdf" }),
    }),
    createCanvas: () => canvas(0, 0),
  };
  return { deps, renders, pages };
}

describe("v7 direct PDF export", () => {
  test("an 11+ page report renders in bounded bands and produces a real PDF blob", async () => {
    const height = PDF_LAYOUT.pageHeight * 14.3;
    const { deps, renders, pages } = fakeDeps(height);
    const blob = await createReportPdf({} as HTMLElement, "MITOCHONDRIA_test", deps);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
    expect(pages.length).toBeGreaterThanOrEqual(15);
    expect(renders.length).toBeGreaterThan(1);
    // No capture exceeds the band limit, so no canvas approaches browser limits (32,767 px).
    for (const r of renders) expect(r.height * PDF_LAYOUT.scale).toBeLessThanOrEqual(PDF_LAYOUT.maxBandHeight * PDF_LAYOUT.scale);
    expect(PDF_LAYOUT.maxBandHeight * PDF_LAYOUT.scale).toBeLessThan(16_384);
  });

  test("reports far beyond the old 40,000 px limit no longer fail", async () => {
    const { deps, pages } = fakeDeps(60_000);
    await createReportPdf({} as HTMLElement, "big", deps);
    expect(pages.length).toBeGreaterThan(55);
  });

  test("an empty canvas from the browser is a reported failure, never a fake success", async () => {
    const { deps } = fakeDeps(PDF_LAYOUT.pageHeight * 12, { emptyBand: true });
    await expect(createReportPdf({} as HTMLElement, "x", deps)).rejects.toThrow("empty page capture");
  });

  test("page cuts never split a fitting row and bands end on page boundaries", () => {
    const cuts = reportPageCuts(3000, 1000, [{ top: 980, bottom: 1020 }, { top: 1990, bottom: 2030 }]);
    expect(cuts).toEqual([0, 980, 1990, 2990, 3000]);
    const bands = planRenderBands(cuts, 2000);
    expect(bands.map((b) => [b.start, b.end])).toEqual([[0, 1990], [1990, 3000]]);
  });

  test("failure message is actionable, states no file was created and points to the separate Print", () => {
    expect(pdfExportErrorMessage(new Error("Canvas exceeded."))).toBe(
      "Direct PDF export failed: Canvas exceeded. No PDF was downloaded. Use the separate Print button for browser Save as PDF.",
    );
    expect(pdfExportErrorMessage(null)).toContain("PDF renderer unavailable");
  });

  test("Download PDF never invokes Print; Print stays a separate action", () => {
    const src = readFileSync(join(import.meta.dir, "../../src/components/astronaut-health-report.tsx"), "utf8");
    const pdfBranch = src.slice(src.indexOf("createReportPdf(reportRef.current"), src.indexOf("} catch (error) {", src.indexOf("createReportPdf(reportRef.current")));
    expect(pdfBranch).not.toContain("window.print");
    expect(pdfBranch).toContain("pdfExportErrorMessage");
    expect(src).toContain('onClick={() => void performExport("print")}');
    expect(src).toContain('onClick={() => void performExport("pdf")}');
  });
});

describe("v7 screen / TXT parity", () => {
  const report = v7Report([
    v7Row("obs-1", "cardiovascular", "cv-001", "62", "bpm", "2026-10-01T07:30:00.000Z"),
    v7Row("obs-2", "cardiovascular", "cv-001", "61", "bpm", "2026-10-04T07:30:00.000Z"),
    v7Row("obs-3", "immune", "IMM-030", "30", "ng/mL", "2026-10-01T07:30:00.000Z"),
  ]);
  const findings = buildScientificFindings(report);
  const summary = buildScientificHealthSummary(report, findings, null, summarizeAttestations(report, []));
  const text = scientificHealthSummaryPlainText(summary);

  test("every on-screen front-page point and evidence ID appears in TXT", () => {
    for (const p of summary.frontPage.keyPoints) expect(text).toContain(p);
    expect(summary.frontPage.evidenceIds).toEqual(["obs-1", "obs-2"]);
    expect(text).toContain("obs-1, obs-2");
    expect(scientificFindingsPlainText(findings)).toContain("obs-1");
  });

  test("immune and behavioral interpretation are explicitly pending, never invented", () => {
    const immune = summary.domainInterpretation.find((d) => d.domain === "Immune")!;
    expect(immune.source).toBeNull();
    expect(immune.status).toContain("pending scientific review");
    expect(summary.domainInterpretation.find((d) => d.domain === "Behavioral")!.present).toBe(false);
    expect(summary.implications.some((i) => i.metricId === "IMM-030")).toBe(false);
  });

  test("AI drafts are declared separate and excluded from exports; no diagnosis language", () => {
    expect(summary.boundaries.join(" ")).toContain("AI-assisted drafts are unverified");
    expect(text.toLowerCase()).not.toMatch(/\bdiagnosed\b|fit for duty|you should take/);
    expect(summary.frontPage.keyPoints.join(" ")).toContain("Ground Medical attestation: 0 attested, 3 accepted without attestation");
  });
});
