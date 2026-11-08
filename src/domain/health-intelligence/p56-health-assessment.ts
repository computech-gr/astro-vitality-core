/**
 * P56 / P56.1 — concise longitudinal health assessment (pure, deterministic, offline).
 *
 * A reader-facing layer over the existing read models of ONE authorized
 * mission + crew + provenance scope, for the selected date range:
 *   - UnifiedHealthReport (included rows, date filters, coverage),
 *   - ResearcherInterpretationModel (series per exact metric ID + unit,
 *     P41 longitudinal comparison, P40 interpretation status, attestation),
 *   - BiomarkerAssessmentReport (P54 RED/AMBER/NORMAL/NEUTRAL, verified
 *     references only),
 *   - optionally an automated preliminary assessment (deterministic, or an AI
 *     draft already validated by preliminary-medical-assessment.ts).
 *
 * P56.1 adds the complete longitudinal profile of every series (peaks,
 * troughs, reversals, intervals) and explicit review-triage rules
 * (p56-longitudinal-profile.ts). Review priority is kept strictly separate
 * from clinical classification: a flagged change is "Priority scientific /
 * medical review required", never RED or AMBER.
 *
 * Never: unit conversion, invented history/thresholds/diagnoses, severity from
 * the size of a change, or causal claims. Identity comes only from the
 * selected crew member; the prohibited reviewer name is redacted from text.
 */
import {
  SEVERITY_MARKERS,
  SEVERITY_ORDER,
  type BiomarkerAssessment,
  type BiomarkerAssessmentReport,
  type Severity,
} from "./biomarker-health-assessment";
import type { InterpretationSnapshot } from "./biomarker-interpretation";
import type { ExamPoint } from "./longitudinal-comparison";
import type { PreliminaryAssessment } from "./preliminary-medical-assessment";
import {
  RESEARCHER_DOMAIN_LABELS,
  type InterpretationSeries,
  type ResearcherInterpretationModel,
} from "./researcher-interpretation";
import { governedHandbookEntry } from "./scientific-health-summary";
import { REPORT_SOURCE_LABELS, type ReportRow, type UnifiedHealthReport } from "./unified-health-report";
import { observationDay } from "./observation-date";
import {
  AUTHORIZATION_LABELS,
  RECOMMENDATION_CATEGORIES,
  bundledPatternLibrary,
  type HealthPattern,
  type PatternLibrary,
  type RecommendationAuthorization,
  type RecommendationCategory,
} from "./p56-pattern-library";
import {
  PATTERN_LABELS,
  bundledReviewRules,
  profileText,
  reviewSeries,
  seriesProfile,
  signedNumber,
  type ReviewFlag,
  type ReviewRules,
  type SeriesPattern,
  type SeriesProfile,
  type SeriesReview,
} from "./p56-longitudinal-profile";
import { redactProhibitedNames, reportAstronautName } from "./report-identity-redaction";

export const HEALTH_ASSESSMENT_SCHEMA = "mitochondria.p56-health-assessment.v2" as const;
export const AUTOMATED_DISCLOSURE = "Automated health assessment — subject to Ground Medical review.";
export const CONFIRMED_DIAGNOSES_TEXT =
  "None. MITOCHONDRIA does not record diagnoses; a diagnosis requires examination and authorization by a qualified clinician.";
export const MAX_KEY_FINDINGS = 5;
export const COMPARABILITY_NOTE =
  "Specimen, laboratory method and collection conditions are not recorded, so comparability between examinations is not verified.";
export const REVIEW_FLAG_LABEL = "Priority scientific/medical review required";
export const DATA_QUALITY_LABEL = "Measurement-consistency check required";
export const REVIEW_MARKER = "[REVIEW]";
export const DATA_CHECK_MARKER = "[DATA CHECK]";

/** Categorical/yes-no results are shown as recorded, without a pseudo-unit such as "yes/no". */
export const isNumericValue = (v: string) => /^[<>≤≥]?\s*-?\d/.test(v.trim());
export function formatResult(name: string, value: string, unit: string): string {
  return isNumericValue(value) ? `${name} ${value} ${unit}` : `${name}: ${value}`;
}
/** Charts in the main report: only the most informative series (page budget). */
export const MAX_TRENDS = 4;

// ------------------------------------------------------------ types

export type TrendDirection = "increase" | "decrease" | "stable" | "insufficient";
export const TREND_LABELS: Record<TrendDirection, string> = {
  increase: "Increase",
  decrease: "Decrease",
  stable: "No recorded change",
  insufficient: "Insufficient historical data",
};
export const TREND_MARKERS: Record<TrendDirection, string> = { increase: "↑", decrease: "↓", stable: "→", insufficient: "·" };

export interface SeriesTrend {
  /** First-to-last direction (kept for counts); the full shape is in `pattern`/`profile`. */
  direction: TrendDirection;
  pattern: SeriesPattern | "not_comparable";
  earliest: { value: string; at: string; precision: "date" | "instant" } | null;
  latest: { value: string; at: string; precision: "date" | "instant" };
  absolute: number | null;
  percent: number | null;
  observationCount: number;
  examinationDates: string[];
  profile: SeriesProfile | null;
  /** Plain-language explanation of the whole period (never a judgement). */
  text: string;
}

export interface Interpretability {
  mathematical: string;
  biological: string;
  clinical: string;
}

export interface Contributor {
  key: string;
  metricId: string;
  name: string;
  unit: string;
  domainLabel: string;
  severity: Severity;
  marker: string;
  statusLabel: string;
  classification: string;
  referenceText: string | null;
  trend: SeriesTrend;
  review: SeriesReview;
  interpretability: Interpretability;
  syntheticDemo: boolean;
  interpretationStatus: "approved" | "pending" | "revoked";
  attestation: { attested: number; total: number };
  handbookContext: string | null;
  evidenceIds: string[];
}

export type FindingState = "validated_concern" | "changed" | "stable" | "baseline";
export type ReviewPriority = "priority_review" | "data_quality_review" | "none";
export type MissingStatus = "outside_period" | "not_recorded";
export interface MissingEvidence {
  label: string;
  status: MissingStatus;
  text: string;
}
export interface Finding {
  id: string;
  patternId: string;
  title: string;
  area: string;
  state: FindingState;
  severity: Severity;
  marker: string;
  reviewPriority: ReviewPriority;
  reviewFlags: { name: string; flag: ReviewFlag }[];
  headline: string;
  whatChanged: string;
  contributors: Contributor[];
  relationship: string;
  spaceflightContext: string;
  /** Cross-marker statement for changes over the same interval; null when none. */
  combined: string | null;
  interpretation: string;
  /** Finding-specific uncertainty only (general limits are in the methodology note). */
  uncertainty: string[];
  exploratory: boolean;
  missingKeyEvidence: string[];
  missingDetail: MissingEvidence[];
  conditions: { name: string; status: "possible_requires_evaluation" | "not_assessable"; requires: string }[];
  reasoning: {
    observations: string;
    changes: string;
    relationshipStatus: string;
    combinedSupport: string;
    missingEvidence: string;
    followUp: string;
  };
  why: {
    rules: string[];
    confidence: { level: "Low" | "Moderate" | "Higher"; basis: string };
    references: string[];
    review: string[];
    automatedNotes: string[];
  };
  score: number;
}

