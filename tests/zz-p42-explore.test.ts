import { it } from "bun:test";
import { writeFileSync } from "node:fs";
import { extractPdfGeometry, repoPath } from "./documents/p42-pdf-helpers";
import { reconstructDocumentTables, documentLinesFromText } from "@/domain/health-intelligence/document-table-reconstruction";
import { classifyWithGovernedExtensions } from "@/domain/health-intelligence/unknown-biomarker-review";
it("explore", async () => {
  const g = await extractPdfGeometry(repoPath("tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf"));
  const r = reconstructDocumentTables(documentLinesFromText(g.text, g.linePages, g.geometry));
  const cls = r.observations.map(o => classifyWithGovernedExtensions({ label: o.label, unit: o.unit }).classification);
  const counts: Record<string, number> = {};
  cls.forEach(c => counts[c.status] = (counts[c.status] ?? 0) + 1);
  writeFileSync("/tmp/p42/recon.json", JSON.stringify({ ...r, observations: r.observations.map((o, i) => ({ n: o.sourceRowNumber, l: o.label, v: o.rawValue, nv: o.value, k: o.valueKind, u: o.unit, s: o.section.heading, d: o.section.domain, p: o.page, c: o.confidence, iss: o.issues.map(x => x.code), rep: o.repeat, cls: cls[i]!.status, m: (cls[i] as any).metricId ?? (cls[i] as any).candidateMetricIds })) }, null, 1));
  console.log(r.observations.length, JSON.stringify(counts), JSON.stringify(r.sections), JSON.stringify(r.rowNumbers), r.decimalConvention, JSON.stringify(r.identity), r.headers.length);
});
