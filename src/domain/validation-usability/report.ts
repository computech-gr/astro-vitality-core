import { P18_KNOWN_LIMITATIONS, P18_VALIDATION_PLAN } from "./catalog";
import type { ValidationEvidence, ValidationSummary } from "./contracts";

export function summarizeValidation(evidence: readonly ValidationEvidence[]): ValidationSummary {
  const byId = new Map(evidence.map((item) => [item.criterionId, item]));
  const criticalFailures: string[] = [];
  const criticalPending: string[] = [];
  let passed = 0;
  let failed = 0;
  let pendingHuman = 0;
  let knownLimitations = 0;

  for (const criterion of P18_VALIDATION_PLAN) {
    const item = byId.get(criterion.id);
    const status = item?.status ?? "pending_human";
    if (status === "pass") passed += 1;
    if (status === "fail") failed += 1;
    if (status === "pending_human") pendingHuman += 1;
    if (status === "known_limitation") knownLimitations += 1;
    if (criterion.critical && status === "fail") criticalFailures.push(criterion.id);
    if (criterion.critical && status !== "pass") criticalPending.push(criterion.id);
  }

  return {
    total: P18_VALIDATION_PLAN.length,
    passed,
    failed,
    pendingHuman,
    knownLimitations,
    criticalFailures,
    criticalPending,
    readyForP18Closure: criticalFailures.length === 0 && criticalPending.length === 0,
  };
}

export function validateEvidence(evidence: readonly ValidationEvidence[]): string[] {
  const issues: string[] = [];
  const knownIds = new Set(P18_VALIDATION_PLAN.map((item) => item.id));
  const seen = new Set<string>();
  for (const item of evidence) {
    if (!knownIds.has(item.criterionId)) issues.push(`Unknown validation criterion ${item.criterionId}`);
    if (seen.has(item.criterionId)) issues.push(`Duplicate validation evidence for ${item.criterionId}`);
    seen.add(item.criterionId);
    if (item.status === "pass" && (!item.evidence || !item.checkedAt)) {
      issues.push(`${item.criterionId} cannot pass without evidence and checkedAt`);
    }
  }
  return issues;
}

export function knownLimitations() {
  return P18_KNOWN_LIMITATIONS;
}
