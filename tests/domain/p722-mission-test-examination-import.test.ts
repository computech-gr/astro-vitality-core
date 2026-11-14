/**
 * P72.2 — MISSION_TEST normal Examinations import (SYNTHETIC OWNER DOCUMENTS ONLY; nothing is stored or synced).
 * Replays the three byte-identical owner documents held in this repository through the same reconstruction,
 * classification, eligibility and save-builder path that Examinations uses, scoped to MISSION_TEST (which has no
 * synthetic demo catalog). Human confirmation is simulated in memory; it is never clinical or scientific approval.
 * Rules pinned: only built-in catalog rows are eligible (no demo biomarkers, no 25(OH) Vitamin D, P1NP or CTX);
 * dates are only those a reviewer applies explicitly; confirmed rows reach the Full Health Report and its PDF.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
import { documentLinesFromText, DOCUMENT_TABLE_RULES_VERSION } from "../../src/domain/health-intelligence/document-table-reconstruction";
import { buildReviewedObservation, reconstructMultiDateDocument, reviewDateFields } from "../../src/domain/health-intelligence/p61-bulk-import";
import { applyDocumentTimestamp, rowExtractionEvidence } from "../../src/domain/health-intelligence/document-intake-review";
import { classifyWithGovernedExtensions } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { intakeRowExclusionReason } from "../../src/domain/health-intelligence/intake-review-selection";
import { extractFiveColumnLabCandidates } from "../../src/domain/health-intelligence/universal-intake-parser";
import { batchDuplicateKeys } from "../../src/domain/health-intelligence/universal-intake-adapters";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { createPremiumReportPdf } from "../../src/domain/health-intelligence/p59-premium-pdf";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { premiumFrom } from "../support/p59-fixtures";

const SCOPE = { missionId: "mission-3fd366c331ed46afb0645cced1d45294", crewMemberId: "crew-43f5fe4d102f40d19ced676dabd3b672", provenance: "synthetic" as const };
const DOCS = {
  nov07: { path: repoPath("tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf"), sha: "d1bd6d9fa7efe52187e8dd9f861fe0917c016440a61a78074027f60cbdcabdfb", name: "Alex_Morgan_Complete_Examination_2026-11-07.pdf" },
  nov1213: { path: repoPath("fixtures/synthetic/p614/owner/MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf"), sha: "27d75069cbfb13f45e32772364bbf16dd9c8ee58f97d559b0da2e5c6f0c9d02a", name: "MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf" },
  nasa: { path: repoPath("tests/fixtures/p39/NASA_Astronaut_Simulated_Medical_Report.pdf"), sha: "59805b82bce32087e6100236138917257cb5911229409b4eb2845baead67c6ce", name: "NASA_Astronaut_Simulated_Medical_Report.pdf" },
};
type Doc = (typeof DOCS)[keyof typeof DOCS];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const HELD_SCIENCE = /vitamin\s*d|25\s*\(oh\)|p1np|pinp|\bctx\b/i;

let n = 0;
const classify = (r: Row) => ({ ...r, classification: classifyWithGovernedExtensions(r).classification });
const eligible = (rows: Row[]) => rows.filter((r) => intakeRowExclusionReason(r) === null);

/** Same table path as Examinations (reconstructMultiDateDocument rows), scoped to MISSION_TEST. */
async function tableRows(doc: Doc): Promise<Row[]> {
  const g = await extractPdfGeometry(doc.path);
  const md = reconstructMultiDateDocument(documentLinesFromText(g.text, g.linePages, g.geometry));
  return md.reconstruction.observations.map((o, i) => {
    const value = o.value || (o.valueKind === "ambiguous_number" ? "" : o.rawValue);
    return classify({
      key: `r${++n}`, selected: false, provenance: "synthetic", missionId: SCOPE.missionId,
      label: o.label, value, unit: o.unit, ...reviewDateFields(md.dates[i]!), examDate: md.dates[i],
      excerpt: o.excerpt, sourceKind: "pdf_text", sourceLabel: "Document", documentName: doc.name, documentSha256: doc.sha,
      extraction: { ...rowExtractionEvidence(o, DOCUMENT_TABLE_RULES_VERSION), proposedValue: value },
      identity: md.reconstruction.identity,
    });
  });
}

const save = (rows: Row[]): UnifiedObservation[] =>
  rows.map((r, i) => buildReviewedObservation(r, { id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, recordedAt: "2026-11-15T10:00:00.000Z", scope: SCOPE, duplicateWarningAcknowledged: false }));