export interface Recommendation {
  id: string;
  category: RecommendationCategory;
  authorization: RecommendationAuthorization;
  authorizationLabel: string;
  text: string;
  basis: string[];
  findingIds: string[];
  /** True when the recommendation answers a priority review flag. */
  priority: boolean;
}

export interface TrendChart {
  key: string;
  name: string;
  unit: string;
  findingTitle: string;
  points: { at: string; label: string; value: number }[];
  trend: SeriesTrend;
  flagged: ReviewPriority;
}

export interface PriorityItem {
  findingId: string;
  text: string;
  ruleId?: string;
}

export interface AutomatedAnalysisInput {
  assessment: PreliminaryAssessment | null;
  /** How the automatic pipeline ran (never shown as model/prompt details in the main report). */
  status: "ai_used" | "ai_not_needed" | "ai_not_authorized" | "ai_unavailable" | "ai_pending" | "deterministic";
  note: string;
}

export interface HealthAssessmentInput {
  unified: UnifiedHealthReport;
  model: ResearcherInterpretationModel;
  biomarkers: BiomarkerAssessmentReport;
  identity: { missionName: string | null; crewDisplayName: string | null };
  snapshot?: InterpretationSnapshot;
  automated?: AutomatedAnalysisInput | null;
  library?: PatternLibrary;
  /** Review rules override (tests); defaults to the bundled, validated rules. */
  reviewRules?: ReviewRules | null;
  /** Included rows of the SAME scope without the date filter, used only to say "measured outside the period". */
  scopeHistory?: readonly ReportRow[] | undefined;
}

export interface HealthAssessment {
  schema: typeof HEALTH_ASSESSMENT_SCHEMA;
  header: {
    astronaut: string;
    mission: string;
    period: string;
    examinationDates: string[];
    generatedAt: string;
    provenance: "synthetic" | "real";
    provenanceLabel: string;
  };
  overview: string[];
  keyFindings: { findingId: string; severity: Severity; marker: string; review: ReviewPriority; text: string }[];
  warnings: { severity: Severity; marker: string; text: string }[];
  warningsStatement: string;
  priorities: {
    validatedAlerts: PriorityItem[];
    reviewRequired: PriorityItem[];
    dataQuality: PriorityItem[];
    exploratory: PriorityItem[];
    routine: { count: number; text: string };
  };
  followUp: { level: "high" | "moderate" | "review_required" | "routine" | "not_determined"; label: string; text: string; clinicalSeverity: string };
  completeness: string;
  methodology: string;
  findings: Finding[];
  assessment: {
    abnormal: string[];
    changes: string[];
    possiblePatterns: string[];
    furtherEvaluation: string[];
    confirmedDiagnoses: string;
  };
  recommendations: Recommendation[];
  trends: TrendChart[];
  trendNote: string;
  otherResults: { count: number; names: string[]; statement: string };
  disclosure: string;
  /** Protected generation metadata: never rendered in the main report narrative. */
  generation: {
    engine: "deterministic" | "deterministic_with_validated_ai_notes";
    automatedStatus: AutomatedAnalysisInput["status"];
    automatedNote: string;
    aiModel: string | null;
    patternLibraryVersion: number;
    patternLibraryStatus: string;
    reviewRulesVersion: number | null;
    reviewRulesStatus: string;
    verifiedReferences: number;
    biomarkers: number;
  };
}

// ------------------------------------------------------------ helpers

