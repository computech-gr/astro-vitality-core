import {
  csvCells,
  extractCsvCandidates,
  extractTextTableCandidates,
  extractFiveColumnLabCandidates,
} from "@/domain/health-intelligence/universal-intake-parser";
import {
  detectIntakeFormat,
  extractJsonCandidates,
  extractXlsxCandidates,
  xlsxCells,
  SUPPORTED_INTAKE_EXTENSIONS,
  batchDuplicateKeys,
} from "@/domain/health-intelligence/universal-intake-adapters";
import {
  extractGridSourceEvidence,
  extractTextSourceEvidence,
  sectionForExcerpt,
  SOURCE_SECTION_RULES_VERSION,
  type CandidateSourceSection,
  type SourceDocumentEvidence,
} from "@/domain/health-intelligence/source-section-classification";
/**
 * Unified Medical Data Intake workspace. Every observation is classified
 * individually against the P36 source catalog (exact name + exact unit), is
 * confirmed row by row by a human reviewer, and is stored as a versioned,
 * encrypted, append-only offline envelope. Unknown, ambiguous or
 * unit-mismatched rows stay review-only and can never be saved. Research
 * reference only — no clinical thresholds, diagnosis or automatic approval.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { UnknownBiomarkerReviewPanel } from "@/components/unknown-biomarker-review-panel";
import { StoredObservationsReview } from "@/components/stored-observations-review";
import { notifyReviewDataChanged } from "@/domain/health-intelligence/review-change-events";
import {
  classifyWithGovernedExtensions,
  syntheticDemoSectionConflict,
} from "@/domain/health-intelligence/unknown-biomarker-review";
import {
  getSyntheticDemoCatalogs,
  subscribeSyntheticDemoCatalogs,
} from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import {
  getActiveCatalog,
  subscribeActiveCatalog,
} from "@/domain/health-intelligence/active-catalog-runtime";
import { Link } from "@tanstack/react-router";
import { type IntakeClassification } from "@/domain/health-domains/unified-intake-classification";
import { DOMAIN_LABELS } from "@/domain/health-domains/document-domain-projection";
import {
  type ObservationSourceKind,
  type UnifiedObservation,
} from "@/domain/health-intelligence/observation-envelope";
import {
  findUnifiedDuplicates,
  listUnifiedObservations,
  saveUnifiedObservation,
} from "@/domain/health-intelligence/observation-store";
import { extractBoneDocument } from "@/domain/bone-health/document-extraction";
import {
  loadMissionIdentity,
  subscribeMissionIdentity,
  type MissionIdentitySnapshot,
} from "@/infrastructure/mission-identity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  editIntakeReviewRow,
  intakeSelectionCounts,
  isIntakeRowEligible,
  intakeRowExclusionReason,
  setIntakeReviewSelection,
} from "@/domain/health-intelligence/intake-review-selection";

import { type ObservationDatePrecision } from "@/domain/health-intelligence/observation-date";
import {
  DOCUMENT_TABLE_RULES_VERSION,
  documentLinesFromText,
  valueKindText,
  type DocumentReconstruction,
} from "@/domain/health-intelligence/document-table-reconstruction";
import {
  applyDocumentTimestamp,
  canResolveIdentityConflict,
  compareDocumentIdentity,
  diagnoseDocumentIntake,
  diagnoseExtractionError,
  extractionBlockingReason,
  identityHoldReason,
  rowExtractionEvidence,
  summarizeDocumentRows,
  type RowExtractionEvidence,
} from "@/domain/health-intelligence/document-intake-review";
import type { GeometryLine } from "@/domain/bone-health/pdf-geometry";
import {
  buildReviewedObservation,
  storedUnitOf,
  evaluateBulkImport,
  extractWideGridCandidates,
  manualDateEvidence,
  reconcileBulkImport,
  reconstructMultiDateDocument,
  resolveDateGroup,
  reviewDateFields,
  rowDateEvidence,
  seriesKeyOf,
  sourceDuplicateKey,
  storedSourceKeys,
  EXAM_DATE_SOURCE_TEXT,
  type ExamDateEvidence,
  type GridCandidate,
  type MultiDateDocument,
  type P61ExceptionCode,
  type SavedImportEntry,
} from "@/domain/health-intelligence/p61-bulk-import";
import { P61BulkImportPanel } from "@/components/p61-bulk-import-panel";

type IntakeRow = {
  key: string;
  label: string;
  value: string;
  unit: string;
  observedAt: string;
  datePrecision?: ObservationDatePrecision;
  collectionDate?: string;
  sourceValidation?: "unvalidated";
  /** Reported specimen / measurement method; required to recognize activated catalog entries. */
  specimen?: string;
  method?: string;
  provenance?: "synthetic" | "real";
  /** Selected mission (mission-scoped SYNTHETIC DEMO entries match only rows of that mission). */
  missionId?: string;
  excerpt: string;
  sourceKind: ObservationSourceKind;
  sourceLabel: string;
  documentName?: string | undefined;
  documentSha256?: string | undefined;
  /** P39: heading / table / page-line provenance of the source row (review evidence). */
  sourceSection?: CandidateSourceSection | undefined;
  /** P61.2: verbatim source context/note (unverified provenance; also kept in the stored source excerpt). */
  sourceContext?: string | undefined;
  classification: IntakeClassification;
  selected: boolean;
  /** P42: document-table evidence (row number, raw value, issues, repeats). */
  extraction?: RowExtractionEvidence | undefined;
  /** P42: explicitly rejected by the reviewer (kept visible, never saved). */
  rejected?: boolean | undefined;
  /** P42: unresolved document identity conflict for the selected scope. */
  identityHold?: string | null | undefined;
  /** P61: where the examination date came from (row, date column, heading, reviewer). */
  examDate?: ExamDateEvidence | undefined;
  /** P61: when the source file was read for review (the upload date; not the examination date). */
  importedAt?: string | undefined;
};

/** P42: one processed document (summary, identity, diagnostics); memory only, never stored. */
type ProcessedDocument = {
  sha256: string;
  fileName: string;
  pages: number | null;
  method: string;
  textLength: number;
  reconstruction: DocumentReconstruction | null;
  /** P61: examination-date groups of the document (memory only). */
  multiDate: MultiDateDocument | null;
  saved: number;
};

/** Review table capacity (a complete multi-domain examination can exceed 300 rows). */
const MAX_ROWS = 1000;

/** Base P36 catalog first; only governed, fully approved catalog extensions can add matches. */
function classify(row: {
  label: string;
  unit: string;
  specimen?: string | undefined;
  method?: string | undefined;
  provenance?: "synthetic" | "real" | undefined;
  sourceValidation?: "unvalidated" | undefined;
  missionId?: string | undefined;
  sourceSection?: CandidateSourceSection | undefined;
}): IntakeClassification {
  return classifyWithGovernedExtensions({ ...row, sourceDomain: sectionDomain(row) })
    .classification;
}
/** Domain of an explicit, recognized source section only (never from keywords). */
function sectionDomain(row: { sourceSection?: CandidateSourceSection | undefined }) {
  const s = row.sourceSection;
  return s?.status === "recognized" && s.domain ? s.domain : undefined;
}
/** Attach P39 section provenance to parser candidates by their verbatim excerpt. */
function withSections<T extends { excerpt: string }>(
  items: readonly T[],
  evidence: SourceDocumentEvidence | null,
): (T & { sourceSection?: CandidateSourceSection })[] {
  if (!evidence) return [...items];
  return items.map((item) => ({
    ...item,
    sourceSection: sectionForExcerpt(evidence, item.excerpt),
  }));
}

/** Re-stamp scope provenance and re-run classification (e.g. after a verified catalog update). */
function reclassifyRows(
  rows: readonly IntakeRow[],
  provenance: "" | "synthetic" | "real",
  missionId: string | undefined,
): IntakeRow[] {
  return rows.map((row) => {
    const next: IntakeRow = { ...row };
    if (provenance) next.provenance = provenance;
    else delete next.provenance;
    if (missionId) next.missionId = missionId;
    else delete next.missionId;
    next.classification = classify(next);
    next.selected = next.selected && isIntakeRowEligible(next);
    return next;
  });
}

function newRow(partial: Partial<IntakeRow> & { label: string; unit: string }): IntakeRow {
  return {
    key: crypto.randomUUID(),
    value: "",
    excerpt: "",
    sourceKind: "manual",
    sourceLabel: "Manual entry",
    selected: false,
    ...partial,
    observedAt: partial.observedAt || partial.collectionDate || "",
    classification: classify({ ...partial }),
  };
}

/** Schema-aware CSV; candidates still require catalog and human review. */
function parseIntakeCsv(
  text: string,
  fileName = "",
  sha256 = "",
): { rows: IntakeRow[]; skipped: number; wide: boolean } {
  let evidence: SourceDocumentEvidence | null = null;
  let cells: string[][] = [];
  try {
    cells = csvCells(text);
    evidence = extractGridSourceEvidence(cells, { sha256, fileName, kind: "csv" });
  } catch {
    evidence = null;
  }
  // P61: a wide grid (one column per examination date) yields one row per dated cell.
  const wide = cells.length ? extractWideGridCandidates(cells) : null;
  if (wide)
    return {
      rows: gridRows(wide.rows, evidence, "csv", "CSV import"),
      skipped: wide.skipped,
      wide: true,
    };
  const parsed = extractCsvCandidates(text, MAX_ROWS, { keepUnparsedDates: true });
  return {
    rows: withSections(parsed.rows, evidence).map((item) => datedRow(item, "csv", "CSV import")),
    skipped: parsed.skipped,
    wide: false,
  };
}

