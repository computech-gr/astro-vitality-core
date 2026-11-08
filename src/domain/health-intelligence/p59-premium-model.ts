/**
 * P59 — Premium Health Intelligence Report read model (pure, deterministic, no rendering).
 *
 * Built from the existing P58 ProfessionalReport plus the unified report rows (ALL included
 * observations in the selected period) and the attested approvals. It never changes stored data,
 * never converts units and never invents values. Clinical colour comes only from approved criteria
 * (operational) or, in synthetic demonstration mode with the explicit option, from provisional
 * literature criteria that are always labelled PROVISIONAL.
 */
import type { ProfessionalReport, MergedRecommendation } from "./p58-professional-report";
import type { UnifiedHealthReport, ReportRow } from "./unified-health-report";
import type { BiomarkerAssessmentReport, BiomarkerAssessment } from "./biomarker-health-assessment";
import type { Contributor } from "./p56-health-assessment";
import type { ReportChart } from "./p58-report-charts";
import type { ClinicalConcern } from "./p58-clinical-reasoning";
import type { ReviewFlag } from "./p56-longitudinal-profile";
import { bundledCriteriaRegistry, classifyWithCriteria, type ApprovedCriterion, type CriteriaClassification } from "./p57-reference-criteria";
import { deriveWarningAxes, type WarningAxes } from "./p571-warning-axes";
import { chartReferenceBands } from "./p571-report-legend";
import { provisionalInterpretation, provisionalBandsFor, provisionalRegistry, type IdentityRoute, type ProvisionalResult } from "./p59-provisional-interpretation";
import { concernWarningPriority, type PriorityDecision } from "./p59-warning-priority";

/** Visible label for every report that uses provisional literature interpretation. */
export const DEMONSTRATION_LABEL = "LITERATURE-BASED SYNTHETIC DEMONSTRATION — NOT CLINICALLY VALIDATED";
import { relationshipGraph, type SeriesFact } from "./p59-relationship-graph";
import { selectExecutiveAlerts, type AlertCard, type FindingSummary } from "./p59-executive-alerts";
import cvCatalog from "../../../data/scientific/cardiovascular-handbook.catalog.v1.json";
import interpretationRegistry from "../../../data/scientific/biomarker-interpretation-registry.v1.json";

export const PREMIUM_REPORT_SCHEMA = "mitochondria.p59-premium-report.v1" as const;
export const PREMIUM_GENERATOR_VERSION = "p59-premium-report.v1" as const;

export type DisplayClass = "RED" | "AMBER" | "NORMAL" | "NEUTRAL";
export type ClassBasis = "approved" | "provisional" | "none";
export type GroupId = "electrolytes" | "metabolic" | "inflammation" | "blood" | "circulation" | "bone" | "recovery" | "other";
export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "electrolytes", label: "Fluids & electrolytes" },
  { id: "metabolic", label: "Glucose & lipids" },
  { id: "inflammation", label: "Inflammation & immunity" },
  { id: "blood", label: "Blood & clotting" },
  { id: "circulation", label: "Heart & circulation" },
  { id: "bone", label: "Bone & mineral" },
  { id: "recovery", label: "Sleep & recovery" },
  { id: "other", label: "Other measurements" },
];

export interface PremiumInput {
  report: ProfessionalReport;
  unified: UnifiedHealthReport;
  biomarkers: BiomarkerAssessmentReport;
  approved: readonly ApprovedCriterion[];
  missionId: string;
  /**
   * provisionalLiterature: synthetic-only literature interpretation (always labelled PROVISIONAL).
   * demonstrationMappings: owner-directed synthetic identity mappings (P59 Rev 2), used only
   * together with provisionalLiterature on synthetic data; never for approved classification.
   */
  options: { provisionalLiterature: boolean; demonstrationMappings?: boolean };
  /** Optional provisional registry override (tests only). */
  provisionalRegistry?: unknown;
}

