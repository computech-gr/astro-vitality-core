/**
 * P61 — final acceptance against the owner-supplied SYNTHETIC fixtures, byte-identical:
 *   fixtures/synthetic/p61/MITOCHONDRIA_Alex_Morgan_November_2026_Longitudinal_Exam_Test_SYNTHETIC.pdf
 *   fixtures/synthetic/p61/Alex_Morgan_304_Observations.csv
 * Catalog matching uses the read-only copy of the signed MITO_DEMO_2026 demo snapshot the Preview
 * installed (v372, verified with the bundled trusted key). Synthetic test data only — this is not
 * clinical, scientific or human acceptance.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DOCUMENT_TABLE_RULES_VERSION, documentLinesFromText } from "../../src/domain/health-intelligence/document-table-reconstruction";
import { rowExtractionEvidence } from "../../src/domain/health-intelligence/document-intake-review";
import { classifyWithGovernedExtensions } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { domainForMetric } from "../../src/domain/health-domains/document-domain-projection";
import { csvCells, extractCsvCandidates } from "../../src/domain/health-intelligence/universal-intake-parser";
import { loadInstalledDemoCatalogs, resetSyntheticDemoCatalogsForTests, SYNTHETIC_DEMO_STORAGE_KEY } from "../../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { listUnifiedObservations, saveUnifiedObservation } from "../../src/domain/health-intelligence/observation-store";
import { InMemoryOfflineMissionStore } from "../../src/infrastructure/offline/store";
import {
  buildReviewedObservation,
  evaluateBulkImport,
  reconcileBulkImport,
  reconstructMultiDateDocument,
  reviewDateFields,
  rowDateEvidence,
  type P61ReviewRow,
} from "../../src/domain/health-intelligence/p61-bulk-import";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
import { premiumFrom, MITO_DEMO_MISSION_ID } from "../support/p59-fixtures";

const PDF = repoPath("fixtures", "synthetic", "p61", "MITOCHONDRIA_Alex_Morgan_November_2026_Longitudinal_Exam_Test_SYNTHETIC.pdf");
const CSV = repoPath("fixtures", "synthetic", "p61", "Alex_Morgan_304_Observations.csv");
const SNAPSHOTS = repoPath("tests", "fixtures", "p61-mito-demo-signed-snapshots.v372.json");
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const DATES = ["2026-11-03", "2026-11-06", "2026-11-09", "2026-11-12", "2026-11-16", "2026-11-20", "2026-11-24", "2026-11-28"];
const SCOPE = { missionId: MITO_DEMO_MISSION_ID, crewMemberId: "crew-alex", provenance: "synthetic" as const };

/**
 * P61.3: the 7 series that stay unresolved after the five owner-directed synthetic aliases and the closed
 * typographic unit-notation rules (no catalog entry, specimen/definition/method needing a Researcher decision,
 * or an alias needing approval — never fuzzy matching or conversion).
 */
