import { BONE_HEALTH_VARIABLES } from "./catalog";
import type { BoneImportCandidate } from "./import";

import { getLocalOcrAssets } from "./ocr-readiness";

export type ExtractedDocument = { text: string; pages: number; method: string; warnings: string[] };
type Detector = { detect(image: ImageBitmap | HTMLCanvasElement): Promise<Array<{rawValue?: string}>> };
type DetectorConstructor = new () => Detector;

// All report pixels remain in the browser. Tesseract's default worker/language
// resources may be downloaded on first use: this is NOT guaranteed offline-ready.
async function recognize(canvas: HTMLCanvasElement): Promise<string> {
  const detector = (globalThis as typeof globalThis & { TextDetector?: DetectorConstructor }).TextDetector;
  if (detector) {
    try {
      const detected = (await new detector().detect(canvas)).map(x => x.rawValue ?? "").join("\n");
      if (detected.trim()) return detected;
    } catch { /* Fall back to WASM OCR; never upload a report. */ }
  }
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | undefined;
  try {
    const { createWorker } = await import("tesseract.js");
    // Use only same-origin, pre-staged OCR resources when a complete offline pack exists.
    // Otherwise retain the P22.5 fallback, explicitly marked as network-dependent.
    const local = await getLocalOcrAssets();
    worker = local
      ? await createWorker("eng", 1, {
          workerPath: local.worker,
          corePath: local.core,
          langPath: local.languageDirectory,
          gzip: true,
        })
      : await createWorker("eng", 1);
    const result = await worker.recognize(canvas);
    if (!result.data.text.trim()) throw new Error("OCR returned no readable text.");
    return result.data.text;
  } catch (error) {
    throw new Error(`On-device OCR unavailable: ${error instanceof Error ? error.message : "unknown failure"}. First use may require a network connection to fetch OCR language resources. Use CSV or manual entry if unavailable.`);
  } finally {
    if (worker) await worker.terminate();
  }
}

export async function extractBoneDocument(file: File): Promise<ExtractedDocument> {
  if (file.size > 12_000_000) throw new Error("Document exceeds 12 MB limit.");
  const warnings: string[] = [];
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const loadParams = { data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false };
    const document = await pdfjs.getDocument(loadParams).promise;
    try {
      if (document.numPages > 12) throw new Error("PDF exceeds 12-page limit.");
      const sections: string[] = [];
      for (let index=1; index<=document.numPages; index++) {
        const page = await document.getPage(index);
        const content = await page.getTextContent();
        let text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
        if (text.trim().length < 30) {
          const viewport = page.getViewport({scale: 1.7});
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas rendering is unavailable.");
          await page.render({canvas,canvasContext:context,viewport}).promise;
          text = await recognize(canvas);
          warnings.push(`Page ${index}: on-device OCR used; check every character and decimal separator.`);
        }
        sections.push(text);
      }
      return {text:sections.join("\n"),pages:document.numPages,method:warnings.length?"PDF text + on-device OCR":"PDF selectable text",warnings};
    } finally { await document.destroy(); }
  }
  if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 20_000_000) throw new Error("Image resolution exceeds 20 megapixels.");
      const canvas = window.document.createElement("canvas");
      canvas.width=bitmap.width; canvas.height=bitmap.height;
      const ctx=canvas.getContext("2d"); if(!ctx) throw new Error("Canvas unavailable.");
      ctx.drawImage(bitmap,0,0);
      return {text:await recognize(canvas),pages:1,method:"on-device OCR",warnings:["OCR can misread numbers and units. Verify against the original report."]};
    } finally {bitmap.close();}
  }
  throw new Error("Only PDF, PNG, JPEG and WebP documents are supported.");
}

export type DocumentMatch = BoneImportCandidate & { rawLine: string; reviewRequired: true };

// Only exact catalog names or their explicitly written slash-separated variants.
// Do not infer clinical synonyms, ranges, inequalities, or missing units.
function normalizedLabel(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}
function catalogLabels(name: string): string[] {
  return [name, ...name.split(/\s+\/\s+/)].map(normalizedLabel).filter(x => x.length >= 3);
}
const resultPattern = /^\s*(?:[:=]|[-–—]|\s)+\s*([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s+([^\s;|]+)(?:\s|$)/;

export function suggestBoneDocumentMatches(text: string, source: string): DocumentMatch[] {
  const lines = text.split(/\r?\n/).slice(0, 1000);
  const found: DocumentMatch[] = [];
  for (const line of lines) {
    // Refuse report lines with comparison symbols, reference intervals or multi-result layouts.
    if (/[<>≤≥]/.test(line) || /\b(?:reference range|reference interval|normal range)\b/i.test(line)) continue;
    const normalized = normalizedLabel(line);
    const candidates = BONE_HEALTH_VARIABLES.flatMap(v => catalogLabels(v.name).map(label => ({v, label})))
      .filter(({label}) => normalized.startsWith(label) && /[\s:=–—-]/.test(normalized.charAt(label.length)));
    const ids = new Set(candidates.map(c => c.v.id));
    if (ids.size !== 1) continue; // matches.length !== 1 is equivalent here // Ambiguous labels are never auto-mapped.
    const chosen = candidates.sort((a,b) => b.label.length - a.label.length)[0]!;
    // Match against original line using the same Unicode-normalized label length.
    const original = line.normalize("NFKC").trim();
    const remainder = original.slice(chosen.label.length);
    const parsed = remainder.match(resultPattern);
    if (!parsed) continue;
    const value = Number(parsed[1]!.replace(",", "."));
    if (!Number.isFinite(value)) continue;
    found.push({variableId:chosen.v.id,value,unit:parsed[2]!,observedAt:"",sourceLabel:source,specimen:"",assayMethod:"",notes:"Extracted from document; human verified.",selected:false,rawLine:line,reviewRequired:true});
  }
  return found.slice(0,100);
}
