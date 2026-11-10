/**
 * P61 automated multi-date bulk examination import (pure, deterministic,
 * browser-safe, offline).
 *
 * One document or grid may hold several examinations. This module proposes an
 * EXAMINATION DATE for every extracted observation from evidence the source
 * states explicitly — a date on the row itself, a date column header, or the
 * nearest preceding examination/collection date heading — and records where
 * the date came from. Nothing is guessed: ambiguous (day/month), conflicting,
 * year-less or invalid dates stay unresolved and appear in the exception
 * queue; one document-level date is never spread over a document that states
 * several examination dates; report / print / upload / birth dates are never
 * examination dates.
 *
 * It then classifies every review row for bulk handling (validated, exception,
 * duplicate, rejected) using the EXISTING save prerequisites
 * (isIntakeRowEligible / isBulkSelectable), the canonical catalog domain and a
 * deterministic source-aware duplicate key, and builds the reconciliation
 * summary. Nothing here saves, approves, converts units or changes catalog or
 * scientific status; bulk confirmation is still an explicit human action and
 * storage stays the encrypted append-only observation store.
 *
 * Date semantics kept apart: examination date = observedAt (date precision);
 * import (upload) time = when the file was read for review; record creation =
 * recordedAt at save time.
 */
import {
  headerCellRole,
  inferDecimalConvention,
  mapHeaderCells,
  normalizeHeaderText,
  parseResultValue,
  reconstructDocumentTables,
  type ColumnRole,
  type DocumentLineInput,
  type DocumentReconstruction,
  type ExtractionConfidence,
  type ExtractionLayout,
  type ObservationIssue,
  type ReconstructedObservation,
  type ReconstructedSection,
  type ReconstructionIssue,
} from "./document-table-reconstruction";
import { documentLineHeading, isPageMarkLine } from "./source-section-classification";
import {
  isCalendarDate,
  isExplicitInstant,
  observationDateKey,
  validObservationDate,
  type ObservationDatePrecision,
} from "./observation-date";
import {
  intakeRowExclusionReason,
  isIntakeRowEligible,
  type IntakeReviewRow,
} from "./intake-review-selection";
import { extractionBlockingReason, isBulkSelectable } from "./document-intake-review";
import { classifyWithGovernedExtensions } from "./unknown-biomarker-review";
import { batchDuplicateKeys } from "./universal-intake-adapters";
import { findUnifiedDuplicates } from "./observation-store";
import {
  DATED_OBSERVATION_SCHEMA,
  UNIFIED_OBSERVATION_SCHEMA,
  type ObservationSourceKind,
  type UnifiedObservation,
} from "./observation-envelope";
import type { HealthDomainId } from "../health-domains/registry";

export const P61_RULES_VERSION = "mitochondria.p61-multi-date-import.v1";

// --- Date text --------------------------------------------------------------------

export interface DateReading {
  iso: string;
  precision: ObservationDatePrecision;
  how: string;
}
export type DateParse =
  | { status: "resolved"; value: string; precision: ObservationDatePrecision; how: string }
  | { status: "ambiguous"; options: DateReading[]; note: string }
  | { status: "invalid"; note: string }
  | { status: "none" };

const MONTHS: Readonly<Record<string, number>> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_RE =
  "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)";
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

interface DateToken {
  start: number;
  end: number;
  text: string;
  readings: DateReading[];
}

/** Every explicit date in a text (ISO, zoned ISO timestamp, D/M/Y numeric, written month). */
export function scanDates(text: string): DateToken[] {
  const found: DateToken[] = [];
  const add = (start: number, end: number, readings: DateReading[]) =>
    found.push({ start, end, text: text.slice(start, end), readings });
  for (const m of text.matchAll(
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})/g,
  )) {
    const v = m[0];
    add(m.index!, m.index! + v.length, isExplicitInstant(v) ? [{ iso: v, precision: "instant", how: "ISO timestamp with stated time zone" }] : []);
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const v = m[0];
    add(m.index!, m.index! + v.length, isCalendarDate(v) ? [{ iso: v, precision: "date", how: "ISO date" }] : []);
  }
  for (const m of text.matchAll(/\b(\d{4})[/.](\d{1,2})[/.](\d{1,2})\b/g)) {
    const iso = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    add(m.index!, m.index! + m[0].length, isCalendarDate(iso) ? [{ iso, precision: "date", how: "year/month/day" }] : []);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    const readings: DateReading[] = [];
    const dayFirst = ymd(y, b, a);
    const monthFirst = ymd(y, a, b);
    if (isCalendarDate(dayFirst)) readings.push({ iso: dayFirst, precision: "date", how: "read as day/month/year" });
    if (monthFirst !== dayFirst && isCalendarDate(monthFirst))
      readings.push({ iso: monthFirst, precision: "date", how: "read as month/day/year" });
    add(m.index!, m.index! + m[0].length, readings);
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi"))) {
    const iso = ymd(Number(m[3]), MONTHS[m[2]!.toLowerCase()] ?? 0, Number(m[1]));
    add(m.index!, m.index! + m[0].length, isCalendarDate(iso) ? [{ iso, precision: "date", how: "written day month year" }] : []);
  }
  for (const m of text.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"))) {
    const iso = ymd(Number(m[3]), MONTHS[m[1]!.toLowerCase()] ?? 0, Number(m[2]));
    add(m.index!, m.index! + m[0].length, isCalendarDate(iso) ? [{ iso, precision: "date", how: "written month day, year" }] : []);
  }
  // Longest first, then drop overlaps (an ISO date inside a timestamp is the same token).
  found.sort((x, y) => x.start - y.start || y.end - y.start - (x.end - x.start));
  const kept: DateToken[] = [];
  for (const t of found) if (!kept.some((k) => t.start < k.end && k.start < t.end)) kept.push(t);
  return kept.sort((x, y) => x.start - y.start);
}

function parseTokens(tokens: readonly DateToken[]): DateParse {
  if (!tokens.length) return { status: "none" };
  const readings = new Map<string, DateReading>();
  let invalid = false;
  for (const t of tokens) {
    if (!t.readings.length) invalid = true;
    for (const r of t.readings) if (!readings.has(r.iso)) readings.set(r.iso, r);
  }
  if (tokens.length > 1) {
    const texts = tokens.map((t) => `"${t.text}"`).join(", ");
    return readings.size === 1 && !invalid
      ? { status: "resolved", ...[...readings.values()][0]!, value: [...readings.keys()][0]! }
      : { status: "ambiguous", options: [...readings.values()], note: `More than one date is stated (${texts}); choose the examination date explicitly.` };
  }
  const t = tokens[0]!;
  if (!t.readings.length) return { status: "invalid", note: `"${t.text}" is not a valid calendar date.` };
  if (t.readings.length > 1)
    return { status: "ambiguous", options: t.readings, note: `"${t.text}" can be read as day/month or month/day; choose explicitly.` };
  const r = t.readings[0]!;
  return { status: "resolved", value: r.iso, precision: r.precision, how: r.how };
}