const UNRESOLVED = [
  "Bicarbonate|mmol/L", "Chloride|mmol/L", "Creatinine|mg/dL",
  "HRV SDNN|ms", "Platelets|10^9/L", "Sleep duration|h", "Urea nitrogen (BUN)|mg/dL",
];
/** P61.2 owner-directed synthetic aliases (pending Researcher review), exact unit only. */
const ALIASED: Record<string, string> = {
  "25-OH vitamin D|ng/mL": "demo:ubt-7b25ce69", "Systolic BP|mmHg": "demo:ubt-e1140df3", "Diastolic BP|mmHg": "demo:ubt-5d16fcaf",
  "Glucose, fasting|mg/dL": "demo:ubt-7f47ee7c", "White blood cells|10^9/L": "demo:ubt-813d9e97",
};
/** Matched series → metric identity, exactly as the authenticated Preview import showed them. */
const MATCHED: Record<string, string> = {
  "aPTT|s": "cv-061", "HbA1c|%": "cv-085", "Hematocrit|%": "cv-076", "Hemoglobin|g/dL": "cv-075", "HRV RMSSD|ms": "cv-027", "hsCRP|mg/L": "cv-091",
  "IL-6|pg/mL": "cv-092", "Lactate|mmol/L": "cv-069", "Potassium|mmol/L": "cv-071", "QTc|ms": "cv-032", "Sodium|mmol/L": "cv-070", "Triglycerides|mg/dL": "cv-088",
  "Sleep efficiency|%": "demo:ubt-efe7e2fb", "CTX|ng/mL": "demo:ubt-d9870fc7", "Osteocalcin|ng/mL": "demo:ubt-12c22152", "P1NP|ng/mL": "demo:ubt-6c8bad01",
  "D-dimer|mg/L FEU": "demo:ubt-eed68002", "Fibrinogen|mg/dL": "demo:ubt-c6a305ef", "HDL cholesterol|mg/dL": "demo:ubt-5ad8b852", "LDL cholesterol|mg/dL": "demo:ubt-26a9a98e",
  "Respiratory rate|breaths/min": "demo:ubt-f4b8be7b", "Resting heart rate|bpm": "demo:ubt-625f8d98", "SpO2|%": "demo:ubt-12f6e490",
  "IL-10|pg/mL": "demo:ubt-e151a9b1", "TNF-alpha|pg/mL": "demo:ubt-516090ed",
  ...ALIASED,
  // P61.3: identical name; "deg C" is the entry's °C written in plain text (rule UN-1, synthetic only).
  "Body temperature|deg C": "demo:ubt-323050f4",
};

type Row = P61ReviewRow & { sourceKind: "pdf_text" | "csv"; sourceLabel: string; documentName: string; excerpt: string; importedAt: string };
let n = 0;
const mk = (p: Record<string, unknown>): Row => {
  const base = { provenance: "synthetic" as const, missionId: SCOPE.missionId, importedAt: "2026-11-10T18:00:00.000Z", ...p } as Omit<Row, "key" | "selected" | "classification">;
  return { ...base, key: `r${++n}`, selected: false, classification: classifyWithGovernedExtensions(base).classification } as Row;
};
const key = (r: { label: string; unit: string }) => `${r.label}|${r.unit}`;

let pdf: Awaited<ReturnType<typeof loadPdf>>;
let csvRows: Row[];
async function loadPdf() {
  const g = await extractPdfGeometry(PDF);
  const m = reconstructMultiDateDocument(documentLinesFromText(g.text, g.linePages, g.geometry));
  const rows = m.reconstruction.observations.map((o, i) =>
    mk({ label: o.label, value: o.value || o.rawValue, unit: o.unit, ...reviewDateFields(m.dates[i]!), examDate: m.dates[i]!, extraction: rowExtractionEvidence(o, DOCUMENT_TABLE_RULES_VERSION), documentSha256: sha(PDF), excerpt: o.excerpt, sourceKind: "pdf_text", sourceLabel: "Document: exam.pdf", documentName: "exam.pdf" }),
  );
  return { m, rows };
}
const storage = new Map<string, string>([[SYNTHETIC_DEMO_STORAGE_KEY, readFileSync(SNAPSHOTS, "utf8")]]);
beforeAll(async () => {
  expect(await loadInstalledDemoCatalogs({ storage: { get: (k) => storage.get(k) ?? null, set: (k, v) => void storage.set(k, v) } })).toEqual({ loaded: 1, rejected: 0 });
  pdf = await loadPdf();
  const parsed = extractCsvCandidates(readFileSync(CSV, "utf8"), 1000, { keepUnparsedDates: true });
  csvRows = parsed.rows.map((c) => mk({ label: c.label, value: c.value, unit: c.unit, observedAt: c.observedAt, ...(c.datePrecision ? { datePrecision: c.datePrecision } : {}), examDate: rowDateEvidence(c), documentSha256: sha(CSV), excerpt: c.excerpt, sourceKind: "csv", sourceLabel: "CSV: obs.csv", documentName: "obs.csv", ...(c.sourceContext ? { sourceContext: c.sourceContext } : {}) }));
});
afterAll(() => resetSyntheticDemoCatalogsForTests());

