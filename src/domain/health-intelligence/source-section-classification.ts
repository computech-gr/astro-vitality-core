/**
 * P39 source-aware biomarker domain classification (pure, deterministic,
 * browser-safe, offline).
 *
 * Extracts the heading / subsection hierarchy, table header context and row
 * provenance (page + line, or data row) of medical examination documents
 * (PDF geometry text, plain text, CSV and the first XLSX sheet) and proposes a
 * health domain for a biomarker with this precedence:
 *
 *   1. an existing authorized canonical mapping, where compatible
 *   2. reliable explicit medical-section provenance (versioned heading rules)
 *   3. versioned scientific catalog references and approved aliases
 *   4. explainable candidate rules (shown, never prepopulated)
 *   5. human review when evidence is insufficient or conflicting
 *
 * A section heading only maps to a domain when the WHOLE normalized heading
 * equals one of the explicit, versioned aliases below; a keyword inside a
 * heading or a label never assigns a domain. Unrecognized headings end the
 * previous section, so later rows are never attributed to an earlier domain.
 * Section provenance is classification evidence only: it is never scientific
 * validation, never an approval and never an activation.
 */
import type { HealthDomainId } from "@/domain/health-domains/registry";
import { normalizeCatalogText } from "./catalog-lifecycle";

export const SOURCE_SECTION_RULES_VERSION = "mitochondria.source-section-rules.v1";
export const SOURCE_SECTION_EVIDENCE_SCHEMA = "mitochondria.source-section-evidence.v1";
export const SOURCE_SECTION_STATUS =
  "SOURCE_DOCUMENT_SECTION_EVIDENCE — classification evidence only, not scientific validation";

/** Explicit, versioned whole-heading aliases (normalized: lower case, "&" → "and"). */
export const SECTION_HEADING_ALIASES: Readonly<Record<HealthDomainId, readonly string[]>> = {
  bone: [
    "bone health",
    "bone",
    "bone metabolism",
    "bone and mineral metabolism",
    "bone mineral metabolism",
    "bone and mineral health",
    "skeletal health",
  ],
  cardiovascular: [
    "cardiovascular health",
    "cardiovascular",
    "cardiovascular system",
    "cardiovascular function",
    "cardiology",
  ],
  immune: ["immune system", "immune health", "immune function", "immunology", "immune"],
  behavioral: [
    "behavioral and psychological health",
    "behavioral and psychological",
    "behavioral health",
    "behavioral health and performance",
    "psychological health",
    "behavioral",
    "psychological",
  ],
};
const ALIAS_TO_DOMAIN = new Map<string, HealthDomainId>(
  (Object.entries(SECTION_HEADING_ALIASES) as [HealthDomainId, readonly string[]][]).flatMap(
    ([d, list]) => list.map((a) => [a, d] as const),
  ),
);

export interface SourceSection {
  /** Verbatim heading text of the innermost section. */
  heading: string;
  /** Verbatim heading hierarchy, outermost first. */
  path: string[];
  /** Domain from an explicit whole-heading alias of the domain-level heading, else null. */
  domain: HealthDomainId | null;
  /** The normalized alias that matched, or null when the heading is unrecognized. */
  rule: string | null;
}
export interface SourceRowEvidence {
  label: string;
  unit: string;
  /** 1-based page (PDF) or null. */
  page: number | null;
  /** 1-based line in the extracted text, or 1-based data row for CSV / XLSX. */
  line: number;
  locator: "page_line" | "text_line" | "csv_row" | "xlsx_row";
  tableHeader: string | null;
  section: SourceSection | null;
  /** Verbatim trimmed source line (or joined cells), for joining parser candidates. */
  excerpt: string;
}
export interface SourceDocumentEvidence {
  schema: typeof SOURCE_SECTION_EVIDENCE_SCHEMA;
  rulesVersion: typeof SOURCE_SECTION_RULES_VERSION;
  sha256: string;
  fileName: string;
  kind: "pdf" | "text" | "csv" | "xlsx";
  pages: number | null;
  /** Domain-level headings in document order with their recognized domain. */
  headings: {
    heading: string;
    domain: HealthDomainId | null;
    page: number | null;
    line: number;
    /** Count printed with the heading ("| 63 observations"), when present. */
    declaredCount: number | null;
  }[];
  rows: SourceRowEvidence[];
}

