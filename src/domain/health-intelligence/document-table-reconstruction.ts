/**
 * P42 Universal medical document table reconstruction (pure, deterministic,
 * browser-safe, offline). Stages A–D of the document intake pipeline:
 *
 *   A. identification  — lines, pages, text layer vs OCR, document identity
 *                        (patient / record / stated examination date-time),
 *                        a declared "simulated data" marker
 *   B. layout          — header rows mapped to column ROLES through an explicit
 *                        English/Greek vocabulary (any column order), geometry
 *                        x-alignment when available, delimited cells otherwise,
 *                        and a low-confidence token fallback for OCR text
 *   C. reconstruction  — one observation per source row with its row number,
 *                        verbatim label/result/unit, reference interval and
 *                        specimen/method columns only when the document has them,
 *                        the P39 section heading, page, line and verbatim excerpt
 *   D. normalization   — only safe, reversible presentation changes (Unicode
 *                        minus, thousands separators proven by the document's own
 *                        decimal convention, exact scientific notation); the raw
 *                        string is always kept and nothing is coerced
 *
 * No template (heading, label, coordinate or value) of any specific document is
 * encoded here. Units, specimens, methods, reference ranges and timestamps are
 * never invented; categorical, time-of-day, censored and range results are kept
 * verbatim and marked unsupported for numeric storage. Catalog matching (stage E)
 * and human review (stage F) stay in the existing intake classification and
 * review workflow; this module never selects, saves or approves anything.
 */
import type { HealthDomainId } from "@/domain/health-domains/registry";
import { isCalendarDate, isExplicitInstant } from "./observation-date";
import {
  documentLineHeading,
  isPageMarkLine,
  pageFurnitureKey,
} from "./source-section-classification";

export const DOCUMENT_TABLE_RULES_VERSION = "mitochondria.document-table-reconstruction.v1";

export type ColumnRole =
  | "row_number"
  | "label"
  | "result"
  | "other_result"
  | "unit"
  | "reference"
  | "date"
  | "specimen"
  | "method"
  | "flag"
  /** P61: reported grouping column ("Domain", "Category", "Panel"); read for traceability only, never a domain assignment. */
  | "category";

export interface DocumentLineInput {
  text: string;
  page: number | null;
  /** Geometry cells (PDF text layer) with their x position; absent for plain/OCR text. */
  cells?: readonly { x: number; text: string }[] | undefined;
}

export type ValueKind =
  | "numeric"
  | "ambiguous_number"
  | "time_of_day"
  | "yes_no"
  | "categorical"
  | "comparator"
  | "range"
  | "missing";

export interface ParsedValue {
  kind: ValueKind;
  raw: string;
  /** Plain decimal string for numeric results, else "". */
  normalized: string;
  notes: string[];
}

export type IssueCode =
  | "unsupported_result_type"
  | "ambiguous_number"
  | "missing_unit"
  | "ambiguous_unit"
  | "column_mismatch"
  | "token_split_failed"
  | "token_split_ambiguous"
  | "multiple_results"
  | "wrapped_row_merged"
  | "ocr_text"
  | "headerless_table";

export interface ObservationIssue {
  code: IssueCode;
  message: string;
  /** Blocking issues keep the row out of storage until the reviewer resolves them explicitly. */
  blocking: boolean;
}

export type ExtractionLayout = "geometry" | "delimited" | "tokens";
export type ExtractionConfidence = "high" | "medium" | "low";

export interface ReconstructedSection {
  heading: string | null;
  path: string[];
  domain: HealthDomainId | null;
  rule: string | null;
}

export interface ReconstructedObservation {
  sourceRowNumber: string | null;
  label: string;
  rawValue: string;
  value: string;
  valueKind: ValueKind;
  valueNotes: string[];
  /** Exact reported unit (never normalized); "" when the document gives none. */
  unit: string;
  referenceInterval: string | null;
  specimen: string | null;
  method: string | null;
  flag: string | null;
  columnDate: string | null;
  otherResults: string[];
  section: ReconstructedSection;
  page: number | null;
  /** 1-based line in the extracted text. */
  line: number;
  excerpt: string;
  tableHeader: string | null;
  layout: ExtractionLayout;
  confidence: ExtractionConfidence;
  issues: ObservationIssue[];
  /** Same normalized label + exact unit appears earlier in this document. */
  repeat: { firstRowNumber: string | null; firstLine: number; sameValue: boolean } | null;
  /** Same normalized label appears elsewhere in this document with another unit. */
  sameLabelOtherUnits: string[];
}

export interface TimestampCandidate {
  value: string;
  precision: "date" | "instant";
  interpretation: string;
}

export interface DocumentIdentity {
  patientName: string | null;
  /** Every distinct patient name stated in the document (more than one is a conflict). */
  patientNames: string[];
  recordId: string | null;
  examDateText: string | null;
  examTimeText: string | null;
  timestampCandidates: TimestampCandidate[];
  timestampNote: string | null;
  declaresSimulated: boolean;
  metadata: { key: string; value: string; line: number }[];
}

export interface ReconstructionIssue {
  line: number | null;
  page: number | null;
  rowNumber: string | null;
  message: string;
  action: string;
}

export interface DocumentReconstruction {
  rulesVersion: typeof DOCUMENT_TABLE_RULES_VERSION;
  linesInspected: number;
  pages: number | null;
  headers: { line: number; page: number | null; text: string; roles: ColumnRole[] }[];
  observations: ReconstructedObservation[];
  issues: ReconstructionIssue[];
  identity: DocumentIdentity;
  sections: { heading: string; domain: HealthDomainId | null; page: number | null; rows: number }[];
  decimalConvention: "dot" | "comma" | "unknown" | "conflicting";
  rowNumbers: { max: number | null; missing: number[]; duplicated: string[] };
}

