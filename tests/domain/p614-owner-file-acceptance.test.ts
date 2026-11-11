/**
 * P61.4 owner-file acceptance — the owner's ORIGINAL 12–13 November 2026 Alex Morgan synthetic PDF (byte-identical,
 * SHA-pinned). Synthetic test data only: not clinical, scientific or human acceptance, and no mapping is approved
 * or activated here — the seven held series must stay held, unsaved and outside the report.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { classifyWithGovernedExtensions } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { getSyntheticDemoCatalogs, loadInstalledDemoCatalogs, resetSyntheticDemoCatalogsForTests, SYNTHETIC_DEMO_STORAGE_KEY } from "../../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import type { SignedSyntheticDemoSnapshot } from "../../src/domain/health-intelligence/synthetic-demo-catalog";
import { DOCUMENT_TABLE_RULES_VERSION, documentLinesFromText } from "../../src/domain/health-intelligence/document-table-reconstruction";
import { rowExtractionEvidence } from "../../src/domain/health-intelligence/document-intake-review";
import { buildReviewedObservation, evaluateBulkImport, reconcileBulkImport, reconstructMultiDateDocument, reviewDateFields, type P61ReviewRow } from "../../src/domain/health-intelligence/p61-bulk-import";
import { heldMappingViews, mappingRecovery, provisionalRuleViews } from "../../src/domain/health-intelligence/p614-mapping-governance";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
import { MITO_DEMO_MISSION_ID, premiumFrom } from "../support/p59-fixtures";

const PDF = repoPath("fixtures", "synthetic", "p614", "owner", "MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf");
const OWNER_SHA256 = "27d75069cbfb13f45e32772364bbf16dd9c8ee58f97d559b0da2e5c6f0c9d02a";
const SNAPSHOTS = repoPath("tests", "fixtures", "p61-mito-demo-signed-snapshots.v372.json");
const SCOPE = { missionId: MITO_DEMO_MISSION_ID, crewMemberId: "crew-alex", provenance: "synthetic" as const };
const DATES = ["2026-11-12", "2026-11-13"];
/** Held series with the owner's exact values per date, as printed in the original PDF. */
const HELD: Record<string, [string, string]> = {
  "Chloride|mmol/L": ["97", "98"], "Bicarbonate|mmol/L": ["21", "22"], "Creatinine|mg/dL": ["1.28", "1.24"],
  "Urea nitrogen (BUN)|mg/dL": ["28", "27"], "Platelets|10^9/L": ["310", "318"], "Sleep duration|h": ["4.5", "4.7"], "HRV SDNN|ms": ["23", "25"],
};
const HELD_NAMES = /^(Chloride|Bicarbonate|Creatinine|Urea nitrogen|BUN|Platelets|Sleep duration|HRV SDNN)\b/i;
type Row = P61ReviewRow & { sourceKind: "pdf_text"; sourceLabel: string; documentName: string; excerpt: string; importedAt: string };
const key = (r: { label: string; unit: string }) => `${r.label}|${r.unit}`;

let n = 0;
async function pdfRows(): Promise<Row[]> {
  const g = await extractPdfGeometry(PDF);
  const m = reconstructMultiDateDocument(documentLinesFromText(g.text, g.linePages, g.geometry));
  return m.reconstruction.observations.map((o, i) => {
    const base = {
      provenance: "synthetic" as const, missionId: SCOPE.missionId, importedAt: "2026-11-13T18:00:00.000Z",
      label: o.label, value: o.value || o.rawValue, unit: o.unit, ...reviewDateFields(m.dates[i]!), examDate: m.dates[i]!,
      extraction: rowExtractionEvidence(o, DOCUMENT_TABLE_RULES_VERSION), documentSha256: OWNER_SHA256, excerpt: o.excerpt,
      sourceKind: "pdf_text" as const, sourceLabel: "Document: owner two-day.pdf", documentName: "MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf",
    } as Omit<Row, "key" | "selected" | "classification">;
    return { ...base, key: `o${++n}`, selected: false, classification: classifyWithGovernedExtensions(base).classification } as Row;
  });
}

const g = globalThis as { window?: unknown };
const had = "window" in g;
const previous = g.window;
beforeAll(async () => {
  g.window = g.window ?? {};
  resetSyntheticDemoCatalogsForTests();
  const storage = new Map([[SYNTHETIC_DEMO_STORAGE_KEY, readFileSync(SNAPSHOTS, "utf8")]]);
  JSON.parse(storage.get(SYNTHETIC_DEMO_STORAGE_KEY)!) as Record<string, SignedSyntheticDemoSnapshot>;
  expect(await loadInstalledDemoCatalogs({ storage: { get: (k) => storage.get(k) ?? null, set: (k, v) => void storage.set(k, v) } })).toMatchObject({ rejected: 0 });
});
afterAll(() => {
  resetSyntheticDemoCatalogsForTests();
  if (had) g.window = previous;
  else delete g.window;
});

