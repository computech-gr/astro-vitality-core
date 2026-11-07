import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import {
  buildReportDocument,
  createTextReportPdf,
  formatRefList,
  renderReportDocument,
  toWinAnsi,
  type PdfWriter,
  type ReportFonts,
  type TextReportInput,
} from "../../src/domain/health-intelligence/report-text-pdf";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildScientificHealthSummary } from "../../src/domain/health-intelligence/scientific-health-summary";
import { buildHealthHistoryReport } from "../../src/domain/health-intelligence/health-history-report";
import { planAttestation, summarizeAttestations } from "../../src/domain/health-intelligence/evidence-attestation";
import { planObservationCorrection } from "../../src/domain/health-intelligence/stored-observation-review";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { V9_SCOPE, gmCtx, obs } from "./fixtures-v9-observations";

const fontDir = join(import.meta.dir, "../../node_modules/pdfjs-dist/standard_fonts");
const fonts: ReportFonts = {
  regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"),
  bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"),
};

function inputFor(history: UnifiedObservation[], provenance: "synthetic" | "real" = "synthetic"): TextReportInput {
  const scope = { ...V9_SCOPE, provenance };
  const unified = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: history, deviceRecords: [] }, scope, {}, "2026-11-01T12:00:00.000Z");
  const findings = buildScientificFindings(unified);
  const hist = buildHealthHistoryReport(history, scope.missionId, scope.crewMemberId, provenance);
  return {
    unified,
    findings,
    summary: buildScientificHealthSummary(unified, findings, hist, summarizeAttestations(unified, [])),
    history: hist,
    attestations: [],
    identity: { missionName: "Μission Ελλάς – Artemis µ-test", crewDisplayName: "Crew Α" },
    title: "MITOCHONDRIA_test",
  };
}

function rows(n: number, provenance: "synthetic" | "real" = "synthetic") {
  return Array.from({ length: n }, (_, i) =>
    obs({ provenance, metricId: i % 2 ? "cv-027" : "cv-001", originalUnit: i % 2 ? "ms" : "bpm", value: String(40 + (i % 30)), observedAt: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString(), id: `obs-${"x".repeat(40)}-${String(i).padStart(4, "0")}` }),
  );
}

/** Records draw calls so pagination and repeated headers can be asserted. */
function recorder() {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: false });
  pdf.addFileToVFS("R.ttf", fonts.regular);
  pdf.addFont("R.ttf", "LiberationSans", "normal");
  pdf.addFileToVFS("B.ttf", fonts.bold);
  pdf.addFont("B.ttf", "LiberationSans", "bold");
  const texts: { page: number; text: string; y: number }[] = [];
  const writer = pdf as unknown as PdfWriter;
  const orig = writer.text.bind(writer);
  writer.text = (t: string, x: number, y: number, o?: Record<string, unknown>) => {
    texts.push({ page: pdf.getCurrentPageInfo().pageNumber, text: t, y });
    return orig(t, x, y, o);
  };
  return { pdf, writer, texts };
}

