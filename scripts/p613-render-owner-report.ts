/**
 * P61.3 — render the P60 Premium Health Intelligence Report from the owner-supplied Alex Morgan SYNTHETIC
 * fixtures (exact PDF and CSV bytes), through the same import pipeline the app uses: extraction → catalog
 * classification (signed MITO_DEMO_2026 demo snapshot copy) → bulk validation → reviewed observations → report.
 * Synthetic test data only; writes PDFs for visual verification. Usage: bun scripts/p613-render-owner-report.ts <outDir>
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { renderPremium, type PremiumWriter } from "../src/domain/health-intelligence/p59-premium-pdf";
import { DOCUMENT_TABLE_RULES_VERSION, documentLinesFromText } from "../src/domain/health-intelligence/document-table-reconstruction";
import { rowExtractionEvidence } from "../src/domain/health-intelligence/document-intake-review";
import { classifyWithGovernedExtensions } from "../src/domain/health-intelligence/unknown-biomarker-review";
import { extractCsvCandidates } from "../src/domain/health-intelligence/universal-intake-parser";
import { loadInstalledDemoCatalogs, SYNTHETIC_DEMO_STORAGE_KEY } from "../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { buildReviewedObservation, evaluateBulkImport, reconstructMultiDateDocument, reviewDateFields, rowDateEvidence } from "../src/domain/health-intelligence/p61-bulk-import";
import { extractPdfGeometry } from "../tests/documents/p42-pdf-helpers";
import { premiumFrom, MITO_DEMO_MISSION_ID } from "../tests/support/p59-fixtures";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? join(ROOT, "p613-preview");
mkdirSync(out, { recursive: true });
(globalThis as { window?: unknown }).window ??= {};
const PDF = join(ROOT, "fixtures/synthetic/p61/MITOCHONDRIA_Alex_Morgan_November_2026_Longitudinal_Exam_Test_SYNTHETIC.pdf");
const CSV = join(ROOT, "fixtures/synthetic/p61/Alex_Morgan_304_Observations.csv");
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const SCOPE = { missionId: MITO_DEMO_MISSION_ID, crewMemberId: "crew-alex", provenance: "synthetic" as const };
const storage = new Map([[SYNTHETIC_DEMO_STORAGE_KEY, readFileSync(join(ROOT, "tests/fixtures/p61-mito-demo-signed-snapshots.v372.json"), "utf8")]]);
await loadInstalledDemoCatalogs({ storage: { get: (k) => storage.get(k) ?? null, set: (k, v) => void storage.set(k, v) } });

let n = 0;
const mk = (p: Record<string, unknown>) => {
  const base = { provenance: "synthetic" as const, missionId: SCOPE.missionId, importedAt: "2026-11-10T18:00:00.000Z", ...p } as never;
  return { ...(base as object), key: `r${++n}`, selected: false, classification: classifyWithGovernedExtensions(base).classification } as never;
};
const g = await extractPdfGeometry(PDF);
const m = reconstructMultiDateDocument(documentLinesFromText(g.text, g.linePages, g.geometry));
const pdfRows = m.reconstruction.observations.map((o, i) => mk({ label: o.label, value: o.value || o.rawValue, unit: o.unit, ...reviewDateFields(m.dates[i]!), examDate: m.dates[i]!, extraction: rowExtractionEvidence(o, DOCUMENT_TABLE_RULES_VERSION), documentSha256: sha(PDF), excerpt: o.excerpt, sourceKind: "pdf_text", sourceLabel: "Document: exam.pdf", documentName: "exam.pdf" }));
const csvRows = extractCsvCandidates(readFileSync(CSV, "utf8"), 1000, { keepUnparsedDates: true }).rows.map((c) => mk({ label: c.label, value: c.value, unit: c.unit, observedAt: c.observedAt, ...(c.datePrecision ? { datePrecision: c.datePrecision } : {}), examDate: rowDateEvidence(c), documentSha256: sha(CSV), excerpt: c.excerpt, sourceKind: "csv", sourceLabel: "CSV: obs.csv", documentName: "obs.csv", ...(c.sourceContext ? { sourceContext: c.sourceContext } : {}) }));
const observations = (rows: never[]) => {
  const keys = new Set(evaluateBulkImport(rows, [], SCOPE).validatedKeys);
  return rows.filter((r: { key: string }) => keys.has(r.key)).map((r, i) => buildReviewedObservation(r, { id: `p61o-${String(i).padStart(6, "0")}-${(r as { key: string }).key}`, recordedAt: "2026-11-10T18:05:00.000Z", scope: SCOPE, duplicateWarningAcknowledged: false }));
};
const fontDir = join(ROOT, "node_modules/pdfjs-dist/standard_fonts");
const fonts = { regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"), bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64") };
const range = { from: "2026-11-01", to: "2026-11-30" };
const crew = process.env.P613_CREW ?? "Alex Morgan — Synthetic Astronaut";
const sets: [string, ReturnType<typeof premiumFrom>][] = [
  ["alex_owner_pdf_demonstration_on", premiumFrom(observations(pdfRows as never[]), { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range, crew })],
  ["alex_owner_csv_demonstration_on", premiumFrom(observations(csvRows as never[]), { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range, crew })],
  ["alex_owner_pdf_demonstration_off", premiumFrom(observations(pdfRows as never[]), { missionId: SCOPE.missionId, scope: SCOPE, range, crew })],
  ["alex_owner_pdf_long_crew_name", premiumFrom(observations(pdfRows as never[]), { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range, crew: "Commander Alexandra Morgan-Fitzgerald-Papadopoulou — Synthetic Astronaut (Backup Crew)" })],
  ["short_crew_name", premiumFrom(observations(pdfRows as never[]), { provisional: true, mappings: true, missionId: SCOPE.missionId, scope: SCOPE, range, crew: "Al" })],
];
for (const [name, r] of sets) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" }) as unknown as PremiumWriter;
  const res = renderPremium(pdf, fonts, r, { fixedDate: "2026-11-10T12:00:00.000Z" });
  const bytes = new Uint8Array(await res.blob.arrayBuffer());
  writeFileSync(join(out, `${name}.pdf`), bytes);
  console.log(`${name}: ${res.pages} pages, ${r.rows.length} observations, ${r.charts.length} charts, ${r.patterns.patterns.length} patterns, sha256 ${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`);
}
