/**
 * P39: deterministic source-section evidence registry for the owner-supplied
 * synthetic MITO_DEMO_2026 source report (tests/fixtures/p39/…pdf, SHA-256
 * bound). Reads the PDF with the same pdf.js text geometry as the app's
 * document import, extracts headings, table context and label/unit row
 * provenance (no values, no patient identity) and writes
 * data/source-evidence/mito-demo-2026-source-sections.v1.json.
 * Run: bun scripts/p39-source-section-evidence.ts           (print coverage)
 *      bun scripts/p39-source-section-evidence.ts --write   (rewrite the registry)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  reconstructGeometryLines,
  geometryLinesToText,
  type PdfTextItem,
} from "../src/domain/bone-health/pdf-geometry";
import {
  compactEvidence,
  extractTextSourceEvidence,
  sectionCoverage,
  SOURCE_SECTION_STATUS,
  type SourceDocumentEvidence,
} from "../src/domain/health-intelligence/source-section-classification";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_PDF = resolve(
  root,
  "tests/fixtures/p39/NASA_Astronaut_Simulated_Medical_Report.pdf",
);
export const REGISTRY_PATH = resolve(
  root,
  "data/source-evidence/mito-demo-2026-source-sections.v1.json",
);

/** Same geometry reconstruction as extractBoneDocument (browser), run with the pdf.js legacy build. */
export async function pdfGeometryText(bytes: Uint8Array) {
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const parts: string[] = [];
  const linePages: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({
        str: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        width: typeof item.width === "number" ? item.width : 0,
        height: typeof item.height === "number" && item.height > 0 ? item.height : 10,
        page: i,
      });
    }
    const lines = reconstructGeometryLines(items);
    parts.push(geometryLinesToText(lines));
    linePages.push(...lines.map((l) => l.page));
  }
  const pages = doc.numPages;
  await task.destroy();
  return { text: parts.join("\n"), linePages, pages };
}

export async function pdfSourceEvidence(path = SOURCE_PDF): Promise<SourceDocumentEvidence> {
  const bytes = new Uint8Array(readFileSync(path));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { text, linePages, pages } = await pdfGeometryText(bytes);
  return extractTextSourceEvidence(
    text,
    { sha256, fileName: basename(path), kind: "pdf", pages },
    linePages,
  );
}

export async function buildRegistry() {
  const doc = compactEvidence(await pdfSourceEvidence());
  return {
    schema: "mitochondria.source-section-evidence-registry.v1",
    status: SOURCE_SECTION_STATUS,
    note: "Derived deterministically from the owner-supplied synthetic source report by scripts/p39-source-section-evidence.ts. Labels, exact units, headings, table context and page/line locations only: no results, dates, flags or identity. Section provenance is classification evidence, never scientific validation, approval or activation.",
    documents: [doc],
  };
}

if (import.meta.main) {
  const registry = await buildRegistry();
  const doc = registry.documents[0]!;
  console.log(doc.sha256, doc.pages, "pages", doc.rows.length, "rows");
  for (const c of sectionCoverage(doc)) console.log(JSON.stringify(c));
  if (process.argv.includes("--write")) {
    mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 1) + "\n");
    console.log(`wrote ${REGISTRY_PATH}`);
  }
}
