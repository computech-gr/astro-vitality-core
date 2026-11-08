/**
 * P58 — Preliminary Clinical Assessment (pure, deterministic, offline).
 *
 * "Preliminary Clinical Assessment — Pending Ground Medical Review" built from
 * the P56 HealthAssessment, the P54/P57 biomarker classification and the
 * governed concern library (data/scientific/p58-clinical-concern-library.v1.json,
 * pending scientific review). For every SUPPORTED concern pattern it states the
 * possible concern, supporting and contradicting evidence, alternative
 * explanations, missing tests/context, which diagnostic criteria are satisfied
 * or not (only approved, applicable P57 criteria can be "satisfied"),
 * confirmation steps and a review priority.
 *
 * Never: a confirmed diagnosis, numeric probabilities or confidence
 * percentages, medication/supplement/dose advice, or a band from a criterion
 * that has not been approved. AI text (validated in this module) may only
 * elaborate concerns that the deterministic engine already listed, and its
 * output never changes criteria status, priority or classification.
 *
 * Ground Medical review (accept / amend / reject / add) is session-only and
 * kept in an audit log separate from AI-generation records, in line with the
 * existing rule that clinician acknowledgments are not persisted until an
 * owner-approved durable store exists.
 */
import libraryJson from "../../../data/scientific/p58-clinical-concern-library.v1.json";
import type { BiomarkerAssessment, BiomarkerAssessmentReport, Severity } from "./biomarker-health-assessment";
import type { Contributor, HealthAssessment } from "./p56-health-assessment";
import {
  AUTHORIZATION_LABELS,
  RECOMMENDATION_CATEGORIES,
  type RecommendationAuthorization,
  type RecommendationCategory,
} from "./p56-pattern-library";
import { bundledCriteriaRegistry, sourceOf, type CriteriaRegistry, type ReferenceCriterion } from "./p57-reference-criteria";
import { redactProhibitedNames } from "./report-identity-redaction";
import { observationDay } from "./observation-date";

export const CLINICAL_SECTION_TITLE = "Preliminary Clinical Assessment — Pending Ground Medical Review";
export const CLINICAL_LIBRARY_SCHEMA = "mitochondria.p58-clinical-concern-library.v1" as const;
export const CLINICAL_DIAGNOSIS_STATEMENT =
  "These are possible concerns for clinician evaluation, not diagnoses. Only an authorized Ground Medical clinician can confirm a medical diagnosis; no probability or confidence percentage is assigned.";
const R = redactProhibitedNames;

// ------------------------------------------------------------ concern library

export interface ConcernPattern {
  id: string;
  title: string;
  patternId: string;
  markers: string[];
  criteriaIds: string[];
  whyItMatters: string;
  mechanisms: string[];
  alternatives: string[];
  missingTests: { label: string; ids: string[] }[];
  contextNeeded: string[];
  confirmation: string[];
  groundMedicalVerify: string[];
  recommendations: { category: RecommendationCategory; authorization: RecommendationAuthorization; text: string }[];
}
export interface ConcernLibrary {
  schema: typeof CLINICAL_LIBRARY_SCHEMA;
  version: number;
  status: string;
  concerns: ConcernPattern[];
  excluded: { id: string; reason: string }[];
}

/** Medication doses (concentration units such as "mg/L" or "mg/dL" are measurements, not doses). */
export const DOSE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:mg|µg|μg|mcg|iu|g|ml|mmol)\b(?!\s*\/)|\bdos(?:e|es|ing)\b|\bprescrib\w*\s+(?:a |an |the )?(?:drugs?|medications?|medicines?|tablets?|supplements?)\b|\bsupplement with\b|\btake \d/i;
const filled = (s: unknown, min = 1): s is string => typeof s === "string" && s.trim().length >= min;
const strings = (a: unknown, min = 1) => Array.isArray(a) && a.length >= min && a.every((x) => filled(x, 5));

function concernProblem(c: Partial<ConcernPattern>, criteria: CriteriaRegistry): string | null {
  if (!filled(c.id) || !filled(c.title, 5) || !filled(c.patternId)) return "missing id, title or pattern";
  if (!Array.isArray(c.markers) || !c.markers.length) return "no markers";
  if (!Array.isArray(c.criteriaIds) || c.criteriaIds.some((id) => !criteria.criteria.some((x) => x.id === id))) return "unknown criterion reference";
  if (!filled(c.whyItMatters, 30)) return "explanation missing";
  if (!strings(c.mechanisms) || !strings(c.alternatives) || !strings(c.confirmation) || !strings(c.groundMedicalVerify) || !Array.isArray(c.contextNeeded)) return "reasoning fields incomplete";
  if (!Array.isArray(c.missingTests) || c.missingTests.some((m) => !filled(m?.label) || !Array.isArray(m.ids))) return "missing tests malformed";
  if (!Array.isArray(c.recommendations) || !c.recommendations.length) return "recommendations missing";
  for (const r of c.recommendations)
    if (!RECOMMENDATION_CATEGORIES.includes(r.category) || !(r.authorization in AUTHORIZATION_LABELS) || !filled(r.text, 20)) return "recommendation malformed";
  if (DOSE_PATTERN.test(JSON.stringify([c.recommendations, c.confirmation, c.mechanisms]))) return "contains medication, supplement or dose advice";
  return null;
}