export interface ResultRow {
  recordId: string;
  group: GroupId;
  metricId: string;
  name: string;
  valueText: string;
  unit: string;
  date: string;
  displayClass: DisplayClass;
  basis: ClassBasis;
  bandLabel: string | null;
  axes: WarningAxes;
  provisional: ProvisionalResult | null;
  criterionText: string;
  limitation: string | null;
  syntheticDemoIdentity: boolean;
  /** Kind of the criterion that produced a non-neutral class (approved or provisional). */
  criterionKind: string | null;
  /** Identity route when a demonstration mapping or alias bound the criterion (traceability). */
  identityRoute: IdentityRoute | null;
}
export interface PremiumChart {
  base: ReportChart;
  bands: { lower: number | null; upper: number | null; severity: string; label: string; criterionId: string }[];
  bandSource: "approved" | "provisional" | "none";
  pointClasses: { cls: DisplayClass | "CHECK"; basis: ClassBasis }[];
  dataCheck: boolean;
  highReview: boolean;
}
export interface SystemTile { group: GroupId; label: string; worst: DisplayClass; basis: ClassBasis; high: boolean; dataCheck: boolean; lines: string[]; measured: boolean }
export interface OverviewAnswer { question: string; answer: string; evidenceKeys: string[] }
export interface PremiumCounts { observations: number; series: number; examinationDates: number; comparedSeries: number; excluded: { reason: string; n: number }[]; approvedCriteria: number }
export interface PremiumReport {
  schema: typeof PREMIUM_REPORT_SCHEMA;
  version: typeof PREMIUM_GENERATOR_VERSION;
  base: ProfessionalReport;
  header: ProfessionalReport["assessment"]["header"] & { evidenceId: string };
  options: { provisionalLiterature: boolean; provisionalActive: boolean; demonstrationMappingsActive: boolean };
  /** Visible demonstration label (null when provisional literature interpretation is off). */
  demonstrationLabel: string | null;
  /** Warning priority per concern (separate from clinical classification). */
  priorities: Record<string, PriorityDecision>;
  counts: PremiumCounts;
  rows: ResultRow[];
  alerts: AlertCard[];
  nextSteps: string[];
  overview: OverviewAnswer[];
  lead: string;
  systems: SystemTile[];
  graph: ReturnType<typeof relationshipGraph>;
  integrated: { heading: string; paragraphs: string[]; evidenceKeys: string[] }[];
  charts: PremiumChart[];
  concerns: ClinicalConcern[];
  recommendations: { column: RecColumn; items: MergedRecommendation[] }[];
  basisText: string;
}
export type RecColumn = "Nutrition" | "Exercise" | "Sleep and recovery" | "Medical follow-up";
const REC_COLUMN: Record<MergedRecommendation["category"], RecColumn> = {
  nutrition: "Nutrition", hydration: "Nutrition", physical_activity: "Exercise", sleep: "Sleep and recovery", recovery: "Sleep and recovery",
  monitoring: "Sleep and recovery", further_examination: "Medical follow-up", ground_medical: "Medical follow-up",
};

// ------------------------------------------------------------------ identity helpers

const CV_UNITS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      const r = o as Record<string, unknown>;
      const id = r["id"], unit = r["unit"];
      if (typeof id === "string" && /^cv-\d+$/.test(id) && typeof unit === "string") m.set(id, unit);
      Object.values(r).forEach(walk);
    }
  };
  walk(cvCatalog);
  return m;
})();

/** Display names: catalog short names and governed interpretation-registry display names (incl. synthetic demo identities). */
const DISPLAY_NAMES: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const r of ((interpretationRegistry as { records?: { identity?: { catalogId?: string; unit?: string; displayName?: string } }[] }).records ?? []))
    if (r.identity?.catalogId && r.identity.displayName && !m.has(`${r.identity.catalogId}|${r.identity.unit}`)) m.set(`${r.identity.catalogId}|${r.identity.unit}`, r.identity.displayName);
  return m;
})();

