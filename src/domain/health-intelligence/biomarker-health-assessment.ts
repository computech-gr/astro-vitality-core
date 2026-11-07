/**
 * P54 — Biomarker health assessment (pure, deterministic, offline).
 *
 * One read model, shared by the Astronaut Health Report screen, the module
 * history views, the searchable PDF and the TXT export. Built on top of the
 * existing Researcher interpretation model (series per exact metric ID + unit,
 * P41 longitudinal comparison, P40 interpretation records); it never re-reads
 * storage, never rewrites observations and never converts units.
 *
 * Classification rule (the only way a colour other than NEUTRAL appears):
 *   a numeric latest value is compared with an INDEPENDENTLY VERIFIED reference
 *   interval or decision threshold from data/scientific/verified-reference-intervals.v1.json
 *   that matches the exact catalog ID, exact unit and domain (synthetic-demo
 *   references only for synthetic data of the same mission), or the record
 *   carries an annotation from an APPROVED adverse rule (adverse-annotations.ts).
 * The registry is empty, so today every result is NEUTRAL /
 * "Insufficient evidence to classify". A numerical increase or decrease is
 * never classified as harmful.
 */
import registryJson from "../../../data/scientific/verified-reference-intervals.v1.json";
import type { ReportRow, UnifiedHealthReport } from "./unified-health-report";
import type { AdverseResolution } from "./adverse-annotations";
import {
  EVIDENCE_LEVEL_LABELS,
  PENDING_INTERPRETATION_TEXT,
  SYNTHETIC_DEMO_INTERPRETATION_LABEL,
  citationLines,
  matchInterpretation,
  type Claim,
  type CitationKind,
  type InterpretationSnapshot,
  type ResolvedInterpretation,
} from "./biomarker-interpretation";
import { registryInterpretationSnapshot } from "./biomarker-interpretation-ledger";
import {
  RESEARCHER_DOMAINS,
  RESEARCHER_DOMAIN_LABELS,
  type InterpretationSeries,
  type ResearcherDomain,
  type ResearcherInterpretationModel,
} from "./researcher-interpretation";
import type { ExamPoint, PairComparison } from "./longitudinal-comparison";

// ------------------------------------------------------------ vocabulary

export const REFERENCE_REGISTRY_SCHEMA = "mitochondria.verified-reference-intervals.v1" as const;

export type MeasurementStatus =
  | "within_verified_reference"
  | "below_verified_reference"
  | "above_verified_reference"
  | "clinically_concerning"
  | "insufficient_evidence";

export const MEASUREMENT_STATUS_LABELS: Record<MeasurementStatus, string> = {
  within_verified_reference: "Within verified reference",
  below_verified_reference: "Below verified reference",
  above_verified_reference: "Above verified reference",
  clinically_concerning: "Clinically concerning",
  insufficient_evidence: "Insufficient evidence to classify",
};

export type Severity = "red" | "amber" | "normal" | "neutral";

/** Colour is never the only signal: every severity has a text marker (ASCII, PDF-safe). */
export const SEVERITY_LABELS: Record<Severity, string> = {
  red: "RED - verified clinically concerning result",
  amber: "AMBER - verified cautionary finding, review required",
  normal: "NORMAL - within a verified reference interval",
  neutral: "NEUTRAL - not classified (insufficient or unverified evidence)",
};
export const SEVERITY_MARKERS: Record<Severity, string> = {
  red: "(!!) RED",
  amber: "(!) AMBER",
  normal: "(=) NORMAL",
  neutral: "(?) NEUTRAL",
};
export const SEVERITY_ORDER: readonly Severity[] = ["red", "amber", "normal", "neutral"];

export const NOT_HARMFUL_BY_CHANGE_TEXT =
  "A numerical increase or decrease is not classified as harmful or beneficial without an applicable, verified reference.";
export const SYNTHETIC_NON_CLINICAL_LABEL = "SYNTHETIC DEMO evidence - non-clinical, not production scientific validation";

export type InsufficientReason =
  | "no_verified_reference"
  | "unit_mismatch"
  | "ambiguous_unit"
  | "non_numeric_value"
  | "differing_repeats"
  | "conflicting_references"
  | "measurement_conditions_unverified"
  | "threshold_not_crossed"
  | "no_observation";

