/**
 * P57 — Scientific Evidence and Reference Criteria Registry (pure, offline).
 *
 * Versioned, fail-closed registry of biomarker-specific criteria
 * (data/scientific/p57-reference-criteria.v1.json). Every entry binds an exact
 * catalog ID + exact unit, documents population, demographic conditions,
 * specimen/method, bands with their meaning, limitations, source provenance,
 * evidence quality, source verification, applicability and audit history.
 *
 * Criterion kinds are never interchangeable: a reference interval is not a
 * diagnostic threshold, a risk category is not a reference interval, and
 * longitudinal review rules (P56.1) never set clinical colour.
 *
 * A criterion classifies a value ONLY when:
 *   1. a Researcher approved its exact fingerprint (server-attested, see
 *      p57-criteria-review.ts) for the report's mission,
 *   2. every mission-level applicability condition was attested in that
 *      approval and every per-observation condition is recorded,
 *   3. no data-quality hold applies to the series,
 *   4. the recorded value is a plain number in the exact unit (never converted),
 *   5. all approved, applicable criteria for the identity agree.
 * Otherwise the result is NEUTRAL with the precise reason.
 */
import registryJson from "../../../data/scientific/p57-reference-criteria.v1.json";
import { canonicalJson } from "./observation-envelope";
import { sha256Hex } from "./catalog-lifecycle";
import type { ResearcherDomain } from "./researcher-interpretation";

export const CRITERIA_SCHEMA = "mitochondria.p57-reference-criteria.v1" as const;

export type CriterionKind =
  | "reference_interval"
  | "diagnostic_threshold"
  | "risk_category"
  | "action_threshold"
  | "critical_limit"
  | "longitudinal_review_rule"
  | "mission_operational_limit";
export const CRITERION_KINDS: readonly CriterionKind[] = [
  "reference_interval",
  "diagnostic_threshold",
  "risk_category",
  "action_threshold",
  "critical_limit",
  "longitudinal_review_rule",
  "mission_operational_limit",
];
export const CRITERION_KIND_LABELS: Record<CriterionKind, string> = {
  reference_interval: "Reference interval",
  diagnostic_threshold: "Diagnostic threshold",
  risk_category: "Risk category",
  action_threshold: "Action threshold",
  critical_limit: "Critical limit",
  longitudinal_review_rule: "Longitudinal review rule",
  mission_operational_limit: "Mission operational limit",
};

export type BandSeverity = "red" | "amber" | "normal" | "none";
export interface CriterionBand {
  id: string;
  label: string;
  lower: number | null;
  lowerInclusive: boolean;
  upper: number | null;
  upperInclusive: boolean;
  severity: BandSeverity;
  direction: "above" | "below" | "within";
  meaning: string;
}
export interface ApplicabilityCondition {
  id: string;
  text: string;
}
export interface ReferenceCriterion {
  id: string;
  kind: CriterionKind;
  title: string;
  domain: ResearcherDomain;
  identity: { catalogId: string | null; catalogName: string; unit: string; status: "EXACT_CATALOG_UNIT" | "NO_CATALOG_IDENTITY" };
  specimen: string | null;
  method: string | null;
  population: string;
  demographicConditions: string[];
  bands: CriterionBand[];
  uncoveredMeaning: string;
  highValues: string;
  lowValues: string;
  limitations: string[];
  confirmation: string;
  applicability: { missionLevel: ApplicabilityCondition[]; perObservation: ApplicabilityCondition[] };
  source: { sourceId: string; locator: string; quote: string };
  evidenceQuality: string;
  sourceVerification: { status: "SOURCE_WORDING_VERIFIED"; retrievedAt: string; method: string; verifiedBy: string };
  astronautApplicability: "terrestrial_with_stated_limitations" | "validated_for_astronauts";
  astronautNote: string;
  audit: { at: string; event: string; by: string; note: string }[];
}
export interface CriteriaSource {
  id: string;
  organization: string;
  publication: string;
  title: string;
  url: string;
  doi: string | null;
  publicationDate: string;
  documentType: string;
  retrievedAt: string;
}
export interface RetrievalRecord {
  organization: string;
  url: string | null;
  retrievedAt: string;
  biomarkers: string[];
  outcome: string;
  note: string;
}
export interface CriteriaRegistry {
  schema: typeof CRITERIA_SCHEMA;
  version: number;
  status: string;
  kinds: Record<string, string>;
  sources: CriteriaSource[];
  criteria: ReferenceCriterion[];
  retrievalRecords: RetrievalRecord[];
  excluded: { id: string; reason: string }[];
}

