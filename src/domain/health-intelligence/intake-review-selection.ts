import { classifyIntakeObservation, type IntakeClassification } from "../health-domains/unified-intake-classification";

export interface IntakeReviewRow {
  key: string;
  label: string;
  value: string;
  unit: string;
  observedAt: string;
  classification: IntakeClassification;
  selected: boolean;
}

const SAFE_DECIMAL = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

/** Selection uses the existing save prerequisites, never scientific approval. */
export function isIntakeRowEligible(row: IntakeReviewRow): boolean {
  return row.classification.status === "matched" &&
    SAFE_DECIMAL.test(row.value.trim()) && Boolean(row.unit.trim()) &&
    Boolean(row.observedAt) && Number.isFinite(Date.parse(row.observedAt));
}

export function intakeSelectionCounts(rows: readonly IntakeReviewRow[]) {
  const eligible = rows.filter(isIntakeRowEligible);
  const selected = eligible.filter((row) => row.selected).length;
  return {
    selected,
    eligible: eligible.length,
    excluded: rows.length - eligible.length,
    allSelected: eligible.length > 0 && selected === eligible.length,
    partiallySelected: selected > 0 && selected < eligible.length,
  };
}

function unconfirmed<T>(rows: T[]) {
  return { rows, reviewerConfirmed: false as const, duplicateAcknowledged: false as const };
}

export function setIntakeReviewSelection<T extends IntakeReviewRow>(rows: readonly T[], selected: boolean) {
  return unconfirmed(rows.map((row) => ({ ...row, selected: selected && isIntakeRowEligible(row) })));
}

export function editIntakeReviewRow<T extends IntakeReviewRow>(rows: readonly T[], key: string, patch: Partial<T>) {
  return unconfirmed(rows.map((row) => {
    if (row.key !== key) return row;
    const next = { ...row, ...patch };
    next.classification = classifyIntakeObservation(next);
    next.selected = next.selected && isIntakeRowEligible(next);
    return next;
  }));
}