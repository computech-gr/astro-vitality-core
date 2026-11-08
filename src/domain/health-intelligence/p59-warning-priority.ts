/**
 * P59 Rev 2 — warning priority for premium-report concern panels (pure, deterministic).
 *
 * Warning priority is the colour of a panel (review urgency). It is a SEPARATE field from the
 * clinical classification of the contributing results, which is never changed here:
 *
 *   RED     HIGH PRIORITY MEDICAL REVIEW       — documented evidence supports priority review
 *   AMBER   MONITORING OR FURTHER EVALUATION   — warrants attention, not high priority
 *   PURPLE  DATA CHECK                         — verify the measurement before interpretation
 *   GREEN   WITHIN APPLICABLE REFERENCE CRITERIA — only with a suitable criterion
 *   NEUTRAL INSUFFICIENT CLASSIFICATION EVIDENCE
 *
 * A red panel never asserts an approved RED clinical classification. Held (measurement-check)
 * results never count as evidence for RED or AMBER, and a data check never suppresses a
 * medical-review priority supported by other results; it is added as a separate badge.
 * Rules WP-1..WP-5 are owner-directed for the synthetic demonstration and pending Researcher review.
 */
import type { ConcernPriority } from "./p58-clinical-reasoning";

export type WarningPriority = "HIGH_PRIORITY_MEDICAL_REVIEW" | "MONITORING" | "DATA_CHECK" | "WITHIN_CRITERIA" | "INSUFFICIENT_EVIDENCE";
export type PriorityTone = "red" | "amber" | "purple" | "green" | "neutral";

export const WARNING_PRIORITY_LABEL: Record<WarningPriority, string> = {
  HIGH_PRIORITY_MEDICAL_REVIEW: "HIGH PRIORITY MEDICAL REVIEW",
  MONITORING: "MONITORING OR FURTHER EVALUATION",
  DATA_CHECK: "DATA CHECK",
  WITHIN_CRITERIA: "WITHIN APPLICABLE REFERENCE CRITERIA",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT CLASSIFICATION EVIDENCE",
};
export const WARNING_PRIORITY_TONE: Record<WarningPriority, PriorityTone> = {
  HIGH_PRIORITY_MEDICAL_REVIEW: "red",
  MONITORING: "amber",
  DATA_CHECK: "purple",
  WITHIN_CRITERIA: "green",
  INSUFFICIENT_EVIDENCE: "neutral",
};
export const WARNING_PRIORITY_MEANING: Record<WarningPriority, string> = {
  HIGH_PRIORITY_MEDICAL_REVIEW: "Medically significant finding or pattern; priority Ground Medical review, supported by documented evidence. Not a diagnosis.",
  MONITORING: "Warrants attention or further evaluation; does not justify a high-priority warning.",
  DATA_CHECK: "Verify the measurement first: implausible change, missing information or possible inconsistency.",
  WITHIN_CRITERIA: "Within the bands of a suitable, applicable criterion.",
  INSUFFICIENT_EVIDENCE: "No defensible classification is available.",
};

export const WARNING_PRIORITY_RULES = [
  { id: "WP-1", priority: "HIGH_PRIORITY_MEDICAL_REVIEW", text: "A contributing result lies in a RED band of an approved criterion or of a documented literature criterion (provisional, synthetic demonstration)." },
  { id: "WP-2", priority: "HIGH_PRIORITY_MEDICAL_REVIEW", text: "A contributing series meets the high review-priority change rules AND a contributing result lies in a band of a diagnostic or action threshold (approved or provisional literature)." },
  { id: "WP-3", priority: "MONITORING", text: "High review-priority change without WP-1/WP-2, or a contributing result in an AMBER band of a risk category, reference interval or threshold." },
  { id: "WP-4", priority: "DATA_CHECK", text: "Measurement-consistency check required. Shown as the panel colour only when no WP-1 to WP-3 evidence exists from other (non-held) results; otherwise added as a separate DATA CHECK badge." },
  { id: "WP-5", priority: "WITHIN_CRITERIA", text: "Every contributing classified result lies within a normal band and no review or data-quality flag applies." },
] as const satisfies readonly { id: string; priority: WarningPriority; text: string }[];

