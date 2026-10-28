import { BONE_HEALTH_VARIABLES } from "./catalog";
import type { QueueItem } from "./file-queue";

export const BONE_IMPORT_SESSION_KEY = "mitochondria.bone-import.synthetic.v1";
export const MAX_BONE_SESSION_CHARS = 500_000;
export type ImportScope = { userId: string; missionId: string; crewMemberId: string; dataOrigin: "real" | "synthetic" };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StoredRow = { id: string; variableId: string; value: number | null; unit: string; observedAt: string; sourceLabel: string; specimen: string; assayMethod: string; notes: string; rawLine?: string; saved?: boolean };
type StoredItem = { id: string; name: string; kind: string; status: string; detail: string; review?: { text: string; method: string; errors: string[]; rows: StoredRow[] } };
const string = (value: unknown, limit: number): value is string => typeof value === "string" && value.length <= limit;

/** Explicit allowlist: never serialize files, approval flags, authorization or consent. */
export function retainBoneImport(storage: StorageLike, scope: ImportScope, items: QueueItem[]) {
  if (scope.dataOrigin !== "synthetic" || !scope.userId || !scope.missionId || !scope.crewMemberId) { storage.removeItem(BONE_IMPORT_SESSION_KEY); return; }
  if (items.some(item => item.review && (item.review.text.length > 100000 || item.review.rows.length > 200 || item.review.errors.length > 250))) { storage.removeItem(BONE_IMPORT_SESSION_KEY); return; }
  const payload = JSON.stringify({ version: 1, scope, items: items.slice(0, 10).map(item => ({
    id: item.id, name: item.name, kind: item.kind, status: item.status, detail: item.detail,
    ...(item.review ? { review: { text: item.review.text, method: item.review.method, errors: item.review.errors, rows: item.review.rows.map(row => ({
      id: row.id, variableId: row.variableId, value: Number.isFinite(row.value) ? row.value : null, unit: row.unit, observedAt: row.observedAt,
      sourceLabel: row.sourceLabel, specimen: row.specimen, assayMethod: row.assayMethod, notes: row.notes, rawLine: row.rawLine, saved: row.saved === true,
    })) } } : {}),
  })) });
  if (payload.length > MAX_BONE_SESSION_CHARS) { storage.removeItem(BONE_IMPORT_SESSION_KEY); return; }
  try { storage.setItem(BONE_IMPORT_SESSION_KEY, payload); } catch { storage.removeItem(BONE_IMPORT_SESSION_KEY); }
}

/** The caller must freshly authorize this exact scope before calling. Storage is not authority. */
export function restoreBoneImport(storage: StorageLike, scope: ImportScope): QueueItem[] {
  try {
    const raw = storage.getItem(BONE_IMPORT_SESSION_KEY);
    if (!raw) return [];
    if (raw.length > MAX_BONE_SESSION_CHARS || scope.dataOrigin !== "synthetic") throw new Error("Invalid scope");
    const data = JSON.parse(raw);
    if (data.version !== 1 || !scope.userId || !scope.missionId || !scope.crewMemberId ||
        Object.keys(scope).some(key => data.scope?.[key] !== scope[key as keyof ImportScope]) || !Array.isArray(data.items) || data.items.length > 10) throw new Error("Invalid session");
    return data.items.map((item: StoredItem) => {
      if (!string(item.id, 100) || !string(item.name, 300) || !string(item.kind, 20) || !string(item.detail, 2000) || !["queued", "processing", "review", "error", "cancelled"].includes(item.status)) throw new Error("Invalid file metadata");
      let review: QueueItem["review"];
      if (item.review) {
        const r = item.review;
        if (!string(r.text, 100000) || !string(r.method, 300) || !Array.isArray(r.errors) || r.errors.length > 250 || r.errors.some((e: unknown) => !string(e, 2000)) || !Array.isArray(r.rows) || r.rows.length > 200) throw new Error("Invalid review");
        review = { text: r.text, method: r.method, errors: r.errors, rows: r.rows.map((row: StoredRow) => {
          if (!string(row.id, 100) || !BONE_HEALTH_VARIABLES.some(v => v.id === row.variableId) || (row.value !== null && (typeof row.value !== "number" || !Number.isFinite(row.value))) ||
              ["unit", "observedAt", "sourceLabel", "specimen", "assayMethod", "notes"].some(key => !string(row[key as keyof StoredRow], key === "notes" ? 10000 : 1000)) || (row.rawLine !== undefined && !string(row.rawLine, 10000))) throw new Error("Invalid row");
          return { id: row.id as string, variableId: row.variableId as string, value: row.value === null ? NaN : row.value as number, unit: row.unit as string, observedAt: row.observedAt as string, sourceLabel: row.sourceLabel as string, specimen: row.specimen as string, assayMethod: row.assayMethod as string, notes: row.notes as string, ...(row.rawLine ? { rawLine: row.rawLine as string } : {}), saved: row.saved === true, selected: false };
        }) };
      }
      return { id: item.id, name: item.name, kind: item.kind, file: undefined, status: review ? "review" : item.status === "cancelled" ? "cancelled" : "error", detail: item.status === "queued" || item.status === "processing" ? "Local processing interrupted; original file is no longer available." : item.detail, ...(review ? { review } : {}) };
    });
  } catch { storage.removeItem(BONE_IMPORT_SESSION_KEY); return []; }
}