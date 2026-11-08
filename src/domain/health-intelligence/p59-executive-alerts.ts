/**
 * P59 — dynamic selection of page-1 alert cards (pure, deterministic).
 * Order: approved clinical RED → high-priority review → data-quality warning → approved AMBER → provisional RED/AMBER.
 * Never invents a RED card; a dataset without concerns yields an explicit "no high-priority findings" card.
 *
 * Rev 2: when a finding carries a warning priority (p59-warning-priority.ts), cards are ordered
 * HIGH PRIORITY MEDICAL REVIEW → DATA CHECK → MONITORING, and the card keeps the priority,
 * its rationale and the clinical class as separate fields.
 */
import { WARNING_PRIORITY_LABEL, type WarningPriority } from "./p59-warning-priority";

export interface FindingSummary {
  id: string;
  title: string;
  clinical: "RED" | "AMBER" | "NORMAL" | "NEUTRAL";
  clinicalBasis: "approved" | "provisional" | "none";
  review: "HIGH" | "ROUTINE" | "NO_FLAG";
  dataQuality: "VERIFIED" | "DATA_QUALITY_WARNING" | "UNKNOWN";
  evidence: string;
  nextStep: string;
  /** Lower = clinically more urgent within the same tier (electrolytes first). */
  clinicalOrder: number;
  /** Rev 2 warning priority (separate from the clinical class). */
  priority?: WarningPriority;
  priorityRationale?: string;
  priorityRules?: string[];
}
export type CardKind = "clinical-red" | "review-high" | "data-check" | "clinical-amber" | "provisional" | "none";
export interface AlertCard {
  kind: CardKind;
  findingIds: string[];
  title: string;
  badges: string[];
  evidence: string;
  nextStep: string;
  priority?: WarningPriority;
  priorityLabel?: string;
  rationale?: string;
  rules?: string[];
  clinical?: FindingSummary["clinical"];
  clinicalBasis?: FindingSummary["clinicalBasis"];
  dataCheck?: boolean;
}

const tier = (f: FindingSummary): [CardKind, number] | null => {
  if (f.priority) {
    const kind: CardKind = f.priority === "HIGH_PRIORITY_MEDICAL_REVIEW"
      ? f.clinical === "RED" && f.clinicalBasis === "approved" ? "clinical-red" : "review-high"
      : f.priority === "DATA_CHECK" ? "data-check"
      : f.priority === "MONITORING" ? f.clinicalBasis === "approved" ? "clinical-amber" : "provisional"
      : "none";
    if (kind === "none") return null;
    return [kind, kind === "clinical-red" ? 0 : kind === "review-high" ? 1 : kind === "data-check" ? 2 : 3];
  }
  if (f.clinical === "RED" && f.clinicalBasis === "approved") return ["clinical-red", 0];
  if (f.review === "HIGH") return ["review-high", 1];
  if (f.dataQuality === "DATA_QUALITY_WARNING") return ["data-check", 2];
  if (f.clinical === "AMBER" && f.clinicalBasis === "approved") return ["clinical-amber", 3];
  if ((f.clinical === "RED" || f.clinical === "AMBER") && f.clinicalBasis === "provisional") return ["provisional", 4];
  return null;
};

const priorityFields = (f: FindingSummary): Partial<AlertCard> =>
  f.priority
    ? {
        priority: f.priority,
        priorityLabel: WARNING_PRIORITY_LABEL[f.priority],
        rationale: f.priorityRationale ?? "",
        rules: f.priorityRules ?? [],
        clinical: f.clinical,
        clinicalBasis: f.clinicalBasis,
        dataCheck: f.dataQuality === "DATA_QUALITY_WARNING",
      }
    : {};

export function selectExecutiveAlerts(findings: readonly FindingSummary[], max = 4): AlertCard[] {
  const ranked = findings
    .map((f) => ({ f, t: tier(f) }))
    .filter((x): x is { f: FindingSummary; t: [CardKind, number] } => x.t !== null)
    .sort((a, b) => a.t[1] - b.t[1] || a.f.clinicalOrder - b.f.clinicalOrder || a.f.id.localeCompare(b.f.id));
  if (!ranked.length)
    return [{ kind: "none", findingIds: [], title: "No high-priority findings in this period", badges: [], evidence: "No approved criterion, review rule or data-quality rule identified a concern.", nextStep: "Continue routine monitoring per mission protocol." }];
  const usesPriority = ranked.some((r) => r.f.priority);
  const cards: AlertCard[] = ranked.slice(0, max - 1).map(({ f, t }) => ({
    kind: t[0], findingIds: [f.id], title: f.title,
    badges: [
      ...(f.clinical !== "NEUTRAL" && f.clinicalBasis !== "none" ? [`${f.clinical}${f.clinicalBasis === "provisional" ? " (PROVISIONAL)" : ""}`] : []),
      ...(f.review === "HIGH" && !usesPriority ? ["HIGH-PRIORITY REVIEW"] : []),
      ...(f.dataQuality === "DATA_QUALITY_WARNING" ? ["DATA CHECK"] : []),
    ],
    evidence: f.evidence, nextStep: f.nextStep,
    ...priorityFields(f),
  }));
  const rest = ranked.slice(max - 1);
  if (rest.length === 1) {
    const { f, t } = rest[0]!;
    cards.push({ kind: t[0], findingIds: [f.id], title: f.title, badges: usesPriority && f.dataQuality === "DATA_QUALITY_WARNING" ? ["DATA CHECK"] : [], evidence: f.evidence, nextStep: f.nextStep, ...priorityFields(f) });
  } else if (rest.length > 1) {
    const first = rest[0]!.f;
    cards.push({
      kind: rest[0]!.t[0], findingIds: rest.map((r) => r.f.id), title: `${rest.length} further findings`,
      badges: [],
      evidence: rest.map((r) => (r.f.priority ? `${r.f.title} — ${WARNING_PRIORITY_LABEL[r.f.priority].toLowerCase()}` : r.f.title)).join("; "),
      nextStep: "See the Preliminary Medical Assessment.",
      ...(first.priority ? { priority: first.priority, priorityLabel: WARNING_PRIORITY_LABEL[first.priority], rationale: "Each finding's priority and its rationale are listed in the Preliminary Medical Assessment.", rules: [], clinical: "NEUTRAL" as const, clinicalBasis: "none" as const, dataCheck: false } : {}),
    });
  }
  return cards;
}
