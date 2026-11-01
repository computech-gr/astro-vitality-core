/**
 * v9.5 — Shared deterministic physiological interpretation model for the four
 * Researcher modules (Bone, Cardiovascular, Immune, Behavioral), the Unified
 * Health PDF and the TXT export. Contract: docs/V9_5_RESEARCHER_INTERPRETATION_CONTRACT.md.
 *
 * Pure, read-only and local: built from an already-authorized Unified Health
 * Report, its Scientific Findings and the scoped attestation ledger. No network,
 * no AI, no writes. Biological context is quoted only from the existing governed
 * exact-ID handbook mappings (Bone, Cardiovascular) with source and review status;
 * Immune and Behavioral have no governed mapping and none is fabricated. It never
 * infers abnormality, disease, thresholds, diagnosis, treatment, fitness for duty,
 * causality or validated trends.
 */
import { REPORT_SOURCE_LABELS, type ReportRow, type UnifiedHealthReport } from "./unified-health-report";
import { CONTEXT_LINKS, CROSS_DOMAIN_SIGNAL_IDS, type ScientificFindings, type ScientificMetricFinding } from "./scientific-findings";
import { evidenceTierOf, governedHandbookEntry } from "./scientific-health-summary";
import { attestationStateFor, type AttestationEvent } from "./evidence-attestation";

export const RESEARCHER_DOMAINS = ["bone", "cardiovascular", "immune", "behavioral"] as const;
export type ResearcherDomain = (typeof RESEARCHER_DOMAINS)[number];

export const RESEARCHER_DOMAIN_LABELS: Record<ResearcherDomain, string> = {
  bone: "Bone Health",
  cardiovascular: "Cardiovascular Health",
  immune: "Immune Health",
  behavioral: "Behavioral Health",
};

/** Scientific interpretation approval status: nothing in this model is approved. */
export const INTERPRETATION_APPROVAL_STATUS = "PENDING_NIKOLAS_REVIEW";

export type SeriesComparison =
  | "multi_day_comparison"
  | "same_utc_day_only"
  | "insufficient_time_points"
  | "non_numeric";

export type HandbookContext =
  | { kind: "quoted_pending_hypothesis"; source: string; reviewStatus: string; about: string | null; statement: string | null; note: string }
  | { kind: "no_governed_mapping"; note: string };

export interface InterpretationSeries {
  metricId: string;
  label: string;
  /** Exact unit as recorded; never converted. */
  unit: string;
  readings: number;
  distinctTimePoints: number;
  distinctUtcDays: number;
  first: string;
  last: string;
  /** Values exactly as recorded. */
  firstValue: string;
  lastValue: string;
  comparison: SeriesComparison;
  /** Signed first-to-last difference at recorded precision (from Scientific Findings). */
  difference: number | null;
  magnitude: number | null;
  direction: "higher" | "lower" | "no_recorded_difference" | null;
  /** One-line, descriptive-only statement shared by screen, PDF and TXT. */
  observation: string;
  evidenceIds: string[];
  provenance: string;
  quality: string;
  evidenceTiers: { storedModule: number; intakeAccepted: number; device: number };
  attestation: { attested: number; notAttested: number; revoked: number; stale: number };
  /** Other units recorded for the same metric ID in this domain (never compared or converted). */
  otherUnits: string[];
  handbook: HandbookContext;
  limitations: string[];
}

export interface DomainInterpretation {
  domain: ResearcherDomain;
  label: string;
  included: number;
  series: InterpretationSeries[];
  evidenceIds: string[];
  coverage: { first: string | null; last: string | null; distinctUtcDays: number };
  governance: { source: string | null; status: string };
  summary: string;
  limitations: string[];
}

export type CrossDomainStatus =
  | "signals_missing"
  | "insufficient_data"
  | "not_temporally_aligned"
  | "measurement_conditions_unverified";

export interface CrossDomainAssessment {
  domains: ResearcherDomain[];
  signals: { signal: string; readings: number; distinctTimePoints: number; utcDays: string[] }[];
  missingSignals: string[];
  sharedUtcDays: string[];
  status: CrossDomainStatus;
  statement: string;
  evidenceIds: string[];
}