// ------------------------------------------------------------ verified reference registry

export interface VerifiedReference {
  id: string;
  environment: "production" | "synthetic_demo";
  /** Synthetic-demo references belong to exactly one mission; null for production. */
  missionId: string | null;
  metricId: string;
  /** Exact unit text; never converted or matched by synonym. */
  unit: string;
  domain: ResearcherDomain;
  kind: "reference_interval" | "decision_threshold";
  /** reference_interval: inclusive bounds (at least one). */
  lower?: number | null;
  upper?: number | null;
  /** decision_threshold: one-sided crossing. */
  threshold?: number | null;
  crossing?: "above" | "below" | null;
  inclusive?: boolean;
  /** What a value outside the interval / across the threshold means. */
  outsideSeverity: "cautionary" | "clinically_concerning";
  population: string;
  astronautApplicability: "validated_for_astronauts" | "terrestrial_with_stated_limitations";
  applicabilityNote: string;
  /** When documented, the observation must record the same specimen / method. */
  specimen: string | null;
  method: string | null;
  citation: { id: string; kind: CitationKind; title: string; locator: string; url: string | null };
  verification: { status: "VERIFIED"; verifiedBy: string; verifiedAt: string; verificationRef: string };
}

export interface ReferenceRegistry {
  schema: typeof REFERENCE_REGISTRY_SCHEMA;
  version: number;
  entries: VerifiedReference[];
  excluded: { id: string; reason: string }[];
}

const filled = (s: unknown, min = 1): s is string => typeof s === "string" && s.trim().length >= min;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Units that cannot be bound to one exact identity (e.g. "ng/mL ή nmol/L", "mg/dL or mmol/L"). */
export function isAmbiguousUnit(unit: string | null | undefined): boolean {
  if (!filled(unit)) return true;
  return /\s(?:or|ή|ή|oder|ou|o)\s|[|;,]|\s\/\s/i.test(unit);
}

function referenceProblem(e: Partial<VerifiedReference>): string | null {
  if (!filled(e.id)) return "missing id";
  if (e.environment !== "production" && e.environment !== "synthetic_demo") return "unknown environment";
  if (e.environment === "synthetic_demo" && !filled(e.missionId)) return "synthetic demo reference without mission";
  if (e.environment === "production" && e.missionId != null) return "production reference bound to a mission";
  if (!filled(e.metricId)) return "missing catalog ID";
  if (!filled(e.unit) || isAmbiguousUnit(e.unit)) return "missing or ambiguous unit";
  if (!(RESEARCHER_DOMAINS as readonly unknown[]).includes(e.domain)) return "unknown domain";
  if (e.kind === "reference_interval") {
    const lo = e.lower ?? null;
    const hi = e.upper ?? null;
    if (lo === null && hi === null) return "interval without bounds";
    if ((lo !== null && !finite(lo)) || (hi !== null && !finite(hi))) return "non-numeric bound";
    if (lo !== null && hi !== null && lo > hi) return "lower bound above upper bound";
  } else if (e.kind === "decision_threshold") {
    if (!finite(e.threshold)) return "threshold missing";
    if (e.crossing !== "above" && e.crossing !== "below") return "threshold crossing direction missing";
  } else return "unknown reference kind";
  if (e.outsideSeverity !== "cautionary" && e.outsideSeverity !== "clinically_concerning") return "unknown severity";
  if (!filled(e.population, 3)) return "population not documented";
  if (e.astronautApplicability !== "validated_for_astronauts" && e.astronautApplicability !== "terrestrial_with_stated_limitations")
    return "astronaut applicability not stated";
  if (!filled(e.applicabilityNote, 20)) return "applicability and limitations not explained";
  const c = e.citation;
  if (!c || !filled(c.id) || !filled(c.title, 3) || !filled(c.locator)) return "source citation incomplete";
  const v = e.verification;
  if (!v || v.status !== "VERIFIED" || !filled(v.verifiedBy, 2) || !filled(v.verificationRef, 3) || !filled(v.verifiedAt, 10))
    return "independent verification incomplete";
  return null;
}

