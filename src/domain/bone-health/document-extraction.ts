import { BONE_MEASUREMENT_PROFILE, catalogIdPattern, type MeasurementProfile } from "@/domain/health-measurements/profiles";
import { parseBoneImport, type BoneImportCandidate } from "./import";

import { getLocalOcrAssets } from "./ocr-readiness";
import { reconstructGeometryLines, geometryLinesToText, type PdfTextItem } from "./pdf-geometry";
import { extractUniversalDocumentRows, type HeldRow } from "./universal-document-rows";

export type ExtractedDocument = { text: string; pages: number; method: string; warnings: string[]; linePages: number[] };
type Detector = { detect(image: ImageBitmap | HTMLCanvasElement): Promise<Array<{rawValue?: string}>> };
type DetectorConstructor = new () => Detector;

// All report pixels remain in the browser. Tesseract's default worker/language
// resources may be downloaded on first use: this is NOT guaranteed offline-ready.
async function recognize(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const detector = (globalThis as typeof globalThis & { TextDetector?: DetectorConstructor }).TextDetector;
  if (detector) {
    try {
      const detected = (await new detector().detect(canvas)).map(x => x.rawValue ?? "").join("\n");
      if (detected.trim()) return detected;
    } catch { /* Fall back to WASM OCR; never upload a report. */ }
  }
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | undefined;
  const abort = () => { void worker?.terminate(); };
  signal?.addEventListener("abort", abort, { once: true });
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
    signal?.throwIfAborted();
    const result = await worker.recognize(canvas);
    signal?.throwIfAborted();
    if (!result.data.text.trim()) throw new Error("OCR returned no readable text.");
    return result.data.text;
  } catch (error) {
    throw new Error(`On-device OCR unavailable: ${error instanceof Error ? error.message : "unknown failure"}. First use may require a network connection to fetch OCR language resources. Use CSV or manual entry if unavailable.`);
  } finally {
    signal?.removeEventListener("abort", abort);
    if (worker) await worker.terminate();
  }
}

export async function extractBoneDocument(file: File, signal?: AbortSignal): Promise<ExtractedDocument> {
  signal?.throwIfAborted();
  if (file.size > 12_000_000) throw new Error("Document exceeds 12 MB limit.");
  const warnings: string[] = [];
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const loadParams = { data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false };
    // pdfjs-dist v6: destroy() lives on the loading task, not on the document proxy.
    const loadingTask = pdfjs.getDocument(loadParams);
    const abort = () => { void loadingTask.destroy(); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const document = await loadingTask.promise;
      signal?.throwIfAborted();
      if (document.numPages > 12) throw new Error("PDF exceeds 12-page limit.");
      const sections: string[] = [];
      const linePages: number[] = [];
      for (let index=1; index<=document.numPages; index++) {
        signal?.throwIfAborted();
        const page = await document.getPage(index);
        const content = await page.getTextContent();
        // P33: rebuild rows and column gaps from text-item geometry (x/y/page)
        // instead of trusting concatenated strings; wrapped cells are merged.
        const items: PdfTextItem[] = [];
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          items.push({
            str: item.str,
            x: item.transform[4] ?? 0,
            y: item.transform[5] ?? 0,
            width: "width" in item && typeof item.width === "number" ? item.width : 0,
            height: "height" in item && typeof item.height === "number" && item.height > 0 ? item.height : 10,
            page: index,
          });
        }
        let text = "";
        if (items.length) {
          const geometryLines = reconstructGeometryLines(items);
          text = geometryLinesToText(geometryLines);
          linePages.push(...geometryLines.map(line => line.page));
        }
        if (!text.trim()) {
          const viewport = page.getViewport({scale: 1.7});
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas rendering is unavailable.");
          await page.render({canvas,canvasContext:context,viewport}).promise;
          text = await recognize(canvas, signal);
          linePages.push(...text.split("\n").map(() => index));
          warnings.push(`Page ${index}: on-device OCR used; check every character and decimal separator.`);
        }
        sections.push(text);
      }
      return {text:sections.join("\n"),pages:document.numPages,method:warnings.length?"PDF text (geometry) + on-device OCR":"PDF selectable text (geometry)",warnings,linePages};
    } finally { signal?.removeEventListener("abort", abort); await loadingTask.destroy(); }
  }
  if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 20_000_000) throw new Error("Image resolution exceeds 20 megapixels.");
      const canvas = window.document.createElement("canvas");
      canvas.width=bitmap.width; canvas.height=bitmap.height;
      const ctx=canvas.getContext("2d"); if(!ctx) throw new Error("Canvas unavailable.");
      ctx.drawImage(bitmap,0,0);
      const text = await recognize(canvas, signal);
      return {text,pages:1,method:"on-device OCR",warnings:["OCR can misread numbers and units. Verify against the original report."],linePages:text.split("\n").map(()=>1)};
    } finally {bitmap.close();}
  }
  throw new Error("Only PDF, PNG, JPEG and WebP documents are supported.");
}

