/**
 * P56 — concise longitudinal health assessment (pure, deterministic, offline).
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
 * Reasoning order per finding: observation → change → biological relationship
 * (P56 pattern library, exact IDs) → interpretation → recommended action.
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
import { REPORT_SOURCE_LABELS, type UnifiedHealthReport } from "./unified-health-report";
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
import { redactProhibitedNames, reportAstronautName } from "./report-identity-redaction";

export const HEALTH_ASSESSMENT_SCHEMA = "mitochondria.p56-health-assessment.v1" as const;
export const AUTOMATED_DISCLOSURE = "Automated health assessment — subject to Ground Medical review.";
export const CONFIRMED_DIAGNOSES_TEXT =
  "None. MITOCHONDRIA does not record diagnoses; a diagnosis requires examination and authorization by a qualified clinician.";
export const MAX_KEY_FINDINGS = 5;
export const MAX_TRENDS = 6;

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
  direction: TrendDirection;
  earliest: { value: string; at: string; precision: "date" | "instant" } | null;
  latest: { value: string; at: string; precision: "date" | "instant" };
  absolute: number | null;
  percent: number | null;
  observationCount: number;
  examinationDates: string[];
  /** Plain-language explanation (never a judgement). */
  text: string;
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
  syntheticDemo: boolean;
  interpretationStatus: "approved" | "pending" | "revoked";
  attestation: { attested: number; total: number };
  handbookContext: string | null;
  evidenceIds: string[];
}

export type FindingState = "validated_concern" | "changed" | "stable" | "baseline";
export interface Finding {
  id: string;
  patternId: string;
  title: string;
  area: string;
  state: FindingState;
  severity: Severity;
  marker: string;
  headline: string;
  whatChanged: string;
  contributors: Contributor[];
  relationship: string;
  spaceflightContext: string;
  interpretation: string;
  uncertainty: string[];
  exploratory: boolean;
  missingKeyEvidence: string[];
  conditions: { name: string; status: "possible_requires_evaluation" | "not_assessable"; requires: string }[];
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
}

export interface TrendChart {
  key: string;
  name: string;
  unit: string;
  findingTitle: string;
  points: { at: string; label: string; value: number }[];
  trend: SeriesTrend;
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
  keyFindings: { findingId: string; severity: Severity; marker: string; text: string }[];
  warnings: { severity: Severity; marker: string; text: string }[];
  warningsStatement: string;
  followUp: { level: "high" | "moderate" | "routine" | "not_determined"; label: string; text: string };
  completeness: string;
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
    verifiedReferences: number;
    biomarkers: number;
  };
}

// ------------------------------------------------------------ helpers

