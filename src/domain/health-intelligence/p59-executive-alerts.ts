/**
 * P59 — dynamic selection of page-1 alert cards (pure, deterministic).
 * Order: approved clinical RED → high-priority review → data-quality warning → approved AMBER → provisional RED/AMBER.
 * Never invents a RED card; a dataset without concerns yields an explicit "no high-priority findings" card.
 */
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
}
export type CardKind = "clinical-red" | "review-high" | "data-check" | "clinical-amber" | "provisional" | "none";
export interface AlertCard { kind: CardKind; findingIds: string[]; title: string; badges: string[]; evidence: string; nextStep: string }

const tier = (f: FindingSummary): [CardKind, number] | null => {
  if (f.clinical === "RED" && f.clinicalBasis === "approved") return ["clinical-red", 0];
  if (f.review === "HIGH") return ["review-high", 1];
  if (f.dataQuality === "DATA_QUALITY_WARNING") return ["data-check", 2];
  if (f.clinical === "AMBER" && f.clinicalBasis === "approved") return ["clinical-amber", 3];
  if ((f.clinical === "RED" || f.clinical === "AMBER") && f.clinicalBasis === "provisional") return ["provisional", 4];
  return null;
};

export function selectExecutiveAlerts(findings: readonly FindingSummary[], max = 4): AlertCard[] {
  const ranked = findings
    .map((f) => ({ f, t: tier(f) }))
    .filter((x): x is { f: FindingSummary; t: [CardKind, number] } => x.t !== null)
    .sort((a, b) => a.t[1] - b.t[1] || a.f.clinicalOrder - b.f.clinicalOrder || a.f.id.localeCompare(b.f.id));
  if (!ranked.length)
    return [{ kind: "none", findingIds: [], title: "No high-priority findings in this period", badges: [], evidence: "No approved criterion, review rule or data-quality rule identified a concern.", nextStep: "Continue routine monitoring per mission protocol." }];
  const cards: AlertCard[] = ranked.slice(0, max - 1).map(({ f, t }) => ({
    kind: t[0], findingIds: [f.id], title: f.title,
    badges: [
      ...(f.clinical !== "NEUTRAL" && f.clinicalBasis !== "none" ? [`${f.clinical}${f.clinicalBasis === "provisional" ? " (PROVISIONAL)" : ""}`] : []),
      ...(f.review === "HIGH" ? ["HIGH-PRIORITY REVIEW"] : []),
      ...(f.dataQuality === "DATA_QUALITY_WARNING" ? ["DATA CHECK"] : []),
    ],
    evidence: f.evidence, nextStep: f.nextStep,
  }));
  const rest = ranked.slice(max - 1);
  if (rest.length === 1) {
    const { f, t } = rest[0]!;
    cards.push({ kind: t[0], findingIds: [f.id], title: f.title, badges: [], evidence: f.evidence, nextStep: f.nextStep });
  } else if (rest.length > 1) {
    cards.push({ kind: rest[0]!.t[0], findingIds: rest.map((r) => r.f.id), title: `${rest.length} further findings to monitor`, badges: [], evidence: rest.map((r) => r.f.title).join("; "), nextStep: "See the Preliminary Medical Assessment." });
  }
  return cards;
}
