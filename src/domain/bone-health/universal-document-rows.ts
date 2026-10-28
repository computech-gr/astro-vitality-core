/** P33: Conservative layout-independent extraction of explicitly identified rows.
 * Only catalog-ID anchored lines with a verifiable analyte and a unique value/unit
 * are promoted to review candidates. No inferred dates, units or clinical meaning.
 *
 * Two layouts are supported:
 *  - Header-mapped tables: a header row naming result/unit/date/reference/ID
 *    columns (English or Greek labels) binds each following row by column
 *    position, so column order may vary. Reference-range columns are captured
 *    but never used as measurements; full ISO datetimes in an explicit date
 *    column prefill the observation instant, anything weaker stays for review.
 *  - ID-anchored rows: an exact catalog ID at line start, the catalog analyte,
 *    then one numeric result followed by an explicit reported unit.
 *
 * Ambiguous, mismatched or unsupported rows are held with a human-readable
 * reason; nothing is fuzzy-mapped, converted or invented.
 */
import type { MeasurementProfile } from "@/domain/health-measurements/profiles";

export type UniversalRow = {
  variableId: string;
  value: number;
  unit: string;
  rawLine: string;
  trailingContext: string;
  specimen: string;
  observedAt: string;
  page?: number;
};
export type HeldRow = { line: number; reason: string; snippet: string; page?: number };
export type UniversalWarning = { line: number; message: string };

const numeric = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
const unitLike = /^(?=.*[\p{L}%µμ])[\p{L}\p{N}%µμ/^.*+-]+$/u;
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Date-like tokens are report context, never silently an observation instant. */
const dateLike = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
/** Strict full datetime with explicit timezone; the only value allowed to prefill. */
const fullIsoDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/;

export function strictIsoDateTime(value: string): string {
  const match = fullIsoDateTime.exec(value);
  if (!match) return "";
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) return "";
  if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6] ?? 0) > 59) return "";
  if (Number(match[8] ?? 0) > 23 || Number(match[9] ?? 0) > 59) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

type Column = "id" | "analyte" | "result" | "unit" | "date" | "reference" | "specimen" | "ignore";
/** Reviewed header labels only (English + Greek); unknown labels never map a column. */
const HEADER_LABELS: Record<Column, readonly string[]> = {
  id: ["id", "code", "catalog id", "test id", "test code", "variable", "κωδικός"],
  analyte: ["analyte", "test", "parameter", "measurement", "metric", "εξέταση"],
  result: ["result", "value", "reading", "αποτέλεσμα", "τιμή"],
  unit: ["unit", "units", "μονάδα"],
  date: ["date", "collected", "collection date", "observed", "observation date", "timestamp", "ημερομηνία"],
  reference: ["reference", "reference range", "reference interval", "normal range", "range", "ref range", "τιμές αναφοράς"],
  specimen: ["specimen", "sample", "modality", "δείγμα"],
};
const COLUMNS = Object.keys(HEADER_LABELS) as Array<Exclude<Column, "ignore">>;

function detectHeader(cells: string[]): Column[] | null {
  const columns: Column[] = cells.map((cell) => {
    const n = normalize(cell);
    return COLUMNS.find((col) => HEADER_LABELS[col].includes(n)) ?? "ignore";
  });
  const present = new Set(columns.filter((col) => col !== "ignore"));
  if (present.size >= 3 && present.has("result") && present.has("unit") && (present.has("id") || present.has("analyte"))) {
    return columns;
  }
  return null;
}

function catalogLabelsMatch(variableName: string, analyte: string): boolean {
  const labels = [variableName, ...variableName.split(/\s+\/\s+/)].map(normalize).filter((n) => n.length > 2);
  return labels.some((n) => analyte.includes(n) || n.includes(analyte));
}

function splitCells(line: string): string[] {
  return line.includes("|") || line.includes("\t")
    ? line.split(/\s*[|\t]\s*/).map((cell) => cell.trim()).filter(Boolean)
    : line.split(/\s+/).filter(Boolean);
}