const DOMAINS = ["bone", "cardiovascular", "immune", "behavioral"] as const;
const filled = (s: unknown, min = 1): s is string => typeof s === "string" && s.trim().length >= min;
const finiteOrNull = (n: unknown): n is number | null => n === null || (typeof n === "number" && Number.isFinite(n));
const DOSE = /\b\d+(?:\.\d+)?\s*(?:mg|µg|μg|mcg|iu)\b(?!\/)|\bdose of\b|\bprescribe\b/i;
/** Same rule as P54: combined units ("ng/mL ή nmol/L", "mg/dL or mmol/L") cannot bind one identity. */
export const isAmbiguousCriterionUnit = (u: unknown) => !filled(u) || /\s(?:or|ή|oder|ou|o)\s|[|;,]|\s\/\s/i.test(u as string);

function bandProblem(b: Partial<CriterionBand>): string | null {
  if (!filled(b.id) || !filled(b.label, 3) || !filled(b.meaning, 10)) return "band without id, label or meaning";
  if (!finiteOrNull(b.lower) || !finiteOrNull(b.upper)) return "non-numeric band bound";
  if (b.lower === null && b.upper === null) return "band without bounds";
  if (b.lower !== null && b.upper !== null && b.lower! > b.upper!) return "band lower bound above upper bound";
  if (typeof b.lowerInclusive !== "boolean" || typeof b.upperInclusive !== "boolean") return "band inclusiveness missing";
  if (!["red", "amber", "normal", "none"].includes(b.severity as string)) return "unknown band severity";
  if (!["above", "below", "within"].includes(b.direction as string)) return "unknown band direction";
  return null;
}

/** Inclusive/exclusive membership of one value in one band. */
export function inBand(b: CriterionBand, v: number): boolean {
  if (b.lower !== null && (b.lowerInclusive ? v < b.lower : v <= b.lower)) return false;
  if (b.upper !== null && (b.upperInclusive ? v > b.upper : v >= b.upper)) return false;
  return true;
}

function overlap(a: CriterionBand, b: CriterionBand): boolean {
  // Probe the boundaries and midpoints of both bands; bands of one criterion must be disjoint.
  const probes = [a.lower, a.upper, b.lower, b.upper].filter((x): x is number => x !== null);
  const pts = new Set<number>();
  for (const p of probes) for (const d of [-1e-6, 0, 1e-6]) pts.add(p + d);
  if (a.lower !== null && a.upper !== null) pts.add((a.lower + a.upper) / 2);
  if (b.lower !== null && b.upper !== null) pts.add((b.lower + b.upper) / 2);
  return [...pts].some((v) => inBand(a, v) && inBand(b, v));
}