export function validateConcernLibrary(raw: unknown, criteria: CriteriaRegistry = bundledCriteriaRegistry()): ConcernLibrary {
  const r = raw as { schema?: unknown; version?: unknown; status?: unknown; concerns?: unknown } | null;
  if (!r || r.schema !== CLINICAL_LIBRARY_SCHEMA || !Array.isArray(r.concerns))
    return { schema: CLINICAL_LIBRARY_SCHEMA, version: 0, status: "INVALID", concerns: [], excluded: [{ id: "*", reason: "library schema invalid" }] };
  const concerns: ConcernPattern[] = [];
  const excluded: ConcernLibrary["excluded"] = [];
  for (const c of r.concerns as Partial<ConcernPattern>[]) {
    const p = concernProblem(c ?? {}, criteria);
    if (p) excluded.push({ id: filled(c?.id) ? c!.id! : "?", reason: p });
    else concerns.push(c as ConcernPattern);
  }
  return { schema: CLINICAL_LIBRARY_SCHEMA, version: typeof r.version === "number" ? r.version : 0, status: typeof r.status === "string" ? r.status : "UNKNOWN", concerns, excluded };
}
let bundled: ConcernLibrary | null = null;
export function bundledConcernLibrary(): ConcernLibrary {
  if (!bundled) bundled = validateConcernLibrary(libraryJson);
  return bundled;
}

// ------------------------------------------------------------ assessment model

export type ConcernPriority = "high" | "prompt" | "measurement_check" | "routine";
export const CONCERN_PRIORITY_LABELS: Record<ConcernPriority, string> = {
  high: "High — prompt Ground Medical review (validated finding)",
  prompt: "Prompt review",
  measurement_check: "Measurement-consistency check first",
  routine: "Routine review",
};
export type CriterionStatus = "satisfied" | "not_satisfied" | "not_evaluable";
export const CRITERION_STATUS_TEXT: Record<CriterionStatus, string> = {
  satisfied: "Satisfied",
  not_satisfied: "Not satisfied",
  not_evaluable: "Not evaluable",
};

export interface ConcernCriterion {
  criterionId: string;
  title: string;
  source: string;
  status: CriterionStatus;
  detail: string;
}
export interface ConcernRecommendation {
  category: RecommendationCategory;
  authorization: RecommendationAuthorization;
  authorizationLabel: string;
  text: string;
  basis: string[];
}
export interface ClinicalConcern {
  id: string;
  concernId: string;
  title: string;
  findingId: string | null;
  priority: ConcernPriority;
  priorityLabel: string;
  severity: Severity;
  supporting: string[];
  contradicting: string[];
  alternatives: string[];
  missing: string[];
  criteria: ConcernCriterion[];
  confirmation: string[];
  narrative: {
    whatHappened: string;
    whyItMatters: string;
    supportingBiomarkers: string[];
    mechanisms: string[];
    otherCauses: string[];
    nextSteps: string[];
    groundMedicalVerify: string[];
  };
  recommendations: ConcernRecommendation[];
  contributorKeys: string[];
  /** Validated AI-assisted elaborations (labelled; never alter status). */
  aiNotes: { section: "explanation" | "supporting" | "contradicting" | "alternatives" | "missing" | "confirmation"; text: string }[];
  fingerprint: string;
}
export interface EvidenceGap {
  id: string;
  concernId: string;
  label: string;
  reason: string;
  concept: { label: string; aliases: string[]; domain: "bone" | "cardiovascular" | "immune" | "behavioral" | null };
}
export interface PreliminaryClinicalAssessment {
  title: typeof CLINICAL_SECTION_TITLE;
  concerns: ClinicalConcern[];
  diagnosisStatement: string;
  origin: "deterministic" | "deterministic_with_validated_ai";
  aiStatus: string;
  crossDomain: { text: string; origin: "deterministic" | "ai_assisted"; contributorKeys: string[] }[];
  lifestyle: { concernId: string; category: RecommendationCategory; text: string }[];
  evidenceGaps: EvidenceGap[];
  library: { version: number; status: string };
  rejectedAi: { section: string; text: string; reason: string }[];
}