export interface ResearcherInterpretationModel {
  scope: UnifiedHealthReport["scope"];
  generatedAt: string;
  domains: DomainInterpretation[];
  crossDomain: CrossDomainAssessment[];
  /** Ground Medical attestation, intake acceptance and scientific approval are separate layers. */
  approvalLayers: { layer: string; count: number | null; meaning: string }[];
  validatedInterpretations: 0;
  boundaries: string[];
}

const GOVERNED: Record<ResearcherDomain, string | null> = {
  bone: "Astronaut Bone Health Handbook v7 (Nikolas)",
  cardiovascular: "NASA Cardiovascular Handbook (Nikolas)",
  immune: null,
  behavioral: null,
};

export const INTERPRETATION_BOUNDARIES: readonly string[] = [
  "Research-use-only. A recorded difference is not an abnormality, disease, clinical threshold, diagnosis, treatment indication, fitness-for-duty finding or validated trend.",
  "Two readings never establish a trend; same-UTC-day readings are never described as a longitudinal change.",
  "Missing data is never evidence of normal or healthy status.",
  "Handbook text describes the measure in general and is a pending hypothesis for qualified review, not a finding about this crew member.",
  "Cross-domain comparisons require temporally aligned signals, compatible measurement conditions and sufficient data, and independent scientific review; no association or causal claim is generated.",
  "Generated locally and deterministically; no AI or network service is used.",
];

const utcDay = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : iso.slice(0, 10);
};
const isResearcherDomain = (b: string): b is ResearcherDomain => (RESEARCHER_DOMAINS as readonly string[]).includes(b);

function handbookContext(domain: ResearcherDomain, metricId: string, comparison: SeriesComparison, direction: InterpretationSeries["direction"]): HandbookContext {
  const entry = governedHandbookEntry(metricId);
  // Exact catalog ID within the same governed domain only.
  if (!entry || entry.domain !== domain) {
    return {
      kind: "no_governed_mapping",
      note: GOVERNED[domain]
        ? `No governed handbook entry for catalog ID ${metricId}; no biological context is stated.`
        : `No governed exact-ID handbook mapping exists for ${RESEARCHER_DOMAIN_LABELS[domain]}; interpretation is pending scientific review and none is generated.`,
    };
  }
  let statement: string | null = null;
  let note: string;
  if (comparison !== "multi_day_comparison") {
    note = comparison === "same_utc_day_only"
      ? "Readings fall on one UTC day; direction-specific handbook context is not applied to a within-day difference."
      : "Direction-specific handbook context is not applied without two comparable time points.";
  } else if (direction === "higher" && entry.increase) {
    statement = `Handbook context for an increase: ${entry.increase}`;
    note = "Pending hypothesis for the recorded direction; not validated and not a finding about this crew member.";
  } else if (direction === "lower" && entry.decrease) {
    statement = `Handbook context for a decrease: ${entry.decrease}`;
    note = "Pending hypothesis for the recorded direction; not validated and not a finding about this crew member.";
  } else if ((direction === "higher" || direction === "lower") && entry.context) {
    statement = `Handbook context: ${entry.context}`;
    note = "Pending hypothesis; the handbook gives general context rather than direction-specific text.";
  } else {
    note = direction === "no_recorded_difference"
      ? "No recorded difference; no direction-specific handbook context applies."
      : "The handbook documents no direction-specific text for this measure; none is stated.";
  }
  return { kind: "quoted_pending_hypothesis", source: entry.handbook, reviewStatus: entry.reviewStatus, about: entry.what ?? null, statement, note };
}

