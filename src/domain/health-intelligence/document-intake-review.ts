/**
 * P42 document intake review rules (pure, browser-safe, offline): row
 * extraction evidence, identity checks against the selected crew scope,
 * reviewer-applied examination timestamps, bulk-selection limits, processing
 * summary and actionable diagnostics. Nothing here saves, uploads, approves or
 * changes catalog / scientific status; storage still requires the existing
 * per-row eligibility, reviewer confirmation and fresh authorization.
 */
import type { IntakeClassification } from "../health-domains/unified-intake-classification";
import type { HealthDomainId } from "../health-domains/registry";
import {
  normalizePersonName,
  type DocumentIdentity,
  type DocumentReconstruction,
  type ExtractionConfidence,
  type ExtractionLayout,
  type ObservationIssue,
  type ReconstructedObservation,
  type TimestampCandidate,
  type ValueKind,
} from "./document-table-reconstruction";

/** Evidence attached to one intake row reconstructed from a document table. */
export interface RowExtractionEvidence {
  rulesVersion: string;
  sourceRowNumber: string | null;
  rawValue: string;
  /** Value as first proposed (normalized numeric or ""), to detect explicit reviewer edits. */
  proposedValue: string;
  sourceUnit: string;
  valueKind: ValueKind;
  valueNotes: string[];
  referenceInterval: string | null;
  page: number | null;
  line: number;
  layout: ExtractionLayout;
  confidence: ExtractionConfidence;
  issues: ObservationIssue[];
  repeat: ReconstructedObservation["repeat"];
  sameLabelOtherUnits: string[];
  sectionHeading: string | null;
  sectionDomain: HealthDomainId | null;
}

export function rowExtractionEvidence(
  o: ReconstructedObservation,
  rulesVersion: string,
): RowExtractionEvidence {
  return {
    rulesVersion,
    sourceRowNumber: o.sourceRowNumber,
    rawValue: o.rawValue,
    proposedValue: o.value,
    sourceUnit: o.unit,
    valueKind: o.valueKind,
    valueNotes: o.valueNotes,
    referenceInterval: o.referenceInterval,
    page: o.page,
    line: o.line,
    layout: o.layout,
    confidence: o.confidence,
    issues: o.issues,
    repeat: o.repeat,
    sameLabelOtherUnits: o.sameLabelOtherUnits,
    sectionHeading: o.section.path[0] ?? null,
    sectionDomain: o.section.domain,
  };
}

interface ExtractionRowLike {
  value: string;
  unit: string;
  extraction?: RowExtractionEvidence | undefined;
}

/**
 * Blocking extraction issue that still applies to the row's CURRENT value/unit.
 * Explicit reviewer edits of the value (or unit, for unit issues) clear it,
 * because the reviewer then attests the corrected field against the source.
 */
export function extractionBlockingReason(row: ExtractionRowLike): string | null {
  const e = row.extraction;
  if (!e) return null;
  const valueUnchanged = row.value.trim() === e.proposedValue.trim();
  const unitUnchanged = row.unit.trim() === e.sourceUnit.trim();
  for (const issue of e.issues) {
    if (!issue.blocking) continue;
    if (issue.code === "missing_unit" || issue.code === "ambiguous_unit") {
      if (unitUnchanged) return issue.message;
      continue;
    }
    if (valueUnchanged) return issue.message;
  }
  return null;
}

/** Bulk "select" never includes in-document repeats, low-confidence or blocked rows. */
export function isBulkSelectable(row: ExtractionRowLike & { rejected?: boolean | undefined }): boolean {
  if (row.rejected) return false;
  const e = row.extraction;
  if (!e) return true;
  return !e.repeat && e.confidence !== "low" && extractionBlockingReason(row) === null;
}

// --- Identity ------------------------------------------------------------------
export type IdentityCheck =
  | { status: "match"; detail: string }
  | { status: "not_stated"; detail: string }
  | { status: "conflict"; detail: string; resolvable: boolean };

/**
 * Document patient vs selected crew label. A match needs the same normalized
 * name, or a crew label that begins with the name followed by a separator
 * ("Alex Morgan — Synthetic Astronaut"); nothing else is inferred.
 */