/** One date cell / value (CSV date, row date column, date column header). */
export function parseDateText(text: string): DateParse {
  const t = text.trim();
  if (!t) return { status: "none" };
  const tokens = scanDates(t);
  if (!tokens.length)
    return /\d/.test(t)
      ? { status: "invalid", note: `"${t}" is not a recognized date (year, month and day are required).` }
      : { status: "none" };
  return parseTokens(tokens);
}

// --- Examination date headings ----------------------------------------------------

export type DateHeadingKind = "examination" | "collection";
const EXCLUDED_CONTEXT =
  /\b(?:report(?:ed)?|print(?:ed)?|issued|generated|created|upload(?:ed)?|received|signed|birth|dob|born|expir\w*|valid|next|due|revision|version|updated|εκδοσ\w*|γεννησ\w*)\b/;
const COLLECTION_CONTEXT = /\b(?:collect(?:ed|ion)|samples?|sampled|sampling|specimen|drawn|draw|δειγματοληψ\w*)\b/;
const EXAM_CONTEXT =
  /\b(?:examinations?|exams?|visits?|sessions?|assessments?|evaluations?|check-?ups?|tests?|measurements?|observations?|dates?|days?|εξετασ\w*|επισκεψ\w*|ημερομηνι\w*)\b/;

const splitDelimited = (text: string) =>
  text
    .split(/\s+\|\s+|\s*\t+\s*| {2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
const lineCells = (l: DocumentLineInput) =>
  l.cells?.length ? l.cells.map((c) => c.text.trim()).filter(Boolean) : splitDelimited(l.text.trim());

export interface DateHeading {
  line: number;
  page: number | null;
  text: string;
  kind: DateHeadingKind | "excluded";
  parse: DateParse;
}

function classifyDateCell(text: string): Omit<DateHeading, "line" | "page"> | null {
  const t = text.trim();
  const tokens = scanDates(t);
  if (!tokens.length) return null;
  let residual = t;
  for (const tok of [...tokens].reverse()) residual = residual.slice(0, tok.start) + " " + residual.slice(tok.end);
  // A measurement row (decimal or 3+ digit value) is never a heading.
  if (/\d+[.,]\d+/.test(residual) || /\b\d{3,}\b/.test(residual)) return null;
  const words = normalizeHeaderText(residual);
  const parse = parseTokens(tokens);
  if (EXCLUDED_CONTEXT.test(words)) return { text: t, kind: "excluded", parse };
  if (COLLECTION_CONTEXT.test(words)) return { text: t, kind: "collection", parse };
  if (EXAM_CONTEXT.test(words) || !/[\p{L}\d]/u.test(words)) return { text: t, kind: "examination", parse };
  return null;
}

const NUMBERED_EXAM =
  /^(?:examinations?|exams?|visits?|sessions?|assessments?|evaluations?|check ?ups?|days?|εξετασ\p{L}*|επισκεψ\p{L}*)(?: no| nr| #)? ?#?\d{1,3}$/u;
/**
 * "Examination 3 — 2026-11-03": a numbered examination title plus exactly one date
 * and nothing else. PDF text geometry splits it into cells ("Examination" | "3" |
 * "— 2026-11-03") that would otherwise look like a measurement row.
 */
export function isNumberedExamHeading(text: string): boolean {
  const t = text.trim();
  if (t.length > 80) return false;
  const tokens = scanDates(t);
  if (tokens.length !== 1) return false;
  const residual = (t.slice(0, tokens[0]!.start) + " " + t.slice(tokens[0]!.end))
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\d#]+/gu, " ")
    .trim();
  return NUMBERED_EXAM.test(residual);
}

/**
 * A line that states an examination (or sample collection) date for the rows
 * that follow. Metadata lines are read cell by cell, so a birth or report date
 * beside the examination date is ignored rather than mixed in.
 */
export function classifyDateHeading(text: string, cells: readonly string[]): Omit<DateHeading, "line" | "page"> | null {
  const t = text.trim();
  if (t.length < 4 || t.length > 160 || isPageMarkLine(t) || cells.length > 4) return null;
  // A cell holding only a number is a measurement value: the line is a table row, not a
  // heading — unless the whole line is a numbered examination title with one date.
  if (cells.some((c) => /^[-+\u2212]?\d+(?:[.,]\d+)?$/.test(c.trim()))) {
    if (!isNumberedExamHeading(t)) return null;
    const whole = classifyDateCell(t);
    return whole && whole.kind === "examination" ? { ...whole, text: t } : null;
  }
  const results = (cells.length > 1 ? cells : [t]).map(classifyDateCell).filter((r): r is NonNullable<typeof r> => r !== null);
  if (!results.length) return null;
  const usable = results.filter((r) => r.kind !== "excluded");
  if (!usable.length) return { ...results[0]!, text: t };
  if (usable.length === 1) return { ...usable[0]!, text: t };
  const kind: DateHeadingKind = usable.some((r) => r.kind === "collection") ? "collection" : "examination";
  const values = new Map<string, DateReading>();
  let unresolved = false;
  for (const r of usable) {
    if (r.parse.status === "resolved") values.set(r.parse.value, { iso: r.parse.value, precision: r.parse.precision, how: r.parse.how });
    else {
      unresolved = true;
      if (r.parse.status === "ambiguous") for (const o of r.parse.options) values.set(o.iso, o);
    }
  }
  const only = [...values.values()];
  const parse: DateParse =
    !unresolved && only.length === 1
      ? { status: "resolved", value: only[0]!.iso, precision: only[0]!.precision, how: only[0]!.how }
      : { status: "ambiguous", options: only, note: `More than one examination date is stated (${usable.map((r) => `"${r.text}"`).join(", ")}); choose explicitly.` };
  return { text: t, kind, parse };
}

// --- Date-column tables -------------------------------------------------------------

type GridRole = ColumnRole | "date_value";
interface DateColumnHeader {
  roles: GridRole[];
  dates: { index: number; text: string; parse: DateParse }[];
}

/** Header whose result columns are examination dates: label (+unit…) + ≥2 date cells. */
export function dateColumnHeader(cells: readonly string[]): DateColumnHeader | null {
  if (cells.length < 3 || cells.length > 40) return null;
  const roles: GridRole[] = [];
  const dates: DateColumnHeader["dates"] = [];
  cells.forEach((cell, index) => {
    const p = parseDateText(cell);
    if (p.status !== "none" && scanDates(cell).length) {
      roles.push("date_value");
      dates.push({ index, text: cell.trim(), parse: p });
      return;
    }
    roles.push((headerCellRole(cell) ?? "flag_unknown") as GridRole);
  });
  if (dates.length < 2 || !roles.includes("label") || roles.includes("result")) return null;
  if (roles.some((r) => !["row_number", "label", "unit", "reference", "specimen", "method", "flag", "category", "date_value"].includes(r)))
    return null;
  return { roles, dates };
}

// --- Evidence per observation ---------------------------------------------------------

export type ExamDateSource = "row" | "column" | "section" | "document" | "manual";
export interface ExamDateEvidence {
  rulesVersion: typeof P61_RULES_VERSION;
  status: "resolved" | "ambiguous" | "conflict" | "invalid" | "missing";
  /** ISO calendar date (or zoned instant) when resolved. */
  value: string | null;
  precision: ObservationDatePrecision | null;
  source: ExamDateSource | null;
  /** Verbatim text the date was read from. */
  sourceText: string | null;
  line: number | null;
  page: number | null;
  /** Date group (heading line or date column) this row shares; resolving the group resolves its rows. */
  groupKey: string | null;
  options: DateReading[];
  note: string;
}

const evidence = (e: Omit<ExamDateEvidence, "rulesVersion">): ExamDateEvidence => ({ rulesVersion: P61_RULES_VERSION, ...e });

export const EXAM_DATE_SOURCE_TEXT: Record<ExamDateSource, string> = {
  row: "date on the row",
  column: "date column header",
  section: "examination date heading",
  document: "document date",
  manual: "entered by the reviewer",
};

export interface DateGroupSummary {
  key: string;
  kind: "heading" | "date_column";
  headingKind: DateHeadingKind | null;
  line: number;
  page: number | null;
  text: string;
  parse: DateParse;
  rows: number;
}

export interface MultiDateDocument {
  rulesVersion: typeof P61_RULES_VERSION;
  /** Reconstruction with date-column observations appended and repeats / row integrity per examination date. */
  reconstruction: DocumentReconstruction;
  /** Aligned with reconstruction.observations. */
  dates: ExamDateEvidence[];
  groups: DateGroupSummary[];
  ignoredDates: { line: number; page: number | null; text: string; reason: string }[];
  /** Distinct resolved examination dates, ascending. */
  distinctDates: string[];
  multipleDates: boolean;
  dateColumnTables: number;
  blankCells: number;
}

const labelKey = (label: string) => label.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();

interface ColumnObs {
  observation: ReconstructedObservation;
  date: { text: string; parse: DateParse; key: string };
}

function readDateColumnTables(
  lines: readonly DocumentLineInput[],
  options: { ocr?: boolean },
): { observations: ColumnObs[]; ownedLines: Set<number>; tables: number; blankCells: number; groups: DateGroupSummary[] } {
  const owned = new Set<number>();
  const out: ColumnObs[] = [];
  const groups = new Map<string, DateGroupSummary>();
  let tables = 0;
  let blankCells = 0;
  type ActiveTable = { header: DateColumnHeader; line: number; text: string; xs: number[] | null };
  let active = null as ActiveTable | null;
  let top: { text: string; domain: HealthDomainId | null; rule: string | null } | null = null;
  let sub: string | null = null;
  const section = (): ReconstructedSection =>
    top ? { heading: sub ?? top.text, path: sub ? [top.text, sub] : [top.text], domain: top.domain, rule: top.rule } : { heading: null, path: [], domain: null, rule: null };
  const raw: { cells: string[]; row: number | null; line: number; page: number | null; text: string; hdr: ActiveTable; section: ReconstructedSection; layout: ExtractionLayout }[] = [];

  lines.slice(0, 5000).forEach((l, i) => {
    const lineNo = i + 1;
    const text = l.text.trim();
    if (!text || text.length > 600) return;
    const cells = lineCells(l);
    const hdr = dateColumnHeader(cells);
    if (hdr) {
      active = { header: hdr, line: lineNo, text: cells.join(" | "), xs: l.cells?.length === cells.length ? l.cells.map((c) => c.x) : null };
      owned.add(lineNo);
      tables++;
      for (const d of hdr.dates) {
        const key = `col:${d.text}`;
        if (!groups.has(key))
          groups.set(key, { key, kind: "date_column", headingKind: null, line: lineNo, page: l.page, text: d.text, parse: d.parse, rows: 0 });
      }
      return;
    }
    const heading = cells.length <= 2 && !/^\d{1,4}[.)]?\s/.test(text) ? documentLineHeading(text) : null;
    if (heading) {
      if (heading.level === 1 || heading.domain) {
        top = { text: heading.text, domain: heading.domain, rule: heading.rule };
        sub = null;
      } else if (top) sub = heading.text;
      else top = { text: heading.text, domain: null, rule: null };
      return;
    }
    const a: ActiveTable | null = active;
    if (!a || isPageMarkLine(text)) return;
    if (mapHeaderCells(cells)) {
      active = null;
      return;
    }
    let columns: string[] | null = null;
    let layout: ExtractionLayout = "delimited";
    if (l.cells?.length && a.xs) {
      const aligned: string[][] = a.xs.map(() => []);
      for (const c of l.cells) {
        let col = 0;
        for (let k = 0; k < a.xs.length; k++) if ((a.xs[k] ?? 0) <= c.x + 12) col = k;
        aligned[col]?.push(c.text.trim());
      }
      columns = aligned.map((x) => x.join(" ").trim());
      layout = "geometry";
    } else if (cells.length === a.header.roles.length) {
      columns = cells;
      layout = l.cells?.length ? "geometry" : "delimited";
    }
    if (!columns) {
      if (cells.length >= 2) active = null;
      return;
    }
    const labelText = columns[a.header.roles.indexOf("label")] ?? "";
    if (!/\p{L}/u.test(labelText)) return;
    const rnIndex = a.header.roles.indexOf("row_number");
    const rn = rnIndex >= 0 ? (columns[rnIndex] ?? "").replace(/[.)]$/, "") : null;
    if (rnIndex >= 0 && !/^\d{1,4}$/.test(rn ?? "")) return;
    owned.add(lineNo);
    raw.push({ cells: columns, row: rn ? Number(rn) : null, line: lineNo, page: l.page, text, hdr: a, section: section(), layout });
  });

  const convention = inferDecimalConvention(raw.flatMap((r) => r.hdr.header.dates.map((d) => r.cells[d.index] ?? "")));
  for (const r of raw) {
    const roles = r.hdr.header.roles;
    const one = (role: GridRole) => {
      const k = roles.indexOf(role);
      const v = k >= 0 ? (r.cells[k] ?? "").trim() : "";
      return v || null;
    };
    for (const d of r.hdr.header.dates) {
      const cell = (r.cells[d.index] ?? "").trim();
      let rawValue = cell;
      let unit = one("unit") ?? "";
      if (/^(?:—|–|-|n\/?a)$/i.test(unit)) unit = "";
      if (!roles.includes("unit") && !unit) {
        const m = /^([^\s]+)\s+(.+)$/.exec(rawValue);
        if (m && parseResultValue(m[1] ?? "", convention).kind === "numeric") {
          rawValue = m[1] ?? "";
          unit = (m[2] ?? "").trim();
        }
      }
      const parsed = parseResultValue(rawValue, convention);
      if (parsed.kind === "missing") {
        blankCells++;
        continue;
      }
      const issues: ObservationIssue[] = [];
      if (parsed.kind !== "numeric" && parsed.kind !== "ambiguous_number")
        issues.push({ code: "unsupported_result_type", message: `Unsupported result type for numeric storage ("${parsed.raw}").`, blocking: true });
      if (parsed.kind === "ambiguous_number")
        issues.push({ code: "ambiguous_number", message: `${parsed.notes.join(" ")} Source shows "${parsed.raw}"; enter the value explicitly after checking the original.`, blocking: true });
      if (!unit) issues.push({ code: "missing_unit", message: "No unit is reported in the source; units are never inferred.", blocking: true });
      if (unit && /\s(?:or|ή)\s/i.test(unit))
        issues.push({ code: "ambiguous_unit", message: `The source lists alternative units ("${unit}"); the exact unit must be chosen explicitly.`, blocking: true });
      if (options.ocr)
        issues.push({ code: "ocr_text", message: "Read by on-device OCR: verify every digit, decimal point and unit symbol against the original.", blocking: false });
      const blocking = issues.some((x) => x.blocking);
      const confidence: ExtractionConfidence = options.ocr || blocking ? "low" : r.layout === "geometry" && !issues.length ? "high" : "medium";
      const key = `col:${d.text}`;
      const g = groups.get(key);
      if (g) g.rows++;
      out.push({
        observation: {
          sourceRowNumber: r.row === null ? null : String(r.row),
          label: (one("label") ?? "").trim(),
          rawValue: parsed.raw,
          value: parsed.normalized || (parsed.kind === "ambiguous_number" ? "" : parsed.kind === "numeric" ? parsed.raw : ""),
          valueKind: parsed.kind,
          valueNotes: parsed.notes,
          unit,
          referenceInterval: one("reference"),
          specimen: one("specimen"),
          method: one("method"),
          flag: one("flag"),
          columnDate: d.text,
          otherResults: [],
          section: r.section,
          page: r.page,
          line: r.line,
          excerpt: `${r.text.slice(0, 300)} [column ${d.text}]`,
          tableHeader: r.hdr.text,
          layout: r.layout,
          confidence,
          issues,
          repeat: null,
          sameLabelOtherUnits: [],
        },
        date: { text: d.text, parse: d.parse, key },
      });
    }
  }
  return { observations: out, ownedLines: owned, tables, blankCells, groups: [...groups.values()] };
}

/**
 * Stages A–D (P42 reconstruction) plus P61 examination-date assignment for one
 * document. Row dates and date columns take precedence over a heading; a heading
 * date covers the rows that follow it until the next date heading; a row whose
 * own date disagrees with its heading is a conflict, never silently resolved.
 */
export function reconstructMultiDateDocument(
  lines: readonly DocumentLineInput[],
  options: { ocr?: boolean } = {},
): MultiDateDocument {
  const inspected = lines.slice(0, 5000);
  const columns = readDateColumnTables(inspected, options);
  // Numbered examination headings are dates, never measurement rows.
  const skip = new Set(columns.ownedLines);
  inspected.forEach((l, i) => {
    if (!columns.ownedLines.has(i + 1) && isNumberedExamHeading(l.text) && classifyDateHeading(l.text, lineCells(l))) skip.add(i + 1);
  });
  const base = reconstructDocumentTables(inspected, { ...options, skipLines: skip });
  const tableLines = new Set(base.observations.map((o) => o.line));

  // Date headings (furniture: an identical multi-date line on several pages is a running header).
  const textPages = new Map<string, Set<number>>();
  inspected.forEach((l) => {
    const t = l.text.trim();
    if (!t) return;
    const s = textPages.get(t) ?? new Set<number>();
    s.add(l.page ?? 0);
    textPages.set(t, s);
  });
  const headings: DateHeading[] = [];
  const ignoredDates: MultiDateDocument["ignoredDates"] = [];
  inspected.forEach((l, i) => {
    const lineNo = i + 1;
    if (tableLines.has(lineNo) || columns.ownedLines.has(lineNo)) return;
    const cells = lineCells(l);
    if (mapHeaderCells(cells)) return;
    const h = classifyDateHeading(l.text, cells);
    if (!h) return;
    if (h.kind === "excluded") {
      ignoredDates.push({ line: lineNo, page: l.page, text: h.text, reason: "Not an examination date (report, print, upload, birth or similar date)." });
      return;
    }
    if (h.parse.status === "ambiguous" && h.parse.options.length > 1 && (textPages.get(l.text.trim())?.size ?? 0) >= 2) {
      ignoredDates.push({ line: lineNo, page: l.page, text: h.text, reason: "Running page header naming several dates; not an examination date." });
      return;
    }
    headings.push({ ...h, line: lineNo, page: l.page });
  });
  const headingFor = (line: number) => {
    let found: DateHeading | null = null;
    for (const h of headings) if (h.line < line) found = h;
    else break;
    return found;
  };

  const all: { o: ReconstructedObservation; col: ColumnObs["date"] | null }[] = [
    ...base.observations.map((o) => ({ o, col: null })),
    ...columns.observations.map((c) => ({ o: c.observation, col: c.date })),
  ];
  const groupRows = new Map<string, number>();
  const dates: ExamDateEvidence[] = all.map(({ o, col }) => {
    const h = headingFor(o.line);
    const hKey = h ? `head:${h.line}` : null;
    const hNote = h ? (h.kind === "collection" ? " The heading names a sample collection date; confirm it is the examination date." : "") : "";
    const own: { parse: DateParse; text: string; source: ExamDateSource; key: string | null } | null = col
      ? { parse: col.parse, text: col.text, source: "column", key: col.key }
      : o.columnDate
        ? { parse: parseDateText(o.columnDate), text: o.columnDate, source: "row", key: null }
        : null;
    if (own && own.parse.status !== "none") {
      const p = own.parse;
      const at = { sourceText: own.text, line: col ? null : o.line, page: o.page, groupKey: own.key, source: own.source };
      if (p.status === "resolved") {
        if (h && h.parse.status === "resolved" && h.parse.value.slice(0, 10) !== p.value.slice(0, 10))
          return evidence({ ...at, status: "conflict", value: null, precision: null, options: [{ iso: p.value, precision: p.precision, how: `${EXAM_DATE_SOURCE_TEXT[own.source]} "${own.text}"` }, { iso: h.parse.value, precision: h.parse.precision, how: `heading "${h.text}" (line ${h.line})` }], note: `The ${EXAM_DATE_SOURCE_TEXT[own.source]} (${p.value}) disagrees with the examination date heading on line ${h.line} (${h.parse.value}); enter the correct date after checking the original.` });
        if (own.key) groupRows.set(own.key, (groupRows.get(own.key) ?? 0) + 1);
        return evidence({ ...at, status: "resolved", value: p.value, precision: p.precision, options: [], note: `Examination date from the ${EXAM_DATE_SOURCE_TEXT[own.source]} "${own.text}" (${p.how}).` });
      }
      if (p.status === "ambiguous") return evidence({ ...at, status: "ambiguous", value: null, precision: null, options: p.options, note: p.note });
      return evidence({ ...at, status: "invalid", value: null, precision: null, options: [], note: p.note });
    }
    if (h) {
      groupRows.set(hKey!, (groupRows.get(hKey!) ?? 0) + 1);
      const at = { source: "section" as const, sourceText: h.text, line: h.line, page: h.page, groupKey: hKey };
      if (h.parse.status === "resolved")
        return evidence({ ...at, status: "resolved", value: h.parse.value, precision: h.parse.precision, options: [], note: `Examination date inherited from the heading "${h.text}" on line ${h.line} (${h.parse.how}).${hNote}` });
      if (h.parse.status === "ambiguous") return evidence({ ...at, status: "ambiguous", value: null, precision: null, options: h.parse.options, note: `Heading "${h.text}" (line ${h.line}): ${h.parse.note}` });
      return evidence({ ...at, status: "invalid", value: null, precision: null, options: [], note: `Heading "${h.text}" (line ${h.line}): ${h.parse.status === "invalid" ? h.parse.note : "no date"}` });
    }
    return evidence({ status: "missing", value: null, precision: null, source: null, sourceText: null, line: null, page: o.page, groupKey: null, options: [], note: headings.length ? "This row comes before the first examination date heading; enter its date explicitly." : "No examination date is stated for this row." });
  });

  // Repeats are per examination date: the same biomarker on another date is a new examination, not a repeat.
  const observations = all.map(({ o }) => ({ ...o, repeat: null as ReconstructedObservation["repeat"], sameLabelOtherUnits: [] as string[] }));
  const first = new Map<string, ReconstructedObservation>();
  const unitsByLabel = new Map<string, Set<string>>();
  observations.forEach((o, i) => {
    const d = dates[i]!;
    const lk = labelKey(o.label);
    const units = unitsByLabel.get(lk) ?? new Set<string>();
    units.add(o.unit);
    unitsByLabel.set(lk, units);
    const k = `${lk}\u0000${o.unit}\u0000${d.value ?? d.groupKey ?? "none"}`;
    const f = first.get(k);
    if (f) o.repeat = { firstRowNumber: f.sourceRowNumber, firstLine: f.line, sameValue: f.rawValue === o.rawValue };
    else first.set(k, o);
  });
  for (const o of observations) o.sameLabelOtherUnits = [...(unitsByLabel.get(labelKey(o.label)) ?? [])].filter((u) => u !== o.unit);

  // Row-number integrity per examination-date group when row numbers restart for each examination.
  const groupsOfTable = new Map<string, ReconstructedObservation[]>();
  base.observations.forEach((o, i) => {
    const k = dates[i]!.groupKey ?? "none";
    const list = groupsOfTable.get(k) ?? [];
    list.push(o);
    groupsOfTable.set(k, list);
  });
  const multiGroup = groupsOfTable.size > 1;
  let issues: ReconstructionIssue[] = base.issues;
  let rowNumbers = base.rowNumbers;
  if (multiGroup) {
    issues = base.issues.filter((x) => !(x.line === null && x.rowNumber !== null && /^(?:Source row \d+ was not found|Row number .+ appears more than once)/.test(x.message)));
    rowNumbers = { max: base.rowNumbers.max, missing: [], duplicated: [] };
    for (const [k, list] of groupsOfTable) {
      const label = k === "none" ? "Rows without a date heading" : `Examination group "${headings.find((h) => `head:${h.line}` === k)?.text ?? k}"`;
      const nums = list.map((o) => Number(o.sourceRowNumber)).filter((n) => Number.isInteger(n) && n > 0);
      const seen = new Map<string, number>();
      for (const o of list) if (o.sourceRowNumber) seen.set(o.sourceRowNumber, (seen.get(o.sourceRowNumber) ?? 0) + 1);
      if (nums.length && Math.min(...nums) <= 1 && Math.max(...nums) <= 5000) {
        const have = new Set(nums);
        for (let n = 1; n <= Math.max(...nums); n++)
          if (!have.has(n)) issues.push({ line: null, page: null, rowNumber: String(n), message: `${label}: source row ${n} was not found in the extracted text.`, action: "Check the original page and enter the row manually if it exists." });
      }
      for (const [n, c] of seen)
        if (c > 1) issues.push({ line: null, page: null, rowNumber: n, message: `${label}: row number ${n} appears more than once.`, action: "Review both rows against the original; neither is merged or dropped." });
    }
  }
  for (const c of columns.observations)
    for (const issue of c.observation.issues.filter((x) => x.blocking))
      issues.push({ line: c.observation.line, page: c.observation.page, rowNumber: c.observation.sourceRowNumber, message: `${c.observation.label || "(no label)"} [${c.date.text}]: ${issue.message}`, action: "Review-only until resolved explicitly by the reviewer." });

  const sectionCounts = new Map<string, { heading: string; domain: HealthDomainId | null; page: number | null; rows: number }>();
  for (const o of observations) {
    const heading = o.section.path[0] ?? "(no section)";
    const entry = sectionCounts.get(heading) ?? { heading, domain: o.section.domain, page: o.page, rows: 0 };
    entry.rows++;
    sectionCounts.set(heading, entry);
  }

  const groups: DateGroupSummary[] = [
    ...headings.map((h) => ({ key: `head:${h.line}`, kind: "heading" as const, headingKind: h.kind as DateHeadingKind, line: h.line, page: h.page, text: h.text, parse: h.parse, rows: dates.filter((d) => d.groupKey === `head:${h.line}`).length })),
    ...columns.groups.map((g) => ({ ...g, rows: dates.filter((d) => d.groupKey === g.key).length })),
  ];
  const distinctDates = [...new Set(dates.filter((d) => d.status === "resolved" && d.value).map((d) => d.value!.slice(0, 10)))].sort();
  return {
    rulesVersion: P61_RULES_VERSION,
    reconstruction: {
      ...base,
      observations,
      issues,
      rowNumbers,
      sections: [...sectionCounts.values()],
      decimalConvention: columns.observations.length ? inferDecimalConvention(observations.map((o) => o.rawValue)) : base.decimalConvention,
    },
    dates,
    groups,
    ignoredDates,
    distinctDates,
    multipleDates: distinctDates.length > 1 || (groups.length > 1 && groups.some((g) => g.parse.status !== "resolved")),
    dateColumnTables: columns.tables,
    blankCells: columns.blankCells,
  };
}

// --- Grids (CSV / XLSX) -----------------------------------------------------------------

export interface GridCandidate {
  label: string;
  value: string;
  unit: string;
  observedAt: string;
  datePrecision?: ObservationDatePrecision;
  sourceRow: number;
  excerpt: string;
  examDate: ExamDateEvidence;
  issue: string | null;
}

/** Wide grid (Biomarker, Unit, <date>, <date>…): one candidate per non-blank date cell. Null if not wide. */
export function extractWideGridCandidates(cells: readonly (readonly string[])[]): { rows: GridCandidate[]; blankCells: number; skipped: number } | null {
  const header = (cells[0] ?? []).map((c) => c.replace(/^\ufeff/, "").trim());
  const roleCells = header.map((c) => c.replace(/_/g, " "));
  const hdr = dateColumnHeader(roleCells);
  if (!hdr) return null;
  const li = hdr.roles.indexOf("label");
  const ui = hdr.roles.indexOf("unit");
  const rows: GridCandidate[] = [];
  let blankCells = 0;
  let skipped = 0;
  cells.slice(1).forEach((row, i) => {
    const sourceRow = i + 2;
    const label = (row[li] ?? "").trim();
    const unit = ui >= 0 ? (row[ui] ?? "").trim() : "";
    if (!label) {
      skipped++;
      return;
    }
    for (const d of hdr.dates) {
      const raw = (row[d.index] ?? "").trim();
      if (!raw || /^(?:—|–|-|n\/?a)$/i.test(raw)) {
        blankCells++;
        continue;
      }
      const numeric = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw);
      const p = d.parse;
      const examDate =
        p.status === "resolved"
          ? evidence({ status: "resolved", value: p.value, precision: p.precision, source: "column", sourceText: d.text, line: 1, page: null, groupKey: `col:${d.text}`, options: [], note: `Examination date from the date column header "${d.text}" (${p.how}).` })
          : evidence({ status: p.status === "ambiguous" ? "ambiguous" : "invalid", value: null, precision: null, source: "column", sourceText: d.text, line: 1, page: null, groupKey: `col:${d.text}`, options: p.status === "ambiguous" ? p.options : [], note: p.status === "ambiguous" || p.status === "invalid" ? p.note : "No date." });
      rows.push({
        label,
        value: numeric ? raw : "",
        unit,
        observedAt: examDate.status === "resolved" ? examDate.value! : "",
        ...(examDate.status === "resolved" ? { datePrecision: examDate.precision! } : {}),
        sourceRow,
        excerpt: `${row.join(",").slice(0, 300)} [column ${d.text}]`,
        examDate,
        issue: numeric ? (unit ? null : "No unit is reported in the source; units are never inferred.") : `Value "${raw}" is not a plain number; enter it explicitly after checking the original.`,
      });
    }
  });
  return { rows, blankCells, skipped };
}