describe("P61 owner fixtures — identity", () => {
  it("are the exact files the owner supplied", () => {
    expect(sha(PDF)).toBe("6e2aa735f3ec8fdd1115cbc691260e14a72e800a13f9853484e29463efb2d505");
    expect(sha(CSV)).toBe("4a68ca84480e7a7903b2068c3b3b976a94124e3181f12031b847b751c7203515");
  });
});

describe("P61 owner fixtures — PDF reconstruction", () => {
  it("304 rows, 8 examination dates, 38 per date, every row from its own heading, no reconstruction issues", () => {
    const { m, rows } = pdf;
    expect(rows.length).toBe(304);
    expect(m.distinctDates).toEqual(DATES);
    expect(m.multipleDates).toBe(true);
    for (const d of DATES) expect(rows.filter((r) => r.observedAt === d).length).toBe(38);
    expect(m.dates.every((d) => d.status === "resolved" && d.source === "section")).toBe(true);
    expect(m.reconstruction.observations.filter((o) => o.issues.length > 0)).toEqual([]);
    expect(new Set(rows.map(key)).size).toBe(38);
  });
  it("date lines followed by no rows (source footers) are never applied to any row", () => {
    const { m } = pdf;
    expect(m.groups.filter((g) => g.rows > 0).map((g) => g.rows)).toEqual(Array(8).fill(38));
    const empty = m.groups.filter((g) => g.rows === 0);
    expect(empty.every((g) => /^Source: MITOCHONDRIA synthetic test fixture/.test(g.text))).toBe(true);
  });
});

describe("P61 owner fixtures — CSV schema compatibility", () => {
  it("metric_name / observed_at / value / unit are read; 304 rows keep their exact instants", () => {
    const parsed = extractCsvCandidates(readFileSync(CSV, "utf8"), 1000);
    expect(parsed.rows.length).toBe(304);
    expect(parsed.skipped).toBe(0);
    expect(parsed.rows.every((r) => r.datePrecision === "instant" && r.observedAt.endsWith("T09:00:00Z"))).toBe(true);
    expect([...new Set(parsed.rows.map((r) => r.observedAt.slice(0, 10)))].sort()).toEqual(DATES);
  });
  it("the PDF and CSV carry the same 304 (date, biomarker, value, unit) tuples", () => {
    const p = pdf.rows.map((r) => `${r.observedAt}|${r.label}|${r.value}|${r.unit}`).sort();
    const c = csvRows.map((r) => `${r.observedAt.slice(0, 10)}|${r.label}|${r.value}|${r.unit}`).sort();
    expect(new Set(p).size).toBe(304);
    expect(p).toEqual(c);
  });
});

describe("P61 owner fixtures — catalog matching and domain assignment", () => {
  for (const [name, get] of [["PDF", () => pdf.rows], ["CSV", () => csvRows]] as const)
    it(`${name}: 31 series matched (25 exact + 5 synthetic aliases + 1 unit notation), 7 listed as unresolved, none forced into a domain`, () => {
      const rows = get();
      const bySeries = new Map<string, string | null>();
      for (const r of rows) bySeries.set(key(r), r.classification.status === "matched" ? r.classification.metricId : null);
      expect(Object.fromEntries([...bySeries].filter(([, v]) => v))).toEqual(MATCHED);
      expect([...bySeries].filter(([, v]) => !v).map(([k]) => k).sort()).toEqual([...UNRESOLVED].sort());
      const domains: Record<string, number> = {};
      for (const id of Object.values(MATCHED)) {
        const r = rows.find((x) => x.classification.status === "matched" && x.classification.metricId === id)!;
        const d = r.classification.status === "matched" ? r.classification.domain : null;
        if (id.startsWith("cv-")) expect(domainForMetric(id)).toBe(d);
        domains[d!] = (domains[d!] ?? 0) + 1;
      }
      expect(domains).toEqual({ cardiovascular: 22, bone: 4, immune: 4, behavioral: 1 });
      // No conversion: every matched row keeps its original unit and value text.
      for (const r of rows) if (r.classification.status === "matched") expect(r.classification.originalUnit).toBe(r.unit);
    });
  it("bulk validation saves only matched rows; every unresolved row stays in the exception queue", () => {
    const { statuses, validatedKeys } = evaluateBulkImport(pdf.rows, [], SCOPE);
    expect(validatedKeys.length).toBe(248);
    const r = reconcileBulkImport(pdf.rows, statuses);
    expect(r).toMatchObject({ validated: 248, unresolved: 56, duplicates: 0 });
    expect(r.exceptions.map((e) => [e.code, e.rows])).toEqual([["unknown_biomarker", 56]]);
    expect(r.summary).toMatch(/^Not complete: 56 of 304 observation\(s\) are unresolved/);
  });
});