describe("P61.4 owner original two-day PDF", () => {
  it("is the exact owner file", () => {
    expect(createHash("sha256").update(readFileSync(PDF)).digest("hex")).toBe(OWNER_SHA256);
  });

  it("extracts 76 observations, 38 series, 2 dates (38 each) with the owner's held values per date", async () => {
    const rows = await pdfRows();
    expect(rows.length).toBe(76);
    expect(new Set(rows.map(key)).size).toBe(38);
    const byDate = new Map<string, number>();
    for (const r of rows) byDate.set(r.observedAt.slice(0, 10), (byDate.get(r.observedAt.slice(0, 10)) ?? 0) + 1);
    expect([...byDate.entries()].sort()).toEqual([["2026-11-12", 38], ["2026-11-13", 38]]);
    for (const [k, [d12, d13]] of Object.entries(HELD)) {
      const vals = rows.filter((r) => key(r) === k).sort((a, b) => a.observedAt.localeCompare(b.observedAt)).map((r) => r.value);
      expect(vals).toEqual([d12, d13]);
    }
  });

  it("62 validated, 14 unresolved, 0 rejected; save 62; re-import 62 duplicates, 14 held, 0 newly eligible, 0 auto-saved", async () => {
    const rows = await pdfRows();
    const first = evaluateBulkImport(rows, [], SCOPE);
    expect(reconcileBulkImport(rows, first.statuses)).toMatchObject({ observations: 76, series: 38, examinationDates: 2, validated: 62, unresolved: 14, rejected: 0, duplicates: 0 });
    const held = rows.filter((r) => first.statuses.get(r.key)?.kind === "exception");
    expect([...new Set(held.map(key))].sort()).toEqual(Object.keys(HELD).sort());

    const stored = rows.filter((r) => first.validatedKeys.includes(r.key)).map((r, i) =>
      buildReviewedObservation(r, { id: `p614-owner-${String(i).padStart(4, "0")}`, recordedAt: "2026-11-13T18:05:00.000Z", scope: SCOPE, duplicateWarningAcknowledged: false }));
    expect(stored.length).toBe(62);
    expect(stored.some((o) => HELD_NAMES.test(o.label) || Object.keys(HELD).some((k) => k.startsWith(`${o.label}|`)))).toBe(false);

    const again = evaluateBulkImport(rows, stored, SCOPE);
    expect(reconcileBulkImport(rows, again.statuses)).toMatchObject({ duplicates: 62, validated: 0, unresolved: 14, rejected: 0 });
    expect(mappingRecovery(rows, again.statuses)).toMatchObject({ extracted: 76, duplicates: 62, newlyEligible: 0, stillHeld: 14, autoSaved: 0 });
    const views = heldMappingViews(rows, again.statuses, { missionId: MITO_DEMO_MISSION_ID, submittedTerms: [], scopeTerms: [], triage: [], demoEvents: [], catalogs: getSyntheticDemoCatalogs() });
    expect(views.length).toBe(7);
    expect(views.every((v) => v.rows === 2 && v.dates.join() === DATES.join() && !v.status.eligible && v.status.stage === "NOT_SUBMITTED")).toBe(true);
  });

  it("the report built from the 62 saved observations never mentions or reasons about the seven held series", async () => {
    const rows = await pdfRows();
    const first = evaluateBulkImport(rows, [], SCOPE);
    const stored = rows.filter((r) => first.validatedKeys.includes(r.key)).map((r, i) =>
      buildReviewedObservation(r, { id: `p614-owner-r-${String(i).padStart(4, "0")}`, recordedAt: "2026-11-13T18:05:00.000Z", scope: SCOPE, duplicateWarningAcknowledged: false }));
    const report = premiumFrom(stored, { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range: { from: "2026-11-12", to: "2026-11-13" } });
    expect(report.rows.length).toBeGreaterThan(0);
    for (const x of report.rows) expect(x.name).not.toMatch(/Chloride|Bicarbonate|Urea nitrogen|\bBUN\b|Platelet|Sleep duration|SDNN|Creatinine/i);
    for (const c of report.charts) expect(c.base.name).not.toMatch(/Chloride|Bicarbonate|Urea nitrogen|\bBUN\b|Platelet|Sleep duration|SDNN|Creatinine/i);
  });

  it("the five aliases and the temperature notation rule stay pending and synthetic-only", () => {
    const rules = provisionalRuleViews();
    expect(rules.length).toBe(6);
    expect(rules.every((r) => r.status.startsWith("PENDING_RESEARCHER_") && r.syntheticOnly)).toBe(true);
  });
});