export interface PriorityEvidence {
  /** Observation label including value and unit. */
  name: string;
  /** Series label without value (used for change-based statements). */
  seriesName?: string;
  displayClass: "RED" | "AMBER" | "NORMAL" | "NEUTRAL";
  basis: "approved" | "provisional" | "none";
  /** Kind of the criterion that produced the class (null when NEUTRAL). */
  criterionKind: string | null;
  bandLabel: string | null;
  highReview: boolean;
  dataCheck: boolean;
}
export interface PriorityDecision {
  priority: WarningPriority;
  label: string;
  tone: PriorityTone;
  rules: string[];
  rationale: string;
  /** True when a measurement check applies (shown as a badge even on red/amber panels). */
  dataCheck: boolean;
}

const THRESHOLD_KINDS = new Set(["diagnostic_threshold", "action_threshold", "critical_limit"]);
const basisWord = (b: PriorityEvidence["basis"]) => (b === "approved" ? "approved criterion" : "provisional literature criterion");
const uniq = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i);

export function concernWarningPriority(input: { concernPriority: ConcernPriority; series: readonly PriorityEvidence[] }): PriorityDecision {
  const usable = input.series.filter((s) => !s.dataCheck);
  const dataCheck = input.concernPriority === "measurement_check" || input.series.some((s) => s.dataCheck);
  const decide = (priority: WarningPriority, rules: string[], why: string[]): PriorityDecision => ({
    priority,
    label: WARNING_PRIORITY_LABEL[priority],
    tone: WARNING_PRIORITY_TONE[priority],
    rules,
    rationale: uniq(why).join(" "),
    dataCheck,
  });
  const checkNote = dataCheck ? [`Verify first: ${uniq(input.series.filter((s) => s.dataCheck).map((s) => s.seriesName ?? s.name)).join(", ") || "measurement consistency"} (data check).`] : [];

  const red = usable.filter((s) => s.displayClass === "RED" && s.basis !== "none");
  if (red.length) return decide("HIGH_PRIORITY_MEDICAL_REVIEW", ["WP-1"], [`${red.map((s) => `${s.name}: ${s.bandLabel ?? "RED band"} (${basisWord(s.basis)})`).join("; ")}.`, ...checkNote]);

  const high = usable.filter((s) => s.highReview);
  const threshold = usable.filter((s) => s.basis !== "none" && (s.displayClass === "AMBER" || s.displayClass === "RED") && s.criterionKind !== null && THRESHOLD_KINDS.has(s.criterionKind));
  if (high.length && threshold.length)
    return decide("HIGH_PRIORITY_MEDICAL_REVIEW", ["WP-2"], [
      `Rapid change meeting the review-priority rules: ${uniq(high.map((s) => s.seriesName ?? s.name)).join(", ")}.`,
      `Threshold met: ${uniq(threshold.map((s) => `${s.name} — ${s.bandLabel ?? "threshold band"} (${basisWord(s.basis)})`)).join("; ")}.`,
      ...checkNote,
    ]);

  const amber = usable.filter((s) => s.displayClass === "AMBER" && s.basis !== "none");
  if (high.length || amber.length)
    return decide("MONITORING", ["WP-3"], [
      ...(high.length ? [`Review-priority change: ${uniq(high.map((s) => s.seriesName ?? s.name)).join(", ")}; no RED band or diagnostic/action threshold supports high priority.`] : []),
      ...(amber.length ? [`AMBER band: ${uniq(amber.map((s) => `${s.name} — ${s.bandLabel ?? "AMBER"} (${basisWord(s.basis)})`)).join("; ")}.`] : []),
      ...checkNote,
    ]);

  if (dataCheck) return decide("DATA_CHECK", ["WP-4"], [...checkNote, "No other result supports a medical-review priority until the measurement is verified."]);

  const classified = usable.filter((s) => s.basis !== "none");
  if (classified.length && classified.every((s) => s.displayClass === "NORMAL") && !usable.some((s) => s.highReview))
    return decide("WITHIN_CRITERIA", ["WP-5"], [`Within normal bands: ${uniq(classified.map((s) => s.name)).join(", ")}.`]);

  return decide("INSUFFICIENT_EVIDENCE", [], ["No applicable criterion, review rule or data-quality rule supports a warning."]);
}