/** Date evidence of one long-format grid row (row-level date or verbatim unparsed date text). */
export function rowDateEvidence(row: { observedAt: string; datePrecision?: ObservationDatePrecision; rawDate?: string; sourceRow?: number }): ExamDateEvidence {
  const at = { source: "row" as const, line: row.sourceRow ?? null, page: null };
  if (row.observedAt && validObservationDate({ observedAt: row.observedAt, ...(row.datePrecision ? { datePrecision: row.datePrecision } : {}) }))
    return evidence({ ...at, status: "resolved", value: row.observedAt, precision: row.datePrecision ?? "instant", sourceText: row.observedAt, groupKey: null, options: [], note: `Examination date from the row's own date "${row.observedAt}".` });
  if (row.rawDate) {
    const p = parseDateText(row.rawDate);
    const groupKey = `raw:${row.rawDate}`;
    if (p.status === "resolved")
      return evidence({ ...at, status: "resolved", value: p.value, precision: p.precision, sourceText: row.rawDate, groupKey, options: [], note: `Examination date from the row's own date "${row.rawDate}" (${p.how}).` });
    if (p.status === "ambiguous") return evidence({ ...at, status: "ambiguous", value: null, precision: null, sourceText: row.rawDate, groupKey, options: p.options, note: p.note });
    return evidence({ ...at, status: "invalid", value: null, precision: null, sourceText: row.rawDate, groupKey, options: [], note: p.status === "invalid" ? p.note : `"${row.rawDate}" is not a date.` });
  }
  return evidence({ ...at, status: "missing", value: null, precision: null, sourceText: null, groupKey: null, options: [], note: "No examination date is stated for this row." });
}