function buildSeries(domain: ResearcherDomain, m: ScientificMetricFinding, rows: ReportRow[], all: ReportRow[], events: readonly AttestationEvent[]): InterpretationSeries {
  const sorted = [...rows].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const distinctTimePoints = new Set(sorted.map((r) => r.observedAt)).size;
  const distinctUtcDays = new Set(sorted.map((r) => utcDay(r.observedAt))).size;
  const numeric = m.earliestValue !== null && m.latestValue !== null;
  const comparison: SeriesComparison =
    m.trend !== "descriptive_change"
      ? (sorted.length >= 2 && distinctTimePoints >= 2 && !numeric ? "non_numeric" : "insufficient_time_points")
      : distinctUtcDays < 2 ? "same_utc_day_only" : "multi_day_comparison";
  const difference = m.trend === "descriptive_change" ? m.delta : null;
  const direction = difference === null ? null : difference > 0 ? "higher" : difference < 0 ? "lower" : "no_recorded_difference";
  const magnitude = difference === null ? null : Math.abs(difference);
  const u = m.unit;
  const observation =
    comparison === "multi_day_comparison"
      ? direction === "no_recorded_difference"
        ? `First ${first.value} ${u} and last ${last.value} ${u} (${first.observedAt} to ${last.observedAt}): no recorded difference.`
        : `Last reading ${direction} than first by ${magnitude} ${u} (${first.value} → ${last.value} ${u}, ${first.observedAt} to ${last.observedAt}). Descriptive first-to-last difference only.`
      : comparison === "same_utc_day_only"
        ? `${sorted.length} readings on one UTC day (${utcDay(first.observedAt)}), ${first.value} → ${last.value} ${u}; within-day difference ${difference} ${u}, not a longitudinal change.`
        : comparison === "non_numeric"
          ? `${sorted.length} readings recorded as non-numeric values; no difference calculated.`
          : `${sorted.length} reading(s) at ${distinctTimePoints} time point(s); fewer than two comparable time points, no difference calculated.`;
  const qualityNotes = [...new Set(sorted.map((r) => r.qualityNote).filter((q): q is string => Boolean(q)))];
  const quality = qualityNotes.length
    ? `As recorded: ${qualityNotes.join("; ")}${qualityNotes.length && sorted.some((r) => !r.qualityNote) ? "; some readings have no recorded quality" : ""}.`
    : "No quality recorded; quality is not inferred.";
  const tiers = { storedModule: 0, intakeAccepted: 0, device: 0 };
  const att = { attested: 0, notAttested: 0, revoked: 0, stale: 0 };
  for (const r of sorted) {
    const t = evidenceTierOf(r);
    if (t === "stored_observation") tiers.storedModule++;
    else if (t === "reviewer_accepted_intake") tiers.intakeAccepted++;
    else tiers.device++;
    const s = attestationStateFor(r, events).status;
    if (s === "attested") att.attested++;
    else if (s === "revoked") att.revoked++;
    else if (s === "stale_record_changed") att.stale++;
    else att.notAttested++;
  }
  const otherUnits = [...new Set(all.filter((r) => r.badge === domain && r.metricId === m.metricId && r.unit !== u).map((r) => r.unit))].sort();
  const limitations = [
    ...(otherUnits.length ? [`Also recorded in ${otherUnits.join(", ")}; series in different units are listed separately and never compared or converted.`] : []),
    ...(comparison === "multi_day_comparison" && sorted.length === 2 ? ["Only two readings; no trend is established."] : []),
    "Individual baseline, method, timing, specimen handling and confounders are not evaluated.",
  ];
  return {
    metricId: m.metricId,
    label: m.label,
    unit: u,
    readings: sorted.length,
    distinctTimePoints,
    distinctUtcDays,
    first: first.observedAt,
    last: last.observedAt,
    firstValue: first.value,
    lastValue: last.value,
    comparison,
    difference,
    magnitude,
    direction,
    observation,
    evidenceIds: sorted.map((r) => r.recordId),
    provenance: `${first.provenance.toUpperCase()} · ${[...new Set(sorted.map((r) => r.sourceLabel))].join(", ")}`,
    quality,
    evidenceTiers: tiers,
    attestation: att,
    otherUnits,
    handbook: handbookContext(domain, m.metricId, comparison, direction),
    limitations,
  };
}