/** Fail-closed validation: anything not fully traceable is excluded with a reason. */
export function validateReferenceRegistry(raw: unknown): ReferenceRegistry {
  const r = raw as { schema?: unknown; version?: unknown; entries?: unknown } | null;
  if (!r || r.schema !== REFERENCE_REGISTRY_SCHEMA || !Array.isArray(r.entries))
    return { schema: REFERENCE_REGISTRY_SCHEMA, version: 0, entries: [], excluded: [{ id: "*", reason: "registry schema invalid" }] };
  const entries: VerifiedReference[] = [];
  const excluded: ReferenceRegistry["excluded"] = [];
  const seen = new Set<string>();
  for (const e of r.entries as Partial<VerifiedReference>[]) {
    const problem = referenceProblem(e ?? {});
    if (problem) excluded.push({ id: filled(e?.id) ? e!.id! : "?", reason: problem });
    else if (seen.has(e.id!)) excluded.push({ id: e.id!, reason: "duplicate id" });
    else {
      seen.add(e.id!);
      entries.push(e as VerifiedReference);
    }
  }
  return { schema: REFERENCE_REGISTRY_SCHEMA, version: typeof r.version === "number" ? r.version : 0, entries, excluded };
}

let bundled: ReferenceRegistry | null = null;
export function bundledReferenceRegistry(): ReferenceRegistry {
  if (!bundled) bundled = validateReferenceRegistry(registryJson);
  return bundled;
}

// ------------------------------------------------------------ single-value classification

export interface ClassificationInput {
  metricId: string;
  unit: string;
  domain: ResearcherDomain;
  /** Value text exactly as recorded. */
  value: string | null;
  provenance: "synthetic" | "real";
  missionId: string;
  /** Latest examination holds repeated readings with different values. */
  differingRepeats?: boolean;
  /** Specimen / method recorded on the observation (report rows record neither today). */
  specimen?: string | null;
  method?: string | null;
  /** Approved adverse annotation marker for this record, if any (adverse-annotations.ts). */
  approvedAdverseMarker?: string | null;
}

export interface Classification {
  status: MeasurementStatus;
  severity: Severity;
  reason: InsufficientReason | "verified_reference" | "approved_adverse_rule";
  /** Plain explanation shared by screen, PDF and TXT. */
  explanation: string;
  reference: VerifiedReference | null;
  syntheticDemoReference: boolean;
}

const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function referenceRangeText(ref: VerifiedReference): string {
  if (ref.kind === "decision_threshold")
    return `decision threshold ${ref.crossing === "above" ? (ref.inclusive ? ">=" : ">") : ref.inclusive ? "<=" : "<"} ${ref.threshold} ${ref.unit}`;
  const lo = ref.lower ?? null;
  const hi = ref.upper ?? null;
  return lo !== null && hi !== null ? `reference interval ${lo}-${hi} ${ref.unit}` : lo !== null ? `reference interval >= ${lo} ${ref.unit}` : `reference interval <= ${hi} ${ref.unit}`;
}

export function referenceApplicabilityText(ref: VerifiedReference): string {
  return ref.astronautApplicability === "validated_for_astronauts"
    ? `Astronaut-applicable reference (${ref.population}). ${ref.applicabilityNote}`
    : `Terrestrial reference population (${ref.population}); applied to astronauts only with these stated limitations: ${ref.applicabilityNote}`;
}

const insufficient = (reason: InsufficientReason, explanation: string, reference: VerifiedReference | null = null): Classification => ({
  status: "insufficient_evidence",
  severity: "neutral",
  reason,
  explanation,
  reference,
  syntheticDemoReference: reference?.environment === "synthetic_demo",
});