/** P61: long-format grid row with its row-level examination date evidence. */
function datedRow(
  item: Parameters<typeof newRow>[0] & { rawDate?: string; sourceRow?: number },
  sourceKind: ObservationSourceKind,
  sourceLabel: string,
): IntakeRow {
  const { rawDate, sourceRow, ...rest } = item;
  const examDate = rowDateEvidence({
    observedAt: rest.observedAt ?? "",
    ...(rest.datePrecision ? { datePrecision: rest.datePrecision } : {}),
    ...(rawDate ? { rawDate } : {}),
    ...(sourceRow ? { sourceRow } : {}),
  });
  const fill = !rest.observedAt && examDate.status === "resolved" ? reviewDateFields(examDate) : {};
  return newRow({ ...rest, ...fill, sourceKind, sourceLabel, examDate });
}

/** P61: wide-grid candidates (date-column header) as review rows. */
function gridRows(
  items: readonly GridCandidate[],
  evidence: SourceDocumentEvidence | null,
  sourceKind: ObservationSourceKind,
  sourceLabel: string,
): IntakeRow[] {
  return items.slice(0, MAX_ROWS).map((item) => {
    const section = evidence ? sectionForExcerpt(evidence, item.excerpt.replace(/ \[column [^\]]*\]$/, "")) : undefined;
    return newRow({
      label: item.label,
      value: item.value,
      unit: item.unit,
      observedAt: item.observedAt,
      ...(item.datePrecision ? { datePrecision: item.datePrecision } : {}),
      excerpt: item.excerpt,
      sourceKind,
      sourceLabel,
      examDate: item.examDate,
      ...(section ? { sourceSection: section } : {}),
    });
  });
}

/** Conservative text/OCR lines: "Label: 12.3 unit". Reference ranges are never extracted. */
const BLOCKED_LINE =
  /(?:reference|normal|interval|range|ref\.|\bmin\b|\bmax\b|[<>≤≥]|\d\s*[-–]\s*\d)/i;

function parseIntakeText(
  text: string,
  sourceKind: ObservationSourceKind,
  sourceLabel: string,
  documentName?: string,
  documentSha256?: string,
  linePages?: readonly number[],
  geometry?: readonly GeometryLine[],
): { rows: IntakeRow[]; reconstruction: DocumentReconstruction; multiDate: MultiDateDocument } {
  // P42 stages A–D: header-role table reconstruction (any column order, multi-page,
  // repeated headers, numbered rows, OCR token fallback). Legacy parsers still run
  // for lines that are not part of a reconstructed table. P61 adds date-column tables
  // and the examination date of every row (row date, date column or date heading).
  const lines = documentLinesFromText(text, linePages, geometry);
  const multiDate = reconstructMultiDateDocument(lines, { ocr: sourceKind === "ocr" });
  const reconstruction = multiDate.reconstruction;
  const tableExcerpts = new Set(
    reconstruction.observations.map((o) => o.excerpt.replace(/ \[column [^\]]*\]$/, "").trim()),
  );
  // P61: examination-date headings and ignored report dates are never measurement rows.
  const dateLines = new Set([
    ...multiDate.groups.filter((g) => g.kind === "heading").map((g) => g.text.trim()),
    ...multiDate.ignoredDates.map((d) => d.text.trim()),
  ]);
  const tableRows: IntakeRow[] = reconstruction.observations.map((o, index) => {
    const examDate = multiDate.dates[index]!;
    const section: CandidateSourceSection = {
      status: o.section.domain
        ? "recognized"
        : o.section.heading
          ? "unrecognized_heading"
          : "no_section",
      heading: o.section.heading,
      path: o.section.path,
      domain: o.section.domain,
      page: o.page,
      line: o.line,
      locator: o.page ? "page_line" : "text_line",
      tableHeader: o.tableHeader,
      rulesVersion: SOURCE_SECTION_RULES_VERSION,
    };
    return newRow({
      label: o.label,
      value: o.value || (o.valueKind === "ambiguous_number" ? "" : o.rawValue),
      unit: o.unit,
      ...reviewDateFields(examDate),
      examDate,
      excerpt: o.excerpt,
      sourceKind,
      sourceLabel,
      documentName,
      documentSha256,
      sourceSection: section,
      ...(o.specimen ? { specimen: o.specimen } : {}),
      ...(o.method ? { method: o.method } : {}),
      extraction: {
        ...rowExtractionEvidence(o, DOCUMENT_TABLE_RULES_VERSION),
        proposedValue: o.value || (o.valueKind === "ambiguous_number" ? "" : o.rawValue),
      },
    });
  });
  const legacy = parseLegacyText(
    text,
    sourceKind,
    sourceLabel,
    documentName,
    documentSha256,
    linePages,
  ).filter((row) => !tableExcerpts.has(row.excerpt.trim()) && !dateLines.has(row.excerpt.trim()));
  return { rows: [...tableRows, ...legacy].slice(0, MAX_ROWS), reconstruction, multiDate };
}