async function confirmedImport() {
  for (const d of Object.values(DOCS)) expect(createHash("sha256").update(readFileSync(d.path)).digest("hex")).toBe(d.sha);
  // 7 Nov: reviewer applies the stated "07/11/2026 09:30 UTC (day/month/year)" timestamp. The in-document duplicate
  // warning flags 4 repeats; the reviewer unticks the 3 Immune-section repeats of hsCRP / IL-6 / TNF-α (rows 184, 190,
  // 196) and keeps Behavioral row 313 "HRV RMSSD 12 ms" (as in the original MITO_DEMO_2026 record), acknowledging it.
  let nov07 = await tableRows(DOCS.nov07);
  const stamp = nov07[0].identity.timestampCandidates[0];
  expect(stamp).toMatchObject({ value: "2026-11-07T09:30:00Z", precision: "instant" });
  nov07 = (applyDocumentTimestamp(nov07, DOCS.nov07.sha, { value: stamp.value, precision: stamp.precision, interpretation: stamp.interpretation }).rows as Row[]).map(classify);
  const nov07Eligible = eligible(nov07);
  const repeats = new Set(batchDuplicateKeys(nov07Eligible.map((r) => ({ key: r.key, metricId: r.classification.metricId, observedAt: r.observedAt, datePrecision: r.datePrecision, value: r.value, unit: r.unit }))));
  const UNTICK = new Set(["184", "190", "196"]);
  const nov07Kept = nov07Eligible.filter((r) => !(repeats.has(r.key) && UNTICK.has(r.extraction.sourceRowNumber ?? r.excerpt.split(" | ")[0])));
  // 12–13 Nov: each row already carries its own examination date (two date columns).
  const nov1213 = await tableRows(DOCS.nov1213);
  // NASA report: five-column lab rows; collection dates are never promoted, so the reviewer types the printed date.
  const nasa = extractFiveColumnLabCandidates((await extractPdfGeometry(DOCS.nasa.path)).text, 500).map((c: Row) =>
    classify({ ...c, key: `r${++n}`, selected: false, provenance: "synthetic", missionId: SCOPE.missionId, sourceKind: "pdf_text", sourceLabel: "Document", documentName: DOCS.nasa.name, documentSha256: DOCS.nasa.sha }));
  const nasaTyped = nasa.map((r: Row) => (r.classification.status === "matched" && r.sourceValidation !== "unvalidated" && r.collectionDate ? { ...r, observedAt: r.collectionDate, datePrecision: "date" } : r));
  return { nov07, nov07Eligible, repeats, nov07Kept, nov1213, nasa: nasaTyped };
}

describe("P72.2 MISSION_TEST normal Examinations import", () => {
  it("yields exactly the original eligible rows per document (52 + 24 + 3 = 79) and nothing outside the built-in catalog", async () => {
    const r = await confirmedImport();
    expect(r.nov07.length).toBe(328);
    expect(r.nov07Eligible.length).toBe(55);
    expect(r.repeats.size).toBe(4);
    expect(r.nov07Kept.length).toBe(52);
    expect(r.nov07Kept.every((x: Row) => x.observedAt === "2026-11-07T09:30:00Z" && x.datePrecision === "instant")).toBe(true);
    const e1213 = eligible(r.nov1213);
    expect(r.nov1213.length).toBe(76);
    expect(e1213.length).toBe(24);
    expect(e1213.filter((x: Row) => x.observedAt.startsWith("2026-11-12")).length).toBe(12);
    const eNasa = eligible(r.nasa);
    expect(eNasa.map((x: Row) => [x.classification.metricId, x.value, x.unit, x.observedAt])).toEqual([
      ["cv-027", "24", "ms", "2026-11-06"], ["cv-088", "165", "mg/dL", "2026-11-06"], ["cv-092", "5.8", "pg/mL", "2026-11-05"],
    ]);
    const all = [...r.nov07Kept, ...e1213, ...eNasa];
    expect(all.length).toBe(79);
    expect(all.every((x: Row) => /^cv-\d{3}$/.test(x.classification.metricId))).toBe(true);
  });

  it("keeps 25(OH) Vitamin D, P1NP and CTX rows held in MISSION_TEST (never eligible, never saved)", async () => {
    const r = await confirmedImport();
    const science = [...r.nov07, ...r.nov1213, ...r.nasa].filter((x: Row) => HELD_SCIENCE.test(x.label));
    expect(science.length).toBeGreaterThan(0);
    expect(science.every((x: Row) => intakeRowExclusionReason(x) !== null)).toBe(true);
  });

  it("confirmed rows are accepted, keep document provenance, and reach the Full Health Report and PDF for Astronaut Test 01", async () => {
    const r = await confirmedImport();
    const saved = save([...r.nov07Kept, ...eligible(r.nov1213), ...eligible(r.nasa)]);
    expect(saved.length).toBe(79);
    expect(saved.every((o) => o.reviewState === "accepted" && o.quality.reviewerConfirmed && o.missionId === SCOPE.missionId && o.crewMemberId === SCOPE.crewMemberId && o.provenance === "synthetic")).toBe(true);
    expect(new Set(saved.map((o) => o.source.documentSha256))).toEqual(new Set([DOCS.nov07.sha, DOCS.nov1213.sha, DOCS.nasa.sha]));
    const range = { from: "2026-11-01", to: "2026-11-15" };
    const unified = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: saved, deviceRecords: [] } as never, SCOPE, range, "2026-11-15T12:00:00.000Z");
    // 79 confirmed observations; Behavioral row 313 repeats RMSSD 12 ms at the same instant and is reported once.
    expect(unified.rows.length).toBe(78);
    expect(unified.exclusions.filter((e) => e.category === "pending_review")).toHaveLength(0);
    const premium = premiumFrom(saved, { scope: SCOPE, missionId: SCOPE.missionId, range, crew: "Astronaut Test 01", mission: "MISSION_TEST" });
    expect(premium.header.astronaut).toBe("Astronaut Test 01");
    // Same fonts the browser download loads (pdf.js Liberation Sans), read from disk instead of fetched.
    const font = (f: string) => readFileSync(createRequire(import.meta.url).resolve(`pdfjs-dist/standard_fonts/${f}`)).toString("base64");
    const pdf = await createPremiumReportPdf(premium, { fonts: { regular: font("LiberationSans-Regular.ttf"), bold: font("LiberationSans-Bold.ttf") } }, { fixedDate: "2026-11-15T00:00:00.000Z" });
    const bytes = new Uint8Array(await pdf.blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.pages).toBeGreaterThan(0);
    if (process.env.P722_PDF_OUT) writeFileSync(process.env.P722_PDF_OUT, bytes);
  });
});
