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
import { buildReportCharts, type ReportChart } from "./p58-report-charts";
import type { ClinicalConcern } from "./p58-clinical-reasoning";
import type { ReviewFlag } from "./p56-longitudinal-profile";
import { bundledCriteriaRegistry, classifyWithCriteria, type ApprovedCriterion, type CriteriaClassification } from "./p57-reference-criteria";
import { deriveWarningAxes, type WarningAxes } from "./p571-warning-axes";
import { chartReferenceBands } from "./p571-report-legend";
import { provisionalInterpretation, provisionalBandsFor, provisionalRegistry, type IdentityRoute, type ProvisionalResult } from "./p59-provisional-interpretation";
import { concernWarningPriority, type PriorityDecision, type WarningPriority } from "./p59-warning-priority";

/** Visible label for every report that uses provisional literature interpretation. */
export const DEMONSTRATION_LABEL = "LITERATURE-BASED SYNTHETIC DEMONSTRATION — NOT CLINICALLY VALIDATED";
import { relationshipGraph, type SeriesFact } from "./p59-relationship-graph";
import { selectExecutiveAlerts, type AlertCard, type FindingSummary } from "./p59-executive-alerts";
import { evaluateClinicalPatterns, shortSource, type ClinicalPattern, type PatternLink, type PatternResult, type PatternRow } from "./p60-clinical-patterns";
import { observationCensus, type ObservationCensus, type ReportSourceCoverage } from "./p60-observation-census";
import cvCatalog from "../../../data/scientific/cardiovascular-handbook.catalog.v1.json";
import interpretationRegistry from "../../../data/scientific/biomarker-interpretation-registry.v1.json";