/** Classify one recorded value. Pure; nothing outside the verified registry is ever used. */
export function classifyMeasurement(input: ClassificationInput, registry: ReferenceRegistry = bundledReferenceRegistry()): Classification {
  if (input.approvedAdverseMarker)
    return {
      status: "clinically_concerning",
      severity: "red",
      reason: "approved_adverse_rule",
      explanation: input.approvedAdverseMarker,
      reference: null,
      syntheticDemoReference: false,
    };
  if (input.value === null) return insufficient("no_observation", "No observation to classify.");
  if (isAmbiguousUnit(input.unit))
    return insufficient("ambiguous_unit", `The recorded unit "${input.unit}" is ambiguous; no reference is applied and the value is never converted.`);
  const applicable = registry.entries.filter(
    (r) =>
      r.metricId === input.metricId &&
      r.domain === input.domain &&
      (r.environment === "production" || (input.provenance === "synthetic" && r.missionId === input.missionId)),
  );
  const sameUnit = applicable.filter((r) => r.unit === input.unit);
  if (!sameUnit.length) {
    const other = [...new Set(applicable.map((r) => r.unit))].sort();
    return other.length
      ? insufficient("unit_mismatch", `A verified reference exists only in ${other.join(", ")}; it is not applied to ${input.unit} and the value is never converted.`)
      : insufficient("no_verified_reference", "No independently verified reference interval or decision threshold exists for this exact biomarker, unit and domain.");
  }
  if (sameUnit.length > 1)
    return insufficient("conflicting_references", `${sameUnit.length} verified references apply to this exact biomarker and unit; they are not reconciled automatically.`);
  const ref = sameUnit[0]!;
  if ((ref.specimen && ref.specimen !== input.specimen) || (ref.method && ref.method !== input.method))
    return insufficient(
      "measurement_conditions_unverified",
      `The verified reference applies to ${[ref.specimen && `specimen ${ref.specimen}`, ref.method && `method ${ref.method}`].filter(Boolean).join(" and ")}; the observation does not record a matching specimen/method, so applicability cannot be confirmed.`,
      ref,
    );
  if (input.differingRepeats)
    return insufficient("differing_repeats", "Repeated readings at the latest examination differ; none is selected for classification.", ref);
  const text = input.value.trim();
  if (!NUMERIC.test(text))
    return insufficient("non_numeric_value", `The recorded value "${input.value}" is not a plain number (comparators, ranges and text are kept as recorded and not classified).`, ref);
  const v = Number(text);
  const demo = ref.environment === "synthetic_demo";
  const tag = demo ? `${SYNTHETIC_NON_CLINICAL_LABEL}. ` : "";
  const range = referenceRangeText(ref);
  const concerning = ref.outsideSeverity === "clinically_concerning";
  const outside = (direction: "below" | "above"): Classification => ({
    status: concerning ? "clinically_concerning" : direction === "below" ? "below_verified_reference" : "above_verified_reference",
    severity: concerning ? "red" : "amber",
    reason: "verified_reference",
    explanation: `${tag}${text} ${ref.unit} is ${direction} the verified ${range} (${ref.citation.title}; verified by ${ref.verification.verifiedBy}, ${ref.verification.verificationRef}). ${concerning ? "The verified source classifies this as clinically concerning." : "The verified source classifies this as a cautionary finding requiring review."}`,
    reference: ref,
    syntheticDemoReference: demo,
  });
  if (ref.kind === "decision_threshold") {
    const t = ref.threshold!;
    const crossed = ref.crossing === "above" ? (ref.inclusive ? v >= t : v > t) : ref.inclusive ? v <= t : v < t;
    if (crossed) return outside(ref.crossing === "above" ? "above" : "below");
    return insufficient(
      "threshold_not_crossed",
      `${tag}${text} ${ref.unit} does not cross the verified ${range}. A threshold that is not crossed does not establish a normal result; no reference interval is verified.`,
      ref,
    );
  }
  if (ref.lower != null && v < ref.lower) return outside("below");
  if (ref.upper != null && v > ref.upper) return outside("above");
  return {
    status: "within_verified_reference",
    severity: "normal",
    reason: "verified_reference",
    explanation: `${tag}${text} ${ref.unit} is within the verified ${range} (${ref.citation.title}; verified by ${ref.verification.verifiedBy}, ${ref.verification.verificationRef}).`,
    reference: ref,
    syntheticDemoReference: demo,
  };
}

// ------------------------------------------------------------ per-biomarker assessment

export interface ExaminationRef {
  value: string;
  observedAt: string;
  precision: "date" | "instant";
  recordIds: string[];
}