function criterionProblem(c: Partial<ReferenceCriterion>, sources: ReadonlySet<string>): string | null {
  if (!filled(c.id, 3)) return "missing id";
  if (!CRITERION_KINDS.includes(c.kind as CriterionKind)) return "unknown criterion kind";
  if (c.kind === "longitudinal_review_rule") return "longitudinal review rules live in the P56.1 rules file and are never classification criteria";
  if (!filled(c.title, 5)) return "missing title";
  if (!(DOMAINS as readonly unknown[]).includes(c.domain)) return "unknown domain";
  const id = c.identity;
  if (!id || !filled(id.catalogName) || isAmbiguousCriterionUnit(id.unit)) return "identity name or exact unit missing/ambiguous";
  if (id.status === "EXACT_CATALOG_UNIT" ? !filled(id.catalogId) : id.status === "NO_CATALOG_IDENTITY" ? id.catalogId !== null : true)
    return "identity status inconsistent with catalog ID";
  if (typeof id.catalogId === "string" && id.catalogId.startsWith("demo:")) return "synthetic demonstration identities never carry production criteria";
  if (!filled(c.population, 3)) return "population not documented";
  if (!Array.isArray(c.demographicConditions)) return "demographic conditions missing";
  if (!Array.isArray(c.bands) || !c.bands.length) return "no bands";
  for (const b of c.bands) {
    const p = bandProblem(b);
    if (p) return p;
  }
  for (let i = 0; i < c.bands.length; i++) for (let j = i + 1; j < c.bands.length; j++) if (overlap(c.bands[i]!, c.bands[j]!)) return "overlapping bands";
  if (!filled(c.uncoveredMeaning, 10) || !filled(c.highValues, 5) || !filled(c.lowValues, 5)) return "interpretation of high/low/uncovered values missing";
  if (!Array.isArray(c.limitations) || !c.limitations.length) return "limitations missing";
  if (!filled(c.confirmation, 10)) return "confirmation requirement missing";
  const ap = c.applicability;
  if (!ap || !Array.isArray(ap.missionLevel) || !Array.isArray(ap.perObservation)) return "applicability missing";
  for (const x of [...ap.missionLevel, ...ap.perObservation]) if (!filled(x?.id) || !filled(x?.text, 10)) return "applicability condition incomplete";
  const s = c.source;
  if (!s || !sources.has(s.sourceId) || !filled(s.locator, 3) || !filled(s.quote, 10)) return "source provenance incomplete";
  if (!filled(c.evidenceQuality, 5)) return "evidence quality missing";
  const v = c.sourceVerification;
  if (!v || v.status !== "SOURCE_WORDING_VERIFIED" || !filled(v.retrievedAt, 10) || !filled(v.method, 10) || !filled(v.verifiedBy, 5)) return "source verification incomplete";
  if (c.astronautApplicability !== "terrestrial_with_stated_limitations" && c.astronautApplicability !== "validated_for_astronauts") return "astronaut applicability missing";
  if (!filled(c.astronautNote, 10)) return "astronaut applicability note missing";
  if (!Array.isArray(c.audit) || !c.audit.length) return "audit history missing";
  const text = JSON.stringify([c.bands, c.highValues, c.lowValues, c.limitations, c.confirmation]);
  if (DOSE.test(text)) return "contains a medication dose";
  return null;
}

/** Fail-closed validation; anything incomplete is excluded with its reason and never applied. */
export function validateCriteriaRegistry(raw: unknown): CriteriaRegistry {
  const r = raw as Partial<CriteriaRegistry> & { criteria?: unknown; sources?: unknown } | null;
  const empty: CriteriaRegistry = { schema: CRITERIA_SCHEMA, version: 0, status: "INVALID", kinds: {}, sources: [], criteria: [], retrievalRecords: [], excluded: [{ id: "*", reason: "registry schema invalid" }] };
  if (!r || r.schema !== CRITERIA_SCHEMA || !Array.isArray(r.criteria) || !Array.isArray(r.sources)) return empty;
  const sources = (r.sources as CriteriaSource[]).filter((s) => filled(s?.id) && filled(s?.organization) && filled(s?.title) && filled(s?.url) && filled(s?.publicationDate));
  const ids = new Set(sources.map((s) => s.id));
  const criteria: ReferenceCriterion[] = [];
  const excluded: CriteriaRegistry["excluded"] = [];
  const seen = new Set<string>();
  for (const c of r.criteria as Partial<ReferenceCriterion>[]) {
    const problem = criterionProblem(c ?? {}, ids);
    if (problem) excluded.push({ id: filled(c?.id) ? c!.id! : "?", reason: problem });
    else if (seen.has(c.id!)) excluded.push({ id: c.id!, reason: "duplicate id" });
    else {
      seen.add(c.id!);
      criteria.push(c as ReferenceCriterion);
    }
  }
  return {
    schema: CRITERIA_SCHEMA,
    version: typeof r.version === "number" ? r.version : 0,
    status: typeof r.status === "string" ? r.status : "UNKNOWN",
    kinds: (r.kinds as Record<string, string>) ?? {},
    sources,
    criteria,
    retrievalRecords: Array.isArray(r.retrievalRecords) ? (r.retrievalRecords as RetrievalRecord[]) : [],
    excluded,
  };
}