// --- Vocabulary -----------------------------------------------------------------
/** Lower case, accents removed (Greek tonos too), whitespace collapsed, trailing ":" dropped. */
export function normalizeHeaderText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .replace(/[:]+$/, "")
    .trim();
}

const ROLE_VOCABULARY: Readonly<Record<ColumnRole, readonly string[]>> = {
  row_number: [
    "no",
    "no.",
    "nr",
    "nr.",
    "#",
    "n",
    "n.",
    "item",
    "seq",
    "s/n",
    "α/α",
    "αα",
    "α.α.",
    "αρ",
    "αρ.",
    "α/α.",
  ],
  label: [
    "measurement",
    "measurements",
    "test",
    "tests",
    "test name",
    "analyte",
    "parameter",
    "biomarker",
    "observation",
    "examination",
    "exam",
    "investigation",
    "name",
    "variable",
    "metric",
    "test / observation",
    "εξεταση",
    "εξετασεις",
    "παραμετρος",
    "μετρηση",
    "δεικτης",
    "ονομασια",
  ],
  result: [
    "result",
    "results",
    "value",
    "measured value",
    "finding",
    "αποτελεσμα",
    "αποτελεσματα",
    "τιμη",
    "ευρημα",
  ],
  other_result: ["previous", "previous result", "prior result", "προηγουμενο", "προηγουμενη τιμη"],
  unit: [
    "unit",
    "units",
    "unit / scale",
    "unit/scale",
    "scale",
    "uom",
    "μοναδα",
    "μοναδες",
    "μοναδα μετρησης",
    "μον.",
    "μον",
  ],
  reference: [
    "reference",
    "reference range",
    "reference interval",
    "ref. range",
    "ref range",
    "ref.",
    "normal range",
    "normal values",
    "τιμες αναφορας",
    "φυσιολογικες τιμες",
    "ευρος αναφορας",
  ],
  date: ["date", "collected", "collection date", "sample date", "ημερομηνια", "ημ/νια"],
  specimen: ["specimen", "sample", "sample type", "matrix", "δειγμα"],
  method: ["method", "assay", "technique", "μεθοδος"],
  flag: ["flag", "status", "comment", "remark", "ενδειξη", "σχολιο"],
  category: ["domain", "category", "panel", "body system", "system", "group", "κατηγορια", "συστημα"],
};
const VOCABULARY = new Map<string, ColumnRole>(
  (Object.entries(ROLE_VOCABULARY) as [ColumnRole, readonly string[]][]).flatMap(([role, words]) =>
    words.map((w) => [normalizeHeaderText(w), role] as const),
  ),
);
const MAX_HEADER_PHRASE = 4;

/** P61: vocabulary role of one header cell (exact vocabulary phrase only), else null. */
export function headerCellRole(cell: string): ColumnRole | null {
  return VOCABULARY.get(normalizeHeaderText(cell)) ?? null;
}

/** Column roles of one header row; null unless every cell is vocabulary and label+result exist. */
export function mapHeaderCells(cells: readonly string[]): ColumnRole[] | null {
  if (cells.length < 2 || cells.length > 12) return null;
  const roles: ColumnRole[] = [];
  for (const cell of cells) {
    const role = VOCABULARY.get(normalizeHeaderText(cell));
    if (!role) return null;
    roles.push(role);
  }
  return roles.includes("label") && roles.includes("result") ? roles : null;
}

/** Single-cell header ("No. Measurement Result Unit / scale"): greedy longest vocabulary phrases. */
function mapHeaderWords(text: string): { cells: string[]; roles: ColumnRole[] } | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 2 || words.length > 24) return null;
  const cells: string[] = [];
  const roles: ColumnRole[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let n = Math.min(MAX_HEADER_PHRASE, words.length - i); n >= 1; n--) {
      const phrase = words.slice(i, i + n).join(" ");
      const role = VOCABULARY.get(normalizeHeaderText(phrase));
      if (role) {
        cells.push(phrase);
        roles.push(role);
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }
  return roles.includes("label") && roles.includes("result") ? { cells, roles } : null;
}

// --- Values -------------------------------------------------------------------
const MINUS = /^[\u2212\u2010\u2011\u2012\u2013\u2014\uFE63\uFF0D]/;
const YES_NO = new Set(
  [
    "yes",
    "no",
    "present",
    "absent",
    "positive",
    "negative",
    "detected",
    "not detected",
    "reactive",
    "non-reactive",
    "nonreactive",
    "ναι",
    "οχι",
    "θετικο",
    "αρνητικο",
    "θετικη",
    "αρνητικη",
    "παρον",
    "απον",
  ].map(normalizeHeaderText),
);
const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
  "⁺": "+",
};
const GROUPED_COMMA = /^\d{1,3}(?:,\d{3})+$/;
const GROUPED_DOT = /^\d{1,3}(?:\.\d{3})+$/;

/** Shift a plain decimal string by a power of ten without floating-point arithmetic. */
function shiftDecimal(mantissa: string, exponent: number): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(mantissa);
  if (!m || Math.abs(exponent) > 30) return null;
  let digits = `${m[1]}${m[2] ?? ""}`;
  let point = (m[1] ?? "").length + exponent;
  if (point <= 0) {
    digits = "0".repeat(1 - point) + digits;
    point = 1;
  }
  if (point > digits.length) digits = digits + "0".repeat(point - digits.length);
  const int = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const frac = digits.slice(point).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

