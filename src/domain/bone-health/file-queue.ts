import { BONE_MEASUREMENT_PROFILE, type MeasurementProfile } from "@/domain/health-measurements/profiles";
import { parseBoneImport, type BoneImportCandidate } from "./import";
import { extractBoneDocument, parseBoneCorrectedText } from "./document-extraction";
import { findPotentialDuplicates, validateBoneEntry, type BoneHealthEntry } from "./history";

export const BONE_FILE_ACCEPT = ".csv,.pdf,.png,.jpg,.jpeg,.webp";
export const MAX_BONE_FILES = 10;
export const BONE_FILE_TIMEOUT_MS = 90_000;
export type ReviewRow = BoneImportCandidate & { id: string; rawLine?: string; saved?: boolean; page?: number | undefined; provenance?: "local" | "ai" };
/** P33: per-file extraction diagnostics for the human review panel. */
export type ReviewDiagnostics = { method: string; pages: number; matched: number; held: number; rejected: number; warnings: number; sourceName: string };
export type FileReview = { rows: ReviewRow[]; errors: string[]; text: string; method: string; diagnostics?: ReviewDiagnostics; aiStatus?: string };
export type QueueItem = {
  id: string; name: string; kind: string; file: File | undefined;
  status: "queued" | "processing" | "review" | "error" | "cancelled";
  detail: string; review?: FileReview;
};
export function boneFileIssue(file: Pick<File, "name" | "size">): string | null {
  if (!/\.(csv|pdf|png|jpe?g|webp)$/i.test(file.name)) return "Unsupported file type. Use CSV, PDF, PNG, JPG, JPEG or WebP.";
  const limit = /\.csv$/i.test(file.name) ? 2_000_000 : 12_000_000;
  return file.size > limit ? `File exceeds ${limit / 1_000_000} MB limit.` : null;
}
export async function processBoneFile(file: File, signal: AbortSignal, profile: MeasurementProfile = BONE_MEASUREMENT_PROFILE): Promise<FileReview> {
  const issue = boneFileIssue(file);
  if (issue) throw new Error(issue);
  signal.throwIfAborted();
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    signal.throwIfAborted();
    const result = parseBoneImport(text, profile);
    return { rows: result.candidates.map(row => ({ ...row, id: crypto.randomUUID() })), errors: result.rejected.length ? result.rejected : result.candidates.length ? [] : ["CSV contains no measurement rows."], text, method: "CSV parsing" };
  }
  const result = await extractBoneDocument(file, signal);
  signal.throwIfAborted();
  const parsed = parseBoneCorrectedText(result.text, file.name, profile, result.linePages);
  const heldMessages = parsed.held.map(row => `Held for manual review (line ${row.line}${row.page ? `, page ${row.page}` : ""}): ${row.reason} — "${row.snippet.slice(0, 120)}"`);
  return {
    rows: parsed.matches.map(row => ({ ...row, id: crypto.randomUUID() })),
    errors: [...result.warnings, ...parsed.errors, ...heldMessages],
    text: result.text,
    method: `${result.method} · ${result.pages} page(s)`,
    diagnostics: { method: result.method, pages: result.pages, matched: parsed.matches.length, held: parsed.held.length, rejected: parsed.errors.length, warnings: result.warnings.length, sourceName: file.name },
  };
}