const toObservations = (rows: readonly Row[]) =>
  rows.map((r, i) => buildReviewedObservation(r, { id: `p61o-${String(i).padStart(6, "0")}-${r.key}`, recordedAt: "2026-11-10T18:05:00.000Z", scope: SCOPE, duplicateWarningAcknowledged: false }));
const validated = (rows: readonly Row[]) => {
  const keys = new Set(evaluateBulkImport(rows, [], SCOPE).validatedKeys);
  return rows.filter((r) => keys.has(r.key));
};

describe("P61 owner fixtures — encrypted offline storage, duplicates and report", () => {
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  const previous = g.window;
  beforeAll(() => { g.window = g.window ?? {}; });
  afterAll(() => { if (had) g.window = previous; else delete g.window; });

  it("stores the 248 validated rows encrypted and date-only; re-import finds all 248 as duplicates", async () => {
    const store = new InMemoryOfflineMissionStore();
    const saved = toObservations(validated(pdf.rows));
    for (const o of saved) await saveUnifiedObservation(o, store);
    const back = await listUnifiedObservations(SCOPE.missionId, SCOPE.crewMemberId, store);
    expect(back.length).toBe(248);
    expect(back.every((o) => o.datePrecision === "date")).toBe(true);
    expect([...new Set(back.map((o) => o.observedAt))].sort()).toEqual(DATES);
    const cipher = store.encryptedSnapshot().map((r) => new TextDecoder().decode(Uint8Array.from(atob(r.ciphertext), (c) => c.charCodeAt(0)))).join("");
    expect(cipher).not.toContain("Sodium");
    expect((await store.listQueueItems()).length).toBe(0);
    const again = reconcileBulkImport(pdf.rows, evaluateBulkImport(pdf.rows, back, SCOPE).statuses);
    expect(again).toMatchObject({ duplicates: 248, validated: 0, unresolved: 56 });
  });

  it("the report receives 8 dates in order and never names data that were not imported", () => {
    const report = premiumFrom(toObservations(validated(pdf.rows)), { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range: { from: "2026-11-01", to: "2026-11-30" } });
    expect(report.census.observations).toBe(248);
    expect(report.census.dates).toEqual(DATES);
    for (const c of report.charts) {
      const days = c.base.points.map((p) => p.day);
      expect([...days].sort()).toEqual(days);
    }
    const titles = report.patterns.patterns.map((p) => p.title);
    // P61.3: body temperature is imported (unit notation UN-1), so "fever" may be named only from an imported
    // temperature at or above the cited 38 °C threshold — never from the source document's narrative.
    const acute = report.patterns.patterns.find((p) => /fever/i.test(p.title));
    expect(acute?.id).toBe("p60-acute-physiology");
    expect(report.rows.filter((x) => x.metricId === "demo:ubt-323050f4").map((x) => x.valueText)).toEqual(["36.7", "37.0", "37.5", "38.8", "38.2", "37.6", "37.1", "36.8"]);
    expect(acute!.headline).toContain("temperature 38.8 °C");
    expect(titles.filter((t) => /fever/i.test(t)).length).toBe(1);
    const by = (id: string) => report.patterns.patterns.find((p) => p.id === id);
    expect(by("p60-hba1c-check")?.priority).toBe("DATA_CHECK");
    expect(by("p60-lipids")?.priority).toBe("MONITORING");
    // vitamin D is now imported (synthetic alias) and provisionally classified, so the title may name it
    expect(by("p60-bone")?.title).toBe("Bone-turnover change and low vitamin D");
  });
});