export function extractUniversalDocumentRows(
  text: string,
  profile: MeasurementProfile,
  linePages?: number[],
): { rows: UniversalRow[]; warnings: UniversalWarning[]; held: HeldRow[] } {
  const rows: UniversalRow[] = [];
  const warnings: UniversalWarning[] = [];
  const held: HeldRow[] = [];
  const idPattern = new RegExp(`^(${profile.idPrefix}-\\d{3})\\b\\s*(.*)$`, "i");
  let header: Column[] | null = null;
  for (const [index, original] of text.split(/\r?\n/).slice(0, 1000).entries()) {
    const line = original.trim();
    const page = linePages?.[index];
    if (!line) { header = null; continue; }
    const cells = splitCells(line);
    // Header detection runs first: a header naming a reference-interval column
    // must bind the table, while the same words in a data row refuse the row.
    const detected = detectHeader(cells);
    if (detected) { header = detected; continue; }
    const idMatch = line.match(idPattern);
    // Comparison symbols or reference-interval prose are never measurements.
    if (/[<>≤≥]/.test(line) || /\b(?:reference range|reference interval|normal range)\b/i.test(line)) {
      if (idMatch) held.push({ line: index + 1, reason: "comparison symbols or reference-interval content; never a measurement", snippet: line, page });
      continue;
    }
    if (header) {
      // Header-mapped table row: columns bind by position, in any order.
      const columnOf = (col: Column) => header!.indexOf(col);
      const get = (col: Column) => {
        const at = columnOf(col);
        return at >= 0 ? (cells[at] ?? "").trim() : "";
      };
      const idCell = get("id");
      const looksLikeRow = idCell || cells.some((cell) => numeric.test(cell));
      if (looksLikeRow && cells.length !== header.length) {
        held.push({ line: index + 1, reason: `column count (${cells.length}) differs from the table header (${header.length}); manual mapping required`, snippet: line, page });
        continue;
      }
      if (looksLikeRow && cells.length === header.length) {
        const variable = profile.variables.find((v) => v.id.toLowerCase() === idCell.toLowerCase());
        if (!variable) {
          held.push({ line: index + 1, reason: idCell ? `unknown catalog ID "${idCell}"` : "row has no catalog ID; manual mapping required", snippet: line, page });
          continue;
        }
        const analyte = normalize(get("analyte"));
        if (!analyte || !catalogLabelsMatch(variable.name, analyte)) {
          held.push({ line: index + 1, reason: "catalog ID/analyte mismatch; manual review required", snippet: line, page });
          continue;
        }
        const resultCell = get("result");
        const unit = get("unit");
        if (!numeric.test(resultCell)) {
          held.push({ line: index + 1, reason: "result is not a single finite number", snippet: line, page });
          continue;
        }
        if (!unit || !unitLike.test(unit) || /[<>≤≥|]/.test(unit)) {
          held.push({ line: index + 1, reason: "reported unit missing or invalid", snippet: line, page });
          continue;
        }
        const catalogUnit = profile.catalogUnit?.(variable.id);
        if (catalogUnit && unit !== catalogUnit) {
          held.push({ line: index + 1, reason: `reported unit "${unit}" differs from catalog unit "${catalogUnit}"; confirm manually — never converted`, snippet: line, page });
          continue;
        }
        const dateCell = get("date");
        let observedAt = "";
        const context: string[] = [];
        if (dateCell) {
          // Wrapped date cells may rejoin with inner spaces; only a complete
          // strict ISO datetime with timezone may prefill, never a bare date.
          const strict = strictIsoDateTime(dateCell.replace(/\s+/g, ""));
          if (strict) observedAt = strict;
          else context.push(`Reported date "${dateCell}" is not a complete timestamp; observation time requires review`);
        }
        rows.push({
          variableId: variable.id,
          value: Number(resultCell.replace(",", ".")),
          unit,
          rawLine: original,
          trailingContext: context.join(" "),
          specimen: get("specimen"),
          observedAt,
          page,
        });
        continue;
      }
      // Non-row line under a header (footer, note): end the table on prose.
      if (!cells.some((cell) => numeric.test(cell))) header = null;
      continue;
    }
    if (!idMatch) continue;
    const variable = profile.variables.find((v) => v.id.toLowerCase() === idMatch[1]?.toLowerCase());
    if (!variable) { warnings.push({ line: index + 1, message: `Line ${index + 1}: unknown catalog ID.` }); continue; }
    const rest = (idMatch[2] ?? "").replace(/\s*[|\t]\s*/g, " ");
    const restCells = rest.split(/\s+/).filter(Boolean);
    // Prefer the first numeric token followed by an explicit unit; later numbers
    // (date, time, range, accession) are preserved as context, never a result.
    const choices = restCells.flatMap((cell, i) => (numeric.test(cell) && unitLike.test(restCells[i + 1] ?? "") ? [i] : []));
    if (!choices.length) { warnings.push({ line: index + 1, message: `Line ${index + 1}: explicit result and unit not found.` }); continue; }
    const at = choices[0]!;
    const analyte = normalize(restCells.slice(0, at).join(" "));
    if (!analyte || !catalogLabelsMatch(variable.name, analyte)) {
      warnings.push({ line: index + 1, message: `Line ${index + 1}: catalog ID/analyte mismatch; manual review required.` });
      continue;
    }
    if (choices.length > 1 && choices[1]! < at + 3) { warnings.push({ line: index + 1, message: `Line ${index + 1}: ambiguous numeric results.` }); continue; }
    const unit = restCells[at + 1]!;
    const catalogUnit = profile.catalogUnit?.(variable.id);
    if (catalogUnit && unit !== catalogUnit) {
      held.push({ line: index + 1, reason: `reported unit "${unit}" differs from catalog unit "${catalogUnit}"; confirm manually — never converted`, snippet: line, page });
      continue;
    }
    const value = Number(restCells[at]!.replace(",", "."));
    if (!Number.isFinite(value)) continue;
    // Reported specimen/modality keeps only the tokens before the first
    // date-like token; the date and everything after it stay uninterpreted.
    const trailing = restCells.slice(at + 2);
    const dateIndex = trailing.findIndex((cell) => dateLike.test(cell));
    const specimen = (dateIndex >= 0 ? trailing.slice(0, dateIndex) : trailing).join(" ");
    const trailingContext = (dateIndex >= 0 ? trailing.slice(dateIndex) : []).join(" ");
    rows.push({ variableId: variable.id, value, unit, rawLine: original, trailingContext, specimen, observedAt: "", page });
  }
  return { rows, warnings, held };
}
