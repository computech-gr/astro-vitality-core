import { BONE_HEALTH_VARIABLES } from "./catalog";

export interface BoneImportCandidate {
  variableId: string;
  value: number;
  unit: string;
  observedAt: string;
  sourceLabel: string;
  specimen: string;
  assayMethod: string;
  notes: string;
  selected: boolean;
}
export interface BoneImportReview {
  candidates: BoneImportCandidate[];
  rejected: string[];
}
const MAX_ROWS = 200;
const MAX_CHARS = 250_000;
const headers = ["variable", "value", "unit", "observed_at", "source"];

function csvRows(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quote = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quote) {
      if (c === '"' && input[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') quote = false;
      else cell += c;
    } else if (c === '"') quote = true;
    else if (c === ',') { row.push(cell.trim()); cell = ""; }
    else if (c === '\n') { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else if (c !== '\r') cell += c;
  }
  if (quote) throw new Error("Unclosed CSV quotation.");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function parseBoneImport(text: string): BoneImportReview {
  if (text.length > MAX_CHARS) throw new Error("Import exceeds 250,000 characters.");
  const rows = csvRows(text);
  if (!rows.length) throw new Error("Empty CSV.");
  const names = rows[0]!.map(x => x.toLowerCase());
  if (headers.some(h => !names.includes(h))) throw new Error(`Required CSV headers: ${headers.join(", ")}`);
  if (rows.length - 1 > MAX_ROWS) throw new Error("Maximum 200 results per import.");
  const candidates: BoneImportCandidate[] = []; const rejected: string[] = [];
  const get = (r: string[], k: string) => r[names.indexOf(k)]?.trim() ?? "";
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!; const label = get(r,"variable");
    const matches = BONE_HEALTH_VARIABLES.filter(v => v.id.toLowerCase() === label.toLowerCase() || v.name.toLowerCase() === label.toLowerCase());
    const rawValue = get(r,"value"); const numeric = Number(rawValue);
    const unit = get(r,"unit"), observed = get(r,"observed_at"), source = get(r,"source");
    if (matches.length !== 1 || !rawValue || !Number.isFinite(numeric) || !unit || !source || !observed || !Number.isFinite(Date.parse(observed))) {
      rejected.push(`Row ${i+1}: unmatched/ambiguous variable or invalid value, unit, date, or source.`); continue;
    }
    candidates.push({variableId:matches[0]!.id,value:numeric,unit,observedAt:new Date(observed).toISOString(),sourceLabel:source,specimen:get(r,"specimen"),assayMethod:get(r,"assay_method"),notes:get(r,"notes"),selected:false});
  }
  return {candidates,rejected};
}
export const BONE_IMPORT_CSV_TEMPLATE = 'variable,value,unit,observed_at,source,specimen,assay_method,notes\n';