describe("P61.2 owner fixtures — source context, report wording and deterministic order", () => {
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  const previous = g.window;
  beforeAll(() => { g.window = g.window ?? {}; });
  afterAll(() => { if (had) g.window = previous; else delete g.window; });
  const reportOf = (rows: readonly Row[]) =>
    premiumFrom(toObservations(validated(rows)), { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range: { from: "2026-11-01", to: "2026-11-30" } });

  it("CSV context is kept verbatim as unverified source provenance on every row", () => {
    const csv = csvCells(readFileSync(CSV, "utf8"));
    const ci = csv[0]!.indexOf("context");
    expect(ci).toBeGreaterThan(-1);
    expect(csvRows.length).toBe(csv.length - 1);
    expect(csvRows.every((r) => typeof r.sourceContext === "string" && r.sourceContext.length > 0)).toBe(true);
    csvRows.forEach((r, i) => expect(r.sourceContext).toBe(csv[i + 1]![ci]!.trim()));
    const k = csvRows.find((r) => r.label === "Potassium")!;
    expect(k.sourceContext).toBe("Serum; hemolysis status unknown");
    // The stored observation carries the context only inside the verbatim source excerpt (no new field, no clinical fact).
    const saved = toObservations(validated(csvRows));
    const ks = saved.find((o) => o.metricId === "cv-071")!;
    expect(ks.source.excerpt).toContain("Serum; hemolysis status unknown");
    expect(JSON.stringify(ks)).not.toContain("\"sourceContext\"");
  });

  it("fibrinogen is not called raised without an applicable criterion", () => {
    const p = reportOf(pdf.rows).patterns.patterns.find((x) => x.id === "p60-coagulation")!;
    expect(p.title).toBe("Raised D-dimer; fibrinogen without an applicable criterion");
    expect(p.title).not.toMatch(/raised (acute-phase clotting protein|fibrinogen)/i);
    expect(p.contradicting.join(" ")).not.toMatch(/raised D-dimer and fibrinogen/);
  });

  it("P1NP and CTX are described as their 8-measurement series, never as single measurements", () => {
    const p = reportOf(pdf.rows).patterns.patterns.find((x) => x.id === "p60-bone")!;
    const all = [...p.observed, p.pattern, ...p.contradicting].join("\n");
    expect(all).not.toMatch(/single measurement/);
    expect(all).not.toMatch(/measured only once/);
    expect(p.observed.filter((o) => /^(P1NP|CTX) .*\(8 measurements, 3 Nov–28 Nov;/.test(o)).length).toBe(2);
  });

  it("timing words follow the recorded dates (no 'within one day' / 'next day' for 3–4-day gaps)", () => {
    const ps = reportOf(pdf.rows).patterns.patterns;
    const text = ps.flatMap((p) => [p.pattern, ...p.measurement, ...p.observed]).join("\n");
    expect(text).not.toMatch(/within about one day|fell the next day|two HbA1c results/);
    expect(ps.find((p) => p.id === "p60-hba1c-check")!.measurement[0]).toContain("3.2 percentage points between 6 Nov and 9 Nov (3 days)");
  });

  it("PDF and CSV imports give the same report rows, charts and findings in the same order", () => {
    const a = reportOf(pdf.rows), b = reportOf(csvRows);
    const rowsKey = (r: typeof a) => r.rows.map((x) => `${x.date}|${x.metricId}|${x.valueText}|${x.unit}|${x.displayClass}`);
    expect(rowsKey(a)).toEqual(rowsKey(b));
    expect(a.charts.map((c) => `${c.base.metricId}:${c.base.points.map((p) => p.valueText).join(",")}`)).toEqual(b.charts.map((c) => `${c.base.metricId}:${c.base.points.map((p) => p.valueText).join(",")}`));
    const pat = (r: typeof a) => JSON.stringify(r.patterns.patterns.map((p) => [p.id, p.priority, p.title, p.headline, p.observed, p.pattern]));
    expect(pat(a)).toBe(pat(b));
  });
});