function parseLegacyText(
  text: string,
  sourceKind: ObservationSourceKind,
  sourceLabel: string,
  documentName?: string,
  documentSha256?: string,
  linePages?: readonly number[],
): IntakeRow[] {
  const evidence = extractTextSourceEvidence(
    text,
    {
      sha256: documentSha256 ?? "",
      fileName: documentName ?? "",
      kind: sourceKind === "pdf_text" ? "pdf" : "text",
    },
    linePages,
  );
  const rows: IntakeRow[] = withSections(
    [
      ...extractTextTableCandidates(text, MAX_ROWS),
      ...extractFiveColumnLabCandidates(text, MAX_ROWS),
    ].slice(0, MAX_ROWS),
    evidence,
  ).map((item) => {
    const row = newRow({ ...item, sourceKind, sourceLabel, documentName, documentSha256 });
    return { ...row, examDate: rowDateEvidence(row) };
  });
  for (const line of text.split(/\r?\n/).slice(0, 1000)) {
    if (line.length > 350 || BLOCKED_LINE.test(line)) continue;
    const match = /^\s*(.+?)\s*[:=]\s*([-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s+([^\s;,|]+)\s*$/.exec(
      line,
    );
    if (!match) continue;
    rows.push(
      newRow({
        label: match[1]!.trim(),
        value: match[2]!,
        unit: match[3]!,
        excerpt: line.slice(0, 350),
        sourceKind,
        sourceLabel,
        documentName,
        documentSha256,
      }),
    );
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function UnifiedIntakeWorkspace() {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadMissionIdentity()
        .then((value) => {
          if (active) setIdentity(value);
        })
        .catch(() => {
          if (active) setIdentity(null);
        });
    };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const memberships = useMemo(() => {
    const allowed =
      identity?.signedIn && !identity.error
        ? identity.memberships.filter(
            (member) =>
              (member.role === "crew_self" || member.role === "ground_medical") &&
              Boolean(member.crewMemberId),
          )
        : [];
    return allowed.map((member) => ({
      missionId: member.missionId,
      crewMemberId: member.crewMemberId!,
      missionLabel: member.missionName ?? member.missionCode ?? member.missionId,
      crewLabel: member.crewDisplayName ?? member.crewMemberId!,
    }));
  }, [identity]);

  const [missionKey, setMissionKey] = useState("");
  const membership = memberships.find((m) => `${m.missionId}|${m.crewMemberId}` === missionKey);
  const rolesForScope = useMemo(
    () =>
      membership && identity?.signedIn && !identity.error
        ? identity.memberships
            .filter(
              (m) =>
                m.missionId === membership.missionId && m.crewMemberId === membership.crewMemberId,
            )
            .map((m) => m.role)
        : [],
    [identity, membership],
  );

  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  /** Ground Medical identity-conflict resolutions: `${sha256}|${missionId}|${crewMemberId}` (memory only). */
  const [identityResolutions, setIdentityResolutions] = useState<ReadonlySet<string>>(new Set());
  const demoCatalogs = useSyncExternalStore(
    subscribeSyntheticDemoCatalogs,
    getSyntheticDemoCatalogs,
    getSyntheticDemoCatalogs,
  );
  const [history, setHistory] = useState<UnifiedObservation[]>([]);
  const [provenance, setProvenance] = useState<"" | "synthetic" | "real">("");
  const [reviewerConfirmed, setReviewerConfirmed] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [status, setStatus] = useState(
    "No observations loaded. Nothing is uploaded or saved automatically.",
  );
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual entry draft
  const [manualLabel, setManualLabel] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [manualUnit, setManualUnit] = useState("");
  const [manualObservedAt, setManualObservedAt] = useState("");
  const [manualPrecision, setManualPrecision] = useState<ObservationDatePrecision>("date");

  useEffect(() => {
    if (!membership) {
      setHistory([]);
      return;
    }
    let active = true;
    void listUnifiedObservations(membership.missionId, membership.crewMemberId)
      .then((entries) => {
        if (active) setHistory(entries);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [membership?.missionId, membership?.crewMemberId]);

  const resetReview = () => {
    setReviewerConfirmed(false);
    setDuplicateAcknowledged(false);
  };

  // Scope (mission, provenance) or a newly verified catalog / mission demo catalog snapshot
  // changes recognition; confirmation resets.
  const scopeMissionId = membership?.missionId;
  useEffect(() => {
    const refresh = () => {
      setRows((previous) =>
        previous.length ? reclassifyRows(previous, provenance, scopeMissionId) : previous,
      );
      setReviewerConfirmed(false);
      setDuplicateAcknowledged(false);
    };
    refresh();
    const stopActive = subscribeActiveCatalog(refresh);
    const stopDemo = subscribeSyntheticDemoCatalogs(refresh);
    return () => {
      stopActive();
      stopDemo();
    };
  }, [provenance, scopeMissionId]);

  const addRows = (incoming: IntakeRow[], note: string) => {
    setRows((previous) =>
      [...previous, ...reclassifyRows(incoming, provenance, scopeMissionId)].slice(0, MAX_ROWS),
    );
    resetReview();
    setStatus(note);
  };

  const editRow = (key: string, patch: Partial<IntakeRow>) => {
    // P61: a date typed by the reviewer replaces the extracted date evidence (kept traceable as manual).
    if ("observedAt" in patch || "datePrecision" in patch) {
      const row = rows.find((r) => r.key === key);
      const observedAt = patch.observedAt ?? row?.observedAt ?? "";
      const precision = patch.datePrecision ?? row?.datePrecision;
      patch = {
        ...patch,
        examDate:
          observedAt || row?.examDate?.status === "resolved"
            ? manualDateEvidence(observedAt, precision)
            : row?.examDate,
      };
    }
    const next = editIntakeReviewRow(rows, key, patch);
    setRows(next.rows);
    setReviewerConfirmed(next.reviewerConfirmed);
    setDuplicateAcknowledged(next.duplicateAcknowledged);
  };

  const setAllSelected = (selected: boolean, onlyKeys?: ReadonlySet<string>) => {
    const next = setIntakeReviewSelection(rows, selected, onlyKeys);
    setRows(next.rows);
    setReviewerConfirmed(next.reviewerConfirmed);
    setDuplicateAcknowledged(next.duplicateAcknowledged);
  };

  // P42: identity of each processed document vs the selected crew scope.
  const identityChecks = useMemo(
    () =>
      new Map(
        documents.map((d) => [
          d.sha256,
          d.reconstruction && membership
            ? compareDocumentIdentity(d.reconstruction.identity, {
                crewLabel: membership.crewLabel,
                provenance,
              })
            : null,
        ]),
      ),
    [documents, membership, provenance],
  );
  const resolutionKey = (sha256: string) =>
    membership ? `${sha256}|${membership.missionId}|${membership.crewMemberId}` : "";
  useEffect(() => {
    setRows((previous) => {
      let changed = false;
      const next = previous.map((row) => {
        const check = row.documentSha256 ? (identityChecks.get(row.documentSha256) ?? null) : null;
        const resolved =
          Boolean(membership && row.documentSha256) &&
          identityResolutions.has(
            `${row.documentSha256}|${membership?.missionId}|${membership?.crewMemberId}`,
          );
        const hold = check ? identityHoldReason(check, resolved) : null;
        if ((row.identityHold ?? null) === hold) return row;
        changed = true;
        return { ...row, identityHold: hold, selected: hold ? false : row.selected };
      });
      return changed ? next : previous;
    });
  }, [identityChecks, identityResolutions, membership]);

  const rejectRow = (key: string, rejected: boolean) => {
    const next = editIntakeReviewRow(rows, key, { rejected, selected: false });
    setRows(next.rows);
    setReviewerConfirmed(false);
    setDuplicateAcknowledged(false);
  };

  const applyTimestamp = (
    sha256: string,
    value: string,
    precision: "date" | "instant",
    interpretation: string,
  ) => {
    const result = applyDocumentTimestamp(rows, sha256, { value, precision, interpretation });
    setRows(
      result.rows.map((row, index) =>
        row.documentSha256 === sha256
          ? {
              ...row,
              ...(row.observedAt && !rows[index]?.observedAt
                ? {
                    examDate: {
                      ...manualDateEvidence(row.observedAt, row.datePrecision),
                      source: "document" as const,
                      sourceText: interpretation,
                      note: `Document date applied by the reviewer: ${interpretation}.`,
                    },
                  }
                : {}),
              classification: classify(row),
            }
          : row,
      ),
    );
    resetReview();
    setStatus(
      `Applied ${value} (${interpretation}) to ${result.applied} unsaved row(s) of this document that had no observation time. Rows stay unchecked; verify each before saving.`,
    );
  };

  /** P61: apply the reviewer's reading to one ambiguous date group (heading, date column or raw date). */
  const resolveGroup = (sha256: string, groupKey: string, iso: string) => {
    const result = resolveDateGroup(rows, sha256, groupKey, iso);
    setRows(result.rows);
    resetReview();
    setStatus(
      `Examination date ${iso} applied to ${result.applied} unsaved row(s) of that date group. They remain subject to bulk or individual confirmation.`,
    );
  };

  const removeDocumentRows = (sha256: string) => {
    setRows((previous) => previous.filter((row) => row.documentSha256 !== sha256));
    setDocuments((previous) => previous.filter((d) => d.sha256 !== sha256));
    resetReview();
    setStatus(
      "Unsaved rows of that document were removed from review. It can be processed again; saved observations are unchanged.",
    );
  };

  // P61: bulk status of every row (existing save prerequisites + source-aware duplicates).
  const p61Scope = useMemo(
    () =>
      membership && provenance
        ? { missionId: membership.missionId, crewMemberId: membership.crewMemberId, provenance }
        : null,
    [membership, provenance],
  );
  const bulk = useMemo(() => evaluateBulkImport(rows, history, p61Scope), [rows, history, p61Scope]);
  const [savedLedger, setSavedLedger] = useState<SavedImportEntry[]>([]);
  const reconciliation = useMemo(
    () => reconcileBulkImport(rows, bulk.statuses, savedLedger),
    [rows, bulk, savedLedger],
  );
  const validatedSignature = bulk.validatedKeys.join("|");
  const [bulkConfirmedFor, setBulkConfirmedFor] = useState<string | null>(null);
  const bulkConfirmed = bulkConfirmedFor !== null && bulkConfirmedFor === validatedSignature;
  const reviewTableRef = useRef<HTMLDivElement>(null);
  /** Date groups that need the reviewer's explicit reading (ambiguous heading / column / raw date). */
  const pendingDateGroups = useMemo(() => {
    const groups = new Map<
      string,
      { sha256: string; groupKey: string; text: string; note: string; options: { iso: string; how: string }[]; rows: number; file: string }
    >();
    for (const row of rows) {
      const e = row.examDate;
      if (!row.documentSha256 || !e?.groupKey || row.observedAt || !e.options.length) continue;
      if (e.status !== "ambiguous" && e.status !== "invalid") continue;
      const k = `${row.documentSha256}|${e.groupKey}`;
      const g = groups.get(k) ?? {
        sha256: row.documentSha256,
        groupKey: e.groupKey,
        text: e.sourceText ?? e.groupKey,
        note: e.note,
        options: e.options.map((o) => ({ iso: o.iso, how: o.how })),
        rows: 0,
        file: row.documentName ?? "",
      };
      g.rows++;
      groups.set(k, g);
    }
    return [...groups.values()];
  }, [rows]);

  // P42: review filters (display only; eligibility and saving are unchanged).
  const [filterDomain, setFilterDomain] = useState("");
  const [filterPage, setFilterPage] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const statusOf = (row: IntakeRow): string =>
    row.rejected
      ? "rejected"
      : row.identityHold
        ? "identity_hold"
        : extractionBlockingReason(row)
          ? row.extraction?.issues.some((i) => i.code === "unsupported_result_type")
            ? "unsupported"
            : "extraction_review"
          : row.classification.status === "matched"
            ? row.extraction?.repeat
              ? "repeat"
              : "matched"
            : row.classification.status;
  const domainOf = (row: IntakeRow): string =>
    row.classification.status === "matched"
      ? row.classification.domain
      : (row.sourceSection?.domain ?? "none");
  const visibleRows = rows.filter(
    (row) =>
      (!filterDomain || domainOf(row) === filterDomain) &&
      (!filterPage ||
        String(row.extraction?.page ?? row.sourceSection?.page ?? "") === filterPage) &&
      (!filterStatus ||
        (filterStatus.startsWith("p61:")
          ? (() => {
              const st = bulk.statuses.get(row.key);
              const code = filterStatus.slice(4);
              return code === "all"
                ? st?.kind === "exception"
                : code === "duplicate"
                  ? st?.kind === "duplicate"
                  : st?.kind === "exception" && st.code === code;
            })()
          : filterStatus === "ambiguity"
          ? row.classification.status === "ambiguous" ||
            row.classification.status === "unit_review_required" ||
            Boolean(row.extraction && extractionBlockingReason(row)) ||
            row.extraction?.confidence === "low"
          : statusOf(row) === filterStatus)),
  );
  const visibleKeys = new Set(visibleRows.map((row) => row.key));
  const filtered = visibleRows.length !== rows.length;
  const pageOptions = [
    ...new Set(
      rows
        .map((row) => row.extraction?.page ?? row.sourceSection?.page)
        .filter((p): p is number => typeof p === "number"),
    ),
  ].sort((a, b) => a - b);

  const [batchFiles, setBatchFiles] = useState<
    Array<{ name: string; state: string; count: number; flags?: string[] }>
  >([]);
  const MAX_BATCH_FILES = 20;
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const processBatch = async (files: File[]) => {
    if (busy || !files.length) return;
    if (files.length > MAX_BATCH_FILES) {
      setStatus(`Select at most ${MAX_BATCH_FILES} files per batch.`);
      return;
    }
    setBusy(true);
    const results: Array<{ name: string; state: string; count: number; flags?: string[] }> = [];
    const incoming: IntakeRow[] = [];
    const processed: ProcessedDocument[] = [];
    const hashes = new Set<string>();
    // Retry safety: a document already in review is never added twice; saved rows are
    // additionally caught by the stored-duplicate check before saving.
    const loaded = new Set(rows.map((row) => row.documentSha256).filter(Boolean));
    // P61: the upload (import) time is kept apart from the examination date and the save time.
    const importedAt = new Date().toISOString();
    try {
      for (const file of files) {
        let state = "complete";
        let count = 0;
        let flags: string[] = [];
        try {
          if (file.size > MAX_FILE_BYTES || file.size === 0)
            throw new Error("File is empty or exceeds 15 MB.");
          const format = detectIntakeFormat(file.name);
          if (format === "unsupported")
            throw new Error(
              `Unsupported file type. Supported: ${SUPPORTED_INTAKE_EXTENSIONS.join(", ")}.`,
            );
          const hash = await sha256Hex(file);
          if (hashes.has(hash)) {
            state = "duplicate file skipped";
            results.push({ name: file.name, state, count });
            continue;
          }
          if (loaded.has(hash)) {
            state =
              "already loaded in review — not added again. Remove its rows first to re-process it.";
            results.push({ name: file.name, state, count });
            continue;
          }
          hashes.add(hash);
          if (format === "xlsx" || format === "json") {
            const bytes = format === "xlsx" ? new Uint8Array(await file.arrayBuffer()) : null;
            const grid = bytes ? xlsxCells(bytes).filter((row) => row.some(Boolean)) : null;
            const wide = grid ? extractWideGridCandidates(grid) : null;
            const parsed = wide
              ? { rows: [], skipped: wide.skipped, notes: [] }
              : bytes
                ? extractXlsxCandidates(bytes, MAX_ROWS, { keepUnparsedDates: true })
                : extractJsonCandidates(await file.text(), MAX_ROWS);
            const evidence = grid
              ? extractGridSourceEvidence(grid, {
                  sha256: hash,
                  fileName: file.name,
                  kind: "xlsx",
                })
              : null;
            const isFhir =
              format === "json" && parsed.rows.some((row) => row.excerpt.startsWith("FHIR "));
            const kind: ObservationSourceKind =
              format === "xlsx" ? "xlsx" : isFhir ? "fhir" : "json";
            const label = format === "xlsx" ? "XLSX" : isFhir ? "FHIR" : "JSON";
            const space = Math.max(0, MAX_ROWS - incoming.length);
            const built = wide
              ? gridRows(wide.rows, evidence, kind, `${label}: ${file.name}`)
              : withSections(parsed.rows, evidence).map((item) =>
                  datedRow(item, kind, `${label}: ${file.name}`),
                );
            const batch = built.slice(0, space).map((row) => ({
              ...row,
              documentName: file.name,
              documentSha256: hash,
            }));
            incoming.push(...batch);
            count = batch.length;
            if (parsed.skipped) state = `complete; ${parsed.skipped} row(s) skipped`;
            if (wide)
              flags.push(
                `Date-column grid: ${wide.rows.length} dated value(s) read, one per examination date column${wide.blankCells ? `; ${wide.blankCells} blank cell(s) skipped` : ""}.`,
              );
          } else if (format === "csv") {
            const parsed = parseIntakeCsv(await file.text(), file.name, hash);
            const space = Math.max(0, MAX_ROWS - incoming.length);
            const batch = parsed.rows.slice(0, space).map((row) => ({
              ...row,
              sourceLabel: `CSV: ${file.name}`,
              documentName: file.name,
              documentSha256: hash,
            }));
            incoming.push(...batch);
            count = batch.length;
            if (parsed.skipped) state = `complete; ${parsed.skipped} row(s) skipped`;
            if (parsed.wide)
              flags.push("Date-column grid: one observation per examination date column.");
          } else {
            const extracted = await extractBoneDocument(file);
            const kind: ObservationSourceKind = /ocr/i.test(extracted.method) ? "ocr" : "pdf_text";
            const space = Math.max(0, MAX_ROWS - rows.length - incoming.length);
            const parsed = parseIntakeText(
              extracted.text,
              kind,
              `Document: ${file.name}`,
              file.name,
              hash,
              extracted.linePages,
              extracted.geometry,
            );
            const batch = parsed.rows.slice(0, space);
            incoming.push(...batch);
            count = batch.length;
            const doc: ProcessedDocument = {
              sha256: hash,
              fileName: file.name,
              pages: extracted.pages,
              method: extracted.method,
              textLength: extracted.text.trim().length,
              reconstruction: parsed.reconstruction,
              multiDate: parsed.multiDate,
              saved: 0,
            };
            processed.push(doc);
            const identityCheck = membership
              ? compareDocumentIdentity(parsed.reconstruction.identity, {
                  crewLabel: membership.crewLabel,
                  provenance,
                })
              : null;
            // Diagnose with the same scope-aware classification the review table uses
            // (mission synthetic demo catalog, provenance).
            const diagnosis = diagnoseDocumentIntake({
              textLength: doc.textLength,
              reconstruction: parsed.reconstruction,
              rows: reclassifyRows(batch, provenance, scopeMissionId),
              identity: identityCheck,
            });
            state = diagnosis.message;
            flags = diagnosis.flags.map((f) => f.message);
            if (batch.length < parsed.rows.length)
              flags.push(
                `${parsed.rows.length - batch.length} row(s) not loaded: the review table holds at most ${MAX_ROWS} rows. Save or clear rows, then re-process.`,
              );
            if (extracted.warnings.length) flags.push(...extracted.warnings);
            const md = parsed.multiDate;
            if (md.multipleDates)
              flags.push(
                `${md.distinctDates.length} examination date(s) detected (${md.distinctDates.join(", ") || "none resolved"}); every row keeps its own date — one document date is never applied to all rows.`,
              );
            for (const ignored of md.ignoredDates.slice(0, 5))
              flags.push(`Line ${ignored.line}: "${ignored.text}" — ${ignored.reason}`);
          }
          if (!count && state === "complete")
            state =
              "No candidate rows: the file was read but contained no rows with a label, value and unit.";
        } catch (error) {
          state =
            error instanceof Error
              ? diagnoseExtractionError(error.message).message
              : "Extraction failed: unknown error";
        }
        results.push({ name: file.name, state, count, ...(flags.length ? { flags } : {}) });
        setBatchFiles([...results]);
      }
      if (processed.length) setDocuments((previous) => [...previous, ...processed]);
      if (incoming.length)
        addRows(
          incoming.map((row) => ({ ...row, importedAt })),
          `Batch processed ${results.length} file(s); ${incoming.length} candidate row(s), all unchecked. Review each row before saving.`,
        );
      else
        setStatus(
          `Batch processed ${results.length} file(s); no candidate rows. Check per-file results.`,
        );
    } finally {
      setBatchFiles([...results]);
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addManualRow = () => {
    if (!manualLabel.trim() || !manualValue.trim() || !manualUnit.trim()) {
      setStatus("Manual entry needs a label, value and unit.");
      return;
    }
    const observedAt = manualObservedAt;
    addRows(
      [
        newRow({
          label: manualLabel,
          value: manualValue,
          unit: manualUnit,
          observedAt,
          datePrecision: manualPrecision,
          sourceKind: "manual",
          sourceLabel: "Manual entry",
        }),
      ],
      "Manual row added unchecked — review and confirm before saving.",
    );
    setManualLabel("");
    setManualValue("");
    setManualUnit("");
    setManualObservedAt("");
  };

  const selection = intakeSelectionCounts(rows);
  const visibleSelection = intakeSelectionCounts(visibleRows);
  // P61: a reading already stored from the same document is never saveable again.
  const saveableRows = rows.filter(
    (row) =>
      row.selected && isIntakeRowEligible(row) && bulk.statuses.get(row.key)?.kind !== "duplicate",
  );
  const reviewOnlyRows = rows.filter(
    (row) => row.classification.status !== "matched" || row.sourceValidation === "unvalidated",
  );
  // Rows matched by an activated mission SYNTHETIC DEMO entry are ordinary matched rows
  // (saveable after human review), so they never reach the unknown-biomarker request.
  // P42: rejected rows, identity-held rows and rows whose label could not be separated
  // safely never become unknown-biomarker requests (identity not safely established).
  const unknownRequestRows = reviewOnlyRows.filter(
    (row) =>
      !row.rejected &&
      !row.identityHold &&
      !row.extraction?.issues.some(
        (i) => i.code === "token_split_failed" || i.code === "column_mismatch",
      ),
  );
  const missionDemoCatalog = membership ? (demoCatalogs.get(membership.missionId) ?? null) : null;
  const duplicates = membership
    ? saveableRows.flatMap((row) =>
        findUnifiedDuplicates(history, {
          metricId: row.classification.status === "matched" ? row.classification.metricId : "",
          observedAt: row.observedAt,
          ...(row.datePrecision ? { datePrecision: row.datePrecision } : {}),
          originalUnit: storedUnitOf(row),
          missionId: membership.missionId,
          crewMemberId: membership.crewMemberId,
          ...(provenance ? { provenance } : {}),
          value: row.value,
        }),
      )
    : [];
  const batchDuplicates = batchDuplicateKeys(
    saveableRows.map((row) => ({
      key: row.key,
      metricId: row.classification.status === "matched" ? row.classification.metricId : "",
      observedAt: row.observedAt,
      ...(row.datePrecision ? { datePrecision: row.datePrecision } : {}),
      unit: storedUnitOf(row),
      value: row.value,
    })),
  );
  const duplicateWarnings = duplicates.length + batchDuplicates.length;
  const canSave = Boolean(
    membership &&
    provenance &&
    reviewerConfirmed &&
    saveableRows.length > 0 &&
    (duplicateWarnings === 0 || duplicateAcknowledged) &&
    !busy,
  );

  const domainRouting = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of saveableRows)
      if (row.classification.status === "matched")
        counts[row.classification.domain] = (counts[row.classification.domain] ?? 0) + 1;
    return Object.entries(counts);
  }, [saveableRows]);

  /**
   * Shared save path for per-row selection and P61 bulk confirmation: fresh
   * authorization, fresh stored-history duplicate check (a reading already stored
   * from the same document is skipped, never re-saved or overwritten), then one
   * append-only encrypted event per observation.
   */
  const saveRows = async (
    toSave: readonly IntakeRow[],
    duplicateWarningAcknowledged: boolean,
    mode: "selected" | "bulk",
  ) => {
    if (!membership || !provenance || !toSave.length) return;
    const scope = { missionId: membership.missionId, crewMemberId: membership.crewMemberId, provenance };
    setBusy(true);
    // P42 recovery: rows already appended leave review immediately, so an interrupted
    // batch can be retried without re-saving them (storage itself is append-only).
    const savedNow: IntakeRow[] = [];
    let skippedDuplicates = 0;
    const settleSaved = () => {
      if (!savedNow.length) return;
      const savedKeys = new Set(savedNow.map((row) => row.key));
      const savedByDocument = new Map<string, number>();
      for (const row of savedNow)
        if (row.documentSha256)
          savedByDocument.set(
            row.documentSha256,
            (savedByDocument.get(row.documentSha256) ?? 0) + 1,
          );
      setDocuments((previous) =>
        previous.map((d) => ({ ...d, saved: d.saved + (savedByDocument.get(d.sha256) ?? 0) })),
      );
      // Computed now: the updater runs later, after savedNow has been cleared for the next batch.
      const ledgerEntries = savedNow.map((row) => ({ seriesKey: seriesKeyOf(row), date: row.observedAt.slice(0, 10) }));
      setSavedLedger((previous) => [...previous, ...ledgerEntries]);
      setRows((previous) => previous.filter((row) => !savedKeys.has(row.key)));
    };
    try {
      const fresh = await loadMissionIdentity();
      if (
        !fresh.signedIn ||
        fresh.error ||
        fresh.userId !== identity?.userId ||
        !fresh.memberships.some(
          (m) =>
            m.missionId === membership.missionId &&
            m.crewMemberId === membership.crewMemberId &&
            (m.role === "crew_self" || m.role === "ground_medical"),
        )
      )
        throw new Error(
          "Your authorization for this mission and crew is no longer valid. Nothing saved.",
        );
      const storedKeys = storedSourceKeys(
        await listUnifiedObservations(membership.missionId, membership.crewMemberId),
        scope,
      );
      for (const row of toSave) {
        if (row.classification.status !== "matched" || !isIntakeRowEligible(row)) continue;
        const key = sourceDuplicateKey(
          { ...row, metricId: row.classification.metricId, unit: storedUnitOf(row) },
          scope,
        );
        if (key && storedKeys.has(key)) {
          skippedDuplicates++;
          continue;
        }
        // Re-derives the demo basis at save time from the verified mission demo catalog.
        const observation: UnifiedObservation = buildReviewedObservation(row, {
          id: crypto.randomUUID(),
          recordedAt: new Date().toISOString(),
          scope,
          duplicateWarningAcknowledged,
          sourceDomain: sectionDomain(row),
        });
        await saveUnifiedObservation(observation);
        if (key) storedKeys.set(key, observation.id);
        savedNow.push(row);
      }
      const savedCount = savedNow.length;
      settleSaved();
      savedNow.length = 0;
      setReviewerConfirmed(false);
      setDuplicateAcknowledged(false);
      setBulkConfirmedFor(null);
      setHistory(await listUnifiedObservations(membership.missionId, membership.crewMemberId));
      notifyReviewDataChanged({
        missionId: membership.missionId,
        crewMemberId: membership.crewMemberId,
      });
      setStatus(
        `${savedCount} observation(s) saved encrypted on this device${mode === "bulk" ? " by bulk confirmation" : ""}.${skippedDuplicates ? ` ${skippedDuplicates} already stored from the same document and not saved again.` : ""} Research reference only — not a scientific approval; no cloud records written.`,
      );
    } catch (error) {
      const partial = savedNow.length;
      settleSaved();
      setReviewerConfirmed(false);
      setBulkConfirmedFor(null);
      setStatus(
        `${error instanceof Error ? error.message : "Saving failed."}${partial ? ` ${partial} observation(s) were saved before the interruption and were removed from review; the rest stay unsaved and can be retried.` : ""}`,
      );
      if (partial)
        void listUnifiedObservations(membership.missionId, membership.crewMemberId)
          .then(setHistory)
          .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const saveAccepted = async () => {
    if (!canSave) return;
    await saveRows(saveableRows, duplicateWarnings > 0, "selected");
  };

  const validatedRows = rows.filter((row) => bulk.statuses.get(row.key)?.kind === "validated");
  const bulkSaveBlockedReason = !membership
    ? "Select the authorized mission and crew first."
    : !provenance
      ? "Select the data provenance first."
      : null;
  const confirmAndSaveValidated = async () => {
    if (!bulkConfirmed || bulkSaveBlockedReason || busy) return;
    await saveRows(validatedRows, false, "bulk");
  };
  const reviewExceptions = (code: P61ExceptionCode | "all") => {
    setFilterDomain("");
    setFilterPage("");
    setFilterStatus(`p61:${code}`);
    reviewTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const reloadHistory = async () => {
    if (!membership) return;
    setHistory(await listUnifiedObservations(membership.missionId, membership.crewMemberId));
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Unified Medical Data Intake
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl">
          Unified Intake — Measurements &amp; Review
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          One review workflow for manual entry, CSV, PDF/OCR text, device observations and
          self-assessments. Every measurement is classified individually against the scientific
          source catalog — exact name and exact unit only. Unknown, ambiguous or unit-mismatched
          rows stay review-only. Accepted observations are stored encrypted on this device,
          append-only, and remain research reference only: no clinical thresholds, diagnosis,
          readiness score or automatic approval. Independent scientific review and
          PENDING_NIKOLAS_REVIEW gates are unchanged.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="intake-membership">Authorized mission &amp; crew</Label>
            <select
              id="intake-membership"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={missionKey}
              onChange={(event) => setMissionKey(event.target.value)}
            >
              <option value="">Select authorized mission and crew</option>
              {memberships.map((member) => (
                <option
                  key={`${member.missionId}|${member.crewMemberId}`}
                  value={`${member.missionId}|${member.crewMemberId}`}
                >
                  {member.missionLabel} — {member.crewLabel}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="intake-provenance">Data provenance (required)</Label>
            <select
              id="intake-provenance"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={provenance}
              onChange={(event) => {
                setProvenance(event.target.value as "synthetic" | "real");
                resetReview();
              }}
            >
              <option value="">Select provenance</option>
              <option value="synthetic">Synthetic / demo data</option>
              <option value="real">Real measurement</option>
            </select>
          </div>
        </div>
        {!membership ? (
          <p className="text-sm text-muted-foreground">
            Sign in with an authorized crew or ground medical mission membership to record
            observations.{" "}
            <Link to="/mission/identity" className="underline">
              Mission identity &amp; sign-in
            </Link>
          </p>
        ) : null}
        {missionDemoCatalog &&
        (missionDemoCatalog.active.length || missionDemoCatalog.revoked.length) ? (
          <div
            className="space-y-2 rounded-md border border-dashed border-border p-3"
            data-testid="mission-demo-parameters"
          >
            <p className="text-sm font-medium">
              Mission synthetic demo parameters (verified demo catalog v
              {missionDemoCatalog.demoCatalogVersion}, available offline)
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {missionDemoCatalog.active.map((e) => (
                <li key={`a-${e.demoId}`}>
                  <span className="font-medium text-foreground">{e.displayName}</span> ({e.demoId})
                  · label {e.aliases.map((a) => `“${a}”`).join(", ")} · exact unit {e.unit} →{" "}
                  {DOMAIN_LABELS[e.domain]} · ACTIVE — recognized automatically in synthetic
                  examinations of this mission
                </li>
              ))}
              {missionDemoCatalog.revoked.map((e) => (
                <li key={`r-${e.demoId}-${e.activation.activationEventId}`}>
                  {e.displayName} ({e.demoId}) · {e.unit} · REVOKED — no longer recognized; earlier
                  records are kept
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              SYNTHETIC DEMO — not a scientific approval, source validation or production catalog
              entry. Applies to synthetic data of this mission only; units are never converted.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Add observations</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="intake-manual-label">Label (as reported)</Label>
            <Input
              id="intake-manual-label"
              value={manualLabel}
              onChange={(event) => setManualLabel(event.target.value)}
              placeholder="e.g. HR"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-manual-value">Value</Label>
            <Input
              id="intake-manual-value"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder="e.g. 62"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-manual-unit">Unit (as reported)</Label>
            <Input
              id="intake-manual-unit"
              value={manualUnit}
              onChange={(event) => setManualUnit(event.target.value)}
              placeholder="e.g. bpm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-manual-observed">Observation date / explicit timestamp</Label>
            <select
              aria-label="Manual observation precision"
              value={manualPrecision}
              onChange={(e) => {
                setManualPrecision(e.target.value as ObservationDatePrecision);
                setManualObservedAt("");
              }}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            >
              <option value="date">Date only</option>
              <option value="instant">Explicit timestamp</option>
            </select>
            <Input
              id="intake-manual-observed"
              type={manualPrecision === "date" ? "date" : "text"}
              placeholder={manualPrecision === "instant" ? "2026-11-05T08:00:00Z" : undefined}
              value={manualObservedAt}
              onChange={(event) => setManualObservedAt(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Date-only observations retain their calendar date without a time or timezone. Timestamped
          observations require an explicit timezone.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addManualRow}>
            Add manual row
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-9 max-w-full whitespace-normal py-2 text-left"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Import CSV, XLSX, JSON/FHIR, PDF or scans (on-device)
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={SUPPORTED_INTAKE_EXTENSIONS.join(",")}
            className="hidden"
            aria-label="Import multiple CSV, XLSX, JSON, FHIR, PDF or scanned documents"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) void processBatch(files);
            }}
          />
        </div>
        {batchFiles.length > 0 && (
          <div role="status" aria-live="polite" className="space-y-1 text-xs">
            <strong>Batch processing results</strong>
            {batchFiles.map((file, i) => (
              <div key={`${file.name}-${i}`} className="break-words">
                <p>
                  <span className="font-medium">{file.name}</span>: {file.state} ({file.count}{" "}
                  candidate row(s))
                </p>
                {file.flags?.length ? (
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {file.flags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Batch limit: 20 files, 15 MB each. Files are processed sequentially on-device; failures
          are isolated and extracted rows remain unchecked.
        </p>
        <p className="text-xs text-muted-foreground">
          Document reading runs on this device: PDF text-layer tables are rebuilt from column
          positions (any column order, multi-page, repeated headers). Pages without a text layer use
          on-device OCR, which can misread digits and decimal points, so OCR rows are always
          low-confidence and never bulk-selected. No on-device AI extraction model is available;
          unresolved rows stay in manual review.
        </p>
        <p className="text-xs text-muted-foreground">
          Documents are processed on this device only. Original files are never uploaded
          automatically; the document name and SHA-256 fingerprint are kept with each row for
          traceability. Device observations and self-assessments use the same envelope through their
          own workflows.
        </p>
      </section>

      {documents.length ? (
        <section
          className="space-y-4 rounded-lg border border-border bg-card p-5"
          aria-labelledby="intake-document-summary"
        >
          <h2 id="intake-document-summary" className="text-lg font-semibold">
            Document processing summary
          </h2>
          {documents.map((doc) => {
            const recon = doc.reconstruction;
            const docRows = rows.filter((row) => row.documentSha256 === doc.sha256);
            const summary = summarizeDocumentRows(
              docRows,
              recon?.observations.length ?? docRows.length,
            );
            const check = identityChecks.get(doc.sha256) ?? null;
            const key = resolutionKey(doc.sha256);
            const resolved = Boolean(key) && identityResolutions.has(key);
            const missingTime = docRows.filter((row) => !row.observedAt).length;
            return (
              <article
                key={doc.sha256}
                className="space-y-3 rounded-md border border-border p-4"
                data-testid="p42-document-summary"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-medium">{doc.fileName}</p>
                    <p className="break-all text-xs text-muted-foreground">
                      SHA-256 {doc.sha256} · {doc.method} · rules {recon?.rulesVersion ?? "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => removeDocumentRows(doc.sha256)}
                  >
                    Remove unsaved rows of this document
                  </Button>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  {(
                    [
                      ["Pages inspected", doc.pages ?? "—"],
                      ["Table headers", recon?.headers.length ?? 0],
                      ["Source rows detected", summary.sourceRows],
                      ["Observations extracted", recon?.observations.length ?? summary.extracted],
                      ["Unsaved rows in review", summary.extracted],
                      ["Safely matched", summary.safelyMatched],
                      ["Ambiguous matches", summary.ambiguous],
                      ["Unit review", summary.unitReview],
                      ["Unknown biomarkers", summary.unknown],
                      ["Unsupported result types", summary.unsupportedResultTypes],
                      ["Potential duplicates (in document)", summary.potentialDuplicates],
                      ["Rows requiring manual review", summary.manualReview],
                      ["Rejected", summary.rejected],
                      ["Rows saved", doc.saved],
                    ] as const
                  ).map(([term, value]) => (
                    <div
                      key={term}
                      className="flex justify-between gap-2 border-b border-border/50 py-1"
                    >
                      <dt className="text-muted-foreground">{term}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground">
                  Match and review counts refer to the unsaved rows still in review.
                </p>
                {recon?.sections.length ? (
                  <p className="text-xs text-muted-foreground">
                    Sections:{" "}
                    {recon.sections
                      .map(
                        (sec) =>
                          `${sec.heading} (${sec.rows} row(s)${sec.domain ? ` → ${DOMAIN_LABELS[sec.domain]}` : ", heading not mapped to a domain"})`,
                      )
                      .join(" · ")}
                  </p>
                ) : null}
                {recon &&
                (recon.rowNumbers.missing.length || recon.rowNumbers.duplicated.length) ? (
                  <p className="text-xs text-destructive">
                    {recon.rowNumbers.missing.length
                      ? `Source row number(s) not found: ${recon.rowNumbers.missing.join(", ")}. `
                      : ""}
                    {recon.rowNumbers.duplicated.length
                      ? `Row number(s) appearing twice: ${recon.rowNumbers.duplicated.join(", ")}.`
                      : ""}{" "}
                    Check the original pages; nothing was filled in.
                  </p>
                ) : null}
                {recon && recon.issues.length ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer">
                      {recon.issues.length} row(s) that could not be reconstructed safely — exact
                      row, reason and action
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {recon.issues.slice(0, 200).map((issue, i) => (
                        <li key={i}>
                          {issue.rowNumber ? `Row ${issue.rowNumber}` : "Row"}
                          {issue.page ? `, page ${issue.page}` : ""}
                          {issue.line ? `, line ${issue.line}` : ""}: {issue.message} —{" "}
                          {issue.action}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {recon ? (
                  <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
                    <p className="font-medium">Document identity (compared on this device only)</p>
                    <p className="text-xs">
                      Patient: {recon.identity.patientName ?? "not stated"} · Record:{" "}
                      {recon.identity.recordId ?? "not stated"} · Stated date:{" "}
                      {recon.identity.examDateText ?? "not stated"} · Stated time:{" "}
                      {recon.identity.examTimeText ?? "not stated"}
                      {recon.identity.declaresSimulated
                        ? " · The document declares simulated data / not a clinical record"
                        : ""}
                    </p>
                    {!membership ? (
                      <p className="text-xs text-muted-foreground">
                        Select the authorized mission and crew to compare identity.
                      </p>
                    ) : check?.status === "match" ? (
                      <p className="text-xs">{check.detail}</p>
                    ) : check?.status === "not_stated" ? (
                      <p className="text-xs">{check.detail}</p>
                    ) : check?.status === "conflict" ? (
                      <div className="space-y-1 text-xs" data-testid="p42-identity-conflict">
                        <p className="font-medium text-destructive">
                          Identity conflict: {check.detail}
                        </p>
                        {check.resolvable ? (
                          canResolveIdentityConflict(rolesForScope) ? (
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={resolved}
                                onChange={(event) =>
                                  setIdentityResolutions((previous) => {
                                    const next = new Set(previous);
                                    if (event.target.checked) next.add(key);
                                    else next.delete(key);
                                    return next;
                                  })
                                }
                              />
                              As Ground Medical for this crew member, I confirm this document
                              belongs to {membership.crewLabel} (resolution kept for this session
                              only).
                            </label>
                          ) : (
                            <p>
                              Only a Ground Medical member of this mission can resolve it. All rows
                              of this document stay held.
                            </p>
                          )
                        ) : null}
                      </div>
                    ) : null}
                    {doc.multiDate && (doc.multiDate.groups.length || doc.multiDate.ignoredDates.length) ? (
                      <div className="space-y-1 text-xs" data-testid="p61-date-groups">
                        <p className="font-medium">
                          Examination dates found in this document ({doc.multiDate.distinctDates.length}{" "}
                          resolved)
                        </p>
                        <ul className="ml-4 list-disc space-y-0.5">
                          {doc.multiDate.groups.filter((g) => g.rows > 0).slice(0, 40).map((g) => (
                            <li key={g.key}>
                              {g.kind === "heading" ? "Heading" : "Date column"} “{g.text}”
                              {g.kind === "heading" ? ` (line ${g.line}${g.page ? `, page ${g.page}` : ""})` : ""}:{" "}
                              {g.parse.status === "resolved"
                                ? `${g.parse.value} (${g.parse.how})`
                                : g.parse.status === "ambiguous"
                                  ? `ambiguous — ${g.parse.options.map((o) => o.iso).join(" or ")}`
                                  : "not a valid date"}{" "}
                              · {g.rows} row(s)
                              {g.headingKind === "collection" ? " · labelled a sample collection date" : ""}
                            </li>
                          ))}
                          {doc.multiDate.groups.filter((g) => g.rows === 0).slice(0, 40).map((g) => (
                            <li key={g.key} className="text-muted-foreground" data-testid="p61-date-line-without-rows">
                              Date line “{g.text}” (line {g.line}
                              {g.page ? `, page ${g.page}` : ""}): no measurement rows follow it, so it was not applied
                              to any row.
                            </li>
                          ))}
                          {doc.multiDate.ignoredDates.map((d) => (
                            <li key={`ignored-${d.line}`} className="text-muted-foreground">
                              Ignored “{d.text}” (line {d.line}): {d.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {doc.multiDate?.multipleDates ? (
                      <p className="text-xs" data-testid="p61-multi-date-guard">
                        This document states several examination dates, so no single document date
                        is offered for all rows; each row keeps the date of its own examination.
                      </p>
                    ) : recon.identity.timestampCandidates.length ? (
                      <div className="space-y-1">
                        <p className="text-xs">
                          Examination time stated in the document — apply it explicitly to the{" "}
                          {missingTime} row(s) without an observation time
                          {recon.identity.timestampNote ? `. ${recon.identity.timestampNote}` : ""}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {recon.identity.timestampCandidates.map((candidate) => (
                            <Button
                              key={`${candidate.value}-${candidate.interpretation}`}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-auto whitespace-normal py-1 text-left"
                              disabled={busy || missingTime === 0}
                              onClick={() =>
                                applyTimestamp(
                                  doc.sha256,
                                  candidate.value,
                                  candidate.precision,
                                  candidate.interpretation,
                                )
                              }
                            >
                              Apply {candidate.value} — {candidate.interpretation}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {recon.identity.timestampNote ??
                          "No examination date is stated in the document; enter observation dates per row."}
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      {pendingDateGroups.length ? (
        <section
          className="space-y-3 rounded-lg border border-border bg-card p-5"
          aria-labelledby="p61-date-choices"
          data-testid="p61-date-choices"
        >
          <h2 id="p61-date-choices" className="text-lg font-semibold">
            Examination dates that need your choice
          </h2>
          <p className="text-sm text-muted-foreground">
            These dates can be read more than one way. Nothing was guessed; choose the reading
            printed in the original, and it is applied to that group&apos;s rows only.
          </p>
          <ul className="space-y-2">
            {pendingDateGroups.map((g) => (
              <li key={`${g.sha256}|${g.groupKey}`} className="space-y-1 rounded-md border border-border p-3 text-sm">
                <p>
                  <span className="font-medium">“{g.text}”</span>
                  {g.file ? ` in ${g.file}` : ""} · {g.rows} row(s)
                </p>
                <p className="text-xs text-muted-foreground">{g.note}</p>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o) => (
                    <Button
                      key={o.iso}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-auto whitespace-normal py-1 text-left"
                      disabled={busy}
                      onClick={() => resolveGroup(g.sha256, g.groupKey, o.iso)}
                    >
                      Use {o.iso} ({o.how})
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length ? (
        <P61BulkImportPanel
          rows={rows}
          statuses={bulk.statuses}
          reconciliation={reconciliation}
          validatedCount={validatedRows.length}
          saveBlockedReason={bulkSaveBlockedReason}
          busy={busy}
          confirmed={bulkConfirmed}
          onConfirmedChange={(checked) => setBulkConfirmedFor(checked ? validatedSignature : null)}
          onConfirmAndSave={() => void confirmAndSaveValidated()}
          onReviewExceptions={reviewExceptions}
        />
      ) : null}

      {rows.length ? (
        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div ref={reviewTableRef} className="scroll-mt-20" />
          <h2 className="text-lg font-semibold">Review each measurement</h2>
          <p className="text-sm text-muted-foreground">
            Classification is per measurement, not per document — one document can route to several
            health domains. Only rows matched exactly to the catalog can be selected; everything
            else remains review-only.
          </p>
          {domainRouting.length ? (
            <p className="text-sm">
              Domain routing preview:{" "}
              {domainRouting.map(([domain, count]) => (
                <Badge key={domain} variant="outline" className="mr-2">
                  {DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ?? domain}: {count}
                </Badge>
              ))}
            </p>
          ) : null}
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Selected: {selection.selected} · Eligible: {selection.eligible} · Excluded:{" "}
            {selection.excluded} · Catalog matched: {selection.matched} · Review-only:{" "}
            {selection.reviewOnly} · Missing date: {selection.missingDate} · Invalid date:{" "}
            {selection.invalidDate} · Date-only: {selection.dateOnly}
          </p>
          <div className="grid gap-3 sm:grid-cols-3" data-testid="p42-review-filters">
            <div className="space-y-1">
              <Label htmlFor="intake-filter-domain">Domain</Label>
              <select
                id="intake-filter-domain"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={filterDomain}
                onChange={(event) => setFilterDomain(event.target.value)}
              >
                <option value="">All domains</option>
                {Object.entries(DOMAIN_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
                <option value="none">No domain</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="intake-filter-page">Source page</Label>
              <select
                id="intake-filter-page"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={filterPage}
                onChange={(event) => setFilterPage(event.target.value)}
              >
                <option value="">All pages</option>
                {pageOptions.map((page) => (
                  <option key={page} value={String(page)}>
                    Page {page}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="intake-filter-status">Status</Label>
              <select
                id="intake-filter-status"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="p61:all">Exceptions only (unresolved / ambiguous)</option>
                {reconciliation.exceptions.map((e) => (
                  <option key={e.code} value={`p61:${e.code}`}>
                    Exception — {e.label} ({e.rows})
                  </option>
                ))}
                <option value="p61:duplicate">Duplicates — already stored</option>
                <option value="matched">Safely matched</option>
                <option value="repeat">Matched — repeated in document</option>
                <option value="ambiguity">Any ambiguity / low confidence</option>
                <option value="unit_review_required">Unit review required</option>
                <option value="ambiguous">Ambiguous name</option>
                <option value="unclassified">Unknown biomarker</option>
                <option value="unsupported">Unsupported result type</option>
                <option value="extraction_review">Extraction needs review</option>
                <option value="identity_hold">Identity hold</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          {filtered ? (
            <p className="text-xs text-muted-foreground">
              Showing {visibleRows.length} of {rows.length} row(s). Select All applies to the shown
              rows only.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Select All picks only safely matched rows: repeated measurements within a document and
            low-confidence (OCR / single-spaced) rows must be ticked one by one.
          </p>
          <div
            className="max-w-full overflow-x-auto"
            role="region"
            aria-label="Measurement review table"
            tabIndex={0}
          >
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th scope="col" className="py-2 pr-3">
                    <span className="block">Review</span>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap normal-case">
                      <Checkbox
                        aria-label={
                          visibleSelection.allSelected
                            ? "Deselect All eligible observations"
                            : "Select All eligible observations"
                        }
                        checked={
                          visibleSelection.allSelected
                            ? true
                            : visibleSelection.partiallySelected
                              ? "indeterminate"
                              : false
                        }
                        disabled={visibleSelection.eligible === 0 || busy}
                        onCheckedChange={() =>
                          setAllSelected(
                            !visibleSelection.allSelected,
                            filtered ? visibleKeys : undefined,
                          )
                        }
                      />
                      {visibleSelection.allSelected ? "Deselect All" : "Select All"}
                    </label>
                  </th>
                  <th className="py-2 pr-3">Source row</th>
                  <th className="py-2 pr-3">Label</th>
                  <th className="py-2 pr-3">Value</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Observed at</th>
                  <th className="py-2 pr-3">Classification</th>
                  <th className="py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row.key}
                    className={`border-b border-border/60 align-top ${row.rejected ? "opacity-60" : ""}`}
                  >
                    <td className="py-2 pr-3">
                      <label className="flex min-h-11 min-w-11 cursor-pointer items-center">
                        <Checkbox
                          aria-label={`Select ${row.label}`}
                          disabled={!isIntakeRowEligible(row) || busy}
                          checked={row.selected}
                          onCheckedChange={(checked) => {
                            editRow(row.key, { selected: checked === true });
                          }}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        disabled={busy}
                        aria-label={`${row.rejected ? "Undo reject" : "Reject"} ${row.label}`}
                        onClick={() => rejectRow(row.key, !row.rejected)}
                      >
                        {row.rejected ? "Undo reject" : "Reject"}
                      </Button>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <ExtractionNote row={row} />
                    </td>
                    <td className="py-2 pr-3 font-medium">{row.label}</td>
                    <td className="py-2 pr-3">
                      <Input
                        aria-label={`Value for ${row.label}`}
                        value={row.value}
                        onChange={(event) => editRow(row.key, { value: event.target.value })}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        aria-label={`Unit for ${row.label}`}
                        value={row.unit}
                        onChange={(event) => editRow(row.key, { unit: event.target.value })}
                        className="h-8 w-24"
                      />
                      <Input
                        aria-label={`Specimen for ${row.label}`}
                        placeholder="Specimen"
                        value={row.specimen ?? ""}
                        onChange={(event) => editRow(row.key, { specimen: event.target.value })}
                        className="mt-1 h-8 w-24 text-xs"
                      />
                      <Input
                        aria-label={`Method for ${row.label}`}
                        placeholder="Method"
                        value={row.method ?? ""}
                        onChange={(event) => editRow(row.key, { method: event.target.value })}
                        className="mt-1 h-8 w-24 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        aria-label={`Date precision for ${row.label}`}
                        value={row.datePrecision ?? "instant"}
                        onChange={(e) =>
                          editRow(row.key, {
                            datePrecision: e.target.value as ObservationDatePrecision,
                            observedAt: "",
                          })
                        }
                        className="mb-1 w-52 rounded-md border border-border bg-background p-1 text-xs"
                      >
                        <option value="date">Date only</option>
                        <option value="instant">Explicit timestamp</option>
                      </select>
                      <Input
                        aria-label={`Observation date for ${row.label}`}
                        type={row.datePrecision === "date" ? "date" : "text"}
                        title={
                          row.collectionDate
                            ? `Source collection date: ${row.collectionDate}; time not supplied`
                            : undefined
                        }
                        placeholder={
                          row.datePrecision !== "date" ? "2026-11-05T08:00:00Z" : undefined
                        }
                        value={row.observedAt}
                        onChange={(event) => editRow(row.key, { observedAt: event.target.value })}
                        className="h-8 w-52"
                      />
                      {row.datePrecision === "date" && (
                        <p className="text-xs text-muted-foreground">
                          Time / timezone not supplied
                        </p>
                      )}
                      {row.examDate ? (
                        <p className="max-w-52 text-xs text-muted-foreground" data-testid="p61-date-evidence">
                          {row.examDate.status === "resolved" && row.examDate.source
                            ? `Examination date: ${EXAM_DATE_SOURCE_TEXT[row.examDate.source]}${row.examDate.line ? ` (line ${row.examDate.line})` : ""}`
                            : row.examDate.note}
                        </p>
                      ) : null}
                      {bulk.statuses.get(row.key)?.kind === "duplicate" ? (
                        <p className="max-w-52 text-xs text-destructive">
                          {bulk.statuses.get(row.key)?.reason}
                        </p>
                      ) : null}
                      {intakeRowExclusionReason(row) && (
                        <p className="max-w-52 text-xs text-destructive">
                          {intakeRowExclusionReason(row)}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {row.classification.status === "matched" &&
                      row.classification.metricId.startsWith("ext:") ? (
                        (() => {
                          const id = row.classification.metricId;
                          const entry = getActiveCatalog().active.find((e) => e.canonicalId === id);
                          return (
                            <Badge variant="secondary" data-testid="p37-recognized">
                              RECOGNIZED — ACTIVE CATALOG v{getActiveCatalog().catalogVersion}:{" "}
                              {entry?.canonicalName ?? id} ({id}) · {entry?.unit ?? row.unit} →{" "}
                              {DOMAIN_LABELS[row.classification.domain]} · matched by label, exact
                              unit, specimen and method
                            </Badge>
                          );
                        })()
                      ) : row.classification.status === "matched" &&
                        row.classification.metricId.startsWith("demo:") ? (
                        (() => {
                          const id = row.classification.metricId;
                          const d = missionDemoCatalog?.active.find((e) => e.demoId === id);
                          return (
                            <Badge variant="outline" data-testid="p37-demo-recognized">
                              SYNTHETIC DEMO RECOGNIZED — mission demo catalog v
                              {missionDemoCatalog?.demoCatalogVersion ?? "?"}:{" "}
                              {d?.displayName ?? id} ({id}) · {d?.unit ?? row.unit} →{" "}
                              {DOMAIN_LABELS[row.classification.domain]} · synthetic only · not a
                              scientific approval
                            </Badge>
                          );
                        })()
                      ) : row.classification.status === "matched" ? (
                        <Badge variant="secondary">
                          Matched: {row.classification.metricId} →{" "}
                          {DOMAIN_LABELS[row.classification.domain]}
                        </Badge>
                      ) : row.classification.status === "unit_review_required" ? (
                        <Badge variant="outline">Unit review required — review-only</Badge>
                      ) : row.classification.status === "ambiguous" ? (
                        <Badge variant="outline">Ambiguous name — review-only</Badge>
                      ) : (
                        <Badge variant="outline">Unclassified — review-only</Badge>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {row.sourceLabel}
                      <SourceSectionNote row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reviewOnlyRows.length ? (
            <p className="text-sm text-muted-foreground">
              {reviewOnlyRows.length} row(s) are review-only and cannot be saved: unknown, ambiguous
              or unit-mismatched observations never enter storage or domain read models.
            </p>
          ) : null}
          {duplicateWarnings ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              {duplicates.length ? (
                <p className="text-sm font-medium">
                  Possible duplicate: {duplicates.length} stored observation(s) share the same
                  metric, time and value.
                </p>
              ) : null}
              {batchDuplicates.length ? (
                <p className="text-sm font-medium">
                  Possible duplicate: {batchDuplicates.length} selected row(s) repeat another
                  selected row&apos;s metric, time and value.
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={duplicateAcknowledged}
                  onChange={(event) => setDuplicateAcknowledged(event.target.checked)}
                />
                This is a legitimate repeat measurement — save anyway.
              </label>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reviewerConfirmed}
              onChange={(event) => setReviewerConfirmed(event.target.checked)}
            />
            I reviewed every selected row (label, value, original unit and observation
            date/precision) and confirm it matches the source.
          </label>
          <Button
            type="button"
            className="h-auto w-full whitespace-normal py-2 text-center"
            disabled={!canSave}
            onClick={() => void saveAccepted()}
          >
            Save {saveableRows.length} reviewed observation(s) — encrypted, offline
          </Button>
        </section>
      ) : null}

      <UnknownBiomarkerReviewPanel
        key={`${membership?.missionId ?? ""}|${membership?.crewMemberId ?? ""}|${provenance}|${identity?.userId ?? ""}`}
        rows={unknownRequestRows}
        scope={
          membership && provenance
            ? { missionId: membership.missionId, crewMemberId: membership.crewMemberId, provenance }
            : null
        }
        reviewerUserId={identity?.signedIn && !identity.error ? (identity.userId ?? null) : null}
        rolesForScope={rolesForScope}
      />

      <StoredObservationsReview
        key={`${membership?.missionId ?? ""}|${membership?.crewMemberId ?? ""}|${identity?.userId ?? ""}`}
        history={history}
        membership={
          membership
            ? { missionId: membership.missionId, crewMemberId: membership.crewMemberId }
            : null
        }
        provenance={provenance}
        userId={identity?.signedIn && !identity.error ? (identity.userId ?? null) : null}
        rolesForScope={rolesForScope}
        reload={reloadHistory}
      />

      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </main>
  );
}

const LOCATOR_WORD: Record<NonNullable<CandidateSourceSection["locator"]>, string> = {
  page_line: "line",
  text_line: "line",
  csv_row: "row",
  xlsx_row: "row",
};
/** P42 source-row evidence: row number, page/line, raw value, confidence, issues and repeats. */
function ExtractionNote({ row }: { row: IntakeRow }) {
  const e = row.extraction;
  if (!e) return <span className="text-muted-foreground">—</span>;
  const blocking = extractionBlockingReason(row);
  return (
    <span className="block min-w-36 space-y-1" data-testid="p42-extraction-note">
      <span className="block font-medium">
        {e.sourceRowNumber ? `No. ${e.sourceRowNumber}` : "Unnumbered"}
        {e.page ? ` · p. ${e.page}` : ""} · line {e.line}
      </span>
      <span className="block text-muted-foreground">
        Source: “{e.rawValue || "—"}” {e.sourceUnit}
        {e.valueKind !== "numeric" ? ` (${valueKindText(e.valueKind)})` : ""}
      </span>
      {e.valueNotes.length && e.valueKind === "numeric" ? (
        <span className="block text-muted-foreground">{e.valueNotes.join(" ")}</span>
      ) : null}
      {e.referenceInterval ? (
        <span className="block text-muted-foreground">
          Reference (as printed, not interpreted): {e.referenceInterval}
        </span>
      ) : null}
      <Badge variant={e.confidence === "high" ? "secondary" : "outline"}>
        Extraction confidence: {e.confidence} ({e.layout})
      </Badge>
      {e.repeat ? (
        <span className="block text-destructive">
          Repeated in this document (first at No. {e.repeat.firstRowNumber ?? "?"}, line{" "}
          {e.repeat.firstLine}; {e.repeat.sameValue ? "same value" : "different value"}). Not
          merged; tick individually only if it is a separate measurement.
        </span>
      ) : null}
      {e.sameLabelOtherUnits.length ? (
        <span className="block text-muted-foreground">
          Same label elsewhere with unit {e.sameLabelOtherUnits.join(", ")} — never combined.
        </span>
      ) : null}
      {blocking ? <span className="block text-destructive">{blocking}</span> : null}
      {e.issues
        .filter((i) => !i.blocking)
        .map((i) => (
          <span key={i.code} className="block text-muted-foreground">
            {i.message}
          </span>
        ))}
      {row.rejected ? <span className="block font-medium">Rejected by reviewer</span> : null}
    </span>
  );
}

/** P39 section provenance of one intake row; evidence only, never an approval. */
function SourceSectionNote({ row }: { row: IntakeRow }) {
  const s = row.sourceSection;
  if (!s) return null;
  const at = [
    s.page ? `page ${s.page}` : null,
    s.line && s.locator ? `${LOCATOR_WORD[s.locator]} ${s.line}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const conflict =
    s.status === "recognized"
      ? syntheticDemoSectionConflict({ ...row, sourceDomain: sectionDomain(row) })
      : null;
  return (
    <span className="mt-1 block" data-testid="p39-source-section">
      {s.status === "recognized" && s.domain
        ? `Section: ${s.path.join(" › ")} → ${DOMAIN_LABELS[s.domain]}`
        : s.status === "unrecognized_heading"
          ? `Section: ${s.path.join(" › ")} (heading not mapped to a domain)`
          : s.status === "ambiguous"
            ? "Section: identical row under different headings (ambiguous)"
            : "Section: none detected"}
      {at ? ` · ${at}` : ""}
      {conflict ? (
        <span className="block text-destructive">
          Source section {DOMAIN_LABELS[conflict.sourceDomain]} differs from the activated demo
          entry {conflict.displayName} ({DOMAIN_LABELS[conflict.entryDomain]}): held review-only.
        </span>
      ) : null}
    </span>
  );
}