export interface BiomarkerAssessment {
  key: string;
  domain: ResearcherDomain;
  domainLabel: string;
  metricId: string;
  name: string;
  /** Exact unit as recorded; never converted. */
  unit: string;
  provenance: "synthetic" | "real";
  latest: ExaminationRef;
  previous: ExaminationRef | null;
  change: { status: PairComparison["status"] | "no_previous"; absolute: number | null; percent: number | null; text: string };
  classification: Classification;
  statusLabel: string;
  severityLabel: string;
  marker: string;
  referenceText: string | null;
  applicabilityText: string | null;
  referenceCitation: string | null;
  /** What the biomarker measures (approved content) or the pending text. */
  explanation: string;
  higherValues: string | null;
  lowerValues: string | null;
  spaceflightContext: string | null;
  citations: string[];
  evidenceQuality: string;
  reviewerStatus: string;
  interpretationStatus: "approved" | "pending" | "revoked";
  /** Visible non-clinical label for synthetic-demo-only evidence. */
  nonClinicalLabel: string | null;
  limitations: string[];
  evidenceIds: string[];
}

export interface BiomarkerAssessmentReport {
  scope: UnifiedHealthReport["scope"];
  generatedAt: string;
  entries: BiomarkerAssessment[];
  counts: Record<Severity, number>;
  referenceRegistry: { version: number; verifiedEntries: number; excluded: number };
  policy: string[];
}

const cite = (claim: Claim, order: readonly string[]) =>
  claim.citationIds.length ? ` [${claim.citationIds.map((id) => order.indexOf(id) + 1).filter((n) => n > 0).join(", ")}]` : "";

function examination(p: ExamPoint): ExaminationRef {
  return { value: p.valueText, observedAt: p.at, precision: p.precision, recordIds: p.readings.map((r) => r.recordId) };
}

function approvedContent(r: ResolvedInterpretation | null) {
  return r && r.status === "approved" && r.content ? r : null;
}

export const ASSESSMENT_POLICY: readonly string[] = [
  "Colour and status come only from an applicable, independently verified reference interval or decision threshold for the exact biomarker, unit and domain, or from an approved adverse rule; everything else is NEUTRAL.",
  NOT_HARMFUL_BY_CHANGE_TEXT,
  "Units are never converted; a reference in another unit is not applied. Terrestrial references are applied to astronauts only with their stated applicability and limitations.",
  "No diagnosis is generated. A newly activated catalog biomarker does not acquire an approved interpretation automatically.",
];