/** Deterministic, synchronous FNV-1a fingerprint (display/binding only, not a security hash). */
export function stableHash(value: unknown): string {
  const text = JSON.stringify(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

const valueOf = (c: Contributor) => `${c.name} ${c.trend.latest.value}${/^[<>≤≥]?\s*-?\d/.test(c.trend.latest.value) ? ` ${c.unit}` : ""} on ${observationDay(c.trend.latest.at)}`;
const changed = (c: Contributor) => c.trend.direction === "increase" || c.trend.direction === "decrease" || Boolean(c.trend.profile?.intermediate);
const validated = (c: Contributor) => c.severity === "red" || c.severity === "amber";

function criterionStatus(cr: ReferenceCriterion, entries: readonly BiomarkerAssessment[], registry: CriteriaRegistry): ConcernCriterion {
  const s = sourceOf(cr, registry);
  const base = { criterionId: cr.id, title: cr.title, source: s ? `${s.organization}, ${s.publicationDate}` : cr.source.sourceId };
  if (!cr.identity.catalogId) return { ...base, status: "not_evaluable", detail: "No exact catalog identity exists for this test, so the criterion cannot be applied." };
  const e = entries.find((x) => x.metricId === cr.identity.catalogId && x.unit === cr.identity.unit);
  if (!e) return { ...base, status: "not_evaluable", detail: `No ${cr.identity.catalogName} (${cr.identity.unit}) result in this period.` };
  const ev = e.classification.criteria?.evaluations.find((x) => x.criterionId === cr.id) ?? null;
  if (!ev) return { ...base, status: "not_evaluable", detail: "Criterion pending Researcher approval; not applied." };
  if (ev.outcome === "classified" && ev.band) {
    const hit = ev.band.severity === "red" || ev.band.severity === "amber";
    return { ...base, status: hit ? "satisfied" : "not_satisfied", detail: `${e.latest.value} ${e.unit}: ${ev.band.label}.` };
  }
  if (ev.outcome === "outside_bands") return { ...base, status: "not_satisfied", detail: `${e.latest.value} ${e.unit} is outside the criterion's published bands.` };
  if (ev.outcome === "held") return { ...base, status: "not_evaluable", detail: "Held until measurement consistency is confirmed." };
  if (ev.outcome === "not_applicable") return { ...base, status: "not_evaluable", detail: `Not applicable — not recorded: ${ev.missing.join("; ")}.` };
  return { ...base, status: "not_evaluable", detail: ev.text };
}

export interface ClinicalInput {
  assessment: HealthAssessment;
  biomarkers: BiomarkerAssessmentReport;
  library?: ConcernLibrary;
  registry?: CriteriaRegistry;
}

export function buildPreliminaryClinicalAssessment(input: ClinicalInput): PreliminaryClinicalAssessment {
  const library = input.library ?? bundledConcernLibrary();
  const registry = input.registry ?? bundledCriteriaRegistry();
  const all = input.assessment.findings.flatMap((f) => f.contributors);
  const presentIds = new Set(all.map((c) => c.metricId));
  const entries = input.biomarkers.entries;
  const concerns: ClinicalConcern[] = [];
  const gaps: EvidenceGap[] = [];

  for (const p of library.concerns) {
    const cs = all.filter((c) => p.markers.includes(c.metricId));
    if (!cs.length) continue;
    const supported = cs.some((c) => validated(c) || c.review.flags.length > 0 || changed(c));
    if (!supported) continue;
    const ordered = [...cs].sort((a, b) => p.markers.indexOf(a.metricId) - p.markers.indexOf(b.metricId));

    const supporting: string[] = [];
    for (const c of ordered.filter(validated)) supporting.push(`${valueOf(c)} — ${c.statusLabel}${c.referenceText ? ` (${c.referenceText})` : ""}.`);
    for (const c of ordered.filter((x) => !validated(x) && (x.review.flags.some((f) => f.kind === "priority_review") || changed(x)) && !x.review.flags.some((f) => f.kind === "data_quality")))
      supporting.push(`${c.name}: ${c.trend.text}${c.review.flags.some((f) => f.kind === "priority_review") ? " Meets the review-triage rules." : ""}`);
    const singles = ordered.filter((c) => !validated(c) && !changed(c) && !c.review.flags.length);
    if (singles.length) supporting.push(`Also recorded (not classified): ${singles.slice(0, 5).map(valueOf).join("; ")}${singles.length > 5 ? `; and ${singles.length - 5} more` : ""}.`);

    const contradicting: string[] = [];
    for (const c of ordered) {
      for (const f of c.review.flags.filter((x) => x.kind === "data_quality"))
        contradicting.push(`${c.name}: ${f.text} The readings contradict each other until sample identity and method are confirmed.`);
      const prof = c.trend.profile;
      if (prof?.intermediate)
        contradicting.push(
          `${c.name} ${prof.intermediate.kind === "peak" ? "fell back" : "rose again"} to ${prof.last.valueText} ${c.unit} at the latest examination after the ${prof.intermediate.point.valueText} ${c.unit} ${prof.intermediate.kind} on ${prof.intermediate.point.day}, so the ${prof.intermediate.kind} was not sustained.`,
        );
      if (c.severity === "normal") contradicting.push(`${valueOf(c)} is within an approved criterion's normal category.`);
      if (c.trend.direction === "stable" && !prof?.intermediate) contradicting.push(`${c.name} did not change between comparable examinations.`);
    }
    if (!contradicting.length) contradicting.push("No recorded measurement contradicts this concern; absence of contradiction is not confirmation.");

    const criteria = p.criteriaIds
      .map((id) => registry.criteria.find((x) => x.id === id))
      .filter((x): x is ReferenceCriterion => Boolean(x))
      .map((cr) => criterionStatus(cr, entries, registry));
    const perObservationMissing = [
      ...new Set(
        entries
          .filter((e) => p.markers.includes(e.metricId))
          .flatMap((e) => e.classification.criteria?.evaluations ?? [])
          .filter((ev) => ev.outcome === "not_applicable")
          .flatMap((ev) => ev.missing),
      ),
    ];
    const missing = [
      ...p.missingTests.filter((m) => !m.ids.some((id) => presentIds.has(id))).map((m) => `${m.label} — not recorded in this period.`),
      ...p.contextNeeded.map((x) => `${x} — not recorded.`),
      ...perObservationMissing.map((x) => `${x} (required by an approved criterion).`),
    ];
    const confirmation = [
      ...p.confirmation,
      ...criteria
        .filter((c) => c.status === "satisfied")
        .map((c) => registry.criteria.find((x) => x.id === c.criterionId)!.confirmation)
        .filter((x, i, a) => a.indexOf(x) === i),
    ];

    const severity: Severity = cs.some((c) => c.severity === "red") ? "red" : cs.some((c) => c.severity === "amber") ? "amber" : "neutral";
    const priority: ConcernPriority =
      severity === "red"
        ? "high"
        : severity === "amber" || cs.some((c) => c.review.flags.some((f) => f.kind === "priority_review"))
          ? "prompt"
          : cs.some((c) => c.review.flags.some((f) => f.kind === "data_quality"))
            ? "measurement_check"
            : "routine";

    const changedOnes = ordered.filter(changed);
    const whatHappened = changedOnes.length
      ? changedOnes.map((c) => `${c.name}: ${c.trend.text}`).join(" ")
      : `Measured once in this period: ${ordered.slice(0, 4).map(valueOf).join("; ")}.`;
    const basis = ordered.filter((c) => validated(c) || changed(c) || c.review.flags.length).map(valueOf);
    const recommendations: ConcernRecommendation[] = p.recommendations.map((r) => ({
      ...r,
      authorizationLabel: AUTHORIZATION_LABELS[r.authorization],
      text: R(r.text),
      basis: [`${p.title}: ${(basis.length ? basis : ordered.map(valueOf)).slice(0, 4).join("; ")}`],
    }));
    const core = { concernId: p.id, supporting, contradicting, criteria: criteria.map((c) => [c.criterionId, c.status, c.detail]), priority };
    concerns.push({
      id: `concern-${p.id}`,
      concernId: p.id,
      title: R(p.title),
      findingId: input.assessment.findings.some((f) => f.patternId === p.patternId) ? `finding-${p.patternId}` : null,
      priority,
      priorityLabel: CONCERN_PRIORITY_LABELS[priority],
      severity,
      supporting: supporting.map(R),
      contradicting: contradicting.map(R),
      alternatives: p.alternatives.map(R),
      missing: missing.map(R),
      criteria,
      confirmation: confirmation.map(R),
      narrative: {
        whatHappened: R(whatHappened),
        whyItMatters: R(p.whyItMatters),
        supportingBiomarkers: ordered.map((c) => c.name),
        mechanisms: p.mechanisms.map(R),
        otherCauses: p.alternatives.map(R),
        nextSteps: recommendations.map((r) => r.text),
        groundMedicalVerify: p.groundMedicalVerify.map(R),
      },
      recommendations,
      contributorKeys: ordered.map((c) => c.key),
      aiNotes: [],
      fingerprint: stableHash(core),
    });

    const approvedCriteria = criteria.filter((c) => c.status !== "not_evaluable" || !/pending Researcher approval/.test(c.detail));
    if (!p.criteriaIds.length || !approvedCriteria.length) {
      const lead = ordered.find((c) => validated(c) || changed(c) || c.review.flags.length) ?? ordered[0]!;
      gaps.push({
        id: `gap-${p.id}`,
        concernId: p.id,
        label: `${p.title}: ${p.criteriaIds.length ? "candidate criteria pending Researcher approval" : "no reference criterion retrieved"}`,
        reason: p.criteriaIds.length
          ? "Candidate criteria exist but none is approved, so diagnostic criteria cannot be evaluated."
          : `No standardized criterion with exact identity and unit was retrieved for ${ordered.map((c) => c.name).slice(0, 4).join(", ")}.`,
        concept: { label: lead.name, aliases: [], domain: domainOf(lead) },
      });
    }
  }

  const rank: Record<ConcernPriority, number> = { high: 0, prompt: 1, measurement_check: 2, routine: 3 };
  concerns.sort((a, b) => rank[a.priority] - rank[b.priority] || b.supporting.length - a.supporting.length || a.title.localeCompare(b.title));

  // Deterministic cross-domain co-observation (never causation): concerns from different domains changed in one period.
  const crossDomain: PreliminaryClinicalAssessment["crossDomain"] = [];
  const domainsOf = (k: string) => all.find((c) => c.key === k)?.domainLabel;
  const active = concerns.filter((c) => c.priority !== "routine");
  const domainSet = new Set(active.flatMap((c) => c.contributorKeys.map(domainsOf)).filter(Boolean));
  if (active.length >= 2 && domainSet.size >= 2)
    crossDomain.push({
      origin: "deterministic",
      contributorKeys: active.flatMap((c) => c.contributorKeys).slice(0, 12),
      text: `${active.length} concern areas changed in the same period across ${[...domainSet].join(", ")}: ${active.map((c) => c.title.replace(/\s*\(.*\)$/, "").toLowerCase()).join("; ")}. Their co-occurrence is reported for joint review; it does not show that one caused another. Shared context such as fluid shifts, sleep, stress, illness or sample handling should be checked first.`,
    });

  return {
    title: CLINICAL_SECTION_TITLE,
    concerns,
    diagnosisStatement: CLINICAL_DIAGNOSIS_STATEMENT,
    origin: "deterministic",
    aiStatus: "Deterministic clinical reasoning engine.",
    crossDomain,
    lifestyle: [],
    evidenceGaps: gaps,
    library: { version: library.version, status: library.status },
    rejectedAi: [],
  };
}

function domainOf(c: Contributor): EvidenceGap["concept"]["domain"] {
  const d = c.key.split("|")[0];
  return d === "bone" || d === "cardiovascular" || d === "immune" || d === "behavioral" ? d : null;
}

// ------------------------------------------------------------ de-identified AI packet and validation

export const CLINICAL_PACKET_SCHEMA = "mitochondria.p58-clinical-packet.v1" as const;
export const CLINICAL_AI_SCHEMA_VERSION = "p58-clinical-reasoning.v1" as const;

export interface ClinicalPacketItem {
  ref: string;
  catalogId: string;
  name: string;
  domain: string;
  unit: string;
  /** Values in examination order with day offsets from the first examination (no calendar dates). */
  series: { day: number; value: string }[];
  severity: Severity;
  classification: string;
  reviewFlags: string[];
}
export interface ClinicalPacket {
  schema: typeof CLINICAL_PACKET_SCHEMA;
  provenance: "synthetic" | "real";
  items: ClinicalPacketItem[];
  concerns: { id: string; title: string; observationRefs: string[]; priority: ConcernPriority; supporting: string[]; contradicting: string[]; criteria: string[]; missing: string[] }[];
}

const dayIndex = (first: string, d: string) => Math.round((Date.parse(`${observationDay(d)}T00:00:00Z`) - Date.parse(`${observationDay(first)}T00:00:00Z`)) / 86_400_000);
const dateless = (t: string) => t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[date]");

/** De-identified packet: catalog concepts, exact values/units, day offsets and deterministic statuses only. */
export function buildClinicalPacket(a: HealthAssessment, clinical: PreliminaryClinicalAssessment): ClinicalPacket {
  const all = a.findings.flatMap((f) => f.contributors);
  const firstDay = a.header.examinationDates[0] ?? "1970-01-01";
  const keys = [...new Set(clinical.concerns.flatMap((c) => c.contributorKeys))];
  const refOf = new Map(keys.map((k, i) => [k, `O${i + 1}`]));
  const items = keys.map((k): ClinicalPacketItem => {
    const c = all.find((x) => x.key === k)!;
    const pts = c.trend.profile?.points ?? [{ at: c.trend.latest.at, valueText: c.trend.latest.value }];
    return {
      ref: refOf.get(k)!,
      catalogId: c.metricId,
      name: c.name,
      domain: c.domainLabel,
      unit: c.unit,
      series: pts.map((p) => ({ day: dayIndex(firstDay, p.at), value: p.valueText })),
      severity: c.severity,
      classification: dateless(c.statusLabel),
      reviewFlags: c.review.flags.map((f) => dateless(f.text)),
    };
  });
  return {
    schema: CLINICAL_PACKET_SCHEMA,
    provenance: a.header.provenance,
    items,
    concerns: clinical.concerns.map((c) => ({
      id: c.concernId,
      title: c.title,
      observationRefs: c.contributorKeys.map((k) => refOf.get(k)!),
      priority: c.priority,
      supporting: c.supporting.map(dateless),
      contradicting: c.contradicting.map(dateless),
      criteria: c.criteria.map((x) => `${x.title}: ${CRITERION_STATUS_TEXT[x.status]} — ${dateless(x.detail)}`),
      missing: c.missing.map(dateless),
    })),
  };
}

export function clinicalPacketPrivacyProblem(p: ClinicalPacket): string | null {
  const text = JSON.stringify(p);
  if (/\d{4}-\d{2}-\d{2}/.test(text)) return "packet contains a calendar date";
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) return "packet contains an identifier";
  if (/@[a-z0-9-]+\./i.test(text)) return "packet contains an e-mail address";
  return null;
}

const CONFIRMED = /\b(?:confirm(?:s|ed)\s+(?:a|the)?\s*diagnos|definitive(?:ly)?|diagnosed with|is diagnostic of|establish(?:es|ed)? (?:a |the )?diagnosis|the (?:patient|astronaut|crew member) has\b)/i;
const PROBABILITY = /\bprobabilit\w*|\b\d+(?:\.\d+)?\s*%\s*(?:chance|probability|likelihood|risk|confidence)|\bconfidence (?:level|interval|of|score)\b|\bodds of\b|\bpercent chance\b/i;
const INVENTED = /\b(?:history of|medical history|family history|reported pain|on examination|physical exam\w*)\b|\b(?:has|had|reports?|reported|complains?|complained|experienc\w+|presents? with)\b[^.]{0,40}\bsymptom/i;
const TREATMENT = /\b(?:treat(?:ment|ed|ing)? with|start (?:on|taking)|administer|dos(?:e|es|ing)|supplement(?:s|ation|ing)?|medication|metformin|insulin therapy|statins?)\b/i;
const MAX = 600;
const numbersIn = (t: string) => [...t.matchAll(/(?<![\w.])[+-]?\d+(?:\.\d+)?/g)].map((m) => m[0].replace(/^\+/, ""));

export interface ClinicalAiOutput {
  schemaVersion: typeof CLINICAL_AI_SCHEMA_VERSION;
  concerns: { concernId: string; explanation: string; supporting: string[]; contradicting: string[]; alternatives: string[]; missingInformation: string[]; confirmationSteps: string[] }[];
  crossDomain: { text: string; observationRefs: string[] }[];
  lifestyle: { concernId: string; category: string; text: string }[];
  uncertainties: string[];
}

/** Validate AI output against its packet; failing statements are dropped with reasons, never rewritten. */
export function validateClinicalAi(raw: unknown, p: ClinicalPacket): { ok: true; output: ClinicalAiOutput; rejected: { section: string; text: string; reason: string }[] } | { ok: false; reason: string } {
  const r = raw as Partial<ClinicalAiOutput> | null;
  if (!r || r.schemaVersion !== CLINICAL_AI_SCHEMA_VERSION) return { ok: false, reason: "The AI response did not match the required structure." };
  const corpus = new Set(numbersIn(JSON.stringify(p)));
  const rejected: { section: string; text: string; reason: string }[] = [];
  const problem = (t: string): string | null => {
    if (t.length > MAX) return "statement too long";
    if (CONFIRMED.test(t)) return "asserts a confirmed diagnosis";
    if (PROBABILITY.test(t)) return "states a probability or confidence";
    if (INVENTED.test(t)) return "refers to history, symptoms or examinations that are not recorded";
    if (TREATMENT.test(t) || DOSE_PATTERN.test(t)) return "contains treatment, medication or dose language";
    const extra = numbersIn(t).filter((n) => !corpus.has(n));
    if (extra.length) return `introduces number(s) not present in the recorded evidence (${extra.slice(0, 3).join(", ")})`;
    return null;
  };
  const keep = (section: string, list: unknown, max = 8): string[] =>
    (Array.isArray(list) ? list : [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, max)
      .flatMap((x) => {
        const t = x.trim();
        const why = problem(t);
        if (why) { rejected.push({ section, text: t.slice(0, MAX), reason: why }); return []; }
        return [t];
      });
  const ids = new Set(p.concerns.map((c) => c.id));
  const refs = new Map(p.items.map((i) => [i.ref, i]));
  const concerns: ClinicalAiOutput["concerns"] = [];
  for (const c of Array.isArray(r.concerns) ? r.concerns.slice(0, 20) : []) {
    if (!c || !ids.has(c.concernId)) { rejected.push({ section: "concerns", text: String(c?.concernId ?? "").slice(0, 80), reason: "concern not listed by the deterministic engine" }); continue; }
    const [explanation] = keep(`${c.concernId}.explanation`, [c.explanation], 1);
    concerns.push({
      concernId: c.concernId,
      explanation: explanation ?? "",
      supporting: keep(`${c.concernId}.supporting`, c.supporting),
      contradicting: keep(`${c.concernId}.contradicting`, c.contradicting),
      alternatives: keep(`${c.concernId}.alternatives`, c.alternatives),
      missingInformation: keep(`${c.concernId}.missingInformation`, c.missingInformation),
      confirmationSteps: keep(`${c.concernId}.confirmationSteps`, c.confirmationSteps),
    });
  }
  const crossDomain: ClinicalAiOutput["crossDomain"] = [];
  for (const x of Array.isArray(r.crossDomain) ? r.crossDomain.slice(0, 6) : []) {
    const obs = Array.isArray(x?.observationRefs) ? x.observationRefs.filter((o): o is string => typeof o === "string") : [];
    const text = typeof x?.text === "string" ? x.text.trim() : "";
    if (!obs.length || obs.some((o) => !refs.has(o))) { rejected.push({ section: "crossDomain", text: text.slice(0, MAX), reason: "does not cite recorded observations of this packet" }); continue; }
    if (new Set(obs.map((o) => refs.get(o)!.domain)).size < 2) { rejected.push({ section: "crossDomain", text: text.slice(0, MAX), reason: "cross-domain statement cites only one domain" }); continue; }
    if (/\bcaus(?:e|es|ed|ing)\b/i.test(text) && !/\bnot\b[^.]{0,30}\bcaus/i.test(text)) { rejected.push({ section: "crossDomain", text: text.slice(0, MAX), reason: "asserts causation" }); continue; }
    const kept = keep("crossDomain", [text], 1);
    if (kept.length) crossDomain.push({ text: kept[0]!, observationRefs: [...new Set(obs)] });
  }
  const lifestyle: ClinicalAiOutput["lifestyle"] = [];
  for (const x of Array.isArray(r.lifestyle) ? r.lifestyle.slice(0, 12) : []) {
    if (!x || !ids.has(x.concernId) || !RECOMMENDATION_CATEGORIES.includes(x.category as RecommendationCategory) || x.category === "ground_medical" || x.category === "further_examination") {
      rejected.push({ section: "lifestyle", text: String(x?.text ?? "").slice(0, MAX), reason: "not a general-wellness category linked to a listed concern" });
      continue;
    }
    const concern = p.concerns.find((c) => c.id === x.concernId)!;
    if (concern.id === "electrolyte_disturbance" && (x.category === "hydration" || x.category === "nutrition")) {
      rejected.push({ section: "lifestyle", text: String(x.text).slice(0, MAX), reason: "electrolyte findings need Ground Medical review before hydration or dietary advice" });
      continue;
    }
    const kept = keep("lifestyle", [x.text], 1);
    if (kept.length) lifestyle.push({ concernId: x.concernId, category: x.category, text: kept[0]! });
  }
  return { ok: true, output: { schemaVersion: CLINICAL_AI_SCHEMA_VERSION, concerns, crossDomain, lifestyle, uncertainties: keep("uncertainties", r.uncertainties, 10) }, rejected };
}

/** Attach validated AI elaborations; deterministic statuses, criteria and priorities are never changed. */
export function mergeClinicalAi(
  clinical: PreliminaryClinicalAssessment,
  packet: ClinicalPacket,
  ai: { output: ClinicalAiOutput; rejected: { section: string; text: string; reason: string }[]; model: string | null },
): PreliminaryClinicalAssessment {
  const keyOf = new Map<string, string>();
  for (const c of clinical.concerns) packet.concerns.find((x) => x.id === c.concernId)?.observationRefs.forEach((ref, i) => keyOf.set(ref, c.contributorKeys[i]!));
  const concerns = clinical.concerns.map((c) => {
    const x = ai.output.concerns.find((y) => y.concernId === c.concernId);
    if (!x) return c;
    const notes: ClinicalConcern["aiNotes"] = [
      ...(x.explanation ? [{ section: "explanation" as const, text: R(x.explanation) }] : []),
      ...x.supporting.map((t) => ({ section: "supporting" as const, text: R(t) })),
      ...x.contradicting.map((t) => ({ section: "contradicting" as const, text: R(t) })),
      ...x.alternatives.map((t) => ({ section: "alternatives" as const, text: R(t) })),
      ...x.missingInformation.map((t) => ({ section: "missing" as const, text: R(t) })),
      ...x.confirmationSteps.map((t) => ({ section: "confirmation" as const, text: R(t) })),
    ];
    return { ...c, aiNotes: notes };
  });
  return {
    ...clinical,
    concerns,
    origin: "deterministic_with_validated_ai",
    aiStatus: `AI-assisted elaboration (${ai.model ?? "model not reported"}) validated against the recorded evidence; ${ai.rejected.length} statement(s) rejected.`,
    crossDomain: [
      ...clinical.crossDomain,
      ...ai.output.crossDomain.map((x) => ({ origin: "ai_assisted" as const, text: R(x.text), contributorKeys: x.observationRefs.map((o) => keyOf.get(o)).filter((k): k is string => Boolean(k)) })),
    ],
    lifestyle: ai.output.lifestyle.map((l) => ({ concernId: l.concernId, category: l.category as RecommendationCategory, text: R(l.text) })),
    rejectedAi: ai.rejected,
  };
}

// ------------------------------------------------------------ Ground Medical review (session-only) and audit

export type ClinicianDecisionKind = "accept" | "amend" | "reject" | "add";
export interface ClinicianDecision {
  id: string;
  concernId: string | null;
  decision: ClinicianDecisionKind;
  text: string;
  reviewerUserId: string;
  reviewedAt: string;
  concernFingerprint: string | null;
  scope: { missionId: string; crewMemberId: string; provenance: "synthetic" | "real" };
}
export interface ClinicalAuditRecord {
  kind: "ai_generation" | "clinician_decision";
  at: string;
  summary: string;
  ref: string;
}

export function planClinicianDecision(
  concern: ClinicalConcern | null,
  actor: { userId: string | null | undefined; rolesForScope: readonly string[]; scope: ClinicianDecision["scope"]; now: string },
  input: { decision: ClinicianDecisionKind; text: string },
): { ok: true; decision: ClinicianDecision } | { ok: false; reason: string } {
  if (!actor.userId) return { ok: false, reason: "Sign in again: the reviewer could not be verified." };
  if (!actor.rolesForScope.includes("ground_medical")) return { ok: false, reason: "Only an authorized Ground Medical clinician for this exact mission and crew member can review the preliminary clinical assessment." };
  const text = input.text.trim();
  if (input.decision !== "add" && !concern) return { ok: false, reason: "Select the concern to review." };
  if (input.decision === "accept" && text.length < 10) return { ok: false, reason: "A review note of at least 10 characters is required to accept." };
  if ((input.decision === "amend" || input.decision === "add") && text.length < 20) return { ok: false, reason: "Write the clinical assessment (at least 20 characters)." };
  if (input.decision === "reject" && text.length < 10) return { ok: false, reason: "State why the concern is rejected (at least 10 characters)." };
  if (DOSE_PATTERN.test(text)) return { ok: false, reason: "Doses and prescriptions are not recorded in MITOCHONDRIA." };
  return {
    ok: true,
    decision: {
      id: `gm-${stableHash([concern?.concernId ?? "add", input.decision, text, actor.now, actor.userId])}`,
      concernId: concern?.concernId ?? null,
      decision: input.decision,
      text: R(text),
      reviewerUserId: actor.userId,
      reviewedAt: actor.now,
      concernFingerprint: concern?.fingerprint ?? null,
      scope: actor.scope,
    },
  };
}

export interface ConcernReviewStatus {
  status: "pending" | "accepted" | "amended" | "rejected" | "stale";
  label: string;
  text: string | null;
}

/** Latest decision for this exact concern content and scope; a stale decision is never applied. */
export function concernReviewStatus(concern: ClinicalConcern, decisions: readonly ClinicianDecision[], scope: ClinicianDecision["scope"]): ConcernReviewStatus {
  const mine = decisions.filter(
    (d) => d.concernId === concern.concernId && d.scope.missionId === scope.missionId && d.scope.crewMemberId === scope.crewMemberId && d.scope.provenance === scope.provenance,
  );
  const last = mine.at(-1);
  if (!last) return { status: "pending", label: "Pending Ground Medical review", text: null };
  if (last.concernFingerprint !== concern.fingerprint) return { status: "stale", label: "Pending Ground Medical review (earlier review no longer matches the evidence)", text: null };
  if (last.decision === "accept") return { status: "accepted", label: "Accepted by Ground Medical (session review — not a confirmed diagnosis)", text: last.text };
  if (last.decision === "amend") return { status: "amended", label: "Amended by Ground Medical (session review)", text: last.text };
  return { status: "rejected", label: "Rejected by Ground Medical (session review)", text: last.text };
}

export function clinicalAuditTrail(clinical: PreliminaryClinicalAssessment, decisions: readonly ClinicianDecision[], generatedAt: string): ClinicalAuditRecord[] {
  return [
    {
      kind: "ai_generation",
      at: generatedAt,
      ref: stableHash(clinical.concerns.map((c) => c.fingerprint)),
      summary: `${clinical.origin === "deterministic" ? "Deterministic engine" : clinical.aiStatus} — ${clinical.concerns.length} concern(s); ${clinical.rejectedAi.length} AI statement(s) rejected.`,
    },
    ...decisions.map((d) => ({
      kind: "clinician_decision" as const,
      at: d.reviewedAt,
      ref: d.id,
      summary: `${d.decision.toUpperCase()} ${d.concernId ?? "(clinician-added assessment)"} by Ground Medical ${d.reviewerUserId}: ${d.text}`,
    })),
  ];
}