const GROUP_IDS: Record<GroupId, RegExp> = {
  electrolytes: /^cv-0(?:1[45]|7[0-4]|7[7-9]|80)$/,
  metabolic: /^cv-0(?:8[3-9]|90)$/,
  inflammation: /^(?:cv-09[1-3]|IMM-\d+)$/,
  blood: /^cv-0(?:5[7-9]|6[0-2]|7[56])$/,
  circulation: /^cv-0(?:0\d|1[0-3]|1[6-9]|2[0-4]|3\d|4\d|5[0-6]|6[3-9]|81|82)$/,
  bone: /^bone-\d+$/,
  recovery: /^(?:cv-02[5-9]|BSC-\d+)$/,
  other: /$^/,
};
const GROUP_NAMES: [GroupId, RegExp][] = [
  ["electrolytes", /sodium|potassium|magnesium|ionized calcium|phosphate|plasma volume|blood volume|natriuretic|\banp\b|osmolal|urine output|fluid/i],
  ["metabolic", /glucose|hba1c|insulin|cholesterol|triglycer|apolipoprotein|lipoprotein|homa/i],
  ["inflammation", /crp|c-reactive|interleukin|\bil-\d|tnf|cytokine|\bwbc\b|leukocyte|neutrophil|lymphocyte|monocyte|eosinophil|basophil|neopterin|procalcitonin|complement|\big[gmaed]\b/i],
  ["blood", /hemoglobin|haemoglobin|hematocrit|haematocrit|d-dimer|fibrinogen|aptt|platelet|inr|red cell/i],
  ["circulation", /pressure|heart rate|pulse|stroke volume|cardiac|jugular|\bijv\b|ecg|qtc|ejection|pwv|spo2|vo2|troponin|bnp/i],
  ["bone", /osteo|\bctx\b|p1np|pinp|picp|vitamin d|hydroxyvitamin|pyridinoline|calcium|pth|bmd|bone|urinary/i],
  ["recovery", /sleep|hrv|rmssd|sdnn|fatigue|pvt|alertness|recovery/i],
];
export function groupOf(metricId: string, name: string): GroupId {
  for (const g of GROUPS) if (GROUP_IDS[g.id].test(metricId)) return g.id;
  for (const [g, re] of GROUP_NAMES) if (re.test(name)) return g;
  return "other";
}
const DOMAINS = ["bone", "cardiovascular", "immune", "behavioral"] as const;
type Domain = (typeof DOMAINS)[number];
const day = (iso: string) => iso.slice(0, 10);
const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const sevToClass = (s: string): DisplayClass => (s === "red" ? "RED" : s === "amber" ? "AMBER" : s === "normal" ? "NORMAL" : "NEUTRAL");
const rank: Record<DisplayClass, number> = { RED: 3, AMBER: 2, NORMAL: 1, NEUTRAL: 0 };
const fmtPct = (p: number | null) => (p === null ? "" : `${p > 0 ? "+" : ""}${Math.abs(p) >= 100 ? p.toFixed(0) : p.toFixed(1)} %`);

function shortOutcome(c: CriteriaClassification | null): string {
  if (!c) return "No applicable criterion.";
  switch (c.outcome) {
    case "no_candidate": return "No criterion for this exact identity and unit.";
    case "pending_approval": return "Candidate criterion pending Researcher approval (not applied).";
    case "not_applicable": return `Approved criterion not applicable — ${c.evaluations.flatMap((e) => e.missing).filter((x, i, a) => a.indexOf(x) === i).join("; ")}.`;
    case "held": return "Held for measurement verification (not classified).";
    case "conflict": return "Approved criteria disagree; not reconciled.";
    case "non_numeric": return "Value is not a plain number; not compared.";
    case "outside_bands": return "Outside the approved criterion's bands; no category.";
    default: return c.explanation;
  }
}

// ------------------------------------------------------------------ builder