function decimalEvidence(raw: string): "dot" | "comma" | null {
  const v = raw.trim().replace(MINUS, "-").replace(/^[+-]/, "");
  if (/^\d+\.\d+$/.test(v) && !GROUPED_DOT.test(v)) return "dot";
  if (/^0\.\d+$/.test(v)) return "dot";
  if (/^\d+,\d+$/.test(v) && !GROUPED_COMMA.test(v)) return "comma";
  if (/^0,\d+$/.test(v)) return "comma";
  if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(v)) return "dot";
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(v)) return "comma";
  return null;
}

/** The document's own decimal convention from unambiguous result cells. */
export function inferDecimalConvention(
  values: readonly string[],
): DocumentReconstruction["decimalConvention"] {
  let dot = 0;
  let comma = 0;
  for (const v of values) {
    const e = decimalEvidence(v);
    if (e === "dot") dot++;
    else if (e === "comma") comma++;
  }
  if (dot && comma) return "conflicting";
  return dot ? "dot" : comma ? "comma" : "unknown";
}

/** Stage D: classify and safely normalize one result cell; the raw text is always kept. */
export function parseResultValue(
  rawInput: string,
  convention: DocumentReconstruction["decimalConvention"],
): ParsedValue {
  const raw = rawInput.trim();
  const notes: string[] = [];
  if (!raw || /^(?:—|–|-|n\/?a|nd)$/i.test(raw))
    return { kind: "missing", raw, normalized: "", notes };
  if (/^[<>≤≥]=?\s*[\d.,]/.test(raw) || /^(?:less|greater) than\b/i.test(raw))
    return {
      kind: "comparator",
      raw,
      normalized: "",
      notes: ["Censored result (comparison sign); kept verbatim."],
    };
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(raw))
    return {
      kind: "time_of_day",
      raw,
      normalized: "",
      notes: ["Clock-time result; never converted."],
    };
  let v = raw.replace(/\s+/g, " ");
  let sign = "";
  if (MINUS.test(v)) {
    sign = "-";
    v = v.slice(1).trim();
    notes.push("Unicode minus sign read as negative.");
  } else if (/^[+-]/.test(v)) {
    sign = v[0] === "-" ? "-" : "";
    v = v.slice(1).trim();
  }
  if (/^[\d.,]+\s*[-–—]\s*[\d.,]+$/.test(v))
    return { kind: "range", raw, normalized: "", notes: ["Range result; kept verbatim."] };
  // Spaces / narrow no-break spaces are only ever thousands separators.
  if (/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(v)) {
    notes.push("Space thousands separators removed.");
    v = v.replace(/[ \u00a0\u202f]/g, "");
  }
  const sci =
    /^(\d+(?:[.,]\d+)?)\s*(?:[eE]([+-]?\d{1,2})|[x×·]\s*10\s*(?:\^\s*([+-]?\d{1,2})|([⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,2})))$/.exec(
      v,
    );
  if (sci) {
    const mant = (sci[1] ?? "").replace(",", ".");
    const expText =
      sci[2] ?? sci[3] ?? [...(sci[4] ?? "")].map((c) => SUPERSCRIPT[c] ?? "").join("");
    const shifted = shiftDecimal(mant, Number(expText));
    if (shifted === null)
      return {
        kind: "ambiguous_number",
        raw,
        normalized: "",
        notes: ["Scientific notation out of range."],
      };
    if ((sci[1] ?? "").includes(",") && convention === "dot")
      return {
        kind: "ambiguous_number",
        raw,
        normalized: "",
        notes: ["Comma in a dot-decimal document."],
      };
    notes.push("Scientific notation written as a plain decimal (exact).");
    return { kind: "numeric", raw, normalized: `${sign}${shifted}`, notes };
  }
  if (/^\d+$/.test(v))
    return { kind: "numeric", raw, normalized: `${sign}${v.replace(/^0+(?=\d)/, "")}`, notes };
  if (GROUPED_COMMA.test(v)) {
    if (convention === "dot") {
      notes.push("Comma thousands separators removed (document uses decimal points).");
      return { kind: "numeric", raw, normalized: `${sign}${v.replace(/,/g, "")}`, notes };
    }
    if (convention === "comma" && /^\d{1,3},\d{3}$/.test(v)) {
      notes.push("Decimal comma read as decimal point (document uses decimal commas).");
      return { kind: "numeric", raw, normalized: `${sign}${v.replace(",", ".")}`, notes };
    }
    return {
      kind: "ambiguous_number",
      raw,
      normalized: "",
      notes: [
        "Comma could be a thousands separator or a decimal comma; the document does not settle it.",
      ],
    };
  }
  if (GROUPED_DOT.test(v) && convention === "comma") {
    notes.push("Dot thousands separators removed (document uses decimal commas).");
    return { kind: "numeric", raw, normalized: `${sign}${v.replace(/\./g, "")}`, notes };
  }
  if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(v) && convention !== "comma") {
    notes.push("Comma thousands separators removed.");
    return { kind: "numeric", raw, normalized: `${sign}${v.replace(/,/g, "")}`, notes };
  }
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(v) && convention !== "dot") {
    notes.push("Dot thousands separators removed; decimal comma read as decimal point.");
    return {
      kind: "numeric",
      raw,
      normalized: `${sign}${v.replace(/\./g, "").replace(",", ".")}`,
      notes,
    };
  }
  if (/^(?:\d+\.\d+|\.\d+)$/.test(v)) {
    if (convention === "comma" && GROUPED_DOT.test(v))
      return {
        kind: "ambiguous_number",
        raw,
        normalized: "",
        notes: ["Dot in a decimal-comma document."],
      };
    return { kind: "numeric", raw, normalized: `${sign}${v.startsWith(".") ? `0${v}` : v}`, notes };
  }
  if (/^(?:\d+,\d+|,\d+)$/.test(v)) {
    if (convention === "dot")
      return {
        kind: "ambiguous_number",
        raw,
        normalized: "",
        notes: ["Comma in a dot-decimal document."],
      };
    notes.push("Decimal comma read as decimal point.");
    const d = v.replace(",", ".");
    return { kind: "numeric", raw, normalized: `${sign}${d.startsWith(".") ? `0${d}` : d}`, notes };
  }
  if (YES_NO.has(normalizeHeaderText(raw)))
    return { kind: "yes_no", raw, normalized: "", notes: ["Yes/no result; kept verbatim."] };
  if (/\p{L}/u.test(raw))
    return {
      kind: "categorical",
      raw,
      normalized: "",
      notes: ["Categorical finding; kept verbatim."],
    };
  return {
    kind: "ambiguous_number",
    raw,
    normalized: "",
    notes: ["Result format not recognized."],
  };
}