describe("v9 searchable text PDF: document model", () => {
  test("first page is a concise executive summary with counts, range, scope and SYNTHETIC / RESEARCH ONLY", () => {
    const doc = buildReportDocument(inputFor(rows(6)));
    const first = doc.blocks.slice(0, doc.blocks.findIndex((b) => b.kind === "pagebreak"));
    expect(first[0]).toEqual({ kind: "banner", text: "SYNTHETIC / RESEARCH ONLY" });
    const kv = first.filter((b) => b.kind === "kv").flatMap((b) => (b.kind === "kv" ? b.rows : []));
    const get = (k: string) => kv.find(([key]) => key === k)?.[1] ?? "";
    expect(get("Included (active) records")).toBe("6");
    expect(get("Observed date range")).toContain("2026-01-01T00:00:00.000Z to 2026-01-01T05:00:00.000Z");
    expect(get("Missing domains")).toContain("Bone");
    // Missing Ground Medical attestation is a prominent call-out directly under the title.
    expect(first[2]).toEqual({
      kind: "alert",
      tone: "pending",
      title: "GROUND MEDICAL ATTESTATION PENDING: 6 of 6 included records",
      lines: [
        "Attested 0 · not attested 6 · revoked 0 · earlier record version 0.",
        "Records awaiting attestation: E001-E006 (see Section 5).",
        "Intake acceptance is a data-entry confirmation, not a Ground Medical attestation.",
      ],
    });
    expect(first.some((b) => b.kind === "alert" && b.title.includes("PENDING INDEPENDENT REVIEW") && b.lines[0]!.includes("0 interpretations are scientifically validated"))).toBe(true);
    expect(doc.headerRight).toBe("SYNTHETIC / RESEARCH ONLY");
  });

  test("executive summary stays concise: no repeated attestation, missing-domain or interpretation bullets", () => {
    const doc = buildReportDocument(inputFor(rows(6)));
    const first = doc.blocks.slice(0, doc.blocks.findIndex((b) => b.kind === "pagebreak"));
    const bullets = first.flatMap((b) => (b.kind === "bullets" ? b.items : []));
    expect(bullets.length).toBeLessThanOrEqual(3);
    expect(bullets.some((i) => /Ground Medical|No included data|PENDING_NIKOLAS/.test(i))).toBe(false);
  });

  test("a fully attested scope shows a completion notice instead of the pending call-out; empty scope says so", () => {
    const input = inputFor(rows(2));
    const plan = planAttestation(input.unified, input.unified.rows.map((r) => r.recordId), [], { actorUserId: "user-gm", rolesForScope: ["ground_medical"], scope: input.unified.scope, decidedAt: "2026-11-01T10:00:00.000Z" }, { reason: "Checked against the source sheet", confirmed: true });
    if (!plan.ok) throw new Error(plan.reason);
    const done = buildReportDocument({ ...input, attestations: plan.events });
    expect(done.blocks[2]).toMatchObject({ kind: "alert", tone: "complete", title: "GROUND MEDICAL ATTESTATION COMPLETE: 2 of 2 included records" });
    expect(done.blocks.some((b) => b.kind === "alert" && b.tone === "pending")).toBe(false);
    // Audit history is preserved in Appendix C.
    const audit = done.blocks.find((b) => b.kind === "table" && b.columns[0]?.title === "Decided (UTC)");
    expect(audit && audit.kind === "table" && audit.rows.length).toBe(2);
    const empty = buildReportDocument({ ...input, unified: { ...input.unified, rows: [] } });
    expect(empty.blocks[2]).toMatchObject({ kind: "alert", tone: "info", title: "GROUND MEDICAL ATTESTATION: NO INCLUDED RECORDS" });
  });

  test("missing-domain statements collapse to one line and limitations are not repeated", () => {
    const doc = buildReportDocument(inputFor(rows(6)));
    const all = doc.blocks.flatMap((b) => (b.kind === "bullets" ? b.items : []));
    expect(all.filter((i) => /^(No included data for|Missing domains)/.test(i)).length).toBe(1);
    expect(all.filter((i) => /^Research-use-only/i.test(i)).length).toBe(1);
    const keys = all.map((i) => i.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("insufficient-point metrics are collapsed by canonical ID plus unit with every evidence reference kept", () => {
    const single = [
      obs({ id: "a-1", metricId: "cv-001", originalUnit: "bpm", value: "60", observedAt: "2026-01-01T08:00:00.000Z" }),
      obs({ id: "a-2", metricId: "cv-027", originalUnit: "ms", value: "40", observedAt: "2026-01-02T08:00:00.000Z" }),
    ];
    const doc = buildReportDocument(inputFor(single));
    const t = doc.blocks.find((b) => b.kind === "table" && b.columns[1]?.title === "Unit (as recorded)");
    expect(t && t.kind === "table" && t.rows.map((r) => [r[0], r[1], r[3]])).toEqual([
      ["cv-001", "bpm", "E001"],
      ["cv-027", "ms", "E002"],
    ]);
    const all = JSON.stringify(doc);
    expect(all).not.toContain("additional comparable time points required");
  });

  test("two points on the same UTC day are never described as a longitudinal change", () => {
    const sameDay = [
      obs({ id: "s-1", metricId: "cv-001", originalUnit: "bpm", value: "60", observedAt: "2026-01-01T08:00:00.000Z" }),
      obs({ id: "s-2", metricId: "cv-001", originalUnit: "bpm", value: "64", observedAt: "2026-01-01T20:00:00.000Z" }),
    ];
    const doc = buildReportDocument(inputFor(sameDay));
    const t = doc.blocks.find((b) => b.kind === "table" && b.columns[0]?.title === "Metric" && b.columns[3]?.title === "Difference");
    expect(t && t.kind === "table" && t.rows[0]![3]).toBe("4 bpm (same UTC day; not a longitudinal change)");
    const glance = doc.blocks.flatMap((b) => (b.kind === "bullets" ? b.items : [])).join(" ");
    expect(glance).toContain("0 show a descriptive first-to-last recorded difference across different days");
    const multi = buildReportDocument(inputFor([sameDay[0]!, { ...sameDay[1]!, observedAt: "2026-01-03T08:00:00.000Z" }]));
    const t2 = multi.blocks.find((b) => b.kind === "table" && b.columns[3]?.title === "Difference");
    expect(t2 && t2.kind === "table" && t2.rows[0]![3]).toBe("4 bpm");
  });

  test("reference lists compress runs to ranges without dropping any reference", () => {
    expect(formatRefList(["E003", "E001", "E002", "E004", "E009", "E011", "E010"])).toBe("E001-E004, E009, E010, E011");
    expect(formatRefList([])).toBe("none");
    expect(formatRefList(["E002", "E002", "x-1"])).toBe("E002, x-1");
  });

  test("real provenance is labelled as real research-only data, never synthetic", () => {
    expect(buildReportDocument(inputFor(rows(2, "real"), "real")).blocks[0]).toEqual({ kind: "banner", text: "REAL DATA / RESEARCH ONLY - NOT FOR CLINICAL USE" });
  });

  test("active summaries show only the latest corrected value; history keeps the superseded record", () => {
    const o = obs({ value: "62" });
    const c = planObservationCorrection(o, [o], { metricId: "cv-001", value: "70", unit: "bpm", observedAt: o.observedAt, reason: "Transcription error fixed", confirmed: true }, gmCtx());
    if (!c.ok) throw new Error(c.reason);
    const doc = buildReportDocument(inputFor([c.erroneousMark, c.corrected]));
    const tables = doc.blocks.filter((b) => b.kind === "table");
    const chrono = tables.find((t) => t.kind === "table" && t.columns[0]!.title === "Observed (UTC)");
    expect(chrono && chrono.kind === "table" && chrono.rows.map((r) => r[3])).toEqual(["70"]);
    const history = tables.find((t) => t.kind === "table" && t.columns[0]!.title === "Record ID" && t.columns[1]!.title === "Status and reason");
    expect(history && history.kind === "table" && history.rows[0]![0]).toBe(o.id);
    const kv = doc.blocks.flatMap((b) => (b.kind === "kv" ? b.rows : []));
    expect(kv.find(([k]) => k === "Excluded records")?.[1]).toContain("superseded by correction 1, marked erroneous 0");
    // Main text uses compact references; full IDs live in Appendix A.
    expect(chrono && chrono.kind === "table" && chrono.rows[0]![6]).toBe("E001");
  });

  test("findings, limitations, hypotheses, reviewer decisions and attestation are separate sections; no AI draft content", () => {
    const doc = buildReportDocument(inputFor(rows(4)));
    const h2 = doc.blocks.filter((b) => b.kind === "h2").map((b) => (b.kind === "h2" ? b.text : ""));
    expect(h2.slice(0, 7)).toEqual([
      // P54: the verified-reference biomarker assessment precedes the numbered sections.
      "Biomarker health assessment (verified references only)",
      "1. Descriptive findings",
      "2. Limitations, missing data and uncertainty",
      // v9.5: shared researcher interpretation sits between limitations and handbook hypotheses.
      "Researcher module physiological evidence interpretation (research only)",
      "3. Handbook hypotheses (pending independent scientific review)",
      "4. Reviewer decisions (data-entry acceptance)",
      "5. Ground Medical evidence attestation (optional second stage)",
    ]);
    const all = JSON.stringify(doc);
    expect(all).not.toMatch(/AI draft|advisor draft|generated draft/i);
    expect(all).toContain("Not endorsed by NASA");
  });
});

describe("v9 searchable text PDF: layout", () => {
  test("90-row and 360-row stress tests paginate with repeated table headers and page numbers", () => {
    for (const n of [90, 360]) {
      const { writer, texts, pdf } = recorder();
      const { pages } = renderReportDocument(buildReportDocument(inputFor(rows(n))), writer, { family: "LiberationSans", unicode: true });
      expect(pages).toBe(pdf.getNumberOfPages());
      expect(pages).toBeGreaterThan(n === 90 ? 6 : 20);
      const headerPages = new Set(texts.filter((t) => t.text === "Observed (UTC)").map((t) => t.page));
      expect(headerPages.size).toBeGreaterThan(1); // header repeated on every page the table spans
      for (let p = 1; p <= pages; p++) {
        expect(texts.some((t) => t.page === p && t.text === `Page ${p} of ${pages}`)).toBe(true);
        expect(texts.some((t) => t.page === p && t.text === "SYNTHETIC / RESEARCH ONLY")).toBe(true);
      }
      // Body text never overflows into the footer band (footer lines start at y = 287 mm).
      expect(texts.filter((t) => t.y > 279.5 && t.y < 286.9).length).toBe(0);
    }
  });

  test("headings are never the last line on a page", () => {
    const { writer, texts } = recorder();
    const doc = buildReportDocument(inputFor(rows(120)));
    renderReportDocument(doc, writer, { family: "LiberationSans", unicode: true });
    const headings = new Set(doc.blocks.flatMap((b) => (b.kind === "h2" || b.kind === "h3" ? [b.text] : [])));
    for (const h of texts.filter((t) => headings.has(t.text))) expect(h.y).toBeLessThan(279 - 15);
  });

  test("long IDs wrap inside cells and Unicode survives with the embedded font", () => {
    const { writer, texts } = recorder();
    renderReportDocument(buildReportDocument(inputFor(rows(3))), writer, { family: "LiberationSans", unicode: true });
    expect(texts.some((t) => t.text.includes("Ελλάς"))).toBe(true);
    const appendixIds = texts.filter((t) => t.text.startsWith("obs-xxxx"));
    expect(appendixIds.length).toBeGreaterThan(0);
    expect(appendixIds.every((t) => t.text.length < 45)).toBe(true);
    // The full identifier is reconstructable from consecutive cell lines, and the
    // trailing sequence number stays attached after its separator.
    const tails = texts.filter((t) => /^x*-\d{4}$/.test(t.text));
    expect(tails.length).toBeGreaterThan(0);
  });

  test("standard-font fallback keeps text searchable and maps symbols to Latin-1", () => {
    expect(toWinAnsi("62 → 61 ≥ – Ελ")).toBe("62 -> 61 >= - ??");
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: false });
    renderReportDocument(buildReportDocument(inputFor(rows(5))), pdf as unknown as PdfWriter, { family: "helvetica", unicode: false });
    const raw = pdf.output();
    expect(raw).toContain("(SYNTHETIC / RESEARCH ONLY) Tj");
    expect(raw).toContain("(Unified Health & Device Report - Executive summary) Tj");
    expect(raw).not.toContain("/Subtype /Image");
  });

  test("createTextReportPdf returns a multi-page, non-image PDF blob with the embedded font", async () => {
    const result = await createTextReportPdf(inputFor(rows(90)), { fonts });
    expect(result.fontMode).toBe("unicode");
    expect(result.pages).toBeGreaterThan(6);
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("/ToUnicode"); // extractable text mapping for search/copy
    expect(text).not.toContain("/Subtype /Image");
    const fallback = await createTextReportPdf(inputFor(rows(3)), { fonts: null });
    expect(fallback.fontMode).toBe("standard");
  });
});

test("v9.2 PDF makes per-domain evidence coverage and comparability limits explicit", () => {
  const doc = buildReportDocument(inputFor(rows(6)));
  const coverage = doc.blocks.find((b) => b.kind === "table" && b.columns.some((c) => c.title === "Recorded UTC coverage"));
  expect(coverage?.kind).toBe("table");
  if (coverage?.kind === "table") {
    expect(coverage.rows.length).toBeGreaterThan(0);
    expect(coverage.rows.some((r) => r[1] === "6")).toBe(true);
  }
  expect(doc.blocks.some((b) => b.kind === "p" && b.text.includes("not overall astronaut health"))).toBe(true);
});
