/**
 * P60 — render premium-report PDFs for visual verification (synthetic fixtures only).
 * Uses the real jsPDF writer and the Liberation Sans files found under node_modules/pdfjs-dist/standard_fonts.
 * Usage: bun scripts/p60-render-preview.ts <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { renderPremium, type PremiumWriter } from "../src/domain/health-intelligence/p59-premium-pdf";
import { premiumFrom, smallNormal, complexAbnormal, MITO_DEMO_MISSION_ID } from "../tests/support/p59-fixtures";
import { alexNovemberExport, largeSynthetic, missingContextAmbiguous } from "../tests/support/p60-fixtures";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? join(ROOT, "p60-preview");
mkdirSync(out, { recursive: true });
const fontDir = join(ROOT, "node_modules/pdfjs-dist/standard_fonts");
const fonts = { regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"), bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64") };
const demo = { provisional: true, mappings: true, missionId: MITO_DEMO_MISSION_ID };
const sets: [string, () => ReturnType<typeof premiumFrom>][] = [
  ["D1_alex_export_fixture_demonstration", () => premiumFrom(alexNovemberExport(), demo)],
  ["D2_small_normal_demonstration", () => premiumFrom(smallNormal(), demo)],
  ["D3_complex_abnormal_demonstration", () => premiumFrom(complexAbnormal(), demo)],
  ["D6_alex_export_fixture_provisional_off", () => premiumFrom(alexNovemberExport(), { missionId: MITO_DEMO_MISSION_ID })],
  ["D9_large_synthetic_demonstration", () => premiumFrom(largeSynthetic(), demo)],
  ["D10_missing_context_ambiguous_identities_demonstration", () => premiumFrom(missingContextAmbiguous(), demo)],
];
for (const [name, build] of sets) {
  const r = build();
  const pdf = new jsPDF({ unit: "mm", format: "a4" }) as unknown as PremiumWriter;
  const res = renderPremium(pdf, fonts, r, { fixedDate: "2026-11-08T12:00:00.000Z" });
  const bytes = new Uint8Array(await res.blob.arrayBuffer());
  writeFileSync(join(out, `${name}.pdf`), bytes);
  console.log(`${name}: ${res.pages} pages, ${r.rows.length} observations, ${r.patterns.patterns.length} patterns, ${bytes.length} bytes`);
}