const VALUE_KIND_TEXT: Record<ValueKind, string> = {
  numeric: "numeric",
  ambiguous_number: "number with ambiguous separators",
  time_of_day: "clock time",
  yes_no: "yes/no finding",
  categorical: "categorical finding",
  comparator: "censored result (<, >)",
  range: "range",
  missing: "missing result",
};
export const valueKindText = (kind: ValueKind) => VALUE_KIND_TEXT[kind];

// --- Identity -----------------------------------------------------------------
const PATIENT_KEYS = new Set(
  [
    "patient",
    "patient name",
    "name",
    "subject",
    "astronaut",
    "crew member",
    "ασθενης",
    "ονοματεπωνυμο",
    "εξεταζομενος",
    "εξεταζομενη",
    "ονομα",
  ].map(normalizeHeaderText),
);
const RECORD_KEYS = new Set(
  [
    "record",
    "record id",
    "record no",
    "record no.",
    "mrn",
    "patient id",
    "medical record",
    "medical record number",
    "examination id",
    "exam id",
    "αρ. μητρωου",
    "αριθμος μητρωου",
    "κωδικος ασθενη",
  ].map(normalizeHeaderText),
);
const DATE_KEYS = new Set(
  [
    "date",
    "exam date",
    "examination date",
    "test date",
    "date of examination",
    "ημερομηνια",
    "ημερομηνια εξετασης",
  ].map(normalizeHeaderText),
);
const TIME_KEYS = new Set(
  ["time", "exam time", "examination time", "ωρα", "ωρα εξετασης"].map(normalizeHeaderText),
);
const SIMULATED =
  /\b(?:simulated|synthetic)\b[^|]{0,30}\b(?:data|record|report|patient)\b|\bnot a clinical record\b|συνθετικ|προσομοιωμεν/i;

const pad = (n: number) => String(n).padStart(2, "0");

function dateCandidates(text: string): {
  dates: { iso: string; how: string }[];
  note: string | null;
} {
  const t = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso)
    return isCalendarDate(t)
      ? { dates: [{ iso: t, how: "ISO date" }], note: null }
      : { dates: [], note: "Invalid date." };
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return { dates: [], note: `Date "${t}" is not in a recognized numeric format.` };
  const a = Number(m[1]);
  const b = Number(m[2]);
  const y = m[3] ?? "";
  const dayFirst = `${y}-${pad(b)}-${pad(a)}`;
  const monthFirst = `${y}-${pad(a)}-${pad(b)}`;
  const out: { iso: string; how: string }[] = [];
  if (isCalendarDate(dayFirst)) out.push({ iso: dayFirst, how: "read as day/month/year" });
  if (monthFirst !== dayFirst && isCalendarDate(monthFirst))
    out.push({ iso: monthFirst, how: "read as month/day/year" });
  return {
    dates: out,
    note:
      out.length > 1
        ? `"${t}" can be read as day/month or month/day; choose explicitly.`
        : out.length
          ? null
          : "Invalid date.",
  };
}