// --- Heading rules ---------------------------------------------------------------
const COUNT_SUFFIX =
  /\s*(?:[|:–—-]\s*)?\(?\s*\d+\s+(?:observations?|results?|tests?|items?|measurements?|parameters?)\s*\)?\s*$/i;
const declaredCount = (line: string): number | null => {
  const m = /(\d+)\s+(?:observations?|results?|tests?|items?|measurements?|parameters?)\s*\)?\s*$/i.exec(line);
  return m ? Number(m[1]) : null;
};
const NUMBERING = /^(?:#{1,6}\s*|(?:section|part)\s+[\dIVX]+\s*[.:–—-]?\s*|[\dIVX]+(?:\.\d+)*[.)]\s+)/i;

/** Normalized heading text for exact alias comparison (never a keyword search). */
export function normalizeHeading(text: string): string {
  return text
    .replace(/\s*\((?:continued|cont\.?)\)\s*$/i, "")
    .replace(COUNT_SUFFIX, "")
    .trim()
    .replace(NUMBERING, "")
    .replace(/[:;.\s]+$/, "")
    .replace(/&/g, " and ")
    .replace(/\bbehavioural\b/gi, "behavioral")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}
/** Domain of a heading only when the whole normalized heading is an explicit alias. */
export function headingDomain(text: string): { domain: HealthDomainId; rule: string } | null {
  const rule = normalizeHeading(text);
  const domain = ALIAS_TO_DOMAIN.get(rule);
  return domain ? { domain, rule } : null;
}

const HEADER_WORDS = new Set([
  "test",
  "tests",
  "observation",
  "analyte",
  "parameter",
  "biomarker",
  "measurement",
  "result",
  "results",
  "value",
  "unit",
  "units",
  "scale",
  "collected",
  "date",
  "flag",
  "reference",
  "name",
  "label",
  "variable",
  "metric",
]);
const splitCells = (line: string) =>
  line
    .split(/\s+\|\s+|\t+| {2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
const NUMERIC = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
const MISSING = /^(?:—|–|-|n\/?a)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function isTableHeader(cells: string[]): boolean {
  if (cells.length < 2 || cells.some((c) => /\d/.test(c))) return false;
  const words = cells.flatMap((c) => c.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  return words.filter((w) => HEADER_WORDS.has(w)).length >= 2;
}
/** Page furniture: running headers/footers and page numbers never change the section. */
const PAGE_MARK = /\bpage\s+\d+(?:\s*(?:of|\/)\s*\d+)?\s*$/i;
const furnitureKey = (line: string) => line.replace(PAGE_MARK, "").replace(/\d+\s*$/, "").trim();

type HeadingKind = { level: 1 | 2; text: string } | null;
function headingKind(line: string, cells: string[]): HeadingKind {
  if (line.length > 90) return null;
  // "HEADING" or "HEADING | 63 observations" only.
  const text =
    cells.length === 1
      ? cells[0]!
      : cells.length === 2 && COUNT_SUFFIX.test(` | ${cells[1]}`)
        ? cells[0]!
        : null;
  if (!text) return null;
  const core = normalizeHeading(text);
  if (!core || /\d/.test(core.replace(/^\d+(?:\.\d+)*[.)]\s+/, ""))) return null;
  const words = core.split(" ");
  if (words.length > 6) return null;
  if (ALIAS_TO_DOMAIN.has(core)) return { level: 1, text };
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 3 && letters === letters.toLocaleUpperCase("en-US") && /^[\p{L}\d#]/u.test(text))
    return { level: 1, text };
  // Title Case subsection ("Bone Turnover Markers"): every significant word capitalized.
  const titleWords = text.split(/\s+/);
  const small = new Set(["and", "of", "the", "&", "/", "-", "in", "for"]);
  if (
    titleWords.length <= 6 &&
    /^[A-Z]/.test(text) &&
    !/[()/:=,;]/.test(text) &&
    titleWords.every((w) => small.has(w.toLowerCase()) || /^[A-Z][A-Za-z-]*$/.test(w))
  )
    return { level: 2, text };
  return null;
}

/** Lenient row shape for evidence only (label + unit); values are never kept. */
function rowShape(cells: string[]): { label: string; unit: string } | null {
  if (cells.length < 2) return null;
  const d = cells.findIndex((c, i) => i >= 2 && ISO_DATE.test(c));
  const pre = d >= 0 ? cells.slice(0, d) : cells;
  if (d < 0 && pre.length < 3) return null;
  const label = pre[0]!;
  if (!/\p{L}/u.test(label) || label.length > 100 || ISO_DATE.test(label)) return null;
  let unit: string;
  const v = pre[1] ?? "";
  if (NUMERIC.test(v) || MISSING.test(v)) unit = pre.slice(2).join(" ");
  else {
    const m = /^([-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s+(.+)$/.exec(v);
    if (!m) return null;
    unit = [m[2]!, ...pre.slice(2)].join(" ");
  }
  unit = unit.trim();
  if (!unit || unit.length > 90 || MISSING.test(unit)) return null;
  return { label: label.trim(), unit };
}

interface Tracker {
  top: { text: string; domain: HealthDomainId | null; rule: string | null } | null;
  sub: string | null;
}
const sectionOf = (t: Tracker): SourceSection | null =>
  t.top
    ? {
        heading: t.sub ?? t.top.text,
        path: t.sub ? [t.top.text, t.sub] : [t.top.text],
        domain: t.top.domain,
        rule: t.top.rule,
      }
    : null;
function enterHeading(t: Tracker, h: NonNullable<HeadingKind>) {
  const hit = headingDomain(h.text);
  if (h.level === 1 || hit) {
    t.top = { text: h.text, domain: hit?.domain ?? null, rule: hit?.rule ?? null };
    t.sub = null;
  } else if (t.top) t.sub = h.text;
  else t.top = { text: h.text, domain: null, rule: null };
}

/** Section-aware evidence for extracted document text (PDF geometry, OCR or plain text). */
export function extractTextSourceEvidence(
  text: string,
  meta: { sha256: string; fileName: string; kind: "pdf" | "text"; pages?: number | null },
  linePages?: readonly number[],
): SourceDocumentEvidence {
  const lines = text.split(/\r?\n/);
  // Lines repeated identically (ignoring page numbers) on ≥2 pages are running headers/footers.
  const pagesByKey = new Map<string, Set<number>>();
  lines.forEach((l, i) => {
    const k = furnitureKey(l.trim());
    if (!k) return;
    const set = pagesByKey.get(k) ?? new Set<number>();
    set.add(linePages?.[i] ?? 0);
    pagesByKey.set(k, set);
  });
  const t: Tracker = { top: null, sub: null };
  let tableHeader: string | null = null;
  const headings: SourceDocumentEvidence["headings"] = [];
  const rows: SourceRowEvidence[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.length > 500) return;
    const page = linePages?.[i] ?? null;
    const cells = splitCells(line);
    if (isTableHeader(cells)) {
      tableHeader = cells.join(" | ");
      return;
    }
    const shape = rowShape(cells);
    if (!shape) {
      if (PAGE_MARK.test(line)) return;
      const h = headingKind(line, cells);
      const furniture =
        !!linePages &&
        !headingDomain(h?.text ?? line) &&
        (pagesByKey.get(furnitureKey(line))?.size ?? 0) >= 2;
      if (h && !furniture) {
        enterHeading(t, h);
        if (h.level === 1 || headingDomain(h.text))
          headings.push({
            heading: h.text,
            domain: t.top?.domain ?? null,
            page,
            line: i + 1,
            declaredCount: declaredCount(line),
          });
        if (h.level === 1) tableHeader = null;
      }
      return;
    }
    rows.push({
      ...shape,
      page,
      line: i + 1,
      locator: page ? "page_line" : "text_line",
      tableHeader,
      section: sectionOf(t),
      excerpt: line.slice(0, 350),
    });
  });
  return {
    schema: SOURCE_SECTION_EVIDENCE_SCHEMA,
    rulesVersion: SOURCE_SECTION_RULES_VERSION,
    sha256: meta.sha256,
    fileName: meta.fileName,
    kind: meta.kind,
    pages: meta.pages ?? (linePages?.length ? Math.max(...linePages) : null),
    headings,
    rows,
  };
}

const LABEL_COLS = ["label", "variable", "metric", "metric_id", "name", "test", "test / observation", "observation", "analyte", "biomarker", "parameter"];
const UNIT_COLS = ["unit", "units", "unit / scale"];
const SECTION_COLS = ["section", "domain", "department", "panel", "category", "system", "health domain"];

/** Section-aware evidence for CSV / first-sheet XLSX grids (header row or section rows). */
export function extractGridSourceEvidence(
  grid: readonly (readonly string[])[],
  meta: { sha256: string; fileName: string; kind: "csv" | "xlsx" },
): SourceDocumentEvidence {
  const rows: SourceRowEvidence[] = [];
  const headings: SourceDocumentEvidence["headings"] = [];
  const nonEmpty = grid.map((r) => r.map((c) => (c ?? "").trim())).filter((r) => r.some(Boolean));
  const head = (nonEmpty[0] ?? []).map((c) => c.toLowerCase().replace(/^\ufeff/, ""));
  const li = head.findIndex((c) => LABEL_COLS.includes(c));
  const ui = head.findIndex((c) => UNIT_COLS.includes(c));
  const si = head.findIndex((c) => SECTION_COLS.includes(c));
  const header = li >= 0 && ui >= 0;
  const tableHeader = header ? (nonEmpty[0] ?? []).join(" | ") : null;
  const t: Tracker = { top: null, sub: null };
  nonEmpty.slice(header ? 1 : 0).forEach((cells, idx) => {
    const line = idx + (header ? 2 : 1);
    const filled = cells.filter(Boolean);
    if (filled.length === 1 && !NUMERIC.test(filled[0]!)) {
      const h = headingKind(filled[0]!, [filled[0]!]) ?? { level: 1 as const, text: filled[0]! };
      enterHeading(t, h);
      headings.push({
        heading: h.text,
        domain: t.top?.domain ?? null,
        page: null,
        line,
        declaredCount: declaredCount(filled[0]!),
      });
      return;
    }
    const label = header ? (cells[li] ?? "") : (cells[0] ?? "");
    const unit = header ? (cells[ui] ?? "") : (cells[2] ?? "");
    if (!label || !unit || !/\p{L}/u.test(label)) return;
    let section = sectionOf(t);
    if (si >= 0 && cells[si]) {
      const hit = headingDomain(cells[si]!);
      section = { heading: cells[si]!, path: [cells[si]!], domain: hit?.domain ?? null, rule: hit?.rule ?? null };
    }
    rows.push({
      label,
      unit,
      page: null,
      line,
      locator: meta.kind === "csv" ? "csv_row" : "xlsx_row",
      tableHeader,
      section,
      excerpt: cells.join(",").slice(0, 350),
    });
  });
  return {
    schema: SOURCE_SECTION_EVIDENCE_SCHEMA,
    rulesVersion: SOURCE_SECTION_RULES_VERSION,
    sha256: meta.sha256,
    fileName: meta.fileName,
    kind: meta.kind,
    pages: null,
    headings,
    rows,
  };
}

// --- Per-row section lookup for intake candidates -------------------------------
export interface CandidateSourceSection {
  status: "recognized" | "unrecognized_heading" | "no_section" | "ambiguous";
  heading: string | null;
  path: string[];
  domain: HealthDomainId | null;
  page: number | null;
  line: number | null;
  locator: SourceRowEvidence["locator"] | null;
  tableHeader: string | null;
  rulesVersion: typeof SOURCE_SECTION_RULES_VERSION;
}
/** Section of one parser candidate, joined by its verbatim excerpt (identical rows in two sections → ambiguous). */
export function sectionForExcerpt(
  evidence: SourceDocumentEvidence,
  excerpt: string,
): CandidateSourceSection {
  const key = excerpt.trim();
  const hits = evidence.rows.filter((r) => r.excerpt === key || (key.length >= 350 && r.excerpt.startsWith(key)));
  const base = { rulesVersion: SOURCE_SECTION_RULES_VERSION } as const;
  if (!hits.length)
    return { ...base, status: "no_section", heading: null, path: [], domain: null, page: null, line: null, locator: null, tableHeader: null };
  const domains = new Set(hits.map((h) => h.section?.domain ?? null));
  const first = hits[0]!;
  if (domains.size > 1)
    return { ...base, status: "ambiguous", heading: null, path: [], domain: null, page: first.page, line: first.line, locator: first.locator, tableHeader: first.tableHeader };
  const s = first.section;
  return {
    ...base,
    status: !s ? "no_section" : s.domain ? "recognized" : "unrecognized_heading",
    heading: s?.heading ?? null,
    path: s?.path ?? [],
    domain: s?.domain ?? null,
    page: first.page,
    line: first.line,
    locator: first.locator,
    tableHeader: first.tableHeader,
  };
}

// --- Domain proposal for a submitted term --------------------------------------
export type DomainConfidence = "high" | "medium" | "low" | "none";
export type DomainBasis =
  | "authorized_mapping"
  | "source_section"
  | "catalog_reference"
  | "candidate_rule"
  | "human_review";
export interface DomainEvidenceRef {
  documentSha256: string;
  fileName: string;
  page: number | null;
  line: number;
  locator: SourceRowEvidence["locator"];
  heading: string | null;
  path: string[];
  domain: HealthDomainId | null;
  tableHeader: string | null;
  unit: string;
}
export interface TermDomainProposal {
  domain: HealthDomainId | null;
  basis: DomainBasis;
  confidence: DomainConfidence;
  /** True only for high-confidence source-section proposals (prepopulated, still need Researcher acceptance). */
  prepopulate: boolean;
  evidence: DomainEvidenceRef[];
  /** Plain-language explanation, including any ambiguity or conflict. */
  reason: string;
  conflict: boolean;
}
export interface TermForDomain {
  originalLabels: readonly string[];
  exactUnit: string;
  sourceDocumentSha256?: readonly string[] | undefined;
}

const DOMAIN_NAME: Record<HealthDomainId, string> = {
  bone: "Bone",
  cardiovascular: "Cardiovascular",
  immune: "Immune",
  behavioral: "Behavioral",
};
const where = (e: DomainEvidenceRef) =>
  `${e.heading ?? "no section"}${e.page ? `, page ${e.page}` : ""}, ${e.locator === "csv_row" || e.locator === "xlsx_row" ? "row" : "line"} ${e.line}`;

/**
 * Source-section proposal for one submitted term from the documents it cites
 * (joined by SHA-256 only). Exact normalized label AND exact unit text are
 * required for high confidence; catalog references that name another domain
 * make it a conflict for explicit review.
 */
export function proposeDomainFromSources(
  term: TermForDomain,
  documents: readonly SourceDocumentEvidence[],
  referenceDomains: readonly HealthDomainId[] = [],
): TermDomainProposal {
  const none = (reason: string, evidence: DomainEvidenceRef[] = [], confidence: DomainConfidence = "none", conflict = false): TermDomainProposal => ({
    domain: null,
    basis: "human_review",
    confidence,
    prepopulate: false,
    evidence,
    reason,
    conflict,
  });
  const cited = new Set(term.sourceDocumentSha256 ?? []);
  const docs = documents.filter((d) => cited.has(d.sha256));
  if (!docs.length)
    return none(
      cited.size
        ? "The source document this term cites is not loaded; its section cannot be read."
        : "The term cites no source document.",
    );
  const labels = new Set(term.originalLabels.map((l) => normalizeCatalogText(l)).filter(Boolean));
  const unit = term.exactUnit.trim();
  const toRef = (d: SourceDocumentEvidence, r: SourceRowEvidence): DomainEvidenceRef => ({
    documentSha256: d.sha256,
    fileName: d.fileName,
    page: r.page,
    line: r.line,
    locator: r.locator,
    heading: r.section?.path[0] ?? null,
    path: r.section?.path ?? [],
    domain: r.section?.domain ?? null,
    tableHeader: r.tableHeader,
    unit: r.unit,
  });
  const labelHits = docs.flatMap((d) =>
    d.rows.filter((r) => labels.has(normalizeCatalogText(r.label))).map((r) => toRef(d, r)),
  );
  const hits = labelHits.filter((e) => e.unit.trim() === unit);
  if (!hits.length)
    return labelHits.length
      ? none(
          `The label appears in the source with a different unit (${[...new Set(labelHits.map((e) => e.unit))].join("; ")}); units are never converted, so no domain is proposed.`,
          labelHits,
          "low",
        )
      : none("No row with this exact label and unit was found in the cited source document.");
  const domains = [...new Set(hits.map((e) => e.domain))];
  if (domains.includes(null))
    return none(
      domains.length > 1
        ? `Rows with this label and unit sit under recognized and unrecognized headings (${hits.map(where).join("; ")}).`
        : `The row sits under a heading that no versioned rule maps to a domain (${hits.map(where).join("; ")}).`,
      hits,
      "low",
      domains.length > 1,
    );
  if (domains.length > 1)
    return none(
      `The same label and unit appear under different medical sections (${hits.map((e) => `${DOMAIN_NAME[e.domain!]}: ${where(e)}`).join("; ")}); choose explicitly.`,
      hits,
      "low",
      true,
    );
  const domain = domains[0]!;
  const otherRefs = [...new Set(referenceDomains)].filter((d) => d !== domain);
  if (otherRefs.length)
    return {
      domain: null,
      basis: "human_review",
      confidence: "low",
      prepopulate: false,
      evidence: hits,
      reason: `The source section says ${DOMAIN_NAME[domain]} but catalog references name ${otherRefs.map((d) => DOMAIN_NAME[d]).join(", ")}; conflicting references are never resolved silently.`,
      conflict: true,
    };
  const repeated = hits.length > 1 ? ` (${hits.length} rows, all in the same section)` : "";
  return {
    domain,
    basis: "source_section",
    confidence: "high",
    prepopulate: true,
    evidence: hits,
    reason: `Source section "${hits[0]!.heading}" (${where(hits[0]!)})${repeated}, exact label and unit.`,
    conflict: false,
  };
}

/** Compact, value-free registry form of document evidence (committed fixtures, offline use). */
export function compactEvidence(doc: SourceDocumentEvidence): SourceDocumentEvidence {
  return {
    ...doc,
    rows: doc.rows.map((r) => ({ ...r, excerpt: "" })),
  };
}

/** Rows extracted per domain-level heading vs the count the heading declares (provenance coverage). */
export function sectionCoverage(doc: SourceDocumentEvidence) {
  return doc.headings.map((h, i) => {
    const next = doc.headings[i + 1];
    const rows = doc.rows.filter(
      (r) => r.line > h.line && (!next || r.line < next.line) && r.section?.path[0] === h.heading,
    ).length;
    return { heading: h.heading, domain: h.domain, page: h.page, declaredCount: h.declaredCount, rows };
  });
}

const HEX64 = /^[0-9a-f]{64}$/;
const DOMAIN_IDS = new Set<string>(["bone", "cardiovascular", "immune", "behavioral"]);
/**
 * Documents of a committed evidence registry, validated structurally; anything
 * with another schema, rules version, fingerprint or domain value is dropped
 * (fails closed: no proposals rather than wrong proposals).
 */
export function evidenceRegistryDocuments(json: unknown): SourceDocumentEvidence[] {
  const docs = (json as { schema?: unknown; documents?: unknown })?.documents;
  if (
    (json as { schema?: unknown })?.schema !== "mitochondria.source-section-evidence-registry.v1" ||
    !Array.isArray(docs)
  )
    return [];
  return docs.filter((d): d is SourceDocumentEvidence => {
    const x = d as Partial<SourceDocumentEvidence>;
    return (
      x?.schema === SOURCE_SECTION_EVIDENCE_SCHEMA &&
      x.rulesVersion === SOURCE_SECTION_RULES_VERSION &&
      typeof x.sha256 === "string" &&
      HEX64.test(x.sha256) &&
      Array.isArray(x.rows) &&
      Array.isArray(x.headings) &&
      x.rows.every(
        (r) =>
          typeof r?.label === "string" &&
          typeof r.unit === "string" &&
          typeof r.line === "number" &&
          (r.section === null ||
            (typeof r.section?.heading === "string" &&
              Array.isArray(r.section.path) &&
              (r.section.domain === null || DOMAIN_IDS.has(r.section.domain)))),
      )
    );
  });
}