/** Review-row date fields for an evidence record: only a resolved date fills observedAt. */
export function reviewDateFields(e: ExamDateEvidence): { observedAt: string; datePrecision?: ObservationDatePrecision } {
  return e.status === "resolved" && e.value ? { observedAt: e.value, datePrecision: e.precision ?? "date" } : { observedAt: "" };
}

export const manualDateEvidence = (value: string, precision: ObservationDatePrecision | undefined): ExamDateEvidence =>
  evidence({ status: value ? "resolved" : "missing", value: value || null, precision: value ? (precision ?? "instant") : null, source: "manual", sourceText: value || null, line: null, page: null, groupKey: null, options: [], note: value ? "Examination date entered by the reviewer." : "No examination date entered." });

/**
 * Apply the reviewer's explicit reading to every unsaved row of one date group
 * (one heading / date column / repeated raw date) that has no date yet. The
 * reading must be one of the group's own options; rows stay unselected.
 */
export function resolveDateGroup<T extends { documentSha256?: string | undefined; observedAt: string; datePrecision?: ObservationDatePrecision | undefined; selected: boolean; examDate?: ExamDateEvidence | undefined }>(
  rows: readonly T[],
  documentSha256: string,
  groupKey: string,
  iso: string,
): { rows: T[]; applied: number } {
  let applied = 0;
  const next = rows.map((row) => {
    const e = row.examDate;
    if (row.documentSha256 !== documentSha256 || !e || e.groupKey !== groupKey || row.observedAt) return row;
    if (e.status !== "ambiguous" && e.status !== "invalid") return row;
    const option = e.options.find((o) => o.iso === iso);
    if (!option) return row;
    applied++;
    return {
      ...row,
      observedAt: option.iso,
      datePrecision: option.precision,
      selected: false,
      examDate: { ...e, status: "resolved" as const, value: option.iso, precision: option.precision, options: [], note: `${e.note} Reviewer chose ${option.iso} (${option.how}).` },
    };
  });
  return { rows: next, applied };
}