function timeWithZone(
  text: string,
): { hhmm: string; offset: string | null; zoneText: string | null } | null {
  const m =
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(utc|gmt|z|(?:utc|gmt)?\s*[+-]\d{1,2}(?::?\d{2})?)?$/i.exec(
      text.trim(),
    );
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] ? Number(m[3]) : 0;
  if (h > 23 || min > 59 || sec > 59) return null;
  const hhmm = `${pad(h)}:${pad(min)}:${pad(sec)}`;
  const zone = (m[4] ?? "").trim();
  if (!zone) return { hhmm, offset: null, zoneText: null };
  if (/^(?:utc|gmt|z)$/i.test(zone)) return { hhmm, offset: "Z", zoneText: zone };
  const o = /([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(zone);
  if (!o || Number(o[2]) > 14) return null;
  const offset = `${o[1]}${pad(Number(o[2]))}:${o[3] ?? "00"}`;
  return {
    hhmm,
    offset: offset === "+00:00" || offset === "-00:00" ? "Z" : offset,
    zoneText: zone,
  };
}

function extractIdentity(lines: readonly DocumentLineInput[]): DocumentIdentity {
  const metadata: DocumentIdentity["metadata"] = [];
  const names: string[] = [];
  let recordId: string | null = null;
  let dateText: string | null = null;
  let timeText: string | null = null;
  let declaresSimulated = false;
  lines.forEach((l, i) => {
    const text = l.text.trim();
    if (!text || text.length > 400) return;
    if (SIMULATED.test(text)) declaresSimulated = true;
    const parts = (l.cells?.length ? l.cells.map((c) => c.text) : [text])
      .flatMap((p) => p.split(/\s*\|\s*/))
      .filter(Boolean);
    // Metadata lines consist only of "Key: value" pairs whose keys are words (never table rows).
    const pair = /^(\p{L}[\p{L} ./'-]{0,39}):\s*(.+)$/u;
    if (!parts.length || !parts.every((p) => pair.test(p.trim()))) return;
    for (const part of parts) {
      const kv = pair.exec(part.trim());
      if (!kv) continue;
      const key = normalizeHeaderText(kv[1] ?? "");
      const value = (kv[2] ?? "").trim();
      if (!value) continue;
      metadata.push({ key: (kv[1] ?? "").trim(), value, line: i + 1 });
      if (PATIENT_KEYS.has(key)) {
        if (!names.some((n) => normalizePersonName(n) === normalizePersonName(value)))
          names.push(value);
      } else if (RECORD_KEYS.has(key)) recordId ??= value;
      else if (DATE_KEYS.has(key)) dateText ??= value;
      else if (TIME_KEYS.has(key)) timeText ??= value;
    }
  });
  const candidates: TimestampCandidate[] = [];
  let note: string | null = null;
  if (dateText) {
    const d = dateCandidates(dateText);
    note = d.note;
    const tz = timeText ? timeWithZone(timeText) : null;
    if (timeText && !tz)
      note = [note, `Time "${timeText}" is not a recognized clock time; not used.`]
        .filter(Boolean)
        .join(" ");
    else if (tz && !tz.offset)
      note = [
        note,
        `Time "${timeText}" has no stated timezone; only the calendar date can be used.`,
      ]
        .filter(Boolean)
        .join(" ");
    for (const date of d.dates) {
      if (tz?.offset) {
        const value = `${date.iso}T${tz.hhmm}${tz.offset}`;
        if (isExplicitInstant(value))
          candidates.push({
            value,
            precision: "instant",
            interpretation: `${dateText} ${timeText} (${date.how}, timezone ${tz.zoneText} as stated)`,
          });
      }
      candidates.push({
        value: date.iso,
        precision: "date",
        interpretation: `${dateText} (${date.how}, date only)`,
      });
    }
  }
  return {
    patientName: names[0] ?? null,
    patientNames: names,
    recordId,
    examDateText: dateText,
    examTimeText: timeText,
    timestampCandidates: candidates,
    timestampNote: note,
    declaresSimulated,
    metadata,
  };
}

/** Case/accent/space-insensitive person-name key (comparison only; never stored). */
export function normalizePersonName(text: string): string {
  return normalizeHeaderText(text).replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

// --- Rows -----------------------------------------------------------------------
const ROW_NUMBER = /^\d{1,4}[.)]?$/;
const splitDelimited = (text: string) =>
  text
    .split(/\s+\|\s+|\s*\t+\s*| {2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
const normalizedLabelKey = (label: string) =>
  label.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();

interface ActiveHeader {
  line: number;
  page: number | null;
  text: string;
  roles: ColumnRole[];
  xs: number[] | null;
}

interface PendingRow {
  sourceRowNumber: string | null;
  cells: Map<ColumnRole, string[]>;
  page: number | null;
  line: number;
  excerpt: string;
  tableHeader: string | null;
  layout: ExtractionLayout;
  issues: ObservationIssue[];
  section: ReconstructedSection;
}

/** Assign geometry cells to header columns by x position (tolerant left edge). */
function alignByX(
  cells: readonly { x: number; text: string }[],
  xs: readonly number[],
): string[][] {
  const out: string[][] = xs.map(() => []);
  const tolerance = 12;
  for (const cell of cells) {
    let col = 0;
    for (let i = 0; i < xs.length; i++) if ((xs[i] ?? 0) <= cell.x + tolerance) col = i;
    out[col]?.push(cell.text);
  }
  return out;
}

const isValueToken = (token: string) => {
  const k = parseResultValue(token, "unknown").kind;
  return k === "numeric" || k === "ambiguous_number" || k === "time_of_day" || k === "comparator";
};

/** Token layout (OCR / single-spaced text): "<no> <label…> <value> <unit…>". Always low confidence. */
function splitTokens(rest: string): {
  label: string;
  value: string;
  unit: string;
  issues: ObservationIssue[];
} {
  const tokens = rest.trim().split(/\s+/);
  const issues: ObservationIssue[] = [];
  const j = tokens.findIndex((t, i) => i >= 1 && isValueToken(t));
  if (j < 1)
    return {
      label: rest.trim(),
      value: "",
      unit: "",
      issues: [
        {
          code: "token_split_failed",
          message: "Result could not be separated from the label in single-spaced text.",
          blocking: true,
        },
      ],
    };
  const label = tokens.slice(0, j).join(" ");
  const unit = tokens.slice(j + 1).join(" ");
  const pureNumber = /^[\u2212+-]?\d+(?:[.,]\d+)?$/;
  if (
    tokens.slice(0, j).some((t) => pureNumber.test(t)) ||
    tokens.slice(j + 1).some((t) => pureNumber.test(t))
  )
    issues.push({
      code: "token_split_ambiguous",
      message:
        "Another standalone number sits in the label or unit; the column split is uncertain.",
      blocking: true,
    });
  return { label, value: tokens[j] ?? "", unit, issues };
}

/**
 * Stages A–D for one extracted document. `lines` come from PDF geometry (with
 * cells/x), OCR or plain text. Every numbered source row under a recognized
 * table produces exactly one observation — rows are never silently dropped.
 */
export function reconstructDocumentTables(
  lines: readonly DocumentLineInput[],
  options: {
    ocr?: boolean;
    /** P61: 1-based lines owned by a date-column table; they end any active table and are not parsed here. */
    skipLines?: ReadonlySet<number>;
  } = {},
): DocumentReconstruction {
  const inspected = lines.slice(0, 5000);
  const identity = extractIdentity(inspected);
  const pagesByKey = new Map<string, Set<number>>();
  inspected.forEach((l) => {
    const k = pageFurnitureKey(l.text);
    if (!k) return;
    const set = pagesByKey.get(k) ?? new Set<number>();
    set.add(l.page ?? 0);
    pagesByKey.set(k, set);
  });
  const isFurniture = (text: string, page: number | null) =>
    isPageMarkLine(text) ||
    (page !== null && (pagesByKey.get(pageFurnitureKey(text))?.size ?? 0) >= 2);

  const headers: DocumentReconstruction["headers"] = [];
  const pending: PendingRow[] = [];
  const issues: ReconstructionIssue[] = [];
  let header: ActiveHeader | null = null;
  let top: { text: string; domain: HealthDomainId | null; rule: string | null } | null = null;
  let sub: string | null = null;
  const section = (): ReconstructedSection =>
    top
      ? {
          heading: sub ?? top.text,
          path: sub ? [top.text, sub] : [top.text],
          domain: top.domain,
          rule: top.rule,
        }
      : { heading: null, path: [], domain: null, rule: null };

  // Headerless numbered rows (typical OCR output): activated only by a run of ≥3 increasing numbered lines.
  const numbered = inspected.map((l) => {
    const m = /^(\d{1,4})[.)]?\s+(\S.*)$/.exec(l.text.trim());
    return m && !l.cells?.length && splitDelimited(l.text).length <= 1 ? Number(m[1]) : null;
  });
  const headerlessOk = (i: number) => {
    let run = 0;
    let prev = -1;
    for (let k = Math.max(0, i - 6); k <= Math.min(numbered.length - 1, i + 6); k++) {
      const n = numbered[k];
      if (n === null || n === undefined) continue;
      if (n > prev) run++;
      prev = n;
    }
    return run >= 3;
  };

  inspected.forEach((l, index) => {
    const lineNo = index + 1;
    if (options.skipLines?.has(lineNo)) {
      header = null;
      return;
    }
    const text = l.text.trim();
    if (!text || text.length > 600) return;
    const delimited = l.cells?.length
      ? l.cells.map((c) => c.text.trim()).filter(Boolean)
      : splitDelimited(text);

    // Header rows (repeated headers on continuation pages simply re-activate the mapping).
    const roles = mapHeaderCells(delimited);
    const wordHeader = !roles && delimited.length <= 1 ? mapHeaderWords(text) : null;
    if (roles || wordHeader) {
      const r = roles ?? wordHeader!.roles;
      const cellsText = roles ? delimited : wordHeader!.cells;
      header = {
        line: lineNo,
        page: l.page,
        text: cellsText.join(" | "),
        roles: r,
        xs: roles && l.cells?.length === r.length ? l.cells.map((c) => c.x) : null,
      };
      headers.push({ line: lineNo, page: l.page, text: header.text, roles: r });
      return;
    }
    const first = delimited[0] ?? "";
    const tokenNumber = /^(\d{1,4})[.)]?\s+(\S.*)$/.exec(text);
    const active: ActiveHeader | null = header;
    const hasRowNumberRole = active?.roles.includes("row_number") ?? false;
    const looksNumbered = ROW_NUMBER.test(first) || (delimited.length <= 1 && !!tokenNumber);
    // Running headers/footers repeat on several pages. A numbered table row or a domain heading that
    // happens to repeat (the same reading in two examinations, a section per examination) is content.
    // P61: in an un-numbered table, a row whose cells match the header column count with a readable
    // result and a lettered label is a measurement row (the same reading in several examinations).
    const alignedTableRow =
      active !== null &&
      !hasRowNumberRole &&
      delimited.length === active.roles.length &&
      isValueToken(delimited[active.roles.indexOf("result")] ?? "") &&
      /\p{L}/u.test(delimited[active.roles.indexOf("label")] ?? "");
    const repeatedContent =
      (active !== null &&
        looksNumbered &&
        (delimited.length >= 2 || (delimited.length <= 1 && !!tokenNumber))) ||
      alignedTableRow ||
      Boolean(documentLineHeading(text)?.domain);
    if (!repeatedContent && isFurniture(text, l.page)) return;

    // Continuation of a wrapped label: an un-numbered line inside a numbered table whose
    // cells sit only in the label column (geometry) or that starts in lower case (text).
    if (active && hasRowNumberRole && !looksNumbered) {
      const h: ActiveHeader = active;
      const prev = pending[pending.length - 1];
      const labelIndex = h.roles.indexOf("label");
      const labelOnly =
        prev !== undefined &&
        prev.page === l.page &&
        lineNo - prev.line <= 2 &&
        (l.cells?.length && h.xs
          ? alignByX(l.cells, h.xs).every((col, i) => !col.length || i === labelIndex) &&
            (l.cells[0]?.x ?? 0) >= (h.xs[labelIndex] ?? 0) - 12
          : delimited.length === 1 && /^[\p{Ll}(]/u.test(text));
      if (prev && labelOnly) {
        const labels = prev.cells.get("label") ?? [];
        labels.push(text);
        prev.cells.set("label", labels);
        prev.excerpt = `${prev.excerpt} ${text}`.slice(0, 350);
        prev.issues.push({
          code: "wrapped_row_merged",
          message: `Wrapped label continued on line ${lineNo}; check the joined label.`,
          blocking: false,
        });
        return;
      }
    }

    // Section headings use the unchanged P39 rule (verbatim text, versioned aliases only).
    if (!looksNumbered) {
      const heading = documentLineHeading(text);
      if (heading && delimited.length <= 2) {
        if (heading.level === 1 || heading.domain) {
          top = { text: heading.text, domain: heading.domain, rule: heading.rule };
          sub = null;
        } else if (top) sub = heading.text;
        else top = { text: heading.text, domain: null, rule: null };
        return;
      }
    }

    if (active) {
      const h: ActiveHeader = active;
      if (hasRowNumberRole && !looksNumbered) return;
      if (hasRowNumberRole || delimited.length >= 2) {
        let columns: string[][] | null = null;
        let layout: ExtractionLayout = "delimited";
        const rowIssues: ObservationIssue[] = [];
        if (l.cells?.length && h.xs) {
          columns = alignByX(l.cells, h.xs);
          layout = "geometry";
        } else if (delimited.length === h.roles.length) {
          columns = delimited.map((c) => [c]);
          layout = l.cells?.length ? "geometry" : "delimited";
        } else if (delimited.length <= 1 && tokenNumber && hasRowNumberRole) {
          const t = splitTokens(tokenNumber[2] ?? "");
          const byRole = new Map<ColumnRole, string>([
            ["row_number", tokenNumber[1] ?? ""],
            ["label", t.label],
            ["result", t.value],
            ["unit", t.unit],
          ]);
          columns = h.roles.map((r) => (byRole.get(r) ? [byRole.get(r)!] : []));
          layout = "tokens";
          rowIssues.push(...t.issues);
          if (h.roles.some((r) => !["row_number", "label", "result", "unit"].includes(r)))
            rowIssues.push({
              code: "column_mismatch",
              message: "Single-spaced text cannot be split into this table's extra columns.",
              blocking: true,
            });
        } else {
          columns = null;
        }
        if (!columns) {
          const rowNumber = ROW_NUMBER.test(first) ? first.replace(/[.)]$/, "") : null;
          if (!hasRowNumberRole && !rowNumber) return;
          pending.push({
            sourceRowNumber: rowNumber,
            cells: new Map([["label", [delimited.slice(rowNumber ? 1 : 0).join(" ")]]]),
            page: l.page,
            line: lineNo,
            excerpt: text.slice(0, 350),
            tableHeader: h.text,
            layout: "delimited",
            issues: [
              {
                code: "column_mismatch",
                message: `${delimited.length} cell(s) found for ${h.roles.length} column(s); columns could not be aligned.`,
                blocking: true,
              },
            ],
            section: section(),
          });
          return;
        }
        const cells = new Map<ColumnRole, string[]>();
        h.roles.forEach((role, i) => {
          const parts = columns![i] ?? [];
          if (!parts.length) return;
          const list = cells.get(role) ?? [];
          list.push(parts.join(" "));
          cells.set(role, list);
        });
        const rowNumberText = (cells.get("row_number") ?? [])[0] ?? null;
        if (hasRowNumberRole && (!rowNumberText || !ROW_NUMBER.test(rowNumberText))) return;
        if (!hasRowNumberRole && !(cells.get("label") ?? []).some((x) => /\p{L}/u.test(x))) return;
        pending.push({
          sourceRowNumber: rowNumberText ? rowNumberText.replace(/[.)]$/, "") : null,
          cells,
          page: l.page,
          line: lineNo,
          excerpt: text.slice(0, 350),
          tableHeader: h.text,
          layout,
          issues: rowIssues,
          section: section(),
        });
        return;
      }
      return;
    }

    // No header seen: headerless numbered-row pattern only.
    if (tokenNumber && delimited.length <= 1 && headerlessOk(index)) {
      const t = splitTokens(tokenNumber[2] ?? "");
      pending.push({
        sourceRowNumber: tokenNumber[1] ?? null,
        cells: new Map<ColumnRole, string[]>([
          ["label", [t.label]],
          ["result", t.value ? [t.value] : []],
          ["unit", t.unit ? [t.unit] : []],
        ]),
        page: l.page,
        line: lineNo,
        excerpt: text.slice(0, 350),
        tableHeader: null,
        layout: "tokens",
        issues: [
          ...t.issues,
          {
            code: "headerless_table",
            message: "No table header was read; columns inferred from the numbered-row pattern.",
            blocking: false,
          },
        ],
        section: section(),
      });
    }
  });

  // Stage D with the document's own decimal convention.
  const convention = inferDecimalConvention(pending.flatMap((p) => p.cells.get("result") ?? []));
  const observations: ReconstructedObservation[] = pending.map((p) => {
    const one = (role: ColumnRole) => {
      const v = (p.cells.get(role) ?? []).join(" ").trim();
      return v ? v : null;
    };
    const issues = [...p.issues];
    const results = p.cells.get("result") ?? [];
    let rawValue = results[0]?.trim() ?? "";
    let unit = one("unit") ?? "";
    // A dash / "N/A" placeholder means the source reports no unit.
    if (/^(?:—|–|-|n\/?a)$/i.test(unit)) unit = "";
    if (results.length > 1)
      issues.push({
        code: "multiple_results",
        message: `${results.length} result columns in one row; choose the result explicitly.`,
        blocking: true,
      });
    // A result cell that carries its own unit ("12.3 mg/L") when the table has no unit column.
    if (!p.cells.has("unit") && !unit) {
      const m = /^([^\s]+)\s+(.+)$/.exec(rawValue);
      if (m && parseResultValue(m[1] ?? "", convention).kind === "numeric") {
        rawValue = m[1] ?? "";
        unit = (m[2] ?? "").trim();
      }
    }
    const parsed = parseResultValue(rawValue, convention);
    if (
      parsed.kind !== "numeric" &&
      parsed.kind !== "ambiguous_number" &&
      parsed.kind !== "missing"
    )
      issues.push({
        code: "unsupported_result_type",
        message: `Unsupported result type for numeric storage: ${valueKindText(parsed.kind)} ("${parsed.raw}").`,
        blocking: true,
      });
    if (parsed.kind === "ambiguous_number")
      issues.push({
        code: "ambiguous_number",
        message: `${parsed.notes.join(" ")} Source shows "${parsed.raw}"; enter the value explicitly after checking the original.`,
        blocking: true,
      });
    if (!unit && parsed.kind !== "yes_no" && parsed.kind !== "categorical")
      issues.push({
        code: "missing_unit",
        message: "No unit is reported in the source; units are never inferred.",
        blocking: true,
      });
    if (unit && /\s(?:or|ή|ή)\s/i.test(unit))
      issues.push({
        code: "ambiguous_unit",
        message: `The source lists alternative units ("${unit}"); the exact unit must be chosen explicitly.`,
        blocking: true,
      });
    if (options.ocr)
      issues.push({
        code: "ocr_text",
        message:
          "Read by on-device OCR: verify every digit, decimal point and unit symbol against the original.",
        blocking: false,
      });
    const blocking = issues.some((x) => x.blocking);
    const confidence: ExtractionConfidence =
      options.ocr || p.layout === "tokens" || blocking
        ? "low"
        : p.layout === "geometry" && !issues.length
          ? "high"
          : "medium";
    return {
      sourceRowNumber: p.sourceRowNumber,
      label: (p.cells.get("label") ?? []).join(" ").trim(),
      rawValue: parsed.raw,
      value: parsed.normalized,
      valueKind: parsed.kind,
      valueNotes: parsed.notes,
      unit,
      referenceInterval: one("reference"),
      specimen: one("specimen"),
      method: one("method"),
      flag: one("flag"),
      columnDate: one("date"),
      otherResults: p.cells.get("other_result") ?? [],
      section: p.section,
      page: p.page,
      line: p.line,
      excerpt: p.excerpt,
      tableHeader: p.tableHeader,
      layout: p.layout,
      confidence,
      issues,
      repeat: null,
      sameLabelOtherUnits: [],
    };
  });

  // Repeated measurements: provenance kept per row, never merged or dropped.
  const firstByKey = new Map<string, ReconstructedObservation>();
  const unitsByLabel = new Map<string, Set<string>>();
  for (const o of observations) {
    const labelKey = normalizedLabelKey(o.label);
    const units = unitsByLabel.get(labelKey) ?? new Set<string>();
    units.add(o.unit);
    unitsByLabel.set(labelKey, units);
    const key = `${labelKey}\u0000${o.unit}`;
    const first = firstByKey.get(key);
    if (first)
      o.repeat = {
        firstRowNumber: first.sourceRowNumber,
        firstLine: first.line,
        sameValue: first.rawValue === o.rawValue,
      };
    else firstByKey.set(key, o);
  }
  for (const o of observations) {
    const units = unitsByLabel.get(normalizedLabelKey(o.label));
    o.sameLabelOtherUnits = units ? [...units].filter((u) => u !== o.unit) : [];
  }

  // Row-number integrity: gaps and duplicates are reported, never filled.
  const nums = observations
    .map((o) => Number(o.sourceRowNumber))
    .filter((n) => Number.isInteger(n) && n > 0);
  const max = nums.length ? Math.max(...nums) : null;
  const seen = new Map<string, number>();
  for (const o of observations)
    if (o.sourceRowNumber) seen.set(o.sourceRowNumber, (seen.get(o.sourceRowNumber) ?? 0) + 1);
  const missing: number[] = [];
  if (max !== null && Math.min(...nums) <= 1 && max <= 5000) {
    const have = new Set(nums);
    for (let n = 1; n <= max; n++) if (!have.has(n)) missing.push(n);
  }
  const duplicated = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  for (const n of missing)
    issues.push({
      line: null,
      page: null,
      rowNumber: String(n),
      message: `Source row ${n} was not found in the extracted text.`,
      action: "Check the original page and enter the row manually if it exists.",
    });
  for (const n of duplicated)
    issues.push({
      line: null,
      page: null,
      rowNumber: n,
      message: `Row number ${n} appears more than once.`,
      action: "Review both rows against the original; neither is merged or dropped.",
    });
  for (const o of observations)
    for (const issue of o.issues.filter((x) => x.blocking))
      issues.push({
        line: o.line,
        page: o.page,
        rowNumber: o.sourceRowNumber,
        message: `${o.label || "(no label)"}: ${issue.message}`,
        action: "Review-only until resolved explicitly by the reviewer.",
      });

  const sectionCounts = new Map<
    string,
    { heading: string; domain: HealthDomainId | null; page: number | null; rows: number }
  >();
  for (const o of observations) {
    const heading = o.section.path[0] ?? "(no section)";
    const entry = sectionCounts.get(heading) ?? {
      heading,
      domain: o.section.domain,
      page: o.page,
      rows: 0,
    };
    entry.rows++;
    sectionCounts.set(heading, entry);
  }
  const pageNumbers = inspected
    .map((l) => l.page)
    .filter((p): p is number => typeof p === "number");
  return {
    rulesVersion: DOCUMENT_TABLE_RULES_VERSION,
    linesInspected: inspected.length,
    pages: pageNumbers.length ? Math.max(...pageNumbers) : null,
    headers,
    observations,
    issues,
    identity,
    sections: [...sectionCounts.values()],
    decimalConvention: convention,
    rowNumbers: { max, missing, duplicated },
  };
}

/** Lines for the reconstruction from extracted text (pipes from PDF geometry, tabs, spaces). */
export function documentLinesFromText(
  text: string,
  linePages?: readonly number[],
  geometry?: readonly { page: number; cells: readonly { x: number; text: string }[] }[],
): DocumentLineInput[] {
  const textLines = text.split(/\r?\n/);
  const useGeometry = geometry && geometry.length === textLines.length;
  return textLines.map((t, i) => ({
    text: t,
    page: linePages?.[i] ?? null,
    ...(useGeometry ? { cells: geometry![i]!.cells } : {}),
  }));
}