const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);
const day = (at: string) => observationDay(at);
const list = (items: readonly string[], max = 6) =>
  items.length <= max ? joinAnd(items) : `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
const R = redactProhibitedNames;

function cleanName(label: string): string {
  return label.replace(/\s+—\s+SYNTHETIC DEMO.*$/u, "").trim();
}

/** Earliest-to-latest trend at recorded precision; same-UTC-day spans are never longitudinal. */
export function seriesTrend(s: InterpretationSeries): SeriesTrend {
  const points: ExamPoint[] = s.longitudinal.points;
  const last = points.at(-1)!;
  const first = points[0]!;
  const dates = [...new Set(points.map((p) => p.at))];
  const latest = { value: last.valueText, at: last.at, precision: last.precision };
  const base = { latest, observationCount: s.readings, examinationDates: dates, absolute: null, percent: null };
  if (points.length < 2)
    return { ...base, direction: "insufficient", earliest: null, text: "Only one examination in this period — a trend cannot be established." };
  const earliest = { value: first.valueText, at: first.at, precision: first.precision };
  if (first.day === last.day)
    return { ...base, direction: "insufficient", earliest, text: "All readings fall on one calendar day; this is not a change over time." };
  const pair = s.longitudinal.baselineToLatest ?? s.longitudinal.consecutive[0] ?? null;
  if (!pair || pair.status !== "compared" || pair.absolute === null)
    return {
      ...base,
      direction: "insufficient",
      earliest,
      text:
        pair?.status === "differing_repeats" || pair?.status === "differing_repeated_readings"
          ? "Repeated readings at one examination differ, so no single value is compared."
          : pair?.status === "ordering_ambiguous"
            ? "A date-only and a timed reading cannot be ordered; not compared."
            : "Values are not plain numbers; no change is calculated.",
    };
  const direction: TrendDirection = pair.direction === "higher" ? "increase" : pair.direction === "lower" ? "decrease" : "stable";
  const pct = pair.percent !== null ? ` (${signed(pair.percent)}%)` : "";
  const text =
    direction === "stable"
      ? `No recorded change between ${day(first.at)} and ${day(last.at)} (${first.valueText} ${s.unit}).`
      : `${direction === "increase" ? "Increased" : "Decreased"} from ${first.valueText} to ${last.valueText} ${s.unit}${pct} between ${day(first.at)} and ${day(last.at)}.`;
  return { ...base, direction, earliest, absolute: pair.absolute, percent: pair.percent, text };
}

function nameLookup(snapshot: InterpretationSnapshot | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of snapshot?.records ?? []) if (r.identity.displayName && !map.has(r.identity.catalogId)) map.set(r.identity.catalogId, r.identity.displayName);
  return map;
}

// ------------------------------------------------------------ builder

export function buildHealthAssessment(input: HealthAssessmentInput): HealthAssessment {
  const { unified, model, biomarkers } = input;
  const library = input.library ?? bundledPatternLibrary();
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
    return {
      key: e.key,
      metricId: e.metricId,
      name: R(displayName),
      unit: e.unit,
      domainLabel: e.domainLabel,
      severity: e.classification.severity,
      marker: e.marker,
      statusLabel: e.statusLabel,
      classification: R(e.classification.explanation),
      referenceText: e.referenceText,
      trend: seriesTrend(s),
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

  const findings = library.patterns
    .filter((p) => grouped.has(p.id))
    .map((p, order) => buildFinding(p, grouped.get(p.id)!.contributors, order, automatedNotes, biomarkers));
  findings.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const rows = unified.rows;
  const allDates = [...new Set(rows.map((r) => day(r.observedAt)))].sort();
  const header = {
    astronaut: reportAstronautName(input.identity.crewDisplayName),
    mission: R(input.identity.missionName?.trim() || unified.scope.missionId),
    period: `${unified.filters.from ?? allDates[0] ?? "no records"} to ${unified.filters.to ?? allDates.at(-1) ?? "no records"}`,
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

  const overview: string[] = [];
  if (!rows.length) {
    overview.push(`No reviewed results are available for ${header.astronaut} in the selected period (${header.period}). Nothing is inferred from missing data.`);
  } else {
    overview.push(
      `This assessment covers ${all.length} reviewed measurement${all.length === 1 ? "" : "s"} for ${header.astronaut} from ${allDates.length} examination date${allDates.length === 1 ? "" : "s"} (${allDates.length === 1 ? allDates[0] : `${allDates[0]} to ${allDates.at(-1)}`}) across ${joinAnd(areas)}.`,
    );
    overview.push(
      compared.length
        ? `${compared.length} measurement${compared.length === 1 ? "" : "s"} could be compared between examinations: ${inc} increased, ${dec} decreased and ${stable} showed no recorded change. ${all.length - compared.length} were measured only once in this period, so no trend can be established for them.`
        : "Every measurement comes from a single examination in this period, so no change over time can be established yet; these results serve as a baseline.",
    );
    overview.push(
      validated.length
        ? `${validated.length} result${validated.length === 1 ? "" : "s"} met verified reference criteria for a health concern (see warnings).`
        : `No result could be checked against verified reference criteria, so the report does not classify any value as low, high or normal. This is not evidence that the results are normal.`,
    );
    const caveats = [
      ...(demo ? [`${demo} result${demo === 1 ? " uses" : "s use"} synthetic demonstration catalog entries that are not scientifically validated`] : []),
      approved < all.length ? "biological interpretations are pending independent scientific review" : "",
    ].filter(Boolean);
    if (caveats.length) overview.push(`${caveats.join("; ").replace(/^./, (c) => c.toUpperCase())}.`);
  }

  const keyFindings = findings.slice(0, MAX_KEY_FINDINGS).map((f) => ({ findingId: f.id, severity: f.severity, marker: f.marker, text: f.headline }));

  const warnings = validated
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.name.localeCompare(b.name))
    .map((c) => ({
      severity: c.severity,
      marker: c.marker,
      text: `${c.name}: ${c.trend.latest.value} ${c.unit} on ${day(c.trend.latest.at)} — ${c.statusLabel}${c.referenceText ? ` (${c.referenceText})` : ""}.`,
    }));
  const warningsStatement = warnings.length
    ? `${warnings.length} validated health warning${warnings.length === 1 ? "" : "s"}.`
    : rows.length
      ? "No validated health warning. None of the results could be checked against verified reference criteria, so the absence of a warning does not mean the results are normal."
      : "No validated health warning; no results in this period.";

  const red = validated.some((c) => c.severity === "red");
  const amber = validated.some((c) => c.severity === "amber");
  const allNormal = all.length > 0 && all.every((c) => c.severity === "normal");
  const followUp: HealthAssessment["followUp"] = red
    ? { level: "high", label: "High", text: "Ground Medical review of the RED finding(s) is recommended promptly." }
    : amber
      ? { level: "moderate", label: "Moderate", text: "Ground Medical review of the AMBER finding(s) at the next scheduled medical conference." }
      : allNormal
        ? { level: "routine", label: "Routine", text: "All results are within verified reference criteria; continue scheduled monitoring." }
        : {
            level: "not_determined",
            label: "Not determined",
            text: "No result could be classified against verified criteria. Ground Medical should review all results before a priority is assigned.",
          };

  const comparable = all.filter((c) => c.trend.direction !== "insufficient").length;
  const completeness = rows.length
    ? `Data completeness: ${all.length} measurements included (${joinAnd(areas)}); ${comparable} with comparable earlier results.${missingAreas.length ? ` No data in this period for: ${joinAnd(missingAreas)}.` : ""}${unified.coverage.pendingReview ? ` ${unified.coverage.pendingReview} record(s) awaiting review are not used.` : ""}${unified.coverage.excluded ? ` ${unified.coverage.excluded} excluded record(s) are not used.` : ""}`
    : "Data completeness: no included results in this period.";

  // Assessment categories (observed abnormal → changes → possible patterns → evaluation → confirmed).
  const assessment: HealthAssessment["assessment"] = {
    abnormal: warnings.map((w) => `${w.marker} ${w.text}`),
    changes: compared
      .filter((c) => c.trend.direction === "increase" || c.trend.direction === "decrease")
      .map((c) => `${TREND_MARKERS[c.trend.direction]} ${c.name}: ${c.trend.text}`),
    possiblePatterns: findings.flatMap((f) => f.conditions.filter((c) => c.status === "possible_requires_evaluation").map((c) => `${c.name} (${f.title}) — possible pattern requiring further evaluation.`)),
    furtherEvaluation: findings
      .filter((f) => f.state === "validated_concern" || f.state === "changed")
      .map((f) => `${f.title}: ${f.state === "validated_concern" ? "results meet verified criteria for a concern" : "related markers changed between examinations"}; Ground Medical evaluation is needed.`),
    confirmedDiagnoses: CONFIRMED_DIAGNOSES_TEXT,
  };
  if (!assessment.furtherEvaluation.length && findings.length)
    assessment.furtherEvaluation.push("All measured areas: Ground Medical should review the recorded values against appropriate reference criteria, because none are verified in this application.");

  const recommendations = buildRecommendations(findings);
  const trends = findings
    .flatMap((f) => f.contributors.filter((c) => c.trend.direction !== "insufficient").map((c) => ({ f, c })))
    .filter(({ c }) => seriesByKey.get(c.key)!.longitudinal.points.every((p) => p.value !== null))
    .slice(0, MAX_TRENDS)
    .map(({ f, c }) => ({
      key: c.key,
      name: c.name,
      unit: c.unit,
      findingTitle: f.title,
      points: seriesByKey.get(c.key)!.longitudinal.points.map((p) => ({ at: p.at, label: day(p.at), value: p.value! })),
      trend: c.trend,
    }));
  const trendNote = trends.length
    ? `Charts show measurements with at least two comparable examinations in the same unit${comparable > trends.length ? `; ${trends.length} of ${comparable} are shown, prioritised by finding` : ""}.`
    : "No trend charts: no measurement has two or more comparable examinations in this period.";

  const otherResults = {
    count: other.length,
    names: other.map((c) => c.name).sort(),
    statement: other.length
      ? `${other.length} further result${other.length === 1 ? " is" : "s are"} not part of a documented relationship group and ${other.length === 1 ? "is" : "are"} listed in the technical appendix only.`
      : "",
  };

  return {
    schema: HEALTH_ASSESSMENT_SCHEMA,
    header,
    overview: overview.map(R),
    keyFindings,
    warnings,
    warningsStatement,
    followUp,
    completeness,
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
      verifiedReferences: biomarkers.referenceRegistry.verifiedEntries,
      biomarkers: biomarkers.entries.length,
    },
  };
}

function buildFinding(
  p: HealthPattern,
  contributorsIn: Contributor[],
  order: number,
  automatedNotes: Map<string, string[]>,
  biomarkers: BiomarkerAssessmentReport,
): Finding {
  const contributors = [...contributorsIn].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      Number(b.trend.direction !== "insufficient") - Number(a.trend.direction !== "insufficient") ||
      p.members.findIndex((m) => m.id === a.metricId) - p.members.findIndex((m) => m.id === b.metricId),
  );
  const ids = new Set(contributors.map((c) => c.metricId));
  const validated = contributors.filter((c) => c.severity === "red" || c.severity === "amber");
  const changed = contributors.filter((c) => c.trend.direction === "increase" || c.trend.direction === "decrease");
  const stableOnes = contributors.filter((c) => c.trend.direction === "stable");
  const state: FindingState = validated.length ? "validated_concern" : changed.length ? "changed" : stableOnes.length ? "stable" : "baseline";
  const severity: Severity = validated.some((c) => c.severity === "red")
    ? "red"
    : validated.length
      ? "amber"
      : contributors.every((c) => c.severity === "normal")
        ? "normal"
        : "neutral";
  const dates = [...new Set(contributors.flatMap((c) => c.trend.examinationDates.map(day)))].sort();
  const valueOf = (c: Contributor) => `${c.name} ${c.trend.latest.value} ${c.unit}`;
  const missingKeyEvidence = p.keyEvidence.filter((k) => !k.ids.some((id) => ids.has(id))).map((k) => k.label);
  const exploratory = contributors.every((c) => c.syntheticDemo);
  const area = p.area.toLowerCase();

  let whatChanged: string;
  let interpretation: string;
  let headline: string;
  if (state === "validated_concern") {
    whatChanged = validated.map((c) => `${c.name} was ${c.trend.latest.value} ${c.unit} on ${day(c.trend.latest.at)} — ${c.statusLabel.toLowerCase()}${c.referenceText ? ` (${c.referenceText})` : ""}.`).join(" ");
    if (changed.length) whatChanged += ` ${changed.map((c) => `${c.name}: ${c.trend.text}`).join(" ")}`;
    interpretation = `${validated.length} result${validated.length === 1 ? "" : "s"} in this group meet${validated.length === 1 ? "s" : ""} verified criteria for ${validated.some((c) => c.severity === "red") ? "a clinically concerning finding" : "a cautionary finding"}. Considered with the related markers, this supports further evaluation of ${area}; it does not by itself establish a diagnosis.`;
    headline = `${p.title}: ${list(validated.map((c) => `${c.name} ${c.statusLabel.toLowerCase()}`), 3)}.`;
  } else if (state === "changed") {
    whatChanged = changed.map((c) => `${c.name}: ${c.trend.text}`).join(" ");
    const once = contributors.length - changed.length - stableOnes.length;
    if (stableOnes.length) whatChanged += ` No recorded change in ${list(stableOnes.map((c) => c.name), 4)}.`;
    if (once > 0) whatChanged += ` ${once} related result${once === 1 ? " has" : "s have"} no comparable earlier measurement.`;
    const roles = new Set(changed.map((c) => p.members.find((m) => m.id === c.metricId)?.role));
    interpretation =
      changed.length >= 2
        ? `Several related markers changed between examinations (${list(changed.map((c) => c.name), 4)}). Because they belong to the same biological system${roles.size > 1 ? " but describe different aspects of it" : ""}, the combined change may be relevant to ${area}. Changes occurring together do not show that one caused the other, and without verified reference criteria they cannot be classified as harmful or beneficial.`
        : `One marker changed (${changed[0]!.name}); the related markers have no comparable change to place it in context yet. Without verified reference criteria the change cannot be classified as harmful or beneficial.`;
    headline = `${p.title}: ${list(changed.map((c) => `${c.name} ${TREND_MARKERS[c.trend.direction]} ${c.trend.percent !== null ? `${signed(c.trend.percent)}%` : c.trend.direction}`), 3)} between examinations.`;
  } else if (state === "stable") {
    whatChanged = `No recorded change in ${list(stableOnes.map((c) => c.name), 5)} between comparable examinations.${contributors.length > stableOnes.length ? ` ${contributors.length - stableOnes.length} related result(s) were measured only once.` : ""}`;
    interpretation = "The related markers did not change between comparable examinations. This does not establish that the values are normal, because no verified reference criteria were applied.";
    headline = `${p.title}: no recorded change in ${stableOnes.length} related measurement${stableOnes.length === 1 ? "" : "s"}.`;
  } else {
    whatChanged = `Measured on ${joinAnd(dates)} only: ${list(contributors.map(valueOf), 6)}. With no comparable earlier result, no change over time can be established.`;
    interpretation = `These results describe ${area} at one point in time. The application has no verified reference criteria for them, so it does not say whether any value is low, high or normal; they form a baseline for later comparison and for Ground Medical review.`;
    headline = `${p.title}: ${contributors.length} related result${contributors.length === 1 ? "" : "s"} recorded on ${joinAnd(dates)}; baseline only, not classifiable against verified criteria.`;
  }

  const units = new Set<string>();
  const uncertainty = [
    ...(missingKeyEvidence.length ? [`Not available in this period: ${joinAnd(missingKeyEvidence)}.`] : []),
    "Specimen, laboratory method and collection conditions are not recorded, so comparability between examinations is not verified.",
    ...(state === "changed" ? ["Changes occurring together do not show that one caused the other."] : []),
    ...(contributors.some((c) => c.syntheticDemo)
      ? [`${contributors.filter((c) => c.syntheticDemo).length} of these results use synthetic demonstration catalog entries, which are not scientifically validated (exploratory).`]
      : []),
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
  const rules = usedRefs.length
    ? usedRefs.map((c) => `${c.name}: ${c.classification}`)
    : [`No verified reference interval or decision threshold applies to these results (verified references available: ${biomarkers.referenceRegistry.verifiedEntries}). Every result is NEUTRAL.`];
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
    `Catalog identity: ${contributors.length - contributors.filter((c) => c.syntheticDemo).length} handbook/catalog, ${contributors.filter((c) => c.syntheticDemo).length} synthetic demonstration (not scientifically validated).`,
    `Relationship text: P56 health pattern library, pending independent scientific review.`,
  ];
  const references = contributors.flatMap((c) => (c.handbookContext ? [`${c.name}: ${c.handbookContext}`] : []));
  const notes = contributors.flatMap((c) => automatedNotes.get(c.key) ?? []);

  const score =
    (severity === "red" ? 1000 : severity === "amber" ? 800 : 0) +
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
    headline: R(headline),
    whatChanged: R(whatChanged),
    contributors,
    relationship: R(p.relationship),
    spaceflightContext: R(p.spaceflightContext),
    interpretation: R(interpretation),
    uncertainty: uncertainty.map(R),
    exploratory,
    missingKeyEvidence,
    conditions,
    why: { rules: rules.map(R), confidence, references, review, automatedNotes: [...new Set(notes)] },
    score,
  };
}

function buildRecommendations(findings: readonly Finding[]): Recommendation[] {
  const lib = bundledPatternLibrary();
  const out = new Map<string, Recommendation>();
  const add = (category: RecommendationCategory, authorization: RecommendationAuthorization, text: string, basis: string) => {
    const key = `${category}|${text}`;
    const existing = out.get(key);
    if (existing) {
      if (!existing.basis.includes(basis)) existing.basis.push(basis);
      return;
    }
    out.set(key, { id: `rec-${out.size + 1}`, category, authorization, authorizationLabel: AUTHORIZATION_LABELS[authorization], text: R(text), basis: [basis] });
  };
  const baselineFindings: Finding[] = [];
  for (const f of findings) {
    const p = lib.patterns.find((x) => x.id === f.patternId);
    const basis = `${f.title} (${f.state === "validated_concern" ? "validated concern" : f.state === "changed" ? "change between examinations" : f.state === "stable" ? "no recorded change" : "single examination"})`;
    if (p && f.state === "validated_concern") for (const r of p.recommendations.concern) add(r.category, r.authorization, r.text, basis);
    else if (p && f.state === "changed") for (const r of p.recommendations.change) add(r.category, r.authorization, r.text, basis);
    else baselineFindings.push(f);
    if (f.missingKeyEvidence.length)
      add(
        "further_examination",
        "clinician_required",
        `${f.title}: the picture is incomplete — ${joinAnd(f.missingKeyEvidence)} ${f.missingKeyEvidence.length === 1 ? "was" : "were"} not available in this period. Ground Medical may request ${f.missingKeyEvidence.length === 1 ? "it" : "them"}.`,
        basis,
      );
  }
  for (const f of baselineFindings) {
    const basis = `${f.title} (${f.state === "stable" ? "no recorded change" : "single examination"})`;
    add("monitoring", "general_wellness", "Repeat these measurements at the next scheduled examination with the same laboratory, method and units, so that changes over time can be measured.", basis);
    add("ground_medical", "clinician_required", "Ground Medical should review the recorded values against appropriate reference criteria; none are verified in this application, so no value has been classified.", basis);
  }
  return [...out.values()].sort((a, b) => RECOMMENDATION_CATEGORIES.indexOf(a.category) - RECOMMENDATION_CATEGORIES.indexOf(b.category));
}

// ------------------------------------------------------------ plain text (TXT export)

export function healthAssessmentPlainText(a: HealthAssessment): string {
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
    ...a.keyFindings.map((k) => `- ${k.marker} ${k.text}`),
    "",
    `Validated health warnings: ${a.warningsStatement}`,
    ...a.warnings.map((w) => `- ${w.marker} ${w.text}`),
    `Follow-up priority: ${a.followUp.label} — ${a.followUp.text}`,
    a.completeness,
    "",
    "KEY BIOLOGICAL FINDINGS",
    ...a.findings.flatMap((f) => [
      `${f.marker} ${f.title}${f.exploratory ? " [exploratory]" : ""}`,
      `  What changed: ${f.whatChanged}`,
      `  How they relate: ${f.relationship} ${f.spaceflightContext}`,
      `  Interpretation: ${f.interpretation}`,
      ...f.uncertainty.map((u) => `  Uncertainty: ${u}`),
    ]),
    "",
    "HEALTH ASSESSMENT AND RECOMMENDATIONS",
    `Observed abnormal measurements (validated): ${a.assessment.abnormal.length ? a.assessment.abnormal.join("; ") : "none"}`,
    `Longitudinal changes: ${a.assessment.changes.length ? a.assessment.changes.join("; ") : "none measurable"}`,
    `Possible condition-related patterns: ${a.assessment.possiblePatterns.length ? a.assessment.possiblePatterns.join("; ") : "none could be assessed"}`,
    ...a.assessment.furtherEvaluation.map((x) => `Further evaluation: ${x}`),
    `Confirmed diagnoses: ${a.assessment.confirmedDiagnoses}`,
    ...a.recommendations.map((r) => `- [${r.authorizationLabel}] ${r.text} (based on: ${r.basis.join("; ")})`),
    "",
    "LONGITUDINAL TRENDS",
    a.trendNote,
    ...a.trends.map((t) => `- ${t.name} [${t.unit}]: ${t.points.map((p) => `${p.label} ${p.value}`).join(" → ")}`),
    ...(a.otherResults.statement ? ["", a.otherResults.statement] : []),
    "",
    a.disclosure,
  ];
  return lines.map(R).join("\n");
}

export { RESEARCHER_DOMAIN_LABELS };