// --- Bulk validation, duplicates and reconciliation ----------------------------------------

export type P61ExceptionCode =
  | "identity_hold"
  | "source_unvalidated"
  | "unknown_biomarker"
  | "ambiguous_identity"
  | "unit_review"
  | "date_missing"
  | "date_ambiguous"
  | "date_conflict"
  | "date_invalid"
  | "extraction"
  | "value"
  | "possible_duplicate"
  | "individual_review"
  | "needs_review";

export const P61_EXCEPTION_LABELS: Record<P61ExceptionCode, string> = {
  identity_hold: "Document identity conflict",
  source_unvalidated: "Source marks the value unvalidated",
  unknown_biomarker: "Biomarker not in the catalog",
  ambiguous_identity: "Ambiguous biomarker name",
  unit_review: "Unit differs from the catalog",
  date_missing: "Examination date missing",
  date_ambiguous: "Examination date ambiguous",
  date_conflict: "Conflicting examination dates",
  date_invalid: "Examination date invalid",
  extraction: "Extraction needs checking",
  value: "Value is not a plain number",
  possible_duplicate: "Possible duplicate from another source",
  individual_review: "Repeated or low-confidence row (tick individually)",
  needs_review: "Needs review",
};

export type P61RowStatus =
  | { kind: "validated"; reason: string }
  | { kind: "duplicate"; reason: string; storedId: string }
  | { kind: "rejected"; reason: string }
  | { kind: "exception"; code: P61ExceptionCode; reason: string };

