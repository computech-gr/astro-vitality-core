import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  geometryLinesToText,
  reconstructGeometryLines,
  type PdfTextItem,
} from "@/domain/bone-health/pdf-geometry";

/** Repository path relative to this file (never a fixed checkout path). */
export const repoPath = (...parts: string[]) =>
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", ...parts);

/** Same PDF.js text-item geometry path as the browser extractor (extractBoneDocument). */
export async function extractPdfGeometry(path: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const doc = await task.promise;
  try {
    const items: PdfTextItem[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        items.push({
          str: item.str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          width: "width" in item && typeof item.width === "number" ? item.width : 0,
          height:
            "height" in item && typeof item.height === "number" && item.height > 0
              ? item.height
              : 10,
          page: i,
        });
      }
    }
    const lines = reconstructGeometryLines(items);
    return {
      pages: doc.numPages,
      text: geometryLinesToText(lines),
      linePages: lines.map((l) => l.page),
      geometry: lines,
    };
  } finally {
    await task.destroy();
  }
}