export function compareDocumentIdentity(
  identity: DocumentIdentity,
  scope: { crewLabel: string; provenance: "" | "synthetic" | "real" },
): IdentityCheck {
  if (identity.declaresSimulated && scope.provenance === "real")
    return {
      status: "conflict",
      detail: "The document declares itself simulated / not a clinical record, but Real provenance is selected. Select Synthetic provenance; this cannot be overridden.",
      resolvable: false,
    };
  if (identity.patientNames.length > 1)
    return {
      status: "conflict",
      detail: `The document names more than one patient (${identity.patientNames.join("; ")}).`,
      resolvable: true,
    };
  const name = identity.patientName;
  if (!name) return { status: "not_stated", detail: "The document states no patient name; confirm the crew member yourself." };
  const doc = normalizePersonName(name);
  const crew = normalizePersonName(scope.crewLabel);
  const boundary = crew.length > doc.length ? crew.slice(doc.length, doc.length + 2) : "";
  if (doc && (crew === doc || (crew.startsWith(doc) && /^(?: [—–\-(,]| ?[—–(,])/.test(boundary))))
    return { status: "match", detail: `Document patient "${name}" matches the selected crew member "${scope.crewLabel}".` };
  return {
    status: "conflict",
    detail: `Document patient "${name}" does not match the selected crew member "${scope.crewLabel}".`,
    resolvable: true,
  };
}

/** Only Ground Medical may resolve a resolvable identity conflict for its own scope. */
export const canResolveIdentityConflict = (roles: readonly string[]) => roles.includes("ground_medical");

export function identityHoldReason(check: IdentityCheck, resolved: boolean): string | null {
  if (check.status !== "conflict") return null;
  if (check.resolvable && resolved) return null;
  return `Identity conflict: ${check.detail}${check.resolvable ? " Ground Medical must resolve it explicitly before any row can be saved." : ""}`;
}

/** Reviewer-applied examination time for every unsaved row of one document that has none yet. */
export function applyDocumentTimestamp<
  T extends { documentSha256?: string | undefined; observedAt: string; datePrecision?: "date" | "instant" | undefined; selected: boolean },
>(rows: readonly T[], sha256: string, candidate: TimestampCandidate): { rows: T[]; applied: number } {
  let applied = 0;
  const next = rows.map((row) => {
    if (row.documentSha256 !== sha256 || row.observedAt) return row;
    applied++;
    return { ...row, observedAt: candidate.value, datePrecision: candidate.precision, selected: false };
  });
  return { rows: next, applied };
}

// --- Summary & diagnostics -------------------------------------------------------
export interface SummaryRow extends ExtractionRowLike {
  label: string;
  classification: IntakeClassification;
  rejected?: boolean | undefined;
  identityHold?: string | null | undefined;
}

export interface DocumentIntakeSummary {
  sourceRows: number;
  extracted: number;
  safelyMatched: number;
  ambiguous: number;
  unitReview: number;
  unknown: number;
  unsupportedResultTypes: number;
  potentialDuplicates: number;
  manualReview: number;
  rejected: number;
  identityHeld: number;
}

export function summarizeDocumentRows(rows: readonly SummaryRow[], sourceRows: number): DocumentIntakeSummary {
  const live = rows.filter((r) => !r.rejected);
  const matched = live.filter((r) => r.classification.status === "matched");
  const safely = matched.filter((r) => !extractionBlockingReason(r) && !r.identityHold);
  return {
    sourceRows,
    extracted: rows.length,
    safelyMatched: safely.length,
    ambiguous: live.filter((r) => r.classification.status === "ambiguous").length,
    unitReview: live.filter((r) => r.classification.status === "unit_review_required").length,
    unknown: live.filter((r) => r.classification.status === "unclassified").length,
    unsupportedResultTypes: live.filter((r) => r.extraction?.issues.some((i) => i.code === "unsupported_result_type")).length,
    potentialDuplicates: live.filter((r) => r.extraction?.repeat).length,
    manualReview: live.filter(
      (r) =>
        r.classification.status !== "matched" ||
        Boolean(extractionBlockingReason(r)) ||
        Boolean(r.identityHold) ||
        Boolean(r.extraction?.repeat) ||
        r.extraction?.confidence === "low",
    ).length,
    rejected: rows.length - live.length,
    identityHeld: live.filter((r) => r.identityHold).length,
  };
}

export type DiagnosisCode =
  | "unsupported_format"
  | "no_extractable_text"
  | "ocr_unavailable"
  | "table_reconstruction_failed"
  | "no_catalog_matches"
  | "identity_conflict"
  | "missing_or_ambiguous_units"
  | "unsupported_result_types"
  | "review_required"
  | "already_loaded"
  | "extraction_failed";

export interface Diagnosis {
  code: DiagnosisCode;
  message: string;
  /** Additional findings that apply alongside the primary diagnosis. */
  flags: { code: DiagnosisCode; message: string }[];
}

/** File-level failure text from the extractors → actionable category. */
export function diagnoseExtractionError(message: string): Diagnosis {
  const m = message.toLowerCase();
  if (m.includes("unsupported file type") || m.includes("only pdf, png"))
    return { code: "unsupported_format", message: `Unsupported file format. ${message}`, flags: [] };
  if (m.includes("ocr unavailable"))
    return { code: "ocr_unavailable", message: `This page has no text layer and on-device OCR is unavailable: ${message} Enter the rows manually or use CSV.`, flags: [] };
  if (m.includes("no readable text"))
    return { code: "no_extractable_text", message: "No extractable text: the document has no text layer and OCR read nothing. Enter the rows manually or use CSV.", flags: [] };
  return { code: "extraction_failed", message: `Extraction failed: ${message}`, flags: [] };
}

export function diagnoseDocumentIntake(input: {
  textLength: number;
  reconstruction: DocumentReconstruction | null;
  rows: readonly SummaryRow[];
  identity: IdentityCheck | null;
}): Diagnosis {
  const flags: Diagnosis["flags"] = [];
  const s = summarizeDocumentRows(input.rows, input.reconstruction?.observations.length ?? input.rows.length);
  if (input.identity?.status === "conflict")
    flags.push({ code: "identity_conflict", message: `Identity conflict — ${input.identity.detail}` });
  const unitIssues = input.rows.filter((r) =>
    r.extraction?.issues.some((i) => i.code === "missing_unit" || i.code === "ambiguous_unit"),
  ).length;
  if (unitIssues) flags.push({ code: "missing_or_ambiguous_units", message: `${unitIssues} row(s) with a missing or ambiguous unit (never inferred).` });
  if (s.unsupportedResultTypes)
    flags.push({ code: "unsupported_result_types", message: `${s.unsupportedResultTypes} row(s) with a categorical, yes/no or clock-time result (kept verbatim, review-only).` });
  if (!input.textLength)
    return { code: "no_extractable_text", message: "No extractable text was found in this document. Enter the rows manually or use CSV.", flags };
  if (!input.rows.length)
    return {
      code: "table_reconstruction_failed",
      message:
        input.reconstruction && input.reconstruction.headers.length
          ? "A table header was found but no data rows could be aligned to its columns. Check that the PDF has selectable text, or use CSV / manual entry."
          : "Text was extracted but no measurement table was recognized (no header with a measurement and a result column, no numbered rows and no 'Label: value unit' lines). Use CSV / manual entry, or report this layout.",
      flags,
    };
  if (!s.safelyMatched && s.extracted)
    return {
      code: "no_catalog_matches",
      message: `${s.extracted} observation(s) extracted; none match an approved catalog entry with the exact unit. They stay review-only and can be sent to Unknown Biomarker Review.`,
      flags,
    };
  if (input.identity?.status === "conflict")
    return { code: "identity_conflict", message: `Extraction complete, but rows are held: ${input.identity.detail}`, flags: flags.filter((f) => f.code !== "identity_conflict") };
  return {
    code: "review_required",
    message: `Extraction complete — review required: ${s.extracted} observation(s) from ${s.sourceRows} source row(s); ${s.safelyMatched} safely matched, ${s.manualReview} need manual review. Nothing is selected or saved automatically.`,
    flags,
  };
}