function buildEntry(
  s: InterpretationSeries,
  domain: ResearcherDomain,
  scope: UnifiedHealthReport["scope"],
  rows: readonly ReportRow[],
  snapshot: InterpretationSnapshot,
  registry: ReferenceRegistry,
  adverse: AdverseResolution | null,
): BiomarkerAssessment {
  const points = s.longitudinal.points;
  const lastPoint = points.at(-1)!;
  const prevPoint = points.length >= 2 ? points.at(-2)! : null;
  const pair = s.longitudinal.consecutive.at(-1) ?? null;
  const latestAdverse = lastPoint.readings.map((r) => adverse?.accepted.get(r.recordId)).find((a) => a && !a.demonstration) ?? null;
  const classification = classifyMeasurement(
    {
      metricId: s.metricId,
      unit: s.unit,
      domain,
      value: lastPoint.repeat === "differing_repeats" ? null : lastPoint.valueText,
      provenance: scope.provenance,
      missionId: scope.missionId,
      differingRepeats: lastPoint.repeat === "differing_repeats",
      approvedAdverseMarker: latestAdverse?.marker ?? null,
    },
    registry,
  );
  // A differing-repeat examination is reported as such, never as "no observation".
  const finalClass: Classification =
    lastPoint.repeat === "differing_repeats" && classification.reason === "no_observation"
      ? { ...classification, reason: "differing_repeats", explanation: "Repeated readings at the latest examination differ; none is selected for classification." }
      : classification;

  const match = matchInterpretation(snapshot, { metricId: s.metricId, unit: s.unit, domain, missionId: scope.missionId, provenance: scope.provenance });
  const approved = approvedContent(match.exact);
  const order = approved?.citations.map((c) => c.id) ?? [];
  const c = approved?.content ?? null;
  const demoPrefix = approved?.synthetic ? `${SYNTHETIC_DEMO_INTERPRETATION_LABEL}. ` : "";
  const explanation = c?.function ? `${demoPrefix}${c.function.text}${cite(c.function, order)}` : `${PENDING_INTERPRETATION_TEXT}.`;
  const higherValues = c?.increaseContext ? `${demoPrefix}${c.increaseContext.text}${cite(c.increaseContext, order)}` : null;
  const lowerValues = c?.decreaseContext ? `${demoPrefix}${c.decreaseContext.text}${cite(c.decreaseContext, order)}` : null;
  const spaceflightContext =
    c?.spaceflightRelevance && c.spaceflightRelevance.evidenceScope !== "general_biomedical"
      ? `${demoPrefix}${c.spaceflightRelevance.text}${cite(c.spaceflightRelevance, order)}`
      : null;
  const syntheticDemo = s.metricId.startsWith("demo:") || Boolean(approved?.synthetic) || finalClass.syntheticDemoReference;
  const ref = finalClass.reference;
  const otherRows = rows.filter((r) => r.badge === domain && r.metricId === s.metricId && r.unit !== s.unit);
  const limitations = [
    ...(finalClass.severity === "neutral" ? [NOT_HARMFUL_BY_CHANGE_TEXT] : []),
    ...(ref ? [referenceApplicabilityText(ref)] : []),
    s.longitudinal.compatibility.statement,
    ...(c?.limitations ?? []),
    ...(otherRows.length ? [`Also recorded in ${[...new Set(otherRows.map((r) => r.unit))].sort().join(", ")}; listed separately and never converted.`] : []),
    ...s.limitations,
  ];
  return {
    key: `${domain}|${s.metricId}|${s.unit}`,
    domain,
    domainLabel: RESEARCHER_DOMAIN_LABELS[domain],
    metricId: s.metricId,
    name: s.label,
    unit: s.unit,
    provenance: scope.provenance,
    latest: examination(lastPoint),
    previous: prevPoint ? examination(prevPoint) : null,
    change: pair
      ? { status: pair.status, absolute: pair.absolute, percent: pair.percent, text: pair.text }
      : { status: "no_previous", absolute: null, percent: null, text: "No previous comparable measurement in the same exact unit." },
    classification: finalClass,
    statusLabel: MEASUREMENT_STATUS_LABELS[finalClass.status],
    severityLabel: SEVERITY_LABELS[finalClass.severity],
    marker: SEVERITY_MARKERS[finalClass.severity],
    referenceText: ref ? `${referenceRangeText(ref)}${ref.environment === "synthetic_demo" ? " (SYNTHETIC DEMO reference)" : ""}` : null,
    applicabilityText: ref ? referenceApplicabilityText(ref) : null,
    referenceCitation: ref ? `${ref.citation.title} - ${ref.citation.locator}${ref.citation.url ? ` ${ref.citation.url}` : ""}; verified by ${ref.verification.verifiedBy} on ${ref.verification.verifiedAt} (${ref.verification.verificationRef})` : null,
    explanation,
    higherValues,
    lowerValues,
    spaceflightContext,
    citations: approved ? citationLines(approved.citations) : [],
    evidenceQuality: approved ? `${EVIDENCE_LEVEL_LABELS[approved.evidenceStrength.level]} - ${approved.evidenceStrength.basis}` : "Not assessed (no approved interpretation).",
    reviewerStatus: s.interpretation.statusLine,
    interpretationStatus: s.interpretation.status,
    nonClinicalLabel: syntheticDemo ? SYNTHETIC_NON_CLINICAL_LABEL : null,
    limitations: [...new Set(limitations)],
    evidenceIds: s.evidenceIds,
  };
}