export interface P61ReviewRow extends IntakeReviewRow {
  documentSha256?: string | undefined;
  examDate?: ExamDateEvidence | undefined;
}

export interface P61Scope {
  missionId: string;
  crewMemberId: string;
  provenance: "synthetic" | "real";
}

/**
 * Deterministic source-aware identity of one reading: the same document
 * (SHA-256), catalog metric, exact unit, examination date at its precision and
 * value. Re-importing a document already saved therefore never stores it again.
 */
export function sourceDuplicateKey(
  r: { documentSha256?: string | undefined; metricId: string; unit: string; observedAt: string; datePrecision?: ObservationDatePrecision | undefined; value: string },
  scope: P61Scope,
): string | null {
  if (!r.documentSha256 || !r.metricId) return null;
  return [scope.missionId, scope.crewMemberId, scope.provenance, r.documentSha256, r.metricId, r.unit.trim(), observationDateKey({ observedAt: r.observedAt, ...(r.datePrecision ? { datePrecision: r.datePrecision } : {}) }), r.value.trim()].join("\u0000");
}

/**
 * P61.3: the unit a matched row is saved and compared under — the catalog's notation when a closed
 * typographic notation rule matched (the verbatim reported unit is kept as reportedUnit), else the
 * reported unit itself. Never a conversion.
 */