function crossDomainAssessments(report: UnifiedHealthReport): CrossDomainAssessment[] {
  return CONTEXT_LINKS.map((link) => {
    const domains = link.domains.filter(isResearcherDomain);
    const signals = link.signals.map((signal) => {
      const ids = CROSS_DOMAIN_SIGNAL_IDS[signal] ?? [];
      const rows = report.rows.filter((r) => ids.includes(r.metricId) && (domains as readonly string[]).includes(r.badge));
      return {
        signal,
        rows,
        readings: rows.length,
        distinctTimePoints: new Set(rows.map((r) => r.observedAt)).size,
        utcDays: [...new Set(rows.map((r) => utcDay(r.observedAt)))].sort(),
      };
    });
    const missingSignals = signals.filter((s) => s.readings === 0).map((s) => s.signal);
    const present = signals.filter((s) => s.readings > 0);
    const sharedUtcDays = present.length === signals.length && present.length
      ? present.reduce<string[]>((acc, s, i) => (i === 0 ? [...s.utcDays] : acc.filter((d) => s.utcDays.includes(d))), [])
      : [];
    const status: CrossDomainStatus = missingSignals.length
      ? "signals_missing"
      : signals.some((s) => s.distinctTimePoints < 2)
        ? "insufficient_data"
        : sharedUtcDays.length === 0
          ? "not_temporally_aligned"
          : "measurement_conditions_unverified";
    const label = domains.map((d) => RESEARCHER_DOMAIN_LABELS[d]).join(" + ");
    const statement =
      status === "signals_missing"
        ? `${label}: missing ${missingSignals.join(", ")}. No comparison is made; missing signals are not evidence of normal status.`
        : status === "insufficient_data"
          ? `${label}: every signal observed, but at least one has fewer than two time points. No comparison is made.`
          : status === "not_temporally_aligned"
            ? `${label}: signals observed on different UTC days; not temporally aligned. No comparison is made.`
            : `${label}: signals co-observed on ${sharedUtcDays.length} shared UTC day(s), but measurement conditions are not recorded, so compatibility cannot be verified. No comparison, association or causal claim is made; independent scientific review is required.`;
    return {
      domains,
      signals: signals.map(({ signal, readings, distinctTimePoints, utcDays }) => ({ signal, readings, distinctTimePoints, utcDays })),
      missingSignals,
      sharedUtcDays,
      status,
      statement,
      evidenceIds: [...new Set(present.flatMap((s) => s.rows.map((r) => r.recordId)))],
    };
  });
}

export function buildResearcherInterpretation(
  report: UnifiedHealthReport,
  findings: ScientificFindings,
  attestations: readonly AttestationEvent[] = [],
): ResearcherInterpretationModel {
  const domains: DomainInterpretation[] = RESEARCHER_DOMAINS.map((domain) => {
    const domainRows = report.rows.filter((r) => r.badge === domain);
    const series = findings.metrics.flatMap((m) => {
      const ids = new Set(m.evidenceIds);
      const rows = domainRows.filter((r) => ids.has(r.recordId) && r.metricId === m.metricId && r.unit === m.unit);
      return rows.length ? [buildSeries(domain, m, rows, report.rows, attestations)] : [];
    }).sort((a, b) => a.metricId.localeCompare(b.metricId) || a.unit.localeCompare(b.unit));
    const times = domainRows.map((r) => r.observedAt).sort((a, b) => Date.parse(a) - Date.parse(b));
    const source = GOVERNED[domain];
    const governance = {
      source,
      status: source
        ? `Exact catalog-ID handbook text, machine-assisted English, ${INTERPRETATION_APPROVAL_STATUS}; shown only as pending hypotheses.`
        : `No governed exact-ID handbook mapping; interpretation ${INTERPRETATION_APPROVAL_STATUS} and none is generated.`,
    };
    const compared = series.filter((s) => s.comparison === "multi_day_comparison").length;
    const sameDay = series.filter((s) => s.comparison === "same_utc_day_only").length;
    const summary = domainRows.length
      ? `${domainRows.length} included observation(s) across ${series.length} metric/unit series; ${compared} with two or more comparable time points on different UTC days, ${sameDay} same-UTC-day only, ${series.length - compared - sameDay} with insufficient comparable time points.`
      : "No included observations in this reporting scope. No physiological conclusion can be drawn, and missing data is not evidence of normal or healthy status.";
    return {
      domain,
      label: RESEARCHER_DOMAIN_LABELS[domain],
      included: domainRows.length,
      series,
      evidenceIds: domainRows.map((r) => r.recordId),
      coverage: { first: times[0] ?? null, last: times.at(-1) ?? null, distinctUtcDays: new Set(times.map(utcDay)).size },
      governance,
      summary,
      limitations: domainRows.length
        ? ["Descriptive observations only; physiological significance requires qualified review of baseline, method, quality, timing and confounders."]
        : [],
    };
  });
  return {
    scope: report.scope,
    generatedAt: report.generatedAt,
    domains,
    crossDomain: crossDomainAssessments(report),
    approvalLayers: approvalLayersFor(domains.flatMap((d) => d.series)),
    validatedInterpretations: 0,
    boundaries: [...INTERPRETATION_BOUNDARIES],
  };
}