let bundled: CriteriaRegistry | null = null;
export function bundledCriteriaRegistry(): CriteriaRegistry {
  if (!bundled) bundled = validateCriteriaRegistry(registryJson);
  return bundled;
}
export const bundledCriteriaJson = (): unknown => registryJson;

/** SHA-256 over the canonical criterion without its audit trail: approvals bind exact content. */
export async function criterionFingerprint(c: ReferenceCriterion): Promise<string> {
  const { audit: _audit, ...content } = c;
  return sha256Hex(canonicalJson(content));
}

/** Why a criterion cannot be approved at all (null when approvable). */
export function approvalBlocker(c: ReferenceCriterion): string | null {
  if (c.identity.status !== "EXACT_CATALOG_UNIT" || !c.identity.catalogId)
    return "No exact catalog identity exists for this biomarker and unit; an approved catalog identity is required first.";
  if (c.sourceVerification.status !== "SOURCE_WORDING_VERIFIED") return "Source wording is not verified.";
  return null;
}

export function sourceOf(c: ReferenceCriterion, registry: CriteriaRegistry = bundledCriteriaRegistry()): CriteriaSource | null {
  return registry.sources.find((s) => s.id === c.source.sourceId) ?? null;
}

export function bandRangeText(b: CriterionBand, unit: string): string {
  const lo = b.lower !== null ? `${b.lowerInclusive ? "≥" : ">"}${b.lower}` : null;
  const hi = b.upper !== null ? `${b.upperInclusive ? "≤" : "<"}${b.upper}` : null;
  if (lo && hi && b.lowerInclusive && b.upperInclusive) return `${b.lower}–${b.upper} ${unit}`;
  return `${[lo, hi].filter(Boolean).join(" and ")} ${unit}`;
}

// ------------------------------------------------------------ approved criteria and classification

export interface ApprovedCriterion {
  criterion: ReferenceCriterion;
  fingerprint: string;
  /** Missions this approval covers, with the mission-level conditions the Researcher attested. */
  missions: { missionId: string; conditions: string[] }[];
  approvedAt: string;
  approverUserId: string;
  /** Short, display-safe reference to the attested approval event. */
  approvalRef: string;
}

export interface CriteriaContext {
  metricId: string;
  unit: string;
  domain: ResearcherDomain;
  /** Value text exactly as recorded (null when no single value can be selected). */
  value: string | null;
  provenance: "synthetic" | "real";
  missionId: string;
  /** Reasons that block classification for this series (e.g. measurement-consistency check). */
  holds: readonly string[];
  /** Per-observation conditions recorded on the observation (none are captured by intake today). */
  observationConditions?: readonly string[];
}

export type CriteriaOutcome = "no_candidate" | "pending_approval" | "not_applicable" | "held" | "non_numeric" | "outside_bands" | "conflict" | "classified";

export interface CriterionEvaluation {
  criterionId: string;
  title: string;
  kind: CriterionKind;
  sourceLabel: string;
  outcome: "classified" | "outside_bands" | "not_applicable" | "held" | "non_numeric";
  band: CriterionBand | null;
  missing: string[];
  text: string;
}