export type DocumentMatch = BoneImportCandidate & { rawLine: string; reviewRequired: true; page?: number | undefined };

// Only exact catalog names or their explicitly written slash-separated variants.
// Do not infer clinical synonyms, ranges, inequalities, or missing units.
function normalizedLabel(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}
function catalogLabels(name: string): string[] {
  return [name, ...name.split(/\s+\/\s+/)].map(normalizedLabel).filter(x => x.length >= 3);
}
const resultPattern = /^\s*(?:[:=]|[-–—]|\s)+\s*([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s+([^\s;|]+)(?:\s|$)/;

export function suggestBoneDocumentMatches(text: string, source: string, profile: MeasurementProfile = BONE_MEASUREMENT_PROFILE): DocumentMatch[] {
  return parseBoneCorrectedText(text, source, profile).matches;
}

/** Supported layouts: exact ID/name + value + reported unit, pipe/tab tables, header-mapped tables, or template CSV. */
export function parseBoneCorrectedText(text: string, source: string, profile: MeasurementProfile = BONE_MEASUREMENT_PROFILE, linePages?: number[]): { matches: DocumentMatch[]; errors: string[]; held: HeldRow[] } {
  if (text.length > 100000) return { matches: [], errors: ["Extracted text exceeds 100,000 characters."], held: [] };
  if (/^\s*variable\s*,/i.test(text)) {
    try {
      const parsed = parseBoneImport(text, profile);
      return { matches: parsed.candidates.map(row => ({ ...row, rawLine: "Corrected CSV", reviewRequired: true })), errors: parsed.rejected.length ? parsed.rejected : parsed.candidates.length ? [] : ["CSV contains no measurement rows."], held: [] };
    } catch (error) { return { matches: [], errors: [error instanceof Error ? error.message : "Invalid CSV."], held: [] }; }
  }
  // P33: preserve strict legacy paths, but support document tables whose
  // value/unit are followed by report metadata, timestamps or other columns.
  // Rows remain unchecked and without an inferred observation date.
  const universal = extractUniversalDocumentRows(text, profile, linePages);
  const universalMatches: DocumentMatch[] = universal.rows.map(row => ({
    variableId: row.variableId, value: row.value, unit: row.unit,
    observedAt: row.observedAt, sourceLabel: row.reportedSource || source, specimen: row.specimen, assayMethod: "",
    notes: row.trailingContext
      ? `Document context (not interpreted): ${row.trailingContext}`
      : "Extracted from document; verify source and observation time.",
    selected: false, rawLine: row.rawLine, reviewRequired: true, page: row.page,
  }));
  const lines = text.split(/\r?\n/).slice(0, 1000);
  const found: DocumentMatch[] = [...universalMatches];
  const universalLines = new Set(universal.rows.map(r => r.rawLine));
  const errors: string[] = [];
  // Lines the legacy paths matched or rejected; universal warnings for those
  // lines are suppressed so one line never produces duplicate diagnostics.
  const legacyTouched = new Set<number>();
  for (const [index, line] of lines.entries()) {
    if (universalLines.has(line)) continue;
    // Refuse report lines with comparison symbols, reference intervals or multi-result layouts.
    if (/[<>≤≥]/.test(line) || /\b(?:reference range|reference interval|normal range)\b/i.test(line)) continue;
    // PDF text often uses whitespace columns: ID, analyte, value, unit, specimen.
    // Only a catalog ID at the beginning of a row may trigger this path.
    // Metadata (e.g. Report ID) and prose containing an ID are never measurements.
    const idRow = line.replace(/\s*[|\t]\s*/g, " ").trim().match(catalogIdPattern(profile));
    const idCode = idRow?.[1]; const idRest = idRow?.[2];
    const cells = idRest ? idRest.trim().split(/\s+/) : [];
    const numericCell = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
    // ID-led rows with an analyte column (ID, analyte, value, unit, specimen). Rows
    // with the value directly after the ID use the existing exact-ID path below.
    if (idCode && cells.length > 0 && !numericCell.test(cells[0] ?? "")) {
      const variable = profile.variables.find(v => v.id.toLowerCase() === idCode.toLowerCase());
      if (!variable) { errors.push(`Line ${index + 1}: unknown catalog ID "${idCode}".`); legacyTouched.add(index); continue; }
      const valueAt = cells.findIndex((cell, i) => i > 0 && numericCell.test(cell) && i + 1 < cells.length);
      const valueCell = cells[valueAt]; const unit = cells[valueAt + 1];
      if (valueAt < 1 || valueCell === undefined || unit === undefined) { errors.push(`Line ${index + 1}: measurement value/unit not identified.`); legacyTouched.add(index); continue; }
      const analyte = normalizedLabel(cells.slice(0, valueAt).join(" "));
      // The row must explicitly name the catalog analyte, not merely carry an ID.
      if (!catalogLabels(variable.name).some(label => analyte.includes(label))) {
        errors.push(`Line ${index + 1}: catalog ID and analyte need human confirmation.`); legacyTouched.add(index); continue;
      }
      const value = Number(valueCell.replace(",", "."));
      if (!Number.isFinite(value) || !/[\p{L}%µμ]/u.test(unit) || /[<>≤≥|]/.test(unit)) { errors.push(`Line ${index + 1}: invalid value/unit.`); legacyTouched.add(index); continue; }
      const specimen = cells.slice(valueAt + 2).join(" ");
      found.push({ variableId: variable.id, value, unit, observedAt: "", sourceLabel: source, specimen, assayMethod: "", notes: "Extracted from document; verify source and observation time.", selected: false, rawLine: line, reviewRequired: true, page: linePages?.[index] });
      legacyTouched.add(index);
      continue;
    }
    const tableLine = line.replace(/\s*[|\t]\s*/g, " ").trim();
    const normalized = normalizedLabel(tableLine);
    const candidates = profile.variables.flatMap(v => [normalizedLabel(v.id), ...catalogLabels(v.name)].map(label => ({v, label})))
      .filter(({label}) => normalized.startsWith(label) && /[\s:=–—-]/.test(normalized.charAt(label.length)));
    const ids = new Set(candidates.map(c => c.v.id));
    if (ids.size !== 1) {
      if (new RegExp(`^\\s*${profile.idPrefix}-\\d+\\b`, "i").test(line)) { errors.push(`Line ${index + 1}: unknown or ambiguous catalog ID.`); legacyTouched.add(index); }
      continue; // Ambiguous labels are never auto-mapped.
    }
    const chosen = candidates.sort((a,b) => b.label.length - a.label.length)[0];
    if (!chosen) continue;
    // Match against original line using the same Unicode-normalized label length.
    const original = tableLine.normalize("NFKC").trim();
    const remainder = original.slice(chosen.label.length);
    const parsed = remainder.match(resultPattern);
    if (!parsed?.[1] || !parsed[2]) { errors.push(`Line ${index + 1}: finite numeric value and reported unit are required.`); legacyTouched.add(index); continue; }
    const value = Number(parsed[1].replace(",", "."));
    const unit = parsed[2];
    if (!Number.isFinite(value) || !/[\p{L}%µμ]/u.test(unit) || /[<>≤≥|]/.test(unit)) { errors.push(`Line ${index + 1}: invalid value or reported unit.`); legacyTouched.add(index); continue; }
    // Do not consume additional numeric columns as a result or infer reference intervals.
    const tail = remainder.slice((parsed.index ?? 0) + parsed[0].length).trim();
    if (tail && /\d/.test(tail)) { errors.push(`Line ${index + 1}: unsupported extra numeric columns; use corrected CSV with explicit fields.`); legacyTouched.add(index); continue; }
    found.push({variableId:chosen.v.id,value,unit,observedAt:"",sourceLabel:source,specimen:"",assayMethod:"",notes:"Extracted from document; requires human review.",selected:false,rawLine:line,reviewRequired:true,page:linePages?.[index]});
    legacyTouched.add(index);
  }
  const universalWarnings = universal.warnings.filter(warning => !legacyTouched.has(warning.line - 1)).map(warning => warning.message);
  const held = universal.held.filter(row => !legacyTouched.has(row.line - 1));
  if (!found.length && !errors.length && !universalWarnings.length && !held.length) errors.push("No supported laboratory rows found. Use exact catalog ID/name followed by value and unit, a tab/pipe table, or the CSV template. Dates and source require human review.");
  if (found.length > 100) errors.push("Maximum 100 document results; remaining rows were not imported.");
  // Restore document line order: universal and legacy matches were collected separately.
  const lineOrder = new Map<string, number>();
  lines.forEach((line, index) => { if (!lineOrder.has(line)) lineOrder.set(line, index); });
  found.sort((a, b) => (lineOrder.get(a.rawLine) ?? 0) - (lineOrder.get(b.rawLine) ?? 0));
  return { matches: found.slice(0,100), errors: [...errors, ...universalWarnings], held };
}