export function storedUnitOf(row: { unit: string; classification: IntakeReviewRow["classification"] }): string {
  const c = row.classification;
  return c.status === "matched" && c.unitNotation && c.unitNotation.reportedUnit === row.unit.trim() ? c.unitNotation.catalogUnit : row.unit.trim();
}

export function storedSourceKeys(history: readonly UnifiedObservation[], scope: P61Scope): Map<string, string> {
  const keys = new Map<string, string>();
  for (const o of history) {
    if (o.status === "erroneous" || o.missionId !== scope.missionId || o.crewMemberId !== scope.crewMemberId || o.provenance !== scope.provenance) continue;
    const k = sourceDuplicateKey({ documentSha256: o.source.documentSha256, metricId: o.metricId, unit: o.originalUnit, observedAt: o.observedAt, datePrecision: o.datePrecision, value: o.value }, scope);
    if (k && !keys.has(k)) keys.set(k, o.id);
  }
  return keys;
}

const dateCode = (row: P61ReviewRow): P61ExceptionCode => {
  if (row.observedAt) return "date_invalid";
  switch (row.examDate?.status) {
    case "ambiguous":
      return "date_ambiguous";
    case "conflict":
      return "date_conflict";
    case "invalid":
      return "date_invalid";
    default:
      return "date_missing";
  }
};

/**
 * Bulk status of every review row. "validated" means the row passes every
 * existing save prerequisite, is bulk-selectable and is not a duplicate — it
 * still needs the reviewer's explicit bulk confirmation before it is saved.
 */
export function evaluateBulkImport(rows: readonly P61ReviewRow[], history: readonly UnifiedObservation[], scope: P61Scope | null): { statuses: Map<string, P61RowStatus>; validatedKeys: string[] } {
  const statuses = new Map<string, P61RowStatus>();
  const stored = scope ? storedSourceKeys(history, scope) : new Map<string, string>();
  const candidates: P61ReviewRow[] = [];
  for (const row of rows) {
    const set = (s: P61RowStatus) => statuses.set(row.key, s);
    if (row.rejected) {
      set({ kind: "rejected", reason: "Rejected by the reviewer; not saved." });
      continue;
    }
    const current = classifyWithGovernedExtensions(row).classification;
    const metricId = current.status === "matched" ? current.metricId : "";
    const sk = scope && metricId ? sourceDuplicateKey({ ...row, metricId, unit: storedUnitOf({ unit: row.unit, classification: current }) }, scope) : null;
    const storedId = sk ? stored.get(sk) : undefined;
    if (storedId) {
      set({ kind: "duplicate", reason: "Already stored from this same document (same biomarker, unit, examination date and value); it is never saved twice.", storedId });
      continue;
    }
    if (row.identityHold) {
      set({ kind: "exception", code: "identity_hold", reason: row.identityHold });
      continue;
    }
    if (row.sourceValidation === "unvalidated") {
      set({ kind: "exception", code: "source_unvalidated", reason: intakeRowExclusionReason(row) ?? "Source marks this measurement unvalidated." });
      continue;
    }
    if (current.status !== "matched") {
      const code: P61ExceptionCode = current.status === "unit_review_required" ? "unit_review" : current.status === "ambiguous" ? "ambiguous_identity" : "unknown_biomarker";
      set({ kind: "exception", code, reason: intakeRowExclusionReason(row) ?? P61_EXCEPTION_LABELS[code] });
      continue;
    }
    if (!validObservationDate(row)) {
      set({ kind: "exception", code: dateCode(row), reason: row.examDate?.note && !row.observedAt ? row.examDate.note : (intakeRowExclusionReason(row) ?? "Examination date is not valid.") });
      continue;
    }
    const blocking = extractionBlockingReason(row);
    if (blocking) {
      set({ kind: "exception", code: "extraction", reason: blocking });
      continue;
    }
    const exclusion = intakeRowExclusionReason(row);
    if (exclusion) {
      set({ kind: "exception", code: /numeric value/.test(exclusion) ? "value" : "needs_review", reason: exclusion });
      continue;
    }
    if (!isBulkSelectable(row)) {
      set({ kind: "exception", code: "individual_review", reason: row.extraction?.repeat ? "Repeated within the same examination of this document; tick it individually only if it is a separate measurement." : "Low-confidence extraction (OCR or single-spaced text); verify and tick it individually." });
      continue;
    }
    if (scope && findUnifiedDuplicates(history, { metricId, observedAt: row.observedAt, ...(row.datePrecision ? { datePrecision: row.datePrecision } : {}), originalUnit: storedUnitOf({ unit: row.unit, classification: current }), missionId: scope.missionId, crewMemberId: scope.crewMemberId, provenance: scope.provenance, value: row.value }).length) {
      set({ kind: "exception", code: "possible_duplicate", reason: "A stored observation from another source has the same biomarker, unit, date and value; confirm individually that it is a separate measurement." });
      continue;
    }
    candidates.push(row);
  }
  const repeats = new Set(
    batchDuplicateKeys(
      candidates.map((row) => {
        const c = row.classification.status === "matched" ? row.classification.metricId : "";
        return { key: row.key, metricId: c, observedAt: row.observedAt, ...(row.datePrecision ? { datePrecision: row.datePrecision } : {}), unit: storedUnitOf(row), value: row.value };
      }),
    ),
  );
  const validatedKeys: string[] = [];
  for (const row of candidates) {
    if (repeats.has(row.key)) {
      statuses.set(row.key, { kind: "exception", code: "possible_duplicate", reason: "Another row in this import has the same biomarker, unit, date and value; confirm individually." });
      continue;
    }
    if (!isIntakeRowEligible(row)) {
      statuses.set(row.key, { kind: "exception", code: "needs_review", reason: intakeRowExclusionReason(row) ?? "Needs review." });
      continue;
    }
    statuses.set(row.key, { kind: "validated", reason: "Catalog-matched, exact unit, plain value and explicit examination date; ready for bulk confirmation." });
    validatedKeys.push(row.key);
  }
  return { statuses, validatedKeys };
}