export function buildPremiumReport(input: PremiumInput): PremiumReport {
  const { report, unified, biomarkers } = input;
  const header = { ...report.assessment.header, evidenceId: report.evidenceId };
  const synthetic = header.provenance === "synthetic";
  const provisionalActive = input.options.provisionalLiterature && synthetic;
  const mode = provisionalActive ? ("synthetic-demonstration" as const) : ("off" as const);
  const demonstrationMappingsActive = provisionalActive && Boolean(input.options.demonstrationMappings);
  const kindOf = (() => {
    const m = new Map<string, string>();
    for (const c of bundledCriteriaRegistry().criteria) m.set(c.id, c.kind);
    for (const c of provisionalRegistry(input.provisionalRegistry ?? undefined).reg.criteria) m.set(c.id, c.kind);
    return (ids: readonly string[]) => ids.map((id) => m.get(id)).find((k): k is string => Boolean(k)) ?? null;
  })();
  const contributors: Contributor[] = report.assessment.findings.flatMap((f) => f.contributors);
  const contribOf = (metricId: string, unit: string) => contributors.find((c) => c.metricId === metricId && c.unit === unit) ?? null;
  const entryOf = (metricId: string, unit: string): BiomarkerAssessment | null => biomarkers.entries.find((e) => e.metricId === metricId && e.unit === unit) ?? null;

  // ---------- rows: every included observation in the period
  const included: ReportRow[] = [...unified.rows].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.metricId.localeCompare(b.metricId) || a.recordId.localeCompare(b.recordId));
  const rows: ResultRow[] = included.map((r) => {
    const c = contribOf(r.metricId, r.unit);
    const e = entryOf(r.metricId, r.unit);
    const chartName = report.charts.charts.find((x) => x.metricId === r.metricId && x.unit === r.unit)?.name;
    const usable = (n: string | undefined | null) => (n && n !== r.metricId ? n : null);
    const name = usable(c?.name) ?? usable(chartName) ?? usable(e?.name) ?? DISPLAY_NAMES.get(`${r.metricId}|${r.unit}`) ?? usable(r.metricLabel) ?? r.metricId;
    const flags: readonly ReviewFlag[] = c?.review.flags ?? [];
    const holds = flags.filter((f) => f.kind === "data_quality").map((f) => `measurement-consistency check required (${f.ruleId})`);
    const domain: Domain = (DOMAINS as readonly string[]).includes(r.badge) ? (r.badge as Domain) : "cardiovascular";
    const approvedCls: CriteriaClassification | null = (DOMAINS as readonly string[]).includes(r.badge)
      ? classifyWithCriteria({ metricId: r.metricId, unit: r.unit, domain, value: r.value, provenance: r.provenance === "real" ? "real" : "synthetic", missionId: input.missionId, holds }, input.approved)
      : null;
    const axes = deriveWarningAxes({ metricId: r.metricId, unit: r.unit, catalogUnit: CV_UNITS.get(r.metricId) ?? null, valueText: r.value, classification: approvedCls, reviewFlags: flags });
    let displayClass: DisplayClass = axes.clinical.value;
    let basis: ClassBasis = displayClass === "NEUTRAL" ? "none" : "approved";
    let bandLabel = axes.clinical.bandLabel;
    let provisional: ProvisionalResult | null = null;
    if (provisionalActive && basis === "none") {
      provisional = provisionalInterpretation({ metricId: r.metricId, unit: r.unit, value: r.value, provenance: "synthetic", mode, missionId: input.missionId, holds, demonstrationMappings: demonstrationMappingsActive }, input.provisionalRegistry);
      if (provisional.status === "PROVISIONAL" && provisional.severity !== "neutral") {
        displayClass = sevToClass(provisional.severity);
        basis = "provisional";
        bandLabel = provisional.bandLabel;
      }
    }
    const route = provisional?.identityRoute ?? null;
    const routeText = route?.kind === "demonstration_mapping" ? `; identity via synthetic demonstration mapping ${route.observedId} → ${route.target} (not Researcher-approved)` : route?.kind === "researcher_alias" ? `; identity via Researcher alias ${route.observedId} → ${route.target}` : "";
    const criterionKind = basis === "approved" ? kindOf(approvedCls?.used.map((u) => u.id) ?? []) : basis === "provisional" ? kindOf(provisional?.criterionIds ?? []) : null;
    const criterionText =
      basis === "approved" ? `${bandLabel ?? ""}${approvedCls?.referenceText ? ` — ${approvedCls.referenceText}` : ""} (approved criterion)`
      : basis === "provisional" ? `${provisional!.bandLabel} (${provisional!.rangeText}) — provisional literature${provisional!.unmetConditions.length ? `; not recorded: ${provisional!.unmetConditions.join("; ")}` : ""}${routeText}`
      : provisional && provisional.status !== "DISABLED" && provisional.status !== "NO_CRITERION" ? provisional.label
      : shortOutcome(approvedCls);
    const limitation = holds.length ? "Held for measurement verification before interpretation." : !NUMERIC.test(r.value.trim()) ? "Non-numeric value; shown as recorded." : r.metricId.startsWith("demo:") ? "Synthetic demonstration catalog identity (not scientifically validated)." : null;
    return { recordId: r.recordId, group: groupOf(r.metricId, name), metricId: r.metricId, name, valueText: r.value, unit: r.unit, date: day(r.observedAt), displayClass, basis, bandLabel, axes, provisional, criterionText, limitation, syntheticDemoIdentity: r.metricId.startsWith("demo:"), criterionKind, identityRoute: basis === "provisional" ? route : null };
  });

  rows.sort((a, b) => GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group) || a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit) || a.date.localeCompare(b.date) || a.recordId.localeCompare(b.recordId));

  // ---------- counts (labelled; never one unlabelled number)
  const seriesKeys = new Set(rows.map((r) => `${r.metricId}|${r.unit}`));
  const comparedSeries = [...seriesKeys].filter((k) => new Set(rows.filter((r) => `${r.metricId}|${r.unit}` === k).map((r) => r.date)).size >= 2).length;
  const excl = new Map<string, number>();
  for (const x of unified.exclusions) excl.set(x.reason, (excl.get(x.reason) ?? 0) + 1);
  const counts: PremiumCounts = {
    observations: rows.length,
    series: seriesKeys.size,
    examinationDates: new Set(rows.map((r) => r.date)).size,
    comparedSeries,
    excluded: [...excl.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    approvedCriteria: input.approved.length,
  };

  // ---------- per-series facts
  const seriesFacts: SeriesFact[] = [...seriesKeys].map((k) => {
    const rs = rows.filter((r) => `${r.metricId}|${r.unit}` === k);
    const nums = rs.filter((r) => NUMERIC.test(r.valueText.trim()));
    const first = nums[0], last = nums.at(-1);
    const direction = !first || !last || first.date === last.date ? null : Number(last.valueText) > Number(first.valueText) ? "up" : Number(last.valueText) < Number(first.valueText) ? "down" : "flat";
    const notable = rs.some((r) => r.displayClass !== "NEUTRAL" || r.axes.review.value !== "NO_FLAG" || r.axes.dataQuality.value === "DATA_QUALITY_WARNING");
    return { metricId: rs[0]!.metricId, direction, notable, interval: first && last && first.date !== last.date ? [first.date, last.date] : null };
  });
  const graph = relationshipGraph(seriesFacts);

  // ---------- concerns → alert cards
  const concerns = report.clinical.concerns;
  const order = ["electrolyte_disturbance", "systemic_inflammation", "dysglycemia", "triglyceride_elevation", "bone_turnover_change", "autonomic_recovery_strain"];
  const rowsOfConcern = (c: ClinicalConcern) => {
    const ids = new Set(c.contributorKeys.map((k) => contributors.find((x) => x.key === k)).filter((x): x is Contributor => Boolean(x)).map((x) => `${x.metricId}|${x.unit}`));
    return rows.filter((r) => ids.has(`${r.metricId}|${r.unit}`));
  };
  const summaries: FindingSummary[] = concerns.map((c) => {
    const rs = rowsOfConcern(c);
    const worst = rs.reduce<ResultRow | null>((m, r) => (!m || rank[r.displayClass] > rank[m.displayClass] ? r : m), null);
    return {
      id: c.concernId,
      title: c.title,
      clinical: worst?.displayClass ?? "NEUTRAL",
      clinicalBasis: worst && worst.displayClass !== "NEUTRAL" ? worst.basis : "none",
      review: c.priority === "high" || c.priority === "prompt" ? "HIGH" : "ROUTINE",
      dataQuality: c.priority === "measurement_check" || rs.some((r) => r.axes.dataQuality.value === "DATA_QUALITY_WARNING") ? "DATA_QUALITY_WARNING" : "UNKNOWN",
      evidence: c.narrative.whatHappened,
      nextStep: c.confirmation[0] ?? c.narrative.nextSteps[0] ?? "Ground Medical review.",
      clinicalOrder: order.includes(c.concernId) ? order.indexOf(c.concernId) : order.length,
    };
  });
  const alerts = selectExecutiveAlerts(summaries, 4);
  const nextSteps = alerts.filter((a) => a.kind !== "none").map((a) => a.nextStep).filter((s, i, arr) => arr.indexOf(s) === i).slice(0, 4);

  // ---------- systems at a glance
  const systems: SystemTile[] = GROUPS.filter((g) => g.id !== "other").map((g) => {
    const rs = rows.filter((r) => r.group === g.id);
    const worstRow = rs.reduce<ResultRow | null>((m, r) => (!m || rank[r.displayClass] > rank[m.displayClass] ? r : m), null);
    const latestPerSeries = new Map<string, ResultRow[]>();
    for (const r of rs) latestPerSeries.set(`${r.metricId}|${r.unit}`, [...(latestPerSeries.get(`${r.metricId}|${r.unit}`) ?? []), r]);
    const notableSeries = [...latestPerSeries.values()].sort((a, b) => Number(b.some((r) => r.axes.review.value === "HIGH" || r.displayClass !== "NEUTRAL")) - Number(a.some((r) => r.axes.review.value === "HIGH" || r.displayClass !== "NEUTRAL")));
    const lines = notableSeries.slice(0, 4).map((s) => `${s[0]!.name} ${s.map((r) => r.valueText).join(" → ")} ${s[0]!.unit}`);
    return {
      group: g.id, label: g.label, measured: rs.length > 0,
      worst: worstRow?.displayClass ?? "NEUTRAL", basis: worstRow && worstRow.displayClass !== "NEUTRAL" ? worstRow.basis : "none",
      high: rs.some((r) => r.axes.review.value === "HIGH"), dataCheck: rs.some((r) => r.axes.dataQuality.value === "DATA_QUALITY_WARNING"),
      lines: rs.length ? lines : ["Not measured in this period."],
    };
  });

  // ---------- charts (P58 selection + bands from approved or provisional criteria)
  const charts: PremiumChart[] = report.charts.charts.map((ch) => {
    const rs = rows.filter((r) => r.metricId === ch.metricId && r.unit === ch.unit);
    const latestCls = entryOf(ch.metricId, ch.unit)?.classification.criteria ?? null;
    const approvedBands = chartReferenceBands(latestCls);
    let bands: PremiumChart["bands"] = approvedBands.bands.map((b) => ({ ...b, severity: b.severity }));
    let bandSource: PremiumChart["bandSource"] = bands.length ? "approved" : "none";
    if (!bands.length && provisionalActive) {
      bands = provisionalBandsFor({ metricId: ch.metricId, unit: ch.unit, provenance: "synthetic", mode, missionId: input.missionId }, input.provisionalRegistry);
      bandSource = bands.length ? "provisional" : "none";
    }
    const dataCheck = rs.some((r) => r.axes.dataQuality.value === "DATA_QUALITY_WARNING");
    const pointClasses = ch.points.map((p) => {
      const r = rs.find((x) => x.date === p.day && x.valueText === p.valueText) ?? rs.find((x) => x.date === p.day);
      return dataCheck ? { cls: "CHECK" as const, basis: "none" as ClassBasis } : { cls: r?.displayClass ?? "NEUTRAL", basis: r?.basis ?? "none" };
    });
    return { base: ch, bands, bandSource, pointClasses, dataCheck, highReview: rs.some((r) => r.axes.review.value === "HIGH") };
  });

  // ---------- recommendations by report column
  const recCols: RecColumn[] = ["Nutrition", "Exercise", "Sleep and recovery", "Medical follow-up"];
  const recommendations = recCols.map((column) => ({ column, items: report.recommendations.filter((r) => REC_COLUMN[r.category] === column) }));

  // ---------- overview answers (deterministic, evidence-linked)
  const notableRows = rows.filter((r) => r.displayClass !== "NEUTRAL" || r.axes.review.value === "HIGH");
  const series = (k: string) => rows.filter((r) => `${r.metricId}|${r.unit}` === k);
  const trendText = (k: string) => {
    const rs = series(k);
    const c = contribOf(rs[0]!.metricId, rs[0]!.unit);
    const pct = c?.trend.percent ?? null;
    const peak = c?.trend.profile?.intermediate ? ` (intermediate ${c.trend.profile.intermediate.kind} ${c.trend.profile.intermediate.point.valueText})` : "";
    return `${rs[0]!.name} ${rs.map((r) => r.valueText).join(" → ")} ${rs[0]!.unit}${pct !== null ? ` (${fmtPct(pct)})` : ""}${peak}`;
  };
  const compared = [...seriesKeys].filter((k) => new Set(series(k).map((r) => r.date)).size >= 2);
  const up = compared.filter((k) => seriesFacts.find((f) => `${f.metricId}|${series(k)[0]!.unit}` === k)?.direction === "up");
  const down = compared.filter((k) => seriesFacts.find((f) => `${f.metricId}|${series(k)[0]!.unit}` === k)?.direction === "down");
  const highKeys = [...new Set(rows.filter((r) => r.axes.review.value === "HIGH").map((r) => `${r.metricId}|${r.unit}`))];
  const checkKeys = [...new Set(rows.filter((r) => r.axes.dataQuality.value === "DATA_QUALITY_WARNING").map((r) => `${r.metricId}|${r.unit}`))];
  const classified = [...new Set(rows.filter((r) => r.displayClass !== "NEUTRAL").map((r) => `${r.name} ${r.valueText} ${r.unit} (${r.displayClass}${r.basis === "provisional" ? ", provisional" : ""})`))];
  const affected = systems.filter((s) => s.measured && (s.high || s.dataCheck || s.worst !== "NEUTRAL"));
  const gm = report.recommendations.filter((r) => r.authorization === "clinician_required");
  const wellness = report.recommendations.filter((r) => r.authorization === "general_wellness");
  const missingTop = (() => {
    const m = new Map<string, number>();
    for (const c of concerns) for (const x of c.missing) m.set(x.replace(/ — .*$/, ""), (m.get(x.replace(/ — .*$/, "")) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  })();
  const join = (xs: string[], none: string) => (xs.length ? xs.join("; ") : none);
  const electrolyte = concerns.some((c) => c.concernId === "electrolyte_disturbance");
  const overview: OverviewAnswer[] = [
    { question: "What is happening?", answer: concerns.length ? `${concerns.length} possible concern area(s) for Ground Medical review: ${concerns.map((c) => c.title.replace(/\s*\(.*\)$/, "").toLowerCase()).join("; ")}.${report.clinical.crossDomain[0] ? ` ${report.clinical.crossDomain[0].text}` : ""}` : "No concern pattern was identified in this period.", evidenceKeys: concerns.flatMap((c) => c.contributorKeys) },
    { question: "Which results are abnormal or concerning?", answer: `${classified.length ? `Classified: ${classified.slice(0, 8).join("; ")}.` : "No result is clinically classified (no applicable criterion)."} ${highKeys.length ? `High-priority review (not a classification): ${highKeys.map((k) => series(k)[0]!.name).join(", ")}.` : ""}`.trim(), evidenceKeys: notableRows.map((r) => r.recordId) },
    { question: "What increased or decreased?", answer: `${up.length ? `Increased: ${up.map(trendText).join("; ")}.` : "No series increased."} ${down.length ? `Decreased: ${down.map(trendText).join("; ")}.` : "No series decreased."}`, evidenceKeys: compared },
    { question: "Which changes are biologically meaningful?", answer: `${highKeys.filter((k) => !checkKeys.includes(k)).length ? `Plausible and important if confirmed: ${highKeys.filter((k) => !checkKeys.includes(k)).map((k) => series(k)[0]!.name).join(", ")}.` : ""} ${checkKeys.length ? `Verify the measurement first: ${checkKeys.map((k) => series(k)[0]!.name).join(", ")}.` : ""}`.trim() || "No change met the review rules.", evidenceKeys: [...highKeys, ...checkKeys] },
    { question: "Which body systems are affected?", answer: join(affected.map((s) => s.label), "No body system shows a flagged or classified result."), evidenceKeys: affected.map((s) => s.group) },
    { question: "How are the biomarkers related?", answer: graph.edges.length ? graph.edges.map((e) => `${graph.nodes.find((n) => n.id === e.from)!.label} – ${graph.nodes.find((n) => n.id === e.to)!.label}: ${e.label}${e.cls === "ESTABLISHED_MECHANISM" ? " (established)" : e.cls === "HYPOTHESIS" ? "" : ""}`).join("; ") + ". Co-occurrence does not show cause." : "No documented relationship applies to the measured biomarkers.", evidenceKeys: graph.edges.map((e) => e.id) },
    { question: "Which conditions could explain the findings?", answer: join(concerns.map((c) => c.title), "None identified.") + (concerns.length ? " All are preliminary and require clinical evaluation." : ""), evidenceKeys: concerns.map((c) => c.concernId) },
    { question: "What supports or contradicts them?", answer: concerns.length ? `${concerns.map((c) => `${c.title.replace(/\s*\(.*\)$/, "")}: ${c.supporting.length} supporting, ${c.contradicting.length} contradicting item(s)`).join("; ")}. Most often missing: ${join(missingTop, "—")}.` : "Not applicable.", evidenceKeys: concerns.map((c) => c.concernId) },
    { question: "What should the astronaut do?", answer: `${electrolyte ? "Do not change fluid, salt or potassium intake before Ground Medical review. " : ""}Report any symptoms. ${wellness.slice(0, 2).map((r) => r.text).join(" ")}`.trim(), evidenceKeys: wellness.map((r) => r.id) },
    { question: "What should Ground Medical confirm?", answer: join(gm.slice(0, 4).map((r) => r.text), "Routine review only."), evidenceKeys: gm.map((r) => r.id) },
  ];
  const lead = `${counts.examinationDates} examination date(s) with ${counts.observations} observation(s) in ${counts.series} biomarker series. ${affected.length} body system(s) show flagged or classified results; ${highKeys.length} series require high-priority review and ${checkKeys.length} require measurement verification first.`;

  // ---------- integrated paragraphs from concern narratives (deterministic)
  const integrated = concerns.map((c) => ({
    heading: c.title.replace(/\s*\(.*\)$/, ""),
    paragraphs: [`${c.narrative.whatHappened} ${c.narrative.whyItMatters}`, c.narrative.mechanisms.length ? `Possible mechanisms (not established for this crew member): ${c.narrative.mechanisms.join(" ")}` : ""].filter(Boolean),
    evidenceKeys: c.contributorKeys,
  }));
  if (report.clinical.crossDomain.length) integrated.push({ heading: "Across body systems", paragraphs: report.clinical.crossDomain.map((x) => x.text), evidenceKeys: report.clinical.crossDomain.flatMap((x) => x.contributorKeys) });

  const basisText = `Clinical colours: ${counts.approvedCriteria} Researcher-approved criteria available for this mission${provisionalActive ? "; provisional literature interpretation is ON for this synthetic demonstration (badges marked PROVISIONAL; never approved classifications)" : ""}. General-population criteria are not NASA flight limits. Review priority (flag) and data quality are separate from clinical classification.`;

  return {
    schema: PREMIUM_REPORT_SCHEMA, version: PREMIUM_GENERATOR_VERSION, base: report, header,
    options: { provisionalLiterature: input.options.provisionalLiterature, provisionalActive },
    counts, rows, alerts, nextSteps, overview, lead, systems, graph, integrated, charts, concerns, recommendations, basisText,
  };
}