/** Build the assessment from the already-built shared interpretation model (same snapshot as the screen). */
export function buildBiomarkerAssessment(
  report: UnifiedHealthReport,
  model: ResearcherInterpretationModel,
  snapshot: InterpretationSnapshot = registryInterpretationSnapshot(),
  options: { registry?: ReferenceRegistry; adverse?: AdverseResolution | null } = {},
): BiomarkerAssessmentReport {
  const registry = options.registry ?? bundledReferenceRegistry();
  const entries = model.domains.flatMap((d) =>
    d.series.filter((s) => s.longitudinal.points.length > 0).map((s) => buildEntry(s, d.domain, report.scope, report.rows, snapshot, registry, options.adverse ?? null)),
  );
  entries.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.classification.severity) - SEVERITY_ORDER.indexOf(b.classification.severity) ||
      RESEARCHER_DOMAINS.indexOf(a.domain) - RESEARCHER_DOMAINS.indexOf(b.domain) ||
      a.metricId.localeCompare(b.metricId) ||
      a.unit.localeCompare(b.unit),
  );
  const counts: Record<Severity, number> = { red: 0, amber: 0, normal: 0, neutral: 0 };
  for (const e of entries) counts[e.classification.severity]++;
  return {
    scope: report.scope,
    generatedAt: report.generatedAt,
    entries,
    counts,
    referenceRegistry: { version: registry.version, verifiedEntries: registry.entries.length, excluded: registry.excluded.length },
    policy: [...ASSESSMENT_POLICY],
  };
}

/** Status for one series in module history views (same rule as the report). */
export function seriesClassification(
  s: InterpretationSeries,
  domain: ResearcherDomain,
  scope: Pick<UnifiedHealthReport["scope"], "missionId" | "provenance">,
  registry: ReferenceRegistry = bundledReferenceRegistry(),
): Classification {
  const last = s.longitudinal.points.at(-1);
  return classifyMeasurement(
    {
      metricId: s.metricId,
      unit: s.unit,
      domain,
      value: last && last.repeat !== "differing_repeats" ? last.valueText : null,
      provenance: scope.provenance,
      missionId: scope.missionId,
      differingRepeats: last?.repeat === "differing_repeats",
    },
    registry,
  );
}

export function severityCountsLine(a: BiomarkerAssessmentReport): string {
  return `${a.entries.length} biomarker(s): ${a.counts.red} RED, ${a.counts.amber} AMBER, ${a.counts.normal} NORMAL, ${a.counts.neutral} NEUTRAL. Verified references available: ${a.referenceRegistry.verifiedEntries}.`;
}

const when = (e: ExaminationRef) => `${e.observedAt}${e.precision === "date" ? " (date only)" : ""}`;

/** Plain-text lines for one biomarker, shared by the PDF bullets and TXT export. */
export function biomarkerAssessmentLines(e: BiomarkerAssessment): string[] {
  return [
    `${e.marker} ${e.name}${e.name !== e.metricId ? ` (${e.metricId})` : ""} [${e.unit}] - ${e.domainLabel}: ${e.latest.value} ${e.unit} on ${when(e.latest)}. Status: ${e.statusLabel}.`,
    ...(e.nonClinicalLabel ? [`  ${e.nonClinicalLabel}.`] : []),
    `  Previous comparable: ${e.previous ? `${e.previous.value} ${e.unit} on ${when(e.previous)}` : "none"}. Change: ${e.change.text}`,
    `  Classification basis: ${e.classification.explanation}`,
    `  Reference: ${e.referenceText ?? "none verified"}${e.referenceCitation ? `; source ${e.referenceCitation}` : ""}.`,
    `  What it measures: ${e.explanation}`,
    `  Higher values: ${e.higherValues ?? "no approved, cited context."}`,
    `  Lower values: ${e.lowerValues ?? "no approved, cited context."}`,
    `  Spaceflight context: ${e.spaceflightContext ?? "no independently supported spaceflight-specific context."}`,
    `  Citations: ${e.citations.length ? e.citations.join("; ") : "none"}. Evidence quality: ${e.evidenceQuality}`,
    `  Reviewer status: ${e.reviewerStatus}`,
    ...e.limitations.map((l) => `  Limitation: ${l}`),
    `  Evidence: ${e.evidenceIds.join(", ")}.`,
  ];
}

export function biomarkerAssessmentPlainText(a: BiomarkerAssessmentReport): string {
  return [
    "BIOMARKER HEALTH ASSESSMENT — RESEARCH ONLY, NOT A DIAGNOSIS",
    severityCountsLine(a),
    "Severity key: " + SEVERITY_ORDER.map((s) => `${SEVERITY_MARKERS[s]} = ${SEVERITY_LABELS[s]}`).join("; ") + ".",
    ...a.policy.map((p) => `- ${p}`),
    ...(a.entries.length ? a.entries.flatMap(biomarkerAssessmentLines) : ["No included biomarker observations in this scope."]),
  ].join("\n");
}