export interface SavedImportEntry {
  seriesKey: string;
  date: string;
}

export const seriesKeyOf = (row: { label: string; unit: string; classification: IntakeReviewRow["classification"] }) =>
  row.classification.status === "matched" ? `${row.classification.metricId}\u0000${storedUnitOf(row)}` : `label:${labelKey(row.label)}\u0000${row.unit.trim()}`;
const dayOf = (row: { observedAt: string; datePrecision?: ObservationDatePrecision | undefined }) =>
  validObservationDate({ observedAt: row.observedAt, ...(row.datePrecision ? { datePrecision: row.datePrecision } : {}) }) ? row.observedAt.slice(0, 10) : "";

export interface BulkReconciliation {
  observations: number;
  accepted: number;
  validated: number;
  unresolved: number;
  rejected: number;
  duplicates: number;
  series: number;
  examinationDates: number;
  perDate: { date: string; observations: number }[];
  undated: number;
  exceptions: { code: P61ExceptionCode; label: string; rows: number }[];
  complete: boolean;
  summary: string;
}

/** Accepted + validated + unresolved + rejected + duplicates = every observation of the import. */
export function reconcileBulkImport(rows: readonly P61ReviewRow[], statuses: ReadonlyMap<string, P61RowStatus>, saved: readonly SavedImportEntry[] = []): BulkReconciliation {
  let validated = 0;
  let unresolved = 0;
  let rejected = 0;
  let duplicates = 0;
  const exceptions = new Map<P61ExceptionCode, number>();
  for (const row of rows) {
    const s = statuses.get(row.key);
    if (!s) continue;
    if (s.kind === "validated") validated++;
    else if (s.kind === "rejected") rejected++;
    else if (s.kind === "duplicate") duplicates++;
    else {
      unresolved++;
      exceptions.set(s.code, (exceptions.get(s.code) ?? 0) + 1);
    }
  }
  const series = new Set([...rows.map(seriesKeyOf), ...saved.map((s) => s.seriesKey)]);
  const perDate = new Map<string, number>();
  let undated = 0;
  for (const row of rows) {
    const d = dayOf(row);
    if (d) perDate.set(d, (perDate.get(d) ?? 0) + 1);
    else undated++;
  }
  for (const s of saved) perDate.set(s.date, (perDate.get(s.date) ?? 0) + 1);
  const observations = rows.length + saved.length;
  const accepted = saved.length;
  const complete = observations > 0 && unresolved === 0 && validated === 0;
  const summary = !observations
    ? "No observations imported."
    : unresolved
      ? `Not complete: ${unresolved} of ${observations} observation(s) are unresolved and listed in the exception queue${validated ? `; ${validated} validated observation(s) await bulk confirmation` : ""}.`
      : validated
        ? `${validated} validated observation(s) await bulk confirmation; no unresolved observations.`
        : `All ${observations} observation(s) handled: ${accepted} accepted, ${duplicates} duplicate(s) not saved, ${rejected} rejected.`;
  return {
    observations,
    accepted,
    validated,
    unresolved,
    rejected,
    duplicates,
    series: series.size,
    examinationDates: perDate.size,
    perDate: [...perDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, n]) => ({ date, observations: n })),
    undated,
    exceptions: [...exceptions.entries()].map(([code, n]) => ({ code, label: P61_EXCEPTION_LABELS[code], rows: n })).sort((a, b) => b.rows - a.rows),
    complete,
    summary,
  };
}

// --- Envelope -------------------------------------------------------------------------------

/** Human-readable source label that records the examination-date basis and the import time (≤300 chars). */
export function importSourceLabel(row: { sourceLabel: string; examDate?: ExamDateEvidence | undefined; importedAt?: string | undefined }): string {
  const e = row.examDate;
  const basis = e && e.status === "resolved" && e.source ? ` · examination date: ${EXAM_DATE_SOURCE_TEXT[e.source]}${e.sourceText && e.source !== "manual" ? ` "${e.sourceText.slice(0, 60)}"` : ""}${e.line ? ` (line ${e.line})` : ""}` : "";
  const imported = row.importedAt ? ` · imported ${row.importedAt}` : "";
  return `${row.sourceLabel}${basis}${imported}`.slice(0, 300);
}

/**
 * Versioned envelope for one confirmed review row (the same construction for
 * the per-row and the bulk save paths). Examination date → observedAt;
 * import time → source label; creation → recordedAt.
 */
export function buildReviewedObservation(
  row: P61ReviewRow & { sourceKind: ObservationSourceKind; sourceLabel: string; documentName?: string | undefined; excerpt: string; importedAt?: string | undefined },
  input: { id: string; recordedAt: string; scope: P61Scope; duplicateWarningAcknowledged: boolean; sourceDomain?: HealthDomainId | undefined },
): UnifiedObservation {
  const { scope } = input;
  if (row.classification.status !== "matched") throw new Error("Only catalog-matched rows can be saved.");
  const demoBasis = classifyWithGovernedExtensions({ ...row, missionId: scope.missionId, provenance: scope.provenance, sourceDomain: input.sourceDomain }).syntheticDemo;
  if (row.classification.metricId.startsWith("demo:") && (scope.provenance !== "synthetic" || demoBasis?.demoId !== row.classification.metricId))
    throw new Error("A synthetic demo parameter is no longer active for this mission, or the scope is not synthetic. Nothing further was saved.");
  return {
    schema: row.datePrecision === "date" ? DATED_OBSERVATION_SCHEMA : UNIFIED_OBSERVATION_SCHEMA,
    id: input.id,
    missionId: scope.missionId,
    crewMemberId: scope.crewMemberId,
    metricId: row.classification.metricId,
    domain: row.classification.domain,
    value: row.value.trim(),
    originalUnit: storedUnitOf(row),
    // P61.3: verbatim reported unit when a closed typographic notation rule matched (never converted).
    ...(storedUnitOf(row) !== row.unit.trim() ? { reportedUnit: row.unit.trim() } : {}),
    observedAt: row.observedAt,
    ...(row.datePrecision ? { datePrecision: row.datePrecision } : {}),
    ...(row.collectionDate ? { collectionDate: row.collectionDate } : {}),
    source: {
      kind: row.sourceKind,
      label: importSourceLabel(row),
      ...(row.documentName ? { documentName: row.documentName } : {}),
      ...(row.documentSha256 ? { documentSha256: row.documentSha256 } : {}),
      ...(row.excerpt ? { excerpt: row.excerpt } : {}),
    },
    provenance: scope.provenance,
    quality: { reviewerConfirmed: true, ...(input.duplicateWarningAcknowledged ? { duplicateWarningAcknowledged: true } : {}) },
    reviewState: "accepted",
    status: "active",
    ...(demoBasis && row.classification.metricId === demoBasis.demoId ? { catalogBasis: demoBasis } : {}),
    recordedAt: input.recordedAt,
  };
}
