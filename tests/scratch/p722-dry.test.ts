import { it } from "bun:test";
import { readFileSync } from "node:fs";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
import { documentLinesFromText, DOCUMENT_TABLE_RULES_VERSION } from "@/domain/health-intelligence/document-table-reconstruction";
import { reconstructMultiDateDocument, reviewDateFields } from "@/domain/health-intelligence/p61-bulk-import";
import { rowExtractionEvidence } from "@/domain/health-intelligence/document-intake-review";
import { classifyWithGovernedExtensions } from "@/domain/health-intelligence/unknown-biomarker-review";
import { intakeRowExclusionReason } from "@/domain/health-intelligence/intake-review-selection";

const M = JSON.parse(readFileSync("/mnt/documents/p72/P72_dry_run_copy_manifest.json", "utf8"));
const DOCS: [string, string][] = [
  ["Alex_Morgan_Complete_Examination_2026-11-07.pdf", repoPath("tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf")],
  ["MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf", repoPath("fixtures/synthetic/p614/owner/MITOCHONDRIA_Alex_Morgan_12-13_Nov_2026_SYNTHETIC.pdf")],
  ["NASA_Astronaut_Simulated_Medical_Report.pdf", repoPath("tests/fixtures/p39/NASA_Astronaut_Simulated_Medical_Report.pdf")],
];
it("dry", async () => {
  for (const [name, path] of DOCS) {
    const g = await extractPdfGeometry(path);
    const md = reconstructMultiDateDocument(documentLinesFromText(g.text, g.linePages, g.geometry));
    const rows = md.reconstruction.observations.map((o, i) => {
      const base: any = { provenance: "synthetic", missionId: "mission-3fd366c331ed46afb0645cced1d45294", label: o.label, value: o.value || (o.valueKind === "ambiguous_number" ? "" : o.rawValue), unit: o.unit, ...reviewDateFields(md.dates[i]!), examDate: md.dates[i], extraction: { ...rowExtractionEvidence(o, DOCUMENT_TABLE_RULES_VERSION), proposedValue: o.value }, excerpt: o.excerpt, key: "k" + i, selected: false };
      base.classification = classifyWithGovernedExtensions(base).classification;
      return base;
    });
    const elig = rows.filter((r: any) => intakeRowExclusionReason(r) === null);
    const matched = rows.filter((r: any) => r.classification.status === "matched");
    const reasons: Record<string, number> = {};
    for (const r of matched) { const x = intakeRowExclusionReason(r); if (x) reasons[x] = (reasons[x] ?? 0) + 1; }
    const orig = M.entries.filter((e: any) => e.documentName === name && e.decision === "copy");
    const okey = (e: any) => `${e.metricId}|${e.value}|${e.unit}|${String(e.observedAt).slice(0, 10)}`;
    const mkey = (r: any) => `${r.classification.metricId}|${r.value}|${r.unit}|${String(r.observedAt || "").slice(0, 10)}`;
    const mset = new Set(matched.map(mkey)), mvset = new Set(matched.map((r: any) => `${r.classification.metricId}|${r.value}|${r.unit}`));
    const missing = orig.filter((e: any) => !mset.has(okey(e)));
    const missingNoDate = orig.filter((e: any) => !mvset.has(`${e.metricId}|${e.value}|${e.unit}`));
    const extra = matched.filter((r: any) => !orig.some((e: any) => e.metricId === r.classification.metricId && e.value === r.value && e.unit === r.unit));
    console.log(JSON.stringify({ name, rows: rows.length, dates: md.dates.slice(0,1).map((d:any)=>d.status+":"+(d.value??d.date??"")), matched: matched.length, eligibleNow: elig.length, reasons, orig: orig.length, missing: missing.length, missingIgnoringDate: missingNoDate.map(okey), extra: extra.map((r: any) => `${r.classification.metricId}|${r.label}|${r.value}|${r.unit}|${r.classification.domain}`) }, null, 1));
  }
});
