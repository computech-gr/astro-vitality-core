/**
 * Governed adverse-value annotations for the searchable report PDF (P36.8.2).
 *
 * This module never classifies a value. It only validates record-level
 * annotations that an independently approved, versioned rule has already
 * produced, and rejects anything that is not fully traceable. No approved rule
 * exists in this repository, so production reports stay neutral and say
 * "Not assessed / scientific review pending".
 *
 * Demonstration annotations are a separate status, accepted only for synthetic
 * scopes when explicitly allowed, and are always labelled as not approved.
 */
import type { ReportRow } from "./unified-health-report";

export type AdverseRuleStatus = "APPROVED" | "DEMONSTRATION_ONLY" | "PENDING_REVIEW" | "REJECTED";

export interface AdverseRule {
  ruleId: string;
  version: string;
  status: AdverseRuleStatus;
  /** Exact canonical metric ID and exact unit text; no conversion or synonyms. */
  metricId: string;
  unit: string;
  /** Named independent approver and auditable approval reference. */
  approvedBy: string;
  approvalRef: string;
  approvedAt: string;
  missionPhases: readonly string[];
}

export interface AdverseAnnotation {
  recordId: string;
  ruleId: string;
  ruleVersion: string;
  missionPhase: string;
  /** Personal baseline or reference used by the rule (identifier, never inferred here). */
  baselineRef: string;
  provenanceRef: string;
  contextRef: string;
  qualityAccepted: boolean;
}

export interface AdverseAssessmentInput {
  rules: readonly AdverseRule[];
  annotations: readonly AdverseAnnotation[];
  /** Demonstration annotations are only honoured for synthetic scopes when this is true. */
  allowDemonstration?: boolean;
}

export interface AcceptedAnnotation {
  recordId: string;
  demonstration: boolean;
  /** Accessible text marker printed beside the observation (never colour alone). */
  marker: string;
}

export type RejectionReason =
  | "unknown_rule"
  | "rule_not_approved"
  | "version_mismatch"
  | "missing_approval"
  | "record_not_included"
  | "metric_mismatch"
  | "unit_mismatch"
  | "phase_not_applicable"
  | "missing_baseline"
  | "missing_provenance"
  | "missing_context"
  | "quality_not_accepted"
  | "demonstration_not_allowed";

export interface AdverseResolution {
  accepted: Map<string, AcceptedAnnotation>;
  rejected: { recordId: string; reason: RejectionReason }[];
}

export const NOT_ASSESSED_TEXT = "Not assessed / scientific review pending";

const filled = (s: string | undefined | null) => typeof s === "string" && s.trim().length > 0;

export function resolveAdverseAnnotations(
  rows: readonly ReportRow[],
  provenance: "synthetic" | "real",
  input: AdverseAssessmentInput | undefined,
): AdverseResolution {
  const accepted = new Map<string, AcceptedAnnotation>();
  const rejected: AdverseResolution["rejected"] = [];
  if (!input) return { accepted, rejected };
  const byRecord = new Map(rows.map((r) => [r.recordId, r]));
  for (const a of input.annotations) {
    const reject = (reason: RejectionReason) => rejected.push({ recordId: a.recordId, reason });
    const rule = input.rules.find((r) => r.ruleId === a.ruleId);
    if (!rule) { reject("unknown_rule"); continue; }
    const demonstration = rule.status === "DEMONSTRATION_ONLY";
    if (rule.status !== "APPROVED" && !demonstration) { reject("rule_not_approved"); continue; }
    if (demonstration && !(input.allowDemonstration && provenance === "synthetic")) { reject("demonstration_not_allowed"); continue; }
    if (rule.version !== a.ruleVersion) { reject("version_mismatch"); continue; }
    if (!demonstration && !(filled(rule.approvedBy) && filled(rule.approvalRef) && filled(rule.approvedAt))) { reject("missing_approval"); continue; }
    const row = byRecord.get(a.recordId);
    if (!row) { reject("record_not_included"); continue; }
    if (row.metricId !== rule.metricId) { reject("metric_mismatch"); continue; }
    if (row.unit !== rule.unit) { reject("unit_mismatch"); continue; }
    if (!rule.missionPhases.includes(a.missionPhase)) { reject("phase_not_applicable"); continue; }
    if (!filled(a.baselineRef)) { reject("missing_baseline"); continue; }
    if (!filled(a.provenanceRef)) { reject("missing_provenance"); continue; }
    if (!filled(a.contextRef)) { reject("missing_context"); continue; }
    if (a.qualityAccepted !== true) { reject("quality_not_accepted"); continue; }
    accepted.set(a.recordId, {
      recordId: a.recordId,
      demonstration,
      marker: demonstration
        ? `DEMONSTRATION ANNOTATION (${rule.ruleId} v${rule.version}) - not an approved medical decision`
        : `ADVERSE per approved rule ${rule.ruleId} v${rule.version} (${rule.approvalRef})`,
    });
  }
  return { accepted, rejected };
}
