import { it } from "bun:test";
import { readFileSync } from "node:fs";
import { extractPdfGeometry, repoPath } from "./documents/p42-pdf-helpers";
import { reconstructDocumentTables, documentLinesFromText } from "@/domain/health-intelligence/document-table-reconstruction";
it("ocr", async () => {
  const g = await extractPdfGeometry(repoPath("tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf"));
  const truth = reconstructDocumentTables(documentLinesFromText(g.text, g.linePages, g.geometry));
  const fx = JSON.parse(readFileSync(repoPath("tests/fixtures/p42/alex-morgan-ocr-tesseract.v1.json"), "utf8"));
  const r = reconstructDocumentTables(fx.lines.map((l: any) => ({ text: l.text, page: l.page })), { ocr: true });
  const t = new Map(truth.observations.map(o => [o.sourceRowNumber, o]));
  let same = 0, diffV = 0, diffL = 0, diffU = 0;
  for (const o of r.observations) { const x = t.get(o.sourceRowNumber); if (!x) continue; if (x.value === o.value && x.label === o.label && x.unit === o.unit) same++; if (x.value !== o.value) diffV++; if (x.label !== o.label) diffL++; if (x.unit !== o.unit) diffU++; }
  console.log(r.observations.length, r.headers.length, JSON.stringify(r.rowNumbers), same, diffV, diffL, diffU, JSON.stringify(r.sections), r.observations.filter(o => o.confidence !== "low").length, r.observations.filter(o=>o.issues.some(i=>i.blocking)).length);
  console.log(JSON.stringify(r.identity.timestampCandidates.map(c=>c.value)), r.identity.patientName);
});