/** One active parser/OCR job; cancellation never publishes late results. */
export class BoneFileQueue {
  items: QueueItem[] = [];
  private controller: AbortController | undefined;
  private running = false;
  private disposed = false;
  constructor(private changed: (items: QueueItem[]) => void, private process: (file: File, signal: AbortSignal) => Promise<FileReview> = processBoneFile) {}
  restore(items: QueueItem[]) { this.items = items; this.publish(); }
  private publish() { if (!this.disposed) this.changed([...this.items]); }
  add(files: File[]) {
    const available = MAX_BONE_FILES - this.items.length;
    for (const file of files.slice(0, Math.max(0, available))) {
      const issue = boneFileIssue(file);
      this.items.push({ id: crypto.randomUUID(), name: file.name, kind: file.name.split(".").pop()?.toUpperCase() ?? "Unknown", file: issue ? undefined : file, status: issue ? "error" : "queued", detail: issue ?? "Waiting for local processing" });
    }
    this.publish(); void this.pump();
    return Math.max(0, files.length - Math.max(0, available));
  }
  cancel(id: string) {
    const item = this.items.find(item => item.id === id);
    if (!item || (item.status !== "queued" && item.status !== "processing")) return;
    if (item.status === "processing") this.controller?.abort();
    item.status = "cancelled"; item.detail = "Cancelled; nothing saved"; item.file = undefined;
    this.publish();
  }
  remove(id: string) { this.cancel(id); this.items = this.items.filter(item => item.id !== id); this.publish(); }
  update(id: string, review: FileReview) { const item = this.items.find(item => item.id === id); if (item) { item.review = review; item.detail = `${review.method} · ${review.rows.filter(row => row.saved).length} saved · ${review.rows.filter(row => !row.saved).length} awaiting review`; this.publish(); } }
  dispose() { this.disposed = true; this.controller?.abort(); this.items = []; }
  private async pump() {
    if (this.running || this.disposed) return;
    this.running = true;
    try {
      while (!this.disposed) {
        const item = this.items.find(item => item.status === "queued");
        if (!item?.file) break;
        const controller = new AbortController(); this.controller = controller;
        item.status = "processing"; item.detail = "Processing locally; if incomplete, bounded extracted text may be sent to the authorized AI extraction service — never the original file"; this.publish();
        const timeout = setTimeout(() => controller.abort(new Error("Local processing timed out after 90 seconds. Use CSV or manual entry.")), BONE_FILE_TIMEOUT_MS);
        try {
          const process = this.process(item.file, controller.signal);
          const review = await new Promise<FileReview>((resolve, reject) => {
            const abort = () => reject(controller.signal.reason ?? new Error("Cancelled"));
            controller.signal.addEventListener("abort", abort, { once: true });
            process.then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", abort));
          });
          controller.signal.throwIfAborted();
          if (item.status === "processing" && !this.disposed) {
            item.review = review; item.status = "review"; item.detail = `${review.method} · ${review.rows.length} unchecked measurement(s)`;
          }
        } catch (error) {
          if (item.status === "processing" && !this.disposed) {
            item.status = "error"; item.detail = error instanceof Error ? error.message : "Unable to process file.";
          }
        } finally { clearTimeout(timeout); item.file = undefined; this.controller = undefined; this.publish(); }
      }
    } finally { this.running = false; }
  }
}

export function reviewedBoneEntries(rows: ReviewRow[], scope: Pick<BoneHealthEntry, "missionId" | "crewMemberId" | "dataOrigin">, profile: MeasurementProfile = BONE_MEASUREMENT_PROFILE): BoneHealthEntry[] {
  return rows.filter(row => row.selected && !row.saved).map(row => {
    const { selected: _selected, saved: _saved, rawLine: _line, ...candidate } = row;
    const entry = { ...candidate, ...scope };
    const issue = validateBoneEntry(entry, profile);
    if (issue) throw new Error(issue);
    return entry;
  });
}
export function duplicateBoneImportIds(entries: BoneHealthEntry[], history: BoneHealthEntry[]): string[] {
  const seen = [...history];
  return entries.filter(entry => {
    const duplicate = findPotentialDuplicates(seen.filter(row => row.dataOrigin === entry.dataOrigin && row.missionId === entry.missionId && row.crewMemberId === entry.crewMemberId).map(row => ({ ...row, observedAt: new Date(row.observedAt).toISOString() })), { ...entry, observedAt: new Date(entry.observedAt).toISOString() }).length > 0;
    seen.push(entry); return duplicate;
  }).map(entry => entry.id);
}
/** Stable IDs plus immediate successful-row receipts prevent partial-save retries. */
export async function persistReviewedBoneEntries(entries: BoneHealthEntry[], save: (entry: BoneHealthEntry) => Promise<void>, receipt: (id: string) => void) {
  for (const entry of entries) { await save(entry); receipt(entry.id); }
}