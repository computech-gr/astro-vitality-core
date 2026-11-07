import { type IntakeClassification } from "../health-domains/unified-intake-classification";

import { validObservationDate, type ObservationDatePrecision } from "./observation-date";
import { classifyWithGovernedExtensions } from "./unknown-biomarker-review";

export interface IntakeReviewRow {
  key: string;
  label: string;
  value: string;
  unit: string;
  observedAt: string;
  datePrecision?: ObservationDatePrecision;
  collectionDate?: string;
  sourceValidation?: "unvalidated";
  specimen?: string;
  method?: string;
  provenance?: "synthetic" | "real";
  /** Selected mission; mission-scoped SYNTHETIC DEMO entries only match rows of that mission. */
  missionId?: string;
  classification: IntakeClassification;
  selected: boolean;
}

const SAFE_DECIMAL = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

/** Selection uses the existing save prerequisites, never scientific approval. */
export function isIntakeRowEligible(row: IntakeReviewRow): boolean {
  return intakeRowExclusionReason(row) === null;
}

export function intakeRowExclusionReason(row: IntakeReviewRow): string | null {
  if (row.sourceValidation === "unvalidated")
    return "Source explicitly marks this measurement unvalidated; scientific/source review required.";
  const current = classifyWithGovernedExtensions(row).classification;
  if (current.status !== "matched")
    return current.status === "unit_review_required"
      ? "Exact reported unit does not match the approved catalog; unit review required."
      : current.status === "ambiguous"
        ? "Ambiguous catalog identity; scientific review required."
        : "No approved catalog mapping; scientific review required.";
  if (row.classification.status !== "matched" || row.classification.metricId !== current.metricId)
    return "Catalog classification is not current.";
  if (!SAFE_DECIMAL.test(row.value.trim()) || !Number.isFinite(Number(row.value.replace(",", "."))))
    return "A finite plain numeric value is required.";
  if (!row.unit.trim()) return "Reported unit is missing.";
  if (!validObservationDate(row))
    return row.observedAt
      ? "Invalid date or timestamp at declared precision."
      : "Observation date is missing; time is optional for date-only records.";
  return null;
}

export function intakeSelectionCounts(rows: readonly IntakeReviewRow[]) {
  const eligible = rows.filter(isIntakeRowEligible);
  const selected = eligible.filter((row) => row.selected).length;
  return {
    selected,
    matched: rows.filter((r) => r.classification.status === "matched").length,
    reviewOnly: rows.filter(
      (r) => r.classification.status !== "matched" || r.sourceValidation === "unvalidated",
    ).length,
    missingDate: rows.filter((r) => !r.observedAt).length,
    invalidDate: rows.filter((r) => Boolean(r.observedAt) && !validObservationDate(r)).length,
    dateOnly: rows.filter((r) => r.datePrecision === "date").length,
    eligible: eligible.length,
    excluded: rows.length - eligible.length,
    allSelected: eligible.length > 0 && selected === eligible.length,
    partiallySelected: selected > 0 && selected < eligible.length,
  };
}

function unconfirmed<T>(rows: T[]) {
  return { rows, reviewerConfirmed: false as const, duplicateAcknowledged: false as const };
}

export function setIntakeReviewSelection<T extends IntakeReviewRow>(
  rows: readonly T[],
  selected: boolean,
) {
  return unconfirmed(
    rows.map((row) => ({ ...row, selected: selected && isIntakeRowEligible(row) })),
  );
}

export function editIntakeReviewRow<T extends IntakeReviewRow>(
  rows: readonly T[],
  key: string,
  patch: Partial<T>,
) {
  return unconfirmed(
    rows.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, ...patch };
      next.classification = classifyWithGovernedExtensions(next).classification;
      next.selected = next.selected && isIntakeRowEligible(next);
      return next;
    }),
  );
}
