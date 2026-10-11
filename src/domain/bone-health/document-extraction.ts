import { BONE_HEALTH_VARIABLES } from "./catalog";
import type { BoneImportCandidate } from "./import";

export type ExtractedDocument = { text: string; pages: number; method: string; warnings: string[] };
type Detector = { detect(image: ImageBitmap | HTMLCanvasElement): Promise<Array<{rawValue?: string}>> };
type DetectorConstructor = new () => Detector;

async function recognize(canvas: HTMLCanvasElement): Promise<string> {
  const detector = (globalThis as typeof globalThis & { TextDetector?: DetectorConstructor }).TextDetector;
  if (!detector) throw new Error("Local OCR is unavailable in this browser. Use a selectable-text PDF, CSV, or manual entry. No document was uploaded.");
  return (await new detector().detect(canvas)).map(x => x.rawValue ?? "").join("\n");
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
          warnings.push(`Page ${index}: browser OCR used; check every character and decimal separator.`);
        }
        sections.push(text);
      }
      return {text:sections.join("\n"),pages:document.numPages,method:warnings.length?"PDF text + browser OCR":"PDF selectable text",warnings};
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
      return {text:await recognize(canvas),pages:1,method:"browser OCR",warnings:["OCR can misread numbers and units. Verify against the original report."]};
    } finally {bitmap.close();}
  }
  throw new Error("Only PDF, PNG, JPEG and WebP documents are supported.");
}

export type DocumentMatch = BoneImportCandidate & { rawLine: string; reviewRequired: true };
export function suggestBoneDocumentMatches(text: string, source: string): DocumentMatch[] {
  const lines = text.split(/\r?\n/).slice(0,1000);
  const found: DocumentMatch[] = [];
  for (const line of lines) {
    const normalized = line.toLocaleLowerCase().replace(/\s+/g," ").trim();
    const matches = BONE_HEALTH_VARIABLES.filter(v => v.name.length>=4 && normalized.startsWith(v.name.toLocaleLowerCase()));
    if(matches.length !== 1) continue;
    const remainder=line.slice(matches[0]!.name.length).trim();
    const parsed = remainder.match(/^[:\s-]*([+-]?\d+(?:[.,]\d+)?)\s+([^\s]+)(?:\s|$)/);
    if(!parsed) continue;
    const value = Number(parsed[1]!.replace(",","."));
    if(!Number.isFinite(value)) continue;
    found.push({variableId:matches[0]!.id,value,unit:parsed[2]!,observedAt:"",sourceLabel:source,specimen:"",assayMethod:"",notes:"Extracted from document; human verified.",selected:false,rawLine:line,reviewRequired:true});
  }
  return found.slice(0,100);
}
