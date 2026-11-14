import { it } from "bun:test";
import { readFileSync } from "node:fs";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
import { documentLinesFromText } from "@/domain/health-intelligence/document-table-reconstruction";
import { reconstructMultiDateDocument } from "@/domain/health-intelligence/p61-bulk-import";
import { classifyWithGovernedExtensions } from "@/domain/health-intelligence/unknown-biomarker-review";
const M = JSON.parse(readFileSync("/mnt/documents/p72/P72_dry_run_copy_manifest.json", "utf8"));
it("t", async () => {
  const g = await extractPdfGeometry(repoPath("tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf"));
  const md = reconstructMultiDateDocument(documentLinesFromText(g.text, g.linePages, g.geometry));
  const m = md.reconstruction.observations.map((o) => ({ o, c: classifyWithGovernedExtensions({ label: o.label, unit: o.unit, provenance: "synthetic", missionId: "x" } as any).classification })).filter((x) => x.c.status === "matched");
  const orig = M.entries.filter((e: any) => e.documentName.startsWith("Alex_Morgan_Complete") && e.decision === "copy");
  const cnt: Record<string, number> = {};
  for (const x of m) { const k = `${(x.c as any).metricId}|${x.o.value}|${x.o.unit}`; cnt[k] = (cnt[k] ?? 0) + 1; }
  for (const [k, v] of Object.entries(cnt)) { const oc = orig.filter((e: any) => `${e.metricId}|${e.value}|${e.unit}` === k).length; if (v !== oc) console.log(k, "doc", v, "orig", oc, m.filter(x=>`${(x.c as any).metricId}|${x.o.value}|${x.o.unit}`===k).map(x=>x.o.sourceRowNumber+":"+x.o.label).join(", ")); }
  const heldOrig = M.entries.filter((e: any) => e.documentName.startsWith("Alex_Morgan_Complete") && e.decision === "held");
  console.log("held orig metrics", [...new Set(heldOrig.map((e:any)=>e.metricId))].length, heldOrig.slice(0,3).map((e:any)=>e.metricId+"|"+e.value+"|"+e.unit));
  console.log("origDates", [...new Set(orig.map((e:any)=>e.observedAt+"/"+e.datePrecision))]);
});