/** Three separate layers; counts come only from the given series. */
export function approvalLayersFor(series: readonly InterpretationSeries[]): ResearcherInterpretationModel["approvalLayers"] {
  const sum = (f: (s: InterpretationSeries) => number) => series.reduce((n, s) => n + f(s), 0);
  return [
    { layer: "Intake acceptance", count: sum((s) => s.evidenceTiers.intakeAccepted), meaning: "Rows accepted one by one in Unified Intake; confirms data entry, not scientific validity." },
    { layer: "Ground Medical attestation", count: sum((s) => s.attestation.attested), meaning: "Verifies evidence provenance for the exact record version; not a scientific interpretation or clinical opinion." },
    { layer: "Scientific interpretation approval", count: 0, meaning: `None approved. All handbook context and catalog mappings remain ${INTERPRETATION_APPROVAL_STATUS}.` },
  ];
}

export const domainInterpretation = (model: ResearcherInterpretationModel, domain: ResearcherDomain) =>
  model.domains.find((d) => d.domain === domain)!;

export const crossDomainFor = (model: ResearcherInterpretationModel, domain: ResearcherDomain) =>
  model.crossDomain.filter((c) => c.domains.includes(domain));

export function attestationLine(a: InterpretationSeries["attestation"]): string {
  return `${a.attested} attested · ${a.notAttested} not attested · ${a.revoked} revoked · ${a.stale} earlier record version`;
}

export function handbookLine(h: HandbookContext): string {
  if (h.kind === "no_governed_mapping") return h.note;
  return `${h.statement ? `${h.statement} ` : ""}${h.note} Source: ${h.source}; status: ${h.reviewStatus}; approval: ${INTERPRETATION_APPROVAL_STATUS}.`;
}

export function researcherInterpretationPlainText(model: ResearcherInterpretationModel): string {
  const out: string[] = ["RESEARCHER MODULE PHYSIOLOGICAL EVIDENCE INTERPRETATION — RESEARCH ONLY"];
  out.push("Approval layers (separate):", ...model.approvalLayers.map((l) => `- ${l.layer}: ${l.count ?? "n/a"}. ${l.meaning}`));
  for (const d of model.domains) {
    out.push("", `${d.label.toUpperCase()}`, d.summary, `Governance: ${d.governance.source ? `${d.governance.source}. ` : ""}${d.governance.status}`);
    if (d.coverage.first) out.push(`Coverage: ${d.coverage.first} to ${d.coverage.last}; ${d.coverage.distinctUtcDays} UTC day(s).`);
    for (const s of d.series) {
      out.push(
        `- ${s.label} (${s.metricId}) [${s.unit}]: ${s.observation}`,
        `  Readings ${s.readings}; time points ${s.distinctTimePoints}; UTC days ${s.distinctUtcDays}. Evidence: ${s.evidenceIds.join(", ")}.`,
        `  Provenance: ${s.provenance}. Quality: ${s.quality}`,
        `  Evidence tiers: ${s.evidenceTiers.storedModule} module, ${s.evidenceTiers.intakeAccepted} intake-accepted, ${s.evidenceTiers.device} device. Ground Medical: ${attestationLine(s.attestation)}.`,
        `  Biological context: ${handbookLine(s.handbook)}`,
        ...s.limitations.map((l) => `  Limitation: ${l}`),
      );
    }
    out.push(...d.limitations);
  }
  out.push("", "CROSS-DOMAIN COMPARABILITY", ...model.crossDomain.map((c) => `- ${c.statement} Evidence: ${c.evidenceIds.join(", ") || "none"}.`));
  out.push(`Validated interpretations: ${model.validatedInterpretations}.`, ...model.boundaries);
  return out.join("\n");
}