export interface CriteriaClassification {
  outcome: CriteriaOutcome;
  severity: "red" | "amber" | "normal" | "neutral";
  direction: "above" | "below" | "within" | null;
  explanation: string;
  /** Short reference text, e.g. "Prediabetes range (ADA Table 2.2): 5.7–6.4 %". */
  referenceText: string | null;
  bandLabel: string | null;
  candidates: { id: string; title: string; kind: CriterionKind; source: string }[];
  evaluations: CriterionEvaluation[];
  used: { id: string; title: string; kind: CriterionKind; source: string; approvalRef: string; locator: string; url: string | null }[];
}

const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const sourceLabel = (c: ReferenceCriterion, registry: CriteriaRegistry) => {
  const s = sourceOf(c, registry);
  return s ? `${s.organization} — ${s.title} (${s.publicationDate})` : c.source.sourceId;
};

export function candidateCriteriaFor(metricId: string, unit: string, domain: ResearcherDomain, registry: CriteriaRegistry = bundledCriteriaRegistry()) {
  return registry.criteria.filter((c) => c.identity.catalogId === metricId && c.identity.unit === unit && c.domain === domain);
}

function evaluate(a: ApprovedCriterion, ctx: CriteriaContext, registry: CriteriaRegistry): CriterionEvaluation {
  const c = a.criterion;
  const base = { criterionId: c.id, title: c.title, kind: c.kind, sourceLabel: sourceLabel(c, registry) };
  const mission = a.missions.find((m) => m.missionId === ctx.missionId);
  if (!mission) return { ...base, outcome: "not_applicable", band: null, missing: ["approval for this mission"], text: `${c.title}: approved, but not for this mission; not applied.` };
  const missing = [
    ...c.applicability.missionLevel.filter((x) => !mission.conditions.includes(x.id)).map((x) => x.text),
    ...c.applicability.perObservation.filter((x) => !(ctx.observationConditions ?? []).includes(x.id)).map((x) => x.text),
  ];
  if (missing.length)
    return { ...base, outcome: "not_applicable", band: null, missing, text: `${c.title}: not applicable — not recorded: ${missing.join("; ")}` };
  if (ctx.holds.length) return { ...base, outcome: "held", band: null, missing: [], text: `${c.title}: held — ${ctx.holds.join("; ")}` };
  const text = ctx.value?.trim() ?? "";
  if (!NUMERIC.test(text)) return { ...base, outcome: "non_numeric", band: null, missing: [], text: `${c.title}: the recorded value "${ctx.value ?? ""}" is not a plain number; not compared.` };
  const v = Number(text);
  const band = c.bands.find((b) => inBand(b, v)) ?? null;
  if (!band) return { ...base, outcome: "outside_bands", band: null, missing: [], text: `${c.title}: ${text} ${c.identity.unit} — ${c.uncoveredMeaning}` };
  return { ...base, outcome: "classified", band, missing: [], text: `${text} ${c.identity.unit}: ${band.label} (${bandRangeText(band, c.identity.unit)}). ${band.meaning}` };
}