const day = (at: string) => observationDay(at);
const list = (items: readonly string[], max = 6) =>
  items.length <= max ? joinAnd(items) : `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
const R = redactProhibitedNames;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function cleanName(label: string): string {
  return label.replace(/\s+—\s+SYNTHETIC DEMO.*$/u, "").trim();
}

/** Complete period trend at recorded precision; same-UTC-day spans are never longitudinal. */
export function seriesTrend(s: InterpretationSeries): SeriesTrend {
  const points: ExamPoint[] = s.longitudinal.points;
  const last = points.at(-1)!;
  const first = points[0]!;
  const dates = [...new Set(points.map((p) => p.at))];
  const latest = { value: last.valueText, at: last.at, precision: last.precision };
  const base = { latest, observationCount: s.readings, examinationDates: dates, absolute: null, percent: null, profile: null };
  if (points.length < 2)
    return { ...base, direction: "insufficient", pattern: "single", earliest: null, text: "Only one examination in this period — a trend cannot be established." };
  const earliest = { value: first.valueText, at: first.at, precision: first.precision };
  if (first.day === last.day)
    return { ...base, direction: "insufficient", pattern: "same_day", earliest, text: "All readings fall on one calendar day; this is not a change over time." };
  const pair = s.longitudinal.baselineToLatest ?? s.longitudinal.consecutive[0] ?? null;
  if (!pair || pair.status !== "compared" || pair.absolute === null)
    return {
      ...base,
      direction: "insufficient",
      pattern: "not_comparable",
      earliest,
      text:
        pair?.status === "differing_repeated_readings"
          ? "Repeated readings at one examination differ, so no single value is compared."
          : pair?.status === "ordering_ambiguous"
            ? "A date-only and a timed reading cannot be ordered; not compared."
            : "Values are not plain numbers; no change is calculated.",
    };
  const direction: TrendDirection = pair.direction === "higher" ? "increase" : pair.direction === "lower" ? "decrease" : "stable";
  const profile = seriesProfile(points);
  const text = profile && profile.pattern !== "single" && profile.pattern !== "same_day" ? profileText(profile, s.unit) : `${first.valueText} → ${last.valueText} ${s.unit}`;
  const notCompared = profile?.notCompared ? ` ${plural(profile.notCompared, "examination")} with non-numeric or differing repeated readings not compared.` : "";
  return { ...base, direction, pattern: profile?.pattern ?? "not_comparable", earliest, absolute: pair.absolute, percent: pair.percent, profile, text: text + notCompared };
}

function nameLookup(snapshot: InterpretationSnapshot | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of snapshot?.records ?? []) if (r.identity.displayName && !map.has(r.identity.catalogId)) map.set(r.identity.catalogId, r.identity.displayName);
  return map;
}

function interpretabilityOf(trend: SeriesTrend, review: SeriesReview, severity: Severity, classification: string): Interpretability {
  const p = trend.profile;
  const mathematical =
    p && p.steps.length
      ? `Calculated from ${plural(p.points.length, "comparable examination")} over ${plural(p.spanDays, "day")}${p.percent !== null ? `; first to last ${signedNumber(p.percent)}%` : ""}.`
      : "No change calculated (single examination, same day or non-comparable values).";
  const biological =
    review.plausibility === "not_expected_over_interval"
      ? `Not biologically expected over this interval. ${review.plausibilityText ?? ""}`.trim()
      : "Not assessed: no governed plausibility rule exists for this marker.";
  const clinical = severity === "neutral" ? "Not clinically interpretable: no verified reference criteria apply." : `Classified against verified criteria: ${classification}`;
  return { mathematical, biological, clinical };
}

// ------------------------------------------------------------ builder

export function buildHealthAssessment(input: HealthAssessmentInput): HealthAssessment {
  const { unified, model, biomarkers } = input;
  const library = input.library ?? bundledPatternLibrary();
  const bundledRules = bundledReviewRules();
  const rules = input.reviewRules === undefined ? bundledRules.rules : input.reviewRules;
  const names = nameLookup(input.snapshot);
  const memberOf = new Map<string, { pattern: HealthPattern; name: string }>();
  for (const p of library.patterns) for (const m of p.members) memberOf.set(m.id, { pattern: p, name: m.name });

  const seriesByKey = new Map<string, InterpretationSeries>();
  for (const d of model.domains) for (const s of d.series) seriesByKey.set(`${d.domain}|${s.metricId}|${s.unit}`, s);

  // Automated (validated) notes, mapped from packet refs (O1…) to assessment entries in packet order.
  const automatedNotes = new Map<string, string[]>();
  const auto = input.automated?.assessment ?? null;
  if (auto && auto.origin === "ai_assisted") {
    for (const section of Object.values(auto.sections))
      for (const st of section)
        for (const ref of st.observationRefs) {
          const entry = biomarkers.entries[Number(ref.slice(1)) - 1];
          if (entry) automatedNotes.set(entry.key, [...(automatedNotes.get(entry.key) ?? []), R(st.text)]);
        }
  }

  const contributorOf = (e: BiomarkerAssessment, displayName: string): Contributor => {
    const s = seriesByKey.get(e.key)!;
    const hb = governedHandbookEntry(e.metricId);
    const trend = seriesTrend(s);
    const review = reviewSeries(e.metricId, trend.profile, e.unit, rules);
    const classification = R(e.classification.explanation);
    return {
      key: e.key,
      metricId: e.metricId,
      name: R(displayName),
      unit: e.unit,
      domainLabel: e.domainLabel,
      severity: e.classification.severity,
      marker: e.marker,
      statusLabel: e.statusLabel,
      classification,
      referenceText: e.referenceText,
      trend,
      review: { ...review, flags: review.flags.map((f) => ({ ...f, text: R(f.text) })) },
      interpretability: interpretabilityOf(trend, review, e.classification.severity, classification),
      syntheticDemo: Boolean(e.nonClinicalLabel),
      interpretationStatus: e.interpretationStatus,
      attestation: { attested: s.attestation.attested, total: s.readings },
      handbookContext: hb?.what ? R(`${hb.what} (${hb.handbook}; pending independent scientific review)`) : null,
      evidenceIds: e.evidenceIds,
    };
  };

  const grouped = new Map<string, { pattern: HealthPattern; contributors: Contributor[] }>();
  const other: Contributor[] = [];
  for (const e of biomarkers.entries) {
    if (!seriesByKey.has(e.key)) continue;
    const m = memberOf.get(e.metricId);
    const display = m?.name ?? names.get(e.metricId) ?? cleanName(e.name);
    const c = contributorOf(e, display);
    if (!m) {
      other.push(c);
      continue;
    }
    const g = grouped.get(m.pattern.id) ?? { pattern: m.pattern, contributors: [] };
    g.contributors.push(c);
    grouped.set(m.pattern.id, g);
  }

  // Scope history (all dates) for missing-evidence provenance; never used for findings or trends.
  const historyLatest = new Map<string, string>();
  for (const r of input.scopeHistory ?? []) {
    const d = day(r.observedAt);
    if ((historyLatest.get(r.metricId) ?? "") < d) historyLatest.set(r.metricId, d);
  }

  const findings = library.patterns
    .filter((p) => grouped.has(p.id))
    .map((p, order) => buildFinding(p, grouped.get(p.id)!.contributors, order, automatedNotes, biomarkers, rules, library, historyLatest));
  findings.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const rows = unified.rows;
  const allDates = [...new Set(rows.map((r) => day(r.observedAt)))].sort();
  const header = {
    astronaut: reportAstronautName(input.identity.crewDisplayName),
    mission: R(input.identity.missionName?.trim() || unified.scope.missionId),
    period: `${unified.filters.from ? day(unified.filters.from) : (allDates[0] ?? "no records")} to ${unified.filters.to ? day(unified.filters.to) : (allDates.at(-1) ?? "no records")}`,
    examinationDates: allDates,
    generatedAt: unified.generatedAt,
    provenance: unified.scope.provenance,
    provenanceLabel: unified.scope.provenance === "synthetic" ? "Synthetic demonstration data" : "Recorded mission data",
  };

  const all = [...findings.flatMap((f) => f.contributors), ...other];
  const validated = all.filter((c) => c.severity === "red" || c.severity === "amber");
  const compared = all.filter((c) => c.trend.direction !== "insufficient");
  const inc = compared.filter((c) => c.trend.direction === "increase").length;
  const dec = compared.filter((c) => c.trend.direction === "decrease").length;
  const stable = compared.filter((c) => c.trend.direction === "stable").length;
  const areas = unified.summaries.filter((s) => s.included > 0).map((s) => REPORT_SOURCE_LABELS[s.badge]);
  const missingAreas = unified.summaries.filter((s) => s.included === 0).map((s) => REPORT_SOURCE_LABELS[s.badge]);
  const demo = all.filter((c) => c.syntheticDemo).length;
  const approved = all.filter((c) => c.interpretationStatus === "approved").length;
  const flaggedPriority = all.filter((c) => c.review.flags.some((f) => f.kind === "priority_review"));
  const flaggedQuality = all.filter((c) => c.review.flags.some((f) => f.kind === "data_quality"));
  const differingRepeats = all.filter((c) => c.trend.pattern === "not_comparable" && /differ/.test(c.trend.text));

  // ---- priority summary (validated alerts are separate from review triage)
  const findingOf = (c: Contributor) => findings.find((f) => f.contributors.includes(c))?.id ?? "other";
  const warnings = validated
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.name.localeCompare(b.name))
    .map((c) => ({
      severity: c.severity,
      marker: c.marker,
      text: `${formatResult(c.name, c.trend.latest.value, c.unit)} on ${day(c.trend.latest.at)} — ${c.statusLabel}${c.referenceText ? ` (${c.referenceText})` : ""}.`,
    }));
  const priorities: HealthAssessment["priorities"] = {
    validatedAlerts: validated.map((c) => ({ findingId: findingOf(c), text: `${c.marker} ${formatResult(c.name, c.trend.latest.value, c.unit)} — ${c.statusLabel}.` })),
    reviewRequired: flaggedPriority.map((c) => {
      const fs = c.review.flags.filter((f) => f.kind === "priority_review");
      return { findingId: findingOf(c), ruleId: fs.map((f) => f.ruleId).join(", "), text: `${c.name}: ${fs.map((f) => f.text).join(" ")}` };
    }),
    dataQuality: [
      ...flaggedQuality.flatMap((c) => c.review.flags.filter((f) => f.kind === "data_quality").map((f) => ({ findingId: findingOf(c), ruleId: f.ruleId, text: `${c.name}: ${f.text}` }))),
      ...differingRepeats.map((c) => ({ findingId: findingOf(c), text: `${c.name}: ${c.trend.text}` })),
    ],
    exploratory: findings
      .filter((f) => f.contributors.some((c) => c.syntheticDemo))
      .map((f) => ({ findingId: f.id, text: `${f.title}: ${plural(f.contributors.filter((c) => c.syntheticDemo).length, "result")} from synthetic demonstration catalog entries (not scientifically validated).` })),
    routine: { count: 0, text: "" },
  };
  const routineCount = all.length - new Set([...validated, ...flaggedPriority, ...flaggedQuality, ...differingRepeats]).size;
  priorities.routine = {
    count: routineCount,
    text: `${plural(routineCount, "further measurement")} without a validated alert or review flag (recorded for monitoring; not shown to be normal).`,
  };

  // ---- overview (concise; general limits once in the methodology note)
  const overview: string[] = [];
  if (!rows.length) {
    overview.push(`No reviewed results are available for ${header.astronaut} in the selected period (${header.period}). Nothing is inferred from missing data.`);
  } else {
    overview.push(
      `This assessment covers ${plural(all.length, "reviewed measurement")} for ${header.astronaut} from ${plural(allDates.length, "examination date")} (${allDates.length === 1 ? allDates[0] : `${allDates[0]} to ${allDates.at(-1)}`}) across ${joinAnd(areas)}.`,
    );
    overview.push(
      compared.length
        ? `${plural(compared.length, "measurement")} could be compared between examinations (${inc} increased, ${dec} decreased, ${stable} unchanged first to last); ${all.length - compared.length} ${all.length - compared.length === 1 ? "was" : "were"} measured only once in this period.`
        : "Every measurement comes from a single examination in this period, so no change over time can be established; these results serve as a baseline.",
    );
    const attention: string[] = [];
    if (validated.length) attention.push(`${plural(validated.length, "result")} met verified criteria for a health concern`);
    if (flaggedPriority.length) attention.push(`${plural(flaggedPriority.length, "change")} require${flaggedPriority.length === 1 ? "s" : ""} priority scientific/medical review (${list(flaggedPriority.map((c) => c.name), 5)})`);
    if (flaggedQuality.length) attention.push(`${plural(flaggedQuality.length, "change")} need${flaggedQuality.length === 1 ? "s" : ""} a measurement-consistency check before interpretation (${list(flaggedQuality.map((c) => c.name), 3)})`);
    overview.push(
      attention.length
        ? `${attention.join("; ").replace(/^./, (x) => x.toUpperCase())}. No result has been classified as abnormal unless stated; review flags are not diagnoses.`
        : "No validated alert and no change meeting the review rules. This is not evidence that the results are normal.",
    );
    const caveats = [
      ...(demo ? [`${plural(demo, "result")} use${demo === 1 ? "s" : ""} synthetic demonstration catalog entries that are not scientifically validated`] : []),
      approved < all.length ? "biological interpretations are pending independent scientific review" : "",
    ].filter(Boolean);
    if (caveats.length) overview.push(`${caveats.join("; ").replace(/^./, (x) => x.toUpperCase())}.`);
  }

  const keyFindings = findings
    .slice(0, MAX_KEY_FINDINGS)
    .map((f) => ({ findingId: f.id, severity: f.severity, marker: f.marker, review: f.reviewPriority, text: f.headline }));

  const warningsStatement = warnings.length
    ? `${plural(warnings.length, "validated health warning")}.`
    : rows.length
      ? `No validated clinical alert: no result could be checked against verified reference criteria. This does not mean there is no health concern${flaggedPriority.length + flaggedQuality.length ? " — see the review items below" : ""}.`
      : "No validated health warning; no results in this period.";

  const red = validated.some((c) => c.severity === "red");
  const amber = validated.some((c) => c.severity === "amber");
  const allNormal = all.length > 0 && all.every((c) => c.severity === "normal");
  const clinicalSeverity = red
    ? "RED — verified clinically concerning result(s)."
    : amber
      ? "AMBER — verified cautionary result(s)."
      : allNormal
        ? "NORMAL — all results within verified reference criteria."
        : "Not determined — no verified reference criteria apply, so no clinical severity is assigned.";
  const followUp: HealthAssessment["followUp"] = red
    ? { level: "high", label: "High", text: "Ground Medical review of the RED finding(s) is recommended promptly.", clinicalSeverity }
    : amber
      ? { level: "moderate", label: "Moderate", text: "Ground Medical review of the AMBER finding(s) at the next scheduled medical conference.", clinicalSeverity }
      : flaggedPriority.length || flaggedQuality.length
        ? {
            level: "review_required",
            label: "Prompt review (review triage, not clinical severity)",
            text: `${REVIEW_FLAG_LABEL} for ${plural(flaggedPriority.length + flaggedQuality.length, "measurement")}, under the explicit review rules listed in the methodology. Ground Medical decides the clinical urgency.`,
            clinicalSeverity,
          }
        : allNormal
          ? { level: "routine", label: "Routine", text: "All results are within verified reference criteria; continue scheduled monitoring.", clinicalSeverity }
          : { level: "not_determined", label: "Not determined", text: "No validated alert and no review flag; Ground Medical reviews the recorded values at the next scheduled conference.", clinicalSeverity };

  const comparable = compared.length;
  const inPeriod = new Set(rows.map((r) => r.recordId));
  const outsideMetrics = new Set((input.scopeHistory ?? []).filter((r) => !inPeriod.has(r.recordId)).map((r) => r.metricId));
  const alsoOutside = all.filter((c) => outsideMetrics.has(c.metricId)).map((c) => c.name);
  const outsideNote = alsoOutside.length
    ? ` ${plural(alsoOutside.length, "measured marker")} also ${alsoOutside.length === 1 ? "has" : "have"} readings outside the selected period (${list(alsoOutside, 5)}); widen the period to compare them.`
    : "";
  const completeness = rows.length
    ? `Data completeness: ${all.length} measurements included (${joinAnd(areas)}); ${comparable} with comparable earlier results.${missingAreas.length ? ` No data in this period for: ${joinAnd(missingAreas)}.` : ""}${unified.coverage.pendingReview ? ` ${unified.coverage.pendingReview} record(s) awaiting review are not used.` : ""}${unified.coverage.excluded ? ` ${unified.coverage.excluded} excluded record(s) are not used.` : ""}${unified.coverage.outOfFilter ? ` ${unified.coverage.outOfFilter} record(s) fall outside the selected period.` : ""}${outsideNote}`
    : "Data completeness: no included results in this period.";

  const verified = biomarkers.referenceRegistry.verifiedEntries + (biomarkers.criteria?.approved ?? 0);
  const classifiedCount = all.filter((c) => c.severity !== "neutral").length;
  const methodology = R(
    [
      `How to read this report: RED, AMBER and NORMAL appear only when a result is checked against Researcher-approved reference criteria for its exact catalog ID and unit whose applicability requirements are all met (${verified} approved criteri${verified === 1 ? "on" : "a"} available; ${classifiedCount} result${classifiedCount === 1 ? "" : "s"} classified${verified ? "" : ", so every result is NEUTRAL — not classified"}). Candidate criteria retrieved from published sources are never applied before approval.`,
      rules
        ? `Review flags come from explicit review-triage rules (pending scientific review): a change of at least ${rules.largeChange.percent}% between examinations, at least ${rules.tightlyRegulated.percent}% for blood electrolytes, intermediate peaks or troughs of at least ${rules.transientExtreme.percent}%, and changes in slowly changing markers such as HbA1c over short intervals. They show what to review first, not that a value is abnormal.`
        : "Review-triage rules are unavailable, so no change is flagged for review.",
      `Changes are calculated only between examinations on different calendar days in the same unit, using every comparable examination in the period. ${COMPARABILITY_NOTE} Changes that occur together do not show that one caused the other, and the report records no diagnoses.`,
    ].join(" "),
  );

  // Assessment categories (observed abnormal → changes → possible patterns → evaluation → confirmed).
  const assessment: HealthAssessment["assessment"] = {
    abnormal: warnings.map((w) => `${w.marker} ${w.text}`),
    changes: compared
      .filter((c) => c.trend.direction === "increase" || c.trend.direction === "decrease" || c.trend.profile?.intermediate)
      .map((c) => `${TREND_MARKERS[c.trend.direction]} ${c.name}: ${c.trend.text}`),
    possiblePatterns: findings.flatMap((f) => f.conditions.filter((c) => c.status === "possible_requires_evaluation").map((c) => `${c.name} (${f.title}) — possible pattern requiring further evaluation.`)),
    furtherEvaluation: findings
      .filter((f) => f.state === "validated_concern" || f.reviewPriority !== "none")
      .map((f) => `${f.title}: ${f.state === "validated_concern" ? "results meet verified criteria for a concern" : f.reviewPriority === "priority_review" ? "changes meet the review rules" : "measurement consistency must be checked"}.`),
    confirmedDiagnoses: CONFIRMED_DIAGNOSES_TEXT,
  };

  const recommendations = buildRecommendations(findings, rules, library);
  for (const f of findings) {
    const recs = recommendations.filter((r) => r.findingIds.includes(f.id));
    f.reasoning.followUp = recs.length ? recs.map((r) => r.id).join(", ") + ` — ${recs[0]!.text}` : "Routine monitoring only.";
  }

  // Most informative charts: priority flags, data checks, intermediate extremes, then the largest changes.
  const chartCandidates = findings
    .flatMap((f) => f.contributors.filter((c) => c.trend.direction !== "insufficient" && c.trend.profile).map((c) => ({ f, c })))
    .filter(({ c }) => seriesByKey.get(c.key)!.longitudinal.points.every((p) => p.value !== null));
  const informative = (c: Contributor) =>
    (c.review.flags.some((x) => x.kind === "priority_review") ? 4000 : 0) +
    (c.review.flags.some((x) => x.kind === "data_quality") ? 3000 : 0) +
    (c.trend.profile?.intermediate ? 1500 : 0) +
    Math.min(Math.abs(c.trend.profile?.largestStep?.percent ?? 0), 1000);
  chartCandidates.sort((a, b) => informative(b.c) - informative(a.c) || a.c.name.localeCompare(b.c.name));
  const trends = chartCandidates.slice(0, MAX_TRENDS).map(({ f, c }) => ({
    key: c.key,
    name: c.name,
    unit: c.unit,
    findingTitle: f.title,
    points: seriesByKey.get(c.key)!.longitudinal.points.map((p) => ({ at: p.at, label: day(p.at), value: p.value! })),
    trend: c.trend,
    flagged: (c.review.flags.some((x) => x.kind === "priority_review") ? "priority_review" : c.review.flags.length ? "data_quality_review" : "none") as ReviewPriority,
  }));
  const trendNote = trends.length
    ? `The ${trends.length === 1 ? "chart shows the series" : `${trends.length} charts show the series`} with the most informative changes (review flags, intermediate peaks, largest changes)${chartCandidates.length > trends.length ? `; ${chartCandidates.length - trends.length} further comparable series are described in the findings` : ""}.`
    : "No trend charts: no measurement has two or more comparable examinations in this period.";

  const otherResults = {
    count: other.length,
    names: other.map((c) => c.name).sort(),
    statement: other.length
      ? `${plural(other.length, "further result")} ${other.length === 1 ? "is" : "are"} not part of a documented relationship group and ${other.length === 1 ? "is" : "are"} listed in the technical appendix only${other.some((c) => c.review.flags.length) ? `; flagged for review: ${list(other.filter((c) => c.review.flags.length).map((c) => c.name), 4)}` : ""}.`
      : "",
  };
  for (const c of other.filter((x) => x.review.flags.length))
    for (const f of c.review.flags)
      (f.kind === "priority_review" ? priorities.reviewRequired : priorities.dataQuality).push({ findingId: "other", ruleId: f.ruleId, text: `${c.name}: ${f.text}` });
  // De-duplicate: other-results flags may already be listed above.
  priorities.reviewRequired = dedupe(priorities.reviewRequired);
  priorities.dataQuality = dedupe(priorities.dataQuality);

  return {
    schema: HEALTH_ASSESSMENT_SCHEMA,
    header,
    overview: overview.map(R),
    keyFindings,
    warnings,
    warningsStatement,
    priorities,
    followUp,
    completeness,
    methodology,
    findings,
    assessment,
    recommendations,
    trends,
    trendNote,
    otherResults,
    disclosure: AUTOMATED_DISCLOSURE,
    generation: {
      engine: automatedNotes.size ? "deterministic_with_validated_ai_notes" : "deterministic",
      automatedStatus: input.automated?.status ?? "deterministic",
      automatedNote: R(input.automated?.note ?? "Deterministic evidence engine."),
      aiModel: auto?.origin === "ai_assisted" ? auto.model : null,
      patternLibraryVersion: library.version,
      patternLibraryStatus: library.status,
      reviewRulesVersion: rules?.version ?? null,
      reviewRulesStatus: rules ? rules.status : `UNAVAILABLE (${bundledRules.problem ?? "disabled"})`,
      verifiedReferences: verified,
      biomarkers: biomarkers.entries.length,
    },
  };
}

function dedupe(items: PriorityItem[]): PriorityItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)));
}

function changeLabel(c: Contributor): string {
  const p = c.trend.profile;
  if (p?.intermediate) return `${c.name} ${p.intermediate.kind} ${p.intermediate.point.valueText} ${c.unit} on ${p.intermediate.point.day}`;
  const pct = c.trend.percent !== null ? `${signedNumber(c.trend.percent)}%` : c.trend.direction;
  return `${c.name} ${TREND_MARKERS[c.trend.direction]} ${pct}`;
}

function buildFinding(
  p: HealthPattern,
  contributorsIn: Contributor[],
  order: number,
  automatedNotes: Map<string, string[]>,
  biomarkers: BiomarkerAssessmentReport,
  rules: ReviewRules | null,
  library: PatternLibrary,
  historyLatest: Map<string, string>,
): Finding {
  const flagRank = (c: Contributor) => (c.review.flags.some((f) => f.kind === "priority_review") ? 0 : c.review.flags.length ? 1 : 2);
  const contributors = [...contributorsIn].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      flagRank(a) - flagRank(b) ||
      Number(b.trend.direction !== "insufficient") - Number(a.trend.direction !== "insufficient") ||
      Number(isNumericValue(a.trend.latest.value)) - Number(isNumericValue(b.trend.latest.value)) ||
      p.members.findIndex((m) => m.id === a.metricId) - p.members.findIndex((m) => m.id === b.metricId),
  );
  const ids = new Set(contributors.map((c) => c.metricId));
  const validated = contributors.filter((c) => c.severity === "red" || c.severity === "amber");
  const changed = contributors.filter((c) => c.trend.direction === "increase" || c.trend.direction === "decrease" || c.trend.profile?.intermediate);
  const stableOnes = contributors.filter((c) => c.trend.direction === "stable" && !c.trend.profile?.intermediate);
  const flagged = contributors.filter((c) => c.review.flags.length);
  const reviewFlags = flagged.flatMap((c) => c.review.flags.map((flag) => ({ name: c.name, flag })));
  const reviewPriority: ReviewPriority = reviewFlags.some((f) => f.flag.kind === "priority_review")
    ? "priority_review"
    : reviewFlags.length
      ? "data_quality_review"
      : "none";
  const state: FindingState = validated.length ? "validated_concern" : changed.length ? "changed" : stableOnes.length ? "stable" : "baseline";
  const severity: Severity = validated.some((c) => c.severity === "red")
    ? "red"
    : validated.length
      ? "amber"
      : contributors.every((c) => c.severity === "normal")
        ? "normal"
        : "neutral";
  const dates = [...new Set(contributors.flatMap((c) => c.trend.examinationDates.map(day)))].sort();
  const valueOf = (c: Contributor) => formatResult(c.name, c.trend.latest.value, c.unit);
  const categorical = contributors.filter((c) => !isNumericValue(c.trend.latest.value));
  const missingDetail: MissingEvidence[] = p.keyEvidence
    .filter((k) => !k.ids.some((id) => ids.has(id)))
    .map((k) => {
      const latest = k.ids.map((id) => historyLatest.get(id)).filter((x): x is string => Boolean(x)).sort().at(-1);
      return latest
        ? { label: k.label, status: "outside_period" as const, text: `${k.label}: measured outside the selected period (latest ${latest})` }
        : { label: k.label, status: "not_recorded" as const, text: `${k.label}: not among the included records (not measured, or not safely matched to a catalog identity during intake)` };
    });
  const missingKeyEvidence = missingDetail.map((m) => m.label);
  const exploratory = contributors.every((c) => c.syntheticDemo);
  const area = p.area.toLowerCase();
  const guidance = rules?.patternGuidance[p.id] ?? null;

  // Cross-marker statement: two or more changed markers over the same interval.
  const byInterval = new Map<string, Contributor[]>();
  for (const c of changed) {
    const s = c.trend.profile?.largestStep;
    if (!s) continue;
    const k = `${s.from.day}|${s.to.day}`;
    byInterval.set(k, [...(byInterval.get(k) ?? []), c]);
  }
  const together = [...byInterval.entries()].filter(([, cs]) => cs.length >= 2).sort((a, b) => b[1].length - a[1].length)[0];
  let combined: string | null = null;
  if (together) {
    const [k, cs] = together;
    const [from, to] = k.split("|");
    const dirs = new Set(cs.map((c) => Math.sign(c.trend.profile!.largestStep!.absolute)));
    combined = `${list(cs.map((c) => `${c.name} (${c.trend.profile!.largestStep!.percent !== null ? `${signedNumber(c.trend.profile!.largestStep!.percent!)}%` : "changed"})`), 4)} changed over the same interval (${from} to ${to})${dirs.size > 1 ? ", in opposite directions" : ", in the same direction"}.`;
  }

  let whatChanged: string;
  let interpretation: string;
  let headline: string;
  const flagText = reviewPriority === "priority_review" ? `${REVIEW_MARKER} ` : reviewPriority === "data_quality_review" ? `${DATA_CHECK_MARKER} ` : "";
  if (state === "validated_concern") {
    whatChanged = validated.map((c) => `${valueOf(c)} on ${day(c.trend.latest.at)} — ${c.statusLabel.toLowerCase()}${c.referenceText ? ` (${c.referenceText})` : ""}.`).join(" ");
    if (changed.length) whatChanged += ` ${changed.map((c) => `${c.name}: ${c.trend.text}`).join(" ")}`;
    interpretation = `${plural(validated.length, "result")} in this group meet${validated.length === 1 ? "s" : ""} verified criteria for ${validated.some((c) => c.severity === "red") ? "a clinically concerning finding" : "a cautionary finding"}. Considered with the related markers, this supports further evaluation of ${area}; it does not by itself establish a diagnosis.`;
    headline = `${p.title}: ${list(validated.map((c) => `${c.name} ${c.statusLabel.toLowerCase()}`), 3)}.`;
  } else if (state === "changed") {
    whatChanged = changed.map((c) => `${c.name}: ${c.trend.text}`).join(" ");
    const once = contributors.length - changed.length - stableOnes.length;
    if (stableOnes.length) whatChanged += ` No recorded change in ${list(stableOnes.map((c) => c.name), 4)}.`;
    if (once > 0) whatChanged += ` ${plural(once, "related result")} measured once (${list(contributors.filter((c) => c.trend.direction === "insufficient" && !c.trend.profile?.intermediate).map(valueOf), 4)}).`;
    const quality = flagged.filter((c) => c.review.plausibility === "not_expected_over_interval");
    const parts: string[] = [];
    if (reviewPriority !== "none" && guidance) parts.push(guidance.combined);
    else if (changed.length >= 2) parts.push(`Several related markers changed (${list(changed.map((c) => c.name), 4)}); because they describe the same biological system, the combined change is reviewed together.`);
    else parts.push(`One marker changed (${changed[0]!.name}); the related markers give no comparable change to place it in context yet.`);
    for (const q of quality) parts.push(`${q.name}: the calculated difference is mathematically correct, but it is not biologically expected over this interval. ${q.review.plausibilityText ?? ""}`.trim());
    interpretation = parts.join(" ");
    headline = `${flagText}${p.title}: ${list(changed.map(changeLabel), 3)}.`;
  } else if (state === "stable") {
    whatChanged = `No recorded change in ${list(stableOnes.map((c) => c.name), 5)} between comparable examinations.${contributors.length > stableOnes.length ? ` ${plural(contributors.length - stableOnes.length, "related result")} measured only once.` : ""}`;
    interpretation = "The related markers did not change between comparable examinations.";
    headline = `${p.title}: no recorded change in ${plural(stableOnes.length, "related measurement")}.`;
  } else {
    whatChanged = `Measured on ${joinAnd(dates)} only: ${list(contributors.map(valueOf), 6)}.`;
    interpretation = `A single-time baseline for ${area}; no change over time can be established yet.`;
    headline = `${p.title}: ${plural(contributors.length, "related result")} on ${joinAnd(dates)}${categorical.length ? `, including ${list(categorical.map((c) => `${c.name} — ${c.trend.latest.value} (as recorded)`), 2)}` : ""}; baseline only.`;
  }

  const units = new Set<string>();
  const demoCount = contributors.filter((c) => c.syntheticDemo).length;
  const uncertainty = [
    ...(missingDetail.length ? [`Not available: ${missingDetail.map((m) => m.text).join("; ")}.`] : []),
    ...(demoCount ? [`${demoCount} of these results ${demoCount === 1 ? "uses a synthetic demonstration catalog entry" : "use synthetic demonstration catalog entries"} (not scientifically validated; exploratory).`] : []),
    ...(contributors.some((c) => {
      const before = units.size;
      units.add(`${c.metricId}`);
      return units.size === before;
    })
      ? ["Some results were recorded in more than one unit; each unit is shown separately and never converted."]
      : []),
  ];

  const conditions = p.conditions.map((c) => ({
    name: c.name,
    status: (state === "validated_concern" ? "possible_requires_evaluation" : "not_assessable") as Finding["conditions"][number]["status"],
    requires: c.requires,
  }));

  const usedRefs = contributors.filter((c) => c.referenceText);
  const rulesApplied = [
    ...(usedRefs.length
      ? usedRefs.map((c) => `${c.name}: ${c.classification}`)
      : [`No approved, applicable reference criterion applies (approved criteria available: ${biomarkers.referenceRegistry.verifiedEntries + (biomarkers.criteria?.approved ?? 0)}); every result is NEUTRAL.`]),
    ...reviewFlags.map((f) => `${f.flag.ruleId} (${f.flag.kind === "priority_review" ? "review priority" : "data-quality check"}) — ${f.name}: ${f.flag.text}`),
  ];
  const confidence: Finding["why"]["confidence"] =
    validated.length && changed.length
      ? { level: "Higher", basis: "Verified reference criteria applied and comparable repeated measurements available." }
      : validated.length || changed.length >= 2
        ? { level: "Moderate", basis: validated.length ? "Verified reference criteria applied to a single examination." : "Several related markers changed between comparable examinations, but no verified reference criteria apply." }
        : { level: "Low", basis: state === "baseline" ? "Single examination and no verified reference criteria." : "Limited comparable data and no verified reference criteria." };
  const approved = contributors.filter((c) => c.interpretationStatus === "approved").length;
  const attested = contributors.reduce((n, c) => n + c.attestation.attested, 0);
  const readings = contributors.reduce((n, c) => n + c.attestation.total, 0);
  const review = [
    `Biological interpretation: ${approved} of ${contributors.length} marker(s) have an approved interpretation; the rest are pending independent scientific review.`,
    `Ground Medical evidence attestation: ${attested} of ${readings} reading(s) attested. Attestation confirms the evidence, not a diagnosis.`,
    `Catalog identity: ${contributors.length - demoCount} handbook/catalog, ${demoCount} synthetic demonstration (not scientifically validated).`,
    `Relationship text: P56 health pattern library, ${library.status === "PENDING_SCIENTIFIC_REVIEW" ? "pending independent scientific review" : library.status}.`,
  ];
  const references = contributors.flatMap((c) => (c.handbookContext ? [`${c.name}: ${c.handbookContext}`] : []));
  const notes = contributors.flatMap((c) => automatedNotes.get(c.key) ?? []);

  const reasoning: Finding["reasoning"] = {
    observations: `${plural(contributors.length, "measurement")}: ${list(contributors.map(valueOf), 5)}.`,
    changes: changed.length ? changed.map((c) => `${c.name}: ${c.trend.text}`).join(" ") : "No change over time in this period.",
    relationshipStatus: `General physiology described in the P56 pattern library (${library.status === "PENDING_SCIENTIFIC_REVIEW" ? "pending independent scientific review" : library.status}); not yet validated for this application.`,
    combinedSupport:
      state === "validated_concern"
        ? "Verified criteria apply; together with the related markers this supports Ground Medical evaluation — not a diagnosis."
        : reviewPriority !== "none"
          ? `${combined ? `${combined} ` : ""}The combined pattern is a review signal only; without verified criteria it supports no clinical interpretation or diagnosis.`
          : "No combined interpretation is supported; values are recorded for monitoring.",
    missingEvidence: missingDetail.length ? missingDetail.map((m) => m.text).join("; ") : "No key measurement of this group is missing.",
    followUp: "",
  };

  const score =
    (severity === "red" ? 10_000 : severity === "amber" ? 8_000 : 0) +
    (reviewPriority === "priority_review" ? 4_000 + reviewFlags.length * 100 : reviewPriority === "data_quality_review" ? 3_000 : 0) +
    (state === "changed" ? 200 + changed.length * 20 : state === "stable" ? 50 : 0) +
    Math.min(contributors.length, 20) * 2 -
    order;

  return {
    id: `finding-${p.id}`,
    patternId: p.id,
    title: R(p.title),
    area: p.area,
    state,
    severity,
    marker: SEVERITY_MARKERS[severity],
    reviewPriority,
    reviewFlags,
    headline: R(headline),
    whatChanged: R(whatChanged),
    contributors,
    relationship: R(p.relationship),
    spaceflightContext: R(p.spaceflightContext),
    combined: combined && R(combined),
    interpretation: R(interpretation),
    uncertainty: uncertainty.map(R),
    exploratory,
    missingKeyEvidence,
    missingDetail,
    conditions,
    reasoning,
    why: { rules: rulesApplied.map(R), confidence, references, review, automatedNotes: [...new Set(notes)] },
    score,
  };
}

function buildRecommendations(findings: readonly Finding[], rules: ReviewRules | null, library: PatternLibrary): Recommendation[] {
  const out = new Map<string, Recommendation>();
  const add = (category: RecommendationCategory, authorization: RecommendationAuthorization, text: string, basis: string, findingIds: readonly string[], priority = false) => {
    const key = `${category}|${text}`;
    const existing = out.get(key);
    if (existing) {
      if (!existing.basis.includes(basis)) existing.basis.push(basis);
      for (const id of findingIds) if (!existing.findingIds.includes(id)) existing.findingIds.push(id);
      existing.priority ||= priority;
      return;
    }
    out.set(key, { id: "", category, authorization, authorizationLabel: AUTHORIZATION_LABELS[authorization], text: R(text), basis: [basis], findingIds: [...findingIds], priority });
  };
  const flaggedBasis = (f: Finding) => `${f.title} — ${list([...new Set(f.reviewFlags.map((x) => x.name))], 4)} (review flag)`;
  const monitorChanged: Finding[] = [];
  const baseline: Finding[] = [];
  const missing: string[] = [];
  for (const f of findings) {
    const p = library.patterns.find((x) => x.id === f.patternId);
    const guidance = rules?.patternGuidance[f.patternId];
    if (p && f.state === "validated_concern") for (const r of p.recommendations.concern) add(r.category, r.authorization, r.text, `${f.title} (validated concern)`, [f.id], true);
    if (f.reviewPriority !== "none") {
      const recs = guidance?.recommendations ?? p?.recommendations.change ?? [];
      for (const r of recs) add(r.category, r.authorization, r.text, flaggedBasis(f), [f.id], f.reviewPriority === "priority_review");
    } else if (f.state === "changed") monitorChanged.push(f);
    else if (f.state !== "validated_concern") baseline.push(f);
    for (const m of f.missingDetail.filter((x) => x.status === "not_recorded")) missing.push(`${m.label} (${f.title.toLowerCase()})`);
  }
  if (monitorChanged.length)
    add(
      "monitoring",
      "general_wellness",
      `Repeat the changed measurements in ${list(monitorChanged.map((f) => f.title.toLowerCase()), 4)} with the same laboratory method at the next scheduled examination, so the change can be confirmed.`,
      monitorChanged.map((f) => `${f.title} (change below the review rules)`).join("; "),
      monitorChanged.map((f) => f.id),
    );
  if (baseline.length)
    add(
      "monitoring",
      "general_wellness",
      "Repeat the single-examination measurements at the next scheduled examination with the same laboratory, method and units, so that changes over time can be measured.",
      baseline.map((f) => `${f.title} (${f.state === "stable" ? "no recorded change" : "single examination"})`).join("; "),
      baseline.map((f) => f.id),
    );
  if (missing.length) {
    add(
      "further_examination",
      "clinician_required",
      `The picture is incomplete. Not recorded in this period: ${missing.join("; ")}. Ground Medical may request these tests.`,
      "documented relationship groups (missing key measurements)",
      findings.filter((f) => f.missingDetail.some((m) => m.status === "not_recorded")).map((f) => f.id),
    );
  }
  return [...out.values()]
    .sort((a, b) => Number(b.priority) - Number(a.priority) || RECOMMENDATION_CATEGORIES.indexOf(a.category) - RECOMMENDATION_CATEGORIES.indexOf(b.category))
    .map((r, i) => ({ ...r, id: `R${i + 1}` }));
}

// ------------------------------------------------------------ plain text (TXT export)

export function healthAssessmentPlainText(a: HealthAssessment): string {
  const pr = a.priorities;
  const lines = [
    "HEALTH ASSESSMENT",
    `Astronaut: ${a.header.astronaut}`,
    `Mission: ${a.header.mission}`,
    `Reporting period: ${a.header.period}`,
    `Data: ${a.header.provenanceLabel}`,
    "",
    ...a.overview,
    "",
    "Most important findings:",
    ...a.keyFindings.map((k) => `- ${k.severity !== "neutral" ? `${k.marker} ` : ""}${k.text}`),
    "",
    `Validated clinical alerts: ${a.warningsStatement}`,
    ...a.warnings.map((w) => `- ${w.marker} ${w.text}`),
    `${REVIEW_FLAG_LABEL}: ${pr.reviewRequired.length ? "" : "none"}`,
    ...pr.reviewRequired.map((i) => `- ${REVIEW_MARKER} ${i.text}`),
    `Data-quality / plausibility checks: ${pr.dataQuality.length ? "" : "none"}`,
    ...pr.dataQuality.map((i) => `- ${DATA_CHECK_MARKER} ${i.text}`),
    ...(pr.exploratory.length ? ["Exploratory observations:", ...pr.exploratory.map((i) => `- ${i.text}`)] : []),
    `Routine: ${pr.routine.text}`,
    `Clinical severity: ${a.followUp.clinicalSeverity}`,
    `Follow-up priority: ${a.followUp.label} — ${a.followUp.text}`,
    a.completeness,
    "",
    "KEY BIOLOGICAL FINDINGS",
    ...a.findings.flatMap((f) => [
      `${f.severity !== "neutral" ? `${f.marker} ` : ""}${f.title}${f.reviewPriority === "priority_review" ? ` ${REVIEW_MARKER}` : f.reviewPriority === "data_quality_review" ? ` ${DATA_CHECK_MARKER}` : ""}${f.exploratory ? " [exploratory]" : ""}`,
      `  What changed: ${f.whatChanged}`,
      ...(f.combined ? [`  Together: ${f.combined}`] : []),
      `  How they relate: ${f.relationship} ${f.spaceflightContext}`,
      `  Interpretation: ${f.interpretation}`,
      ...f.uncertainty.map((u) => `  Uncertainty: ${u}`),
      `  Follow-up: ${f.reasoning.followUp}`,
    ]),
    "",
    "RECOMMENDATIONS",
    ...a.recommendations.map((r) => `- ${r.id} [${r.authorizationLabel}] ${r.text} (based on: ${r.basis.join("; ")})`),
    `Possible condition-related patterns: ${a.assessment.possiblePatterns.length ? a.assessment.possiblePatterns.join("; ") : "none could be assessed"}`,
    `Confirmed diagnoses: ${a.assessment.confirmedDiagnoses}`,
    "",
    "LONGITUDINAL TRENDS",
    a.trendNote,
    ...a.trends.map((t) => `- ${t.name} [${t.unit}]: ${t.points.map((p) => `${p.label} ${p.value}`).join(" → ")} — ${t.trend.text}`),
    ...(a.otherResults.statement ? ["", a.otherResults.statement] : []),
    "",
    "METHODOLOGY",
    a.methodology,
    "",
    a.disclosure,
  ];
  return lines.map(R).join("\n");
}

export { PATTERN_LABELS, RESEARCHER_DOMAIN_LABELS };
