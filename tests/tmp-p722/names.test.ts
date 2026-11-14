import { it } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { getActiveCatalog } from "@/domain/health-intelligence/active-catalog-runtime";
it("n", () => {
  const c: any = getActiveCatalog();
  console.log(Object.keys(c)); const s:any = (c.entries ?? c.metrics ?? c.catalog ?? Object.values(c)[0]); console.log(JSON.stringify(Array.isArray(s)? s[0] : s console.log(Object.keys(c));console.log(Object.keys(c)); Object.values(s)[0]).slice(0,400));
  const M = JSON.parse(readFileSync("/mnt/documents/p72/P72_dry_run_copy_manifest.json", "utf8"));
  const list: any[] = c.entries ?? c.metrics ?? [];
  const byId = new Map<string, any>();
  for (const e of (Array.isArray(list) ? list : Object.values(list))) byId.set(e.id ?? e.metricId, e);
  const rows = M.entries.filter((e: any) => e.decision === "copy").map((e: any) => { const x = byId.get(e.metricId); return [e.documentName, e.documentSha256, e.metricId, x?.name ?? x?.label ?? x?.displayName ?? "", e.value, e.unit, e.observedAt, e.datePrecision]; });
  rows.sort((a: any, b: any) => a[0].localeCompare(b[0]) || String(a[6]).localeCompare(String(b[6])) || a[2].localeCompare(b[2]));
  const esc = (v: any) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  writeFileSync("/tmp/p722/expected.csv", ["document,document_sha256,metric_id,catalog_name,value,unit,observed_at,date_precision", ...rows.map((r: any) => r.map(esc).join(","))].join("\n") + "\n");
  console.log(rows.length, rows.slice(0, 2));
});