/** Classify one recorded value against approved, applicable criteria. Pure and deterministic. */
export function classifyWithCriteria(
  ctx: CriteriaContext,
  approved: readonly ApprovedCriterion[],
  registry: CriteriaRegistry = bundledCriteriaRegistry(),
): CriteriaClassification {
  const candidates = candidateCriteriaFor(ctx.metricId, ctx.unit, ctx.domain, registry);
  const cand = candidates.map((c) => ({ id: c.id, title: c.title, kind: c.kind, source: sourceLabel(c, registry) }));
  const neutral = (outcome: CriteriaOutcome, explanation: string, evaluations: CriterionEvaluation[] = []): CriteriaClassification => ({
    outcome, severity: "neutral", direction: null, explanation, referenceText: null, bandLabel: null, candidates: cand, evaluations, used: [],
  });
  if (!candidates.length) {
    const other = [...new Set(registry.criteria.filter((c) => c.identity.catalogId === ctx.metricId && c.domain === ctx.domain).map((c) => c.identity.unit))];
    return neutral(
      "no_candidate",
      other.length
        ? `Candidate criteria exist only in ${other.join(", ")}; they are never applied to ${ctx.unit} and values are never converted.`
        : "No reference criterion has been retrieved for this exact biomarker and unit.",
    );
  }
  const ids = new Set(candidates.map((c) => c.id));
  const mine = approved.filter((a) => ids.has(a.criterion.id));
  if (!mine.length)
    return neutral("pending_approval", `${candidates.length} candidate criteri${candidates.length === 1 ? "on" : "a"} (${cand.map((c) => c.source.split(" — ")[0]).join("; ")}) ${candidates.length === 1 ? "is" : "are"} pending Researcher approval and not applied.`);
  const evals = mine.map((a) => evaluate(a, ctx, registry));
  const classified = evals.filter((e) => e.outcome === "classified");
  if (!classified.length) {
    const held = evals.find((e) => e.outcome === "held");
    if (held) return neutral("held", `Approved criteria are held: ${ctx.holds.join("; ")}`, evals);
    const na = evals.filter((e) => e.outcome === "not_applicable");
    if (na.length === evals.length) return neutral("not_applicable", `Approved criteria do not apply: ${[...new Set(na.flatMap((e) => e.missing))].join("; ")}.`, evals);
    const nn = evals.find((e) => e.outcome === "non_numeric");
    if (nn) return neutral("non_numeric", nn.text, evals);
    return neutral("outside_bands", evals.map((e) => e.text).join(" "), evals);
  }
  const severities = new Set(classified.map((e) => (e.band!.severity === "none" ? "neutral" : e.band!.severity)));
  if (severities.size > 1)
    return neutral("conflict", `Approved criteria disagree for this value (${classified.map((e) => `${e.band!.label}`).join(" vs ")}); they are not reconciled automatically.`, evals);
  const primary = classified[0]!;
  const sev = [...severities][0] as CriteriaClassification["severity"];
  const used = classified.map((e) => {
    const a = mine.find((x) => x.criterion.id === e.criterionId)!;
    const s = sourceOf(a.criterion, registry);
    return { id: a.criterion.id, title: a.criterion.title, kind: a.criterion.kind, source: e.sourceLabel, approvalRef: a.approvalRef, locator: a.criterion.source.locator, url: s?.url ?? null };
  });
  const demo = ctx.provenance === "synthetic" ? "Synthetic demonstration data. " : "";
  return {
    outcome: "classified",
    severity: sev,
    direction: sev === "neutral" ? null : primary.band!.direction,
    explanation: `${demo}${primary.text} Source: ${used.map((u) => `${u.source}, ${u.locator}`).join("; ")}. Approved by a Researcher (${used.map((u) => u.approvalRef).join(", ")}); not a diagnosis.`,
    referenceText: classified.map((e) => `${e.band!.label}: ${bandRangeText(e.band!, ctx.unit)}`).join("; "),
    bandLabel: primary.band!.label,
    candidates: cand,
    evaluations: evals,
    used,
  };
}

// ------------------------------------------------------------ registry overview

export interface RegistryOverview {
  version: number;
  criteria: number;
  byKind: Record<CriterionKind, number>;
  withCatalogIdentity: number;
  withoutCatalogIdentity: number;
  sources: number;
  retrievalWithoutCriterion: number;
  excluded: number;
}

export function registryOverview(registry: CriteriaRegistry = bundledCriteriaRegistry()): RegistryOverview {
  const byKind = Object.fromEntries(CRITERION_KINDS.map((k) => [k, 0])) as Record<CriterionKind, number>;
  for (const c of registry.criteria) byKind[c.kind]++;
  return {
    version: registry.version,
    criteria: registry.criteria.length,
    byKind,
    withCatalogIdentity: registry.criteria.filter((c) => c.identity.status === "EXACT_CATALOG_UNIT").length,
    withoutCatalogIdentity: registry.criteria.filter((c) => c.identity.status === "NO_CATALOG_IDENTITY").length,
    sources: registry.sources.length,
    retrievalWithoutCriterion: registry.retrievalRecords.length,
    excluded: registry.excluded.length,
  };
}