export const PREMIUM_REPORT_SCHEMA = "mitochondria.p59-premium-report.v1" as const;
export const PREMIUM_GENERATOR_VERSION = "p59-premium-report.v1" as const;
/** P60 upgrade of the same schema (additive fields only; P59 fields keep their meaning). */
export const P60_GENERATOR_VERSION = "p60-premium-report.v1" as const;

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
  /** P60: loader coverage (how many stored records were read); null/undefined when unknown. */
  coverage?: ReportSourceCoverage | null;
  /** P60: optional pattern-library override (tests only). */
  patternLibrary?: unknown;
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
  /** Per-observation criterion conditions that are not recorded (empty for approved classes, which require them). */
  unrecordedConditions: string[];
  /** P60: compact criterion text for the results table ("" = no applicable criterion); details move to table notes. */
  criterionShort: string;
  /** P60: table note markers that apply to this row ("‡" unrecorded conditions, "§" demonstration mapping, "◊" demo identity, "†" pattern-level data check). */
  notes: string[];
  /**
   * P60.1: medical-review priority of the finding this result belongs to (P60 pattern, else its P59 concern);
   * null when the result contributes to no finding. Separate from the clinical class and from trend review.
   */
  priority: WarningPriority | null;
  /**
   * P61.3: the HIGH priority comes from the finding/pattern while this result's own clinical class is not RED;
   * printed as "Associated with HIGH PRIORITY pattern" so it never reads as an individual HIGH classification.
   */
  priorityAssociated: boolean;
  /** P60.1: a pattern-level DATA CHECK names this result's series; it is NOT an observation-level data-quality flag. */
  patternDataCheck: boolean;
}
/** P61.3: label for a result (or series) that belongs to a HIGH PRIORITY pattern without a RED class of its own. */
export const ASSOCIATED_HIGH_PRIORITY_LABEL = "Associated with HIGH PRIORITY pattern";
export interface PremiumChart {
  base: ReportChart;
  bands: { lower: number | null; upper: number | null; severity: string; label: string; criterionId: string }[];
  bandSource: "approved" | "provisional" | "none";
  pointClasses: { cls: DisplayClass | "CHECK"; basis: ClassBasis }[];
  dataCheck: boolean;
  /** Significant longitudinal change (P56 trend review) — never a medical-review priority by itself. */
  highReview: boolean;
  /** P60.1: highest medical-review priority among the series' results (same value as the results table). */
  priority: WarningPriority | null;
  /** P61.3: HIGH priority from a pattern while no result of the series has a RED class of its own. */
  priorityAssociated: boolean;
  /** P60.1: a pattern-level DATA CHECK names this series (not an observation-level flag). */
  patternDataCheck: boolean;
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
  /** Clinical class statements per concern (separate field from the warning priority). */
  concernClasses: Record<string, string[]>;
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
  /** P61.3: series still not charted (no class, priority or review flag), named in the report. */
  chartsOmitted: { name: string; reason: string }[];
  concerns: ClinicalConcern[];
  recommendations: { column: RecColumn; items: MergedRecommendation[] }[];
  basisText: string;
  /** P60 generator version (the schema stays PREMIUM_REPORT_SCHEMA). */
  generator: typeof P60_GENERATOR_VERSION;
  /** P60 cross-domain clinical patterns (synthetic demonstration only; empty otherwise). */
  patterns: PatternResult;
  /** P60 page-1 cards built from patterns (null when no pattern exists; renderer then uses `alerts`). */
  patternAlerts: AlertCard[] | null;
  /** P60 relationship map between patterns (non-overlapping layout in the renderer). */
  patternGraph: { nodes: { id: string; title: string; priority: ClinicalPattern["priority"]; dataCheck: boolean; headline: string }[]; edges: (PatternLink & { n: number })[] };
  /** P60 integrated synthesis paragraph(s) (empty when no pattern exists). */
  synthesis: string[];
  /** P60 clinical-class lines per pattern (separate from its warning priority). */
  patternClasses: Record<string, string[]>;
  /** P60 P58 concerns whose contributing results are all covered by patterns (not rendered twice). */
  coveredConcerns: string[];
  /** P60 P58 concern ids related to each pattern (their alternatives are shown with the pattern). */
  patternConcerns: Record<string, string[]>;
  /** P60 results-table notes (markers explained once instead of per row). */
  tableNotes: string[];
  /** P60 observation census (count, series, dates, SHA-256) of exactly the rows used. */
  census: ObservationCensus;
  /** P60 loader coverage, when supplied. */
  coverage: ReportSourceCoverage | null;
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
/** Lower-cases the first letter only for ordinary words (keeps HbA1c, IL-6, QTc, D-dimer). */
const lcFirst = (t: string) => { const w = t.split(/[\s(]/)[0] ?? ""; return w.length > 1 && !/\d/.test(w) && (w.match(/[A-Z]/g) ?? []).length < 2 && !/^[A-Z]-/.test(w) ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
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
  // P61.3: every chartable series (P58 caps its own selection); used to name rows and to re-include series this
  // report classifies or prioritises, so a classified or prioritised series is never left without a chart.
  const fullCharts = buildReportCharts(report.assessment, biomarkers, undefined, { uncapped: true }).charts;
  const header = { ...report.assessment.header, evidenceId: report.evidenceId };
  const synthetic = header.provenance === "synthetic";
  const provisionalActive = input.options.provisionalLiterature && synthetic;
  const mode = provisionalActive ? ("synthetic-demonstration" as const) : ("off" as const);
  const demonstrationMappingsActive = provisionalActive && Boolean(input.options.demonstrationMappings);
  const criterionMeta = new Map<string, { kind: string; perObservation: string[] }>();
  for (const c of bundledCriteriaRegistry().criteria) criterionMeta.set(c.id, { kind: c.kind, perObservation: c.applicability.perObservation.map((x) => x.text) });
  for (const c of provisionalRegistry(input.provisionalRegistry ?? undefined).reg.criteria) criterionMeta.set(c.id, { kind: c.kind, perObservation: c.applicability.perObservation.map((x) => x.text) });
  const kindOf = (ids: readonly string[]) => ids.map((id) => criterionMeta.get(id)?.kind).find((k): k is string => Boolean(k)) ?? null;
  /** Per-observation conditions of the criteria that are not recorded (observation conditions are never captured, so all are unrecorded). */
  const unrecordedPerObservation = (ids: readonly string[]) => [...new Set(ids.flatMap((id) => criterionMeta.get(id)?.perObservation ?? []))];
  const contributors: Contributor[] = report.assessment.findings.flatMap((f) => f.contributors);
  const contribOf = (metricId: string, unit: string) => contributors.find((c) => c.metricId === metricId && c.unit === unit) ?? null;
  const entryOf = (metricId: string, unit: string): BiomarkerAssessment | null => biomarkers.entries.find((e) => e.metricId === metricId && e.unit === unit) ?? null;

  // ---------- rows: every included observation in the period
  const included: ReportRow[] = [...unified.rows].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.metricId.localeCompare(b.metricId) || a.recordId.localeCompare(b.recordId));
  const rows: ResultRow[] = included.map((r) => {
    const c = contribOf(r.metricId, r.unit);
    const e = entryOf(r.metricId, r.unit);
    const chartName = (report.charts.charts.find((x) => x.metricId === r.metricId && x.unit === r.unit) ?? fullCharts.find((x) => x.metricId === r.metricId && x.unit === r.unit))?.name;
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
    if (provisionalActive && basis === "none" && r.provenance !== "real") {
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
    const unrec = basis === "provisional" ? unrecordedPerObservation(provisional?.criterionIds ?? []) : [];
    const notes = [...(unrec.length ? ["‡"] : []), ...(route?.kind === "demonstration_mapping" && basis === "provisional" ? ["§"] : []), ...(r.metricId.startsWith("demo:") ? ["◊"] : [])];
    const criterionShort =
      holds.length ? "Held — verify the measurement first"
      : basis === "approved" ? `${bandLabel ?? "Approved band"} (approved)`
      : basis === "provisional" ? `${provisional!.bandLabel} (${provisional!.rangeText})`
      : !NUMERIC.test(r.value.trim()) ? "Non-numeric; shown as recorded"
      : approvedCls?.outcome === "pending_approval" ? "Candidate criterion pending approval"
      : provisional && provisional.status === "PROVISIONAL" && provisional.severity === "neutral" ? "Outside the provisional bands"
      : "";
    return { criterionShort, notes, recordId: r.recordId, group: groupOf(r.metricId, name), metricId: r.metricId, name, valueText: r.value, unit: r.unit, date: day(r.observedAt), displayClass, basis, bandLabel, axes, provisional, criterionText, limitation, syntheticDemoIdentity: r.metricId.startsWith("demo:"), criterionKind, identityRoute: basis === "provisional" ? route : null, unrecordedConditions: unrec, priority: null as WarningPriority | null, priorityAssociated: false, patternDataCheck: false };
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
  const priorities: Record<string, PriorityDecision> = {};
  const concernClasses: Record<string, string[]> = {};
  const summaries: FindingSummary[] = concerns.map((c) => {
    const rs = rowsOfConcern(c);
    const worst = rs.reduce<ResultRow | null>((m, r) => (!m || rank[r.displayClass] > rank[m.displayClass] ? r : m), null);
    const decision = concernWarningPriority({
      concernPriority: c.priority,
      series: rs.map((r) => ({
        name: `${r.name} ${r.valueText} ${r.unit}`,
        seriesName: r.name,
        displayClass: r.displayClass,
        basis: r.basis,
        criterionKind: r.criterionKind,
        bandLabel: r.bandLabel,
        unrecordedConditions: r.unrecordedConditions,
        highReview: r.axes.review.value === "HIGH",
        dataCheck: r.axes.dataQuality.value === "DATA_QUALITY_WARNING" || r.provisional?.status === "HELD" || Boolean(r.limitation?.startsWith("Held")),
      })),
    });
    priorities[c.concernId] = decision;
    const classLines = rs
      .filter((r) => r.displayClass !== "NEUTRAL" && r.basis !== "none")
      .map((r) => `${r.name} ${r.valueText} ${r.unit} (${r.date}): ${r.displayClass === "NORMAL" ? "GREEN" : r.displayClass}${r.basis === "provisional" ? " (PROVISIONAL)" : ""} — ${r.bandLabel ?? "criterion band"}`);
    concernClasses[c.concernId] = classLines.length ? [...new Set(classLines)] : ["NEUTRAL — insufficient classification evidence (no applicable criterion for the contributing results)."];
    return {
      priority: decision.priority,
      priorityRationale: decision.rationale,
      priorityRules: decision.rules,
      id: c.concernId,
      title: c.title,
      clinical: worst?.displayClass ?? "NEUTRAL",
      clinicalBasis: worst && worst.displayClass !== "NEUTRAL" ? worst.basis : "none",
      review: c.priority === "high" || c.priority === "prompt" ? "HIGH" : "ROUTINE",
      dataQuality: c.priority === "measurement_check" || rs.some((r) => r.axes.dataQuality.value === "DATA_QUALITY_WARNING") ? "DATA_QUALITY_WARNING" : "UNKNOWN",
      evidence: c.narrative.whatHappened,
      nextStep: (decision.priority === "DATA_CHECK" ? [...c.narrative.nextSteps, ...c.confirmation].find((x) => /\b(?:verif|repeat|new sample|method|sample identity)/i.test(x)) : undefined) ?? c.confirmation[0] ?? c.narrative.nextSteps[0] ?? "Ground Medical review.",
      clinicalOrder: order.includes(c.concernId) ? order.indexOf(c.concernId) : order.length,
    };
  });
  const alerts = selectExecutiveAlerts(summaries, 4);
  const nextSteps = alerts.filter((a) => a.kind !== "none").map((a) => a.nextStep).filter((s, i, arr) => arr.indexOf(s) === i && (s !== "See the Preliminary Medical Assessment." || arr.length === 1)).slice(0, 4);

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
  const toPremiumChart = (ch: ReportChart): PremiumChart => {
    const rs = rows.filter((r) => r.metricId === ch.metricId && r.unit === ch.unit);
    const latestCls = entryOf(ch.metricId, ch.unit)?.classification.criteria ?? null;
    const approvedBands = chartReferenceBands(latestCls);
    let bands: PremiumChart["bands"] = approvedBands.bands.map((b) => ({ ...b, severity: b.severity }));
    let bandSource: PremiumChart["bandSource"] = bands.length ? "approved" : "none";
    if (!bands.length && provisionalActive) {
      bands = provisionalBandsFor({ metricId: ch.metricId, unit: ch.unit, provenance: "synthetic", mode, missionId: input.missionId, demonstrationMappings: demonstrationMappingsActive }, input.provisionalRegistry);
      bandSource = bands.length ? "provisional" : "none";
    }
    const dataCheck = rs.some((r) => r.axes.dataQuality.value === "DATA_QUALITY_WARNING");
    const pointClasses = ch.points.map((p) => {
      const r = rs.find((x) => x.date === p.day && x.valueText === p.valueText) ?? rs.find((x) => x.date === p.day);
      return dataCheck ? { cls: "CHECK" as const, basis: "none" as ClassBasis } : { cls: r?.displayClass ?? "NEUTRAL", basis: r?.basis ?? "none" };
    });
    return { base: ch, bands, bandSource, pointClasses, dataCheck, highReview: rs.some((r) => r.axes.review.value === "HIGH"), priority: null as WarningPriority | null, priorityAssociated: false, patternDataCheck: false };
  };
  const charts: PremiumChart[] = report.charts.charts.map(toPremiumChart);

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
  const classified = (() => {
    const bySeries = new Map<string, ResultRow[]>();
    for (const r of rows.filter((x) => x.displayClass !== "NEUTRAL")) bySeries.set(`${r.metricId}|${r.unit}`, [...(bySeries.get(`${r.metricId}|${r.unit}`) ?? []), r]);
    return [...bySeries.values()].map((rs) => `${rs[0]!.name} ${rs.map((r) => r.valueText).join(" / ")} ${rs[0]!.unit} (${[...new Set(rs.map((r) => (r.displayClass === "NORMAL" ? "GREEN" : r.displayClass)))].join("/")}${rs.some((r) => r.basis === "provisional") ? ", provisional" : ""})`);
  })();
  const affected = systems.filter((s) => s.measured && (s.high || s.dataCheck || s.worst !== "NEUTRAL"));
  const gm = report.recommendations.filter((r) => r.authorization === "clinician_required");
  const wellness = report.recommendations.filter((r) => r.authorization === "general_wellness");
  const missingTop = (() => {
    const m = new Map<string, number>();
    for (const c of concerns) for (const x of c.missing) m.set(x.replace(/ — .*$/, ""), (m.get(x.replace(/ — .*$/, "")) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  })();
  const join = (xs: string[], none: string) => (xs.length ? xs.map((x, i) => (i < xs.length - 1 && /[.!?]$/.test(x) ? `${x} ` : i < xs.length - 1 ? `${x}; ` : x)).join("") : none);
  const electrolyte = concerns.some((c) => c.concernId === "electrolyte_disturbance");
  const overview: OverviewAnswer[] = [
    { question: "What is happening?", answer: concerns.length ? `${concerns.length} possible concern area(s) for Ground Medical review: ${concerns.map((c) => c.title.replace(/\s*\(.*\)$/, "").toLowerCase()).join("; ")}.${report.clinical.crossDomain[0] ? ` ${report.clinical.crossDomain[0].text}` : ""}` : "No concern pattern was identified in this period.", evidenceKeys: concerns.flatMap((c) => c.contributorKeys) },
    { question: "Which results are abnormal or concerning?", answer: `${classified.length ? `Classified: ${classified.slice(0, 10).join("; ")}.` : "No result is clinically classified (no applicable criterion)."} ${highKeys.length ? `Trend review — significant change between examinations (not a medical-review priority or a classification): ${highKeys.map((k) => series(k)[0]!.name).join(", ")}.` : ""}`.trim(), evidenceKeys: notableRows.map((r) => r.recordId) },
    { question: "What increased or decreased?", answer: `${up.length ? `Increased: ${up.map(trendText).join("; ")}.` : "No series increased."} ${down.length ? `Decreased: ${down.map(trendText).join("; ")}.` : "No series decreased."}`, evidenceKeys: compared },
    { question: "Which changes are biologically meaningful?", answer: `${highKeys.filter((k) => !checkKeys.includes(k)).length ? `Plausible and important if confirmed: ${highKeys.filter((k) => !checkKeys.includes(k)).map((k) => series(k)[0]!.name).join(", ")}.` : ""} ${checkKeys.length ? `Verify the measurement first: ${checkKeys.map((k) => series(k)[0]!.name).join(", ")}.` : ""}`.trim() || "No change met the review rules.", evidenceKeys: [...highKeys, ...checkKeys] },
    { question: "Which body systems are affected?", answer: join(affected.map((s) => s.label), "No body system shows a flagged or classified result."), evidenceKeys: affected.map((s) => s.group) },
    { question: "How are the biomarkers related?", answer: graph.edges.length ? graph.edges.map((e) => `${graph.nodes.find((n) => n.id === e.from)!.label} – ${graph.nodes.find((n) => n.id === e.to)!.label}: ${e.label}${e.cls === "ESTABLISHED_MECHANISM" ? " (established)" : e.cls === "HYPOTHESIS" ? "" : ""}`).join("; ") + ". Co-occurrence does not show cause." : "No documented relationship applies to the measured biomarkers.", evidenceKeys: graph.edges.map((e) => e.id) },
    { question: "Which conditions could explain the findings?", answer: join(concerns.map((c) => c.title), "None identified.") + (concerns.length ? " All are preliminary and require clinical evaluation." : ""), evidenceKeys: concerns.map((c) => c.concernId) },
    { question: "What supports or contradicts them?", answer: concerns.length ? `${concerns.map((c) => `${c.title.replace(/\s*\(.*\)$/, "")}: ${c.supporting.length} supporting, ${c.contradicting.length} contradicting item(s)`).join("; ")}. Most often missing: ${join(missingTop, "—")}.` : "Not applicable.", evidenceKeys: concerns.map((c) => c.concernId) },
    { question: "What should the astronaut do?", answer: `${electrolyte ? "Do not change fluid, salt or potassium intake before Ground Medical review. " : ""}Report any symptoms. ${wellness.slice(0, 2).map((r) => r.text).join(" ")}`.trim(), evidenceKeys: wellness.map((r) => r.id) },
    { question: "What should Ground Medical confirm?", answer: join(gm.map((r) => r.text.trim()).filter(Boolean).slice(0, 4), "Routine review only."), evidenceKeys: gm.map((r) => r.id) },
  ];
  let lead = `${counts.examinationDates} examination date(s) with ${counts.observations} observation(s) in ${counts.series} biomarker series. ${affected.length} body system(s) show flagged or classified results; ${highKeys.length} series show a significant change between examinations (trend review) and ${checkKeys.length} require measurement verification first.`;

  // ---------- integrated paragraphs from concern narratives (deterministic)
  const integrated = concerns.map((c) => ({
    heading: c.title.replace(/\s*\(.*\)$/, ""),
    paragraphs: [`${c.narrative.whatHappened} ${c.narrative.whyItMatters}`, c.narrative.mechanisms.length ? `Possible mechanisms (not established for this crew member): ${c.narrative.mechanisms.join(" ")}` : ""].filter(Boolean),
    evidenceKeys: c.contributorKeys,
  }));
  if (report.clinical.crossDomain.length) integrated.push({ heading: "Across body systems", paragraphs: report.clinical.crossDomain.map((x) => x.text), evidenceKeys: report.clinical.crossDomain.flatMap((x) => x.contributorKeys) });

  // ---------- P60 cross-domain clinical patterns (synthetic demonstration only)
  const isHeld = (r: ResultRow) => r.axes.dataQuality.value === "DATA_QUALITY_WARNING" || r.provisional?.status === "HELD" || Boolean(r.limitation?.startsWith("Held"));
  const patternRows: PatternRow[] = rows.map((r) => ({ recordId: r.recordId, metricId: r.metricId, unit: r.unit, valueText: r.valueText, date: r.date, name: r.name, displayClass: r.displayClass, basis: r.basis, bandLabel: r.bandLabel, reviewHigh: r.axes.review.value === "HIGH", held: isHeld(r) }));
  const patterns = evaluateClinicalPatterns(patternRows, { active: provisionalActive, library: input.patternLibrary });
  const P = patterns.patterns;
  const rowById = new Map(rows.map((r) => [r.recordId, r]));
  const patternClasses: Record<string, string[]> = {};
  for (const p of P) {
    const rs = p.recordIds.map((id) => rowById.get(id)).filter((r): r is ResultRow => Boolean(r) && r!.displayClass !== "NEUTRAL" && r!.basis !== "none");
    const lines = [...new Set(rs.map((r) => `${r.name} ${r.valueText} ${r.unit} (${r.date.slice(5).replace("-", "/")}): ${r.displayClass === "NORMAL" ? "GREEN" : r.displayClass}${r.basis === "provisional" ? " (PROVISIONAL)" : ""} — ${r.bandLabel ?? "criterion band"}`))];
    patternClasses[p.id] = lines.length ? lines : ["NEUTRAL — no applicable criterion classifies the contributing results; the pattern rests on cited thresholds and review rules, not on a clinical class."];
  }
  const patternIds = new Set(P.flatMap((p) => p.recordIds));
  const patternConcerns: Record<string, string[]> = {};
  for (const p of P) patternConcerns[p.id] = concerns.filter((c) => rowsOfConcern(c).some((r) => p.recordIds.includes(r.recordId))).map((c) => c.concernId);
  // A P58 concern that shares results with a pattern is represented by it (its alternatives are shown there).
  const coveredConcerns = [...new Set(Object.values(patternConcerns).flat())].filter(() => patternIds.size > 0);
  const worstOf = (ids: readonly string[]) => ids.map((id) => rowById.get(id)).filter((r): r is ResultRow => Boolean(r)).reduce<ResultRow | null>((m, r) => (!m || rank[r.displayClass] > rank[m.displayClass] ? r : m), null);
  const patternAlerts = P.length
    ? selectExecutiveAlerts(P.map((p, i) => {
        const w = worstOf(p.recordIds);
        return { id: p.id, title: p.title, clinical: w?.displayClass ?? "NEUTRAL", clinicalBasis: w && w.displayClass !== "NEUTRAL" ? w.basis : "none", review: p.priority === "HIGH_PRIORITY_MEDICAL_REVIEW" ? "HIGH" : "ROUTINE", dataQuality: p.dataCheck ? "DATA_QUALITY_WARNING" : "UNKNOWN", evidence: p.headline, nextStep: p.nextStep, clinicalOrder: i, priority: p.priority, priorityRationale: p.rationale, priorityRules: p.rules } as FindingSummary;
      }), 4)
    : null;
  // Overflow card: one short line per further pattern (never cut mid-list).
  // P60.1: medical-review findings first, then data-quality findings; each line names its own priority.
  const over = patternAlerts?.find((a) => a.findingIds.length > 1);
  if (over) {
    const ps = over.findingIds.map((id) => P.find((p) => p.id === id)!);
    const ordered = [...ps.filter((p) => p.priority !== "DATA_CHECK"), ...ps.filter((p) => p.priority === "DATA_CHECK")];
    over.findingIds = ordered.map((p) => p.id);
    over.evidence = ordered.map((p) => `• ${p.title} — ${p.priority === "DATA_CHECK" ? "data check (measurement quality)" : p.priority === "MONITORING" ? "monitoring" : p.priorityLabel.toLowerCase()}${p.dataCheck && p.priority !== "DATA_CHECK" ? " + pattern data check" : ""}`).join("\n");
  }
  // P60.1: one medical-review priority per result (pattern first, else its own P59 concern), shared by the
  // results table, charts and assessments. Trend review and data quality stay separate axes.
  const PRI_RANK: Record<WarningPriority, number> = { HIGH_PRIORITY_MEDICAL_REVIEW: 4, MONITORING: 3, DATA_CHECK: 2, WITHIN_CRITERIA: 1, INSUFFICIENT_EVIDENCE: 0 };
  const raise = (r: ResultRow, p: WarningPriority) => { if (!r.priority || PRI_RANK[p] > PRI_RANK[r.priority]) r.priority = p; };
  for (const p of P) {
    for (const id of p.recordIds) { const r = rowById.get(id); if (r) raise(r, p.priority); }
    if (p.priority !== "DATA_CHECK")
      for (const id of p.dataCheckRecordIds ?? []) { const r = rowById.get(id); if (r && r.axes.dataQuality.value !== "DATA_QUALITY_WARNING") r.patternDataCheck = true; }
  }
  for (const c of concerns) if (!P.length || !coveredConcerns.includes(c.concernId)) for (const r of rowsOfConcern(c)) raise(r, priorities[c.concernId]!.priority);
  for (const r of rows) if (r.patternDataCheck && !r.notes.includes("†")) r.notes.push("†");
  // P61.3: a HIGH priority inherited from a pattern never reads as the result's own HIGH classification.
  for (const r of rows) r.priorityAssociated = r.priority === "HIGH_PRIORITY_MEDICAL_REVIEW" && r.displayClass !== "RED";
  const charted = new Set(charts.map((c) => c.base.key));
  const reincluded = new Set<string>();
  for (const ch of fullCharts) {
    if (charted.has(ch.key)) continue;
    const rs = rows.filter((r) => r.metricId === ch.metricId && r.unit === ch.unit);
    if (rs.some((r) => r.displayClass !== "NEUTRAL" || r.priority === "HIGH_PRIORITY_MEDICAL_REVIEW" || r.priority === "MONITORING" || r.priority === "DATA_CHECK")) {
      charts.push(toPremiumChart(ch));
      reincluded.add(ch.name);
    }
  }
  const chartsOmitted = report.charts.omitted.filter((o) => !reincluded.has(o.name));
  for (const ch of charts) {
    const rs = rows.filter((r) => r.metricId === ch.base.metricId && r.unit === ch.base.unit);
    ch.priority = rs.reduce<WarningPriority | null>((m, r) => (r.priority && (!m || PRI_RANK[r.priority] > PRI_RANK[m]) ? r.priority : m), null);
    ch.patternDataCheck = rs.some((r) => r.patternDataCheck);
    ch.priorityAssociated = ch.priority === "HIGH_PRIORITY_MEDICAL_REVIEW" && !rs.some((r) => r.displayClass === "RED");
  }
  const prioritised = (pr: WarningPriority) => (P.length ? P.filter((p) => p.priority === pr).length : Object.values(priorities).filter((d) => d.priority === pr).length);
  const nHigh = prioritised("HIGH_PRIORITY_MEDICAL_REVIEW"), nMon = prioritised("MONITORING"), nCheck = prioritised("DATA_CHECK");
  if (nHigh + nMon + nCheck) lead += ` Medical-review priority: ${nHigh} finding(s) high priority, ${nMon} monitoring, ${nCheck} data check.`;
  if (patternAlerts) {
    nextSteps.length = 0;
    nextSteps.push(...[...new Set(P.filter((p) => p.priority === "HIGH_PRIORITY_MEDICAL_REVIEW" || p.priority === "DATA_CHECK").map((p) => p.nextStep))].slice(0, 4));
    if (!nextSteps.length) nextSteps.push(...P.slice(0, 2).map((p) => p.nextStep));
  }
  // Relationship map: one edge per unordered pair (labels merged), numbered for the legend.
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const merged = new Map<string, PatternLink & { n: number }>();
  for (const l of patterns.links) {
    const k = pairKey(l.from, l.to);
    const prev = merged.get(k);
    if (!prev) merged.set(k, { ...l, n: merged.size + 1 });
    else if (l.kind === "established" && prev.kind !== "established") merged.set(k, { ...l, n: prev.n, label: `${l.label}; also ${lcFirst(prev.label)}` });
    else if (!prev.label.includes(l.label)) merged.set(k, { ...prev, label: `${prev.label}; also ${lcFirst(l.label)}` });
  }
  const patternGraph = { nodes: P.map((p) => ({ id: p.id, title: p.title, priority: p.priority, dataCheck: p.dataCheck, headline: p.headline })), edges: [...merged.values()].sort((a, b) => a.n - b.n) };
  // Integrated synthesis (deterministic): lead pattern, what connects to it, what must be verified first.
  const synthesis: string[] = [];
  if (P.length) {
    const titleOf = (id: string) => lcFirst(P.find((p) => p.id === id)?.title ?? id);
    const high = P.filter((p) => p.priority === "HIGH_PRIORITY_MEDICAL_REVIEW");
    const lead = high[0] ?? P[0]!;
    const linked = patternGraph.edges.filter((e) => e.from === lead.id || e.to === lead.id).map((e) => ({ other: e.from === lead.id ? e.to : e.from, e }));
    const est = linked.filter((x) => x.e.kind === "established");
    const co = linked.filter((x) => x.e.kind !== "established");
    synthesis.push(
      `${high.length ? `${high.length} pattern(s) warrant high-priority Ground Medical review` : "No pattern reaches high priority"}; the leading one is ${titleOf(lead.id)}.` +
      (est.length ? ` Part of the picture may follow from it through established biology: ${est.map((x) => `${titleOf(x.other)} (${lcFirst(x.e.label)}${x.e.sourceId ? `; ${shortSource(x.e.sourceId)}` : ""})`).join("; ")}.` : "") +
      (co.length ? ` Other findings occur at the same time without an established causal link: ${co.map((x) => titleOf(x.other)).join("; ")} — co-occurrence does not show cause.` : ""),
    );
    const checks = P.filter((p) => p.dataCheck);
    if (checks.length) synthesis.push(`Before interpretation, measurements must be verified for: ${checks.map((p) => titleOf(p.id)).join("; ")}. A data check never lowers a medical-review priority.`);
    const rest = P.filter((p) => p !== lead && !linked.some((x) => x.other === p.id) && !p.dataCheck);
    if (rest.length) synthesis.push(`Independent findings for monitoring: ${rest.map((p) => titleOf(p.id)).join("; ")}.`);
    synthesis.push("All patterns are preliminary, rest on synthetic demonstration data and literature thresholds that are not Researcher-approved, and require clinical evaluation; none is a diagnosis.");
  }
  // Pattern-derived Ground Medical actions first; P58 items kept unless near-duplicates.
  if (P.length) {
    const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const similar = (a: string, b: string) => { const A = words(a), B = words(b); const inter = [...A].filter((w) => B.has(w)).length; return inter / Math.min(A.size, B.size) > 0.6; };
    const template = report.recommendations.find((r) => r.authorization === "clinician_required");
    const p60Items: MergedRecommendation[] = P.flatMap((p) => p.confirm.slice(0, p.priority === "HIGH_PRIORITY_MEDICAL_REVIEW" ? 2 : 1).map((text, i) => ({
      id: `p60:${p.id}:${i}`, category: "ground_medical" as MergedRecommendation["category"], categoryLabel: template?.categoryLabel ?? "Ground Medical",
      authorization: "clinician_required" as MergedRecommendation["authorization"], authorizationLabel: template?.authorizationLabel ?? "Requires a Ground Medical decision",
      text, basis: [p.title], origin: "pattern" as const, priority: p.priority === "HIGH_PRIORITY_MEDICAL_REVIEW",
    }))).filter((x, i, arr) => arr.findIndex((y) => y.text === x.text) === i);
    const med = recommendations.find((c) => c.column === "Medical follow-up")!;
    const coveredSet = new Set(coveredConcerns);
    // P58 items are kept only when they do not repeat a pattern action; items about represented concerns are already covered.
    med.items = [...p60Items, ...med.items.filter((r) => !p60Items.some((x) => similar(x.text, r.text)) && !r.basis.some((b) => concerns.some((c) => coveredSet.has(c.concernId) && (b.includes(c.title) || b.includes(c.concernId)))))];
    // During an acute high-priority pattern, general exercise suggestions are deferred to Ground Medical.
    const acute = P.find((p) => p.id === "p60-acute-physiology" && p.priority === "HIGH_PRIORITY_MEDICAL_REVIEW");
    if (acute) {
      const ex = recommendations.find((c) => c.column === "Exercise")!;
      ex.items = [{ id: "p60:defer-exercise", category: "physical_activity" as MergedRecommendation["category"], categoryLabel: ex.items[0]?.categoryLabel ?? "Physical activity", authorization: "clinician_required" as MergedRecommendation["authorization"], authorizationLabel: template?.authorizationLabel ?? "Requires a Ground Medical decision", text: "Follow Ground Medical's advice on physical activity until the acute findings have been assessed; general exercise suggestions are deferred.", basis: [acute.title], origin: "pattern", priority: true }];
    }
  }
  // Overview answers that patterns make more precise (others unchanged).
  if (P.length) {
    const set = (q: string, answer: string, keys: string[]) => { const i = overview.findIndex((x) => x.question === q); if (i >= 0) overview[i] = { question: q, answer, evidenceKeys: keys }; };
    set("What is happening?", `${P.length} connected finding pattern(s) for Ground Medical review: ${P.map((p) => `${p.title.toLowerCase()} (${p.priorityLabel.toLowerCase()})`).join("; ")}.`, P.flatMap((p) => p.recordIds));
    set("How are the biomarkers related?", patternGraph.edges.length ? `${patternGraph.edges.map((e) => `${P.find((p) => p.id === e.from)!.title} – ${P.find((p) => p.id === e.to)!.title}: ${e.label}${e.kind === "established" && e.sourceId ? ` (established; ${shortSource(e.sourceId)})` : e.kind === "hypothesis" ? " (hypothesis)" : ""}`).join("; ")}. Co-occurrence does not show cause.` : "No documented relationship connects the patterns.", patternGraph.edges.map((e) => `${e.from}|${e.to}`));
    set("Which conditions could explain the findings?", `${[...new Set(P.flatMap((p) => p.hypotheses.map((h) => h.replace(/^Hypothesis: /, ""))))].slice(0, 6).join("; ")}. All are hypotheses for clinical evaluation, not diagnoses.`, P.map((p) => p.id));
    set("What supports or contradicts them?", P.map((p) => `${p.title}: ${p.observed.length + p.supporting.filter((x) => !p.observed.includes(x)).length} supporting, ${p.contradicting.length} contradicting/limiting`).join("; ") + ".", P.map((p) => p.id));
    if (P.some((p) => p.id === "p60-acute-physiology" && p.priority === "HIGH_PRIORITY_MEDICAL_REVIEW"))
      set("What should the astronaut do?", `Report any symptoms to Ground Medical now (for example fever, breathlessness, chest pain, palpitations or dizziness).${P.some((p) => p.id === "p60-electrolytes") ? " Do not change fluid, salt or potassium intake before Ground Medical review." : ""} Do not start or change supplements or exercise until Ground Medical has reviewed these findings.`, P.map((p) => p.id));
    const toConfirm = [...new Set(P.filter((p) => p.priority !== "MONITORING").map((p) => p.confirm[0]!))];
    // P60.1: when every pattern is MONITORING the answer is never left empty.
    set("What should Ground Medical confirm?", (toConfirm.length ? toConfirm : [...new Set(P.map((p) => p.confirm[0]!).filter(Boolean))]).slice(0, 4).join(" ") || "Routine review only.", P.map((p) => p.id));
  }
  // Results-table notes: explained once.
  const unrecAll = [...new Set(rows.flatMap((r) => (r.notes.includes("‡") ? r.unrecordedConditions : [])))];
  const tableNotes = [
    "— No applicable criterion: NEUTRAL (insufficient classification evidence).",
    ...(unrecAll.length ? [`‡ Per-measurement conditions of the provisional criterion that are not recorded: ${unrecAll.map((x) => x.replace(/\.$/, "")).join("; ")}.`] : []),
    ...(rows.some((r) => r.notes.includes("§")) ? ["§ Identity bound through an owner-directed synthetic demonstration mapping (not Researcher-approved)."] : []),
    ...(rows.some((r) => r.notes.includes("◊")) ? ["◊ Synthetic demonstration catalog identity (not scientifically validated)."] : []),
    ...(rows.some((r) => r.patternDataCheck) ? [`† Pattern-level DATA CHECK (${P.filter((p) => p.dataCheck && p.priority !== "DATA_CHECK").map((p) => p.title).join("; ")}): verify this series before interpretation. It is not an observation-level measurement error and does not lower the medical-review priority.`] : []),
  ];
  const census = observationCensus(included.map((r) => ({ metricId: r.metricId, unit: r.unit, date: day(r.observedAt), valueText: r.value, provenance: r.provenance })));

  const mappedRows = rows.filter((r) => r.identityRoute?.kind === "demonstration_mapping");
  const basisText = `Clinical classes: ${counts.approvedCriteria} Researcher-approved criteria for this mission${provisionalActive ? "; PROVISIONAL = documented literature criterion (synthetic demonstration only; never a validated alert)" : ""}${demonstrationMappingsActive ? `; ${new Set(mappedRows.map((r) => r.metricId)).size} synthetic identity mapping(s) applied (owner-directed)` : ""}. Panel colour = warning priority, separate from each result's clinical class. General-population criteria are not NASA flight limits.`;

  return {
    schema: PREMIUM_REPORT_SCHEMA, version: PREMIUM_GENERATOR_VERSION, base: report, header,
    options: { provisionalLiterature: input.options.provisionalLiterature, provisionalActive, demonstrationMappingsActive },
    demonstrationLabel: provisionalActive ? DEMONSTRATION_LABEL : null,
    priorities,
    concernClasses,
    counts, rows, alerts, nextSteps, overview, lead, systems, graph, integrated, charts, chartsOmitted, concerns, recommendations, basisText,
    generator: P60_GENERATOR_VERSION, patterns, patternAlerts, patternGraph, synthesis, patternClasses, coveredConcerns, patternConcerns, tableNotes, census,
    coverage: input.coverage ?? null,
  };
}
