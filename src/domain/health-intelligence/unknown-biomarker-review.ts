/**
 * Unknown Biomarker Review & Catalog Extension — governed, research-only workflow.
 *
 * Pure and deterministic. Groups review-only Unified Intake rows (unclassified,
 * ambiguous, unit-mismatched) into catalog review terms with source evidence,
 * records append-only reviewer decisions (ground-medical role only), drafts
 * versioned catalog-extension proposals that always stay PENDING_NIKOLAS_REVIEW,
 * and re-evaluates candidates only against extensions that the governed
 * registry (data/scientific/catalog-extensions.v1.json) records as approved.
 *
 * Never auto-approves, never converts units, never rewrites stored records and
 * never transmits anything.
 */
import p36Registry from "../../../data/scientific/p36-biomarker-source-registry.v1.json";
import governedRegistry from "../../../data/scientific/catalog-extensions.v1.json";
import {
  classifyIntakeObservation,
  type IntakeClassification,
} from "@/domain/health-domains/unified-intake-classification";
import { domainForMetric } from "@/domain/health-domains/document-domain-projection";
import type { HealthDomainId } from "@/domain/health-domains/registry";
import {
  canonicalCatalogEntry,
  recognizeBiomarker,
  type EvaluatedCatalog,
  type Provenance,
} from "./catalog-lifecycle";
import { getActiveCatalog } from "./active-catalog-runtime";
import { getSyntheticDemoCatalogs } from "./synthetic-demo-catalog-runtime";
import {
  canonicalSyntheticDemoEntry,
  recognizeSyntheticDemo,
  syntheticDemoBasisFor,
  type EvaluatedDemoCatalog,
  type SyntheticDemoCatalogBasis,
  type SyntheticDemoRecognition,
} from "./synthetic-demo-catalog";

/**
 * SYNTHETIC DEMO coverage of an examination row: the recognition that made the
 * row match an activated mission-scoped demo entry, or null (no demo match, or
 * the handbook / governed / production catalogs already matched it).
 */
export function syntheticDemoCoverage(
  input: GovernedClassificationInput,
  catalogs: ReadonlyMap<string, EvaluatedDemoCatalog> = getSyntheticDemoCatalogs(),
): SyntheticDemoRecognition | null {
  const r = classifyWithGovernedExtensions(input, undefined, undefined, catalogs);
  if (!r.syntheticDemo || input.identity === "canonical") return null;
  const hit = recognizeSyntheticDemo(input, catalogs);
  return hit.status === "SYNTHETIC_DEMO_RECOGNIZED" ? hit : null;
}

/**
 * Mission-scoped SYNTHETIC DEMO stage, applied only after the handbook, governed
 * extensions and production catalog produced no match. It may resolve a
 * unit-review / ambiguous / unclassified handbook outcome (an explicitly
 * activated demo entry is never silently suppressed by a near-miss handbook
 * entry such as bone-019), but never replaces an exact handbook or validated match.
 */
function classifySyntheticDemo(
  input: GovernedClassificationInput,
  catalogs: ReadonlyMap<string, EvaluatedDemoCatalog>,
): ExtendedClassification | null {
  if (input.provenance !== "synthetic" || !input.missionId) return null;
  const matched = (
    e: { demoId: string; domain: HealthDomainId },
    basis: SyntheticDemoCatalogBasis,
  ) => ({
    classification: {
      status: "matched" as const,
      metricId: e.demoId,
      domain: e.domain,
      originalLabel: input.label.trim(),
      originalUnit: input.unit.trim(),
      reviewRequired: true as const,
    },
    extension: null,
    syntheticDemo: basis,
  });
  if (input.identity === "canonical") {
    const e = canonicalSyntheticDemoEntry(
      {
        demoId: input.label.trim(),
        unit: input.unit,
        missionId: input.missionId,
        provenance: input.provenance,
      },
      catalogs,
      input.includeRevoked === true,
    );
    return e ? matched(e, syntheticDemoBasisFor(e, e.activation.demoCatalogVersion)) : null;
  }
  const r = recognizeSyntheticDemo(input, catalogs);
  if (r.status !== "SYNTHETIC_DEMO_RECOGNIZED") return null;
  const e = catalogs.get(r.missionId)?.active.find((x) => x.demoId === r.demoId);
  // P39: an explicit source section naming another domain is incompatible; the row
  // stays review-only instead of being attributed to the activated entry's domain.
  if (e && input.sourceDomain && input.sourceDomain !== e.domain) return null;
  return e ? matched(e, syntheticDemoBasisFor(e, r.demoCatalogVersion)) : null;
}

/**
 * P39: the activated SYNTHETIC DEMO entry a row would match by label and exact
 * unit but whose domain differs from the row's explicit source section, or null.
 */
export function syntheticDemoSectionConflict(
  input: GovernedClassificationInput,
  catalogs: ReadonlyMap<string, EvaluatedDemoCatalog> = getSyntheticDemoCatalogs(),
): {
  demoId: string;
  displayName: string;
  entryDomain: HealthDomainId;
  sourceDomain: HealthDomainId;
} | null {
  if (!input.sourceDomain || input.identity === "canonical") return null;
  const c = classifyWithGovernedExtensions(
    { ...input, sourceDomain: undefined },
    undefined,
    undefined,
    catalogs,
  ).classification;
  if (c.status !== "matched" || !c.metricId.startsWith("demo:")) return null;
  const entryDomain = c.domain;
  if (entryDomain === input.sourceDomain) return null;
  const e = catalogs.get(input.missionId ?? "")?.active.find((x) => x.demoId === c.metricId);
  return {
    demoId: c.metricId,
    displayName: e?.displayName ?? c.metricId,
    entryDomain,
    sourceDomain: input.sourceDomain,
  };
}

export const UNKNOWN_BIOMARKER_REVIEW_SCHEMA = "mitochondria.unknown-biomarker-review.v2";
export const CATALOG_EXTENSION_PROPOSAL_SCHEMA = "mitochondria.catalog-extension-proposal.v1";
export const CATALOG_EXTENSION_REGISTRY_SCHEMA = "mitochondria.catalog-extension-registry.v1";
export const REQUIRED_SCIENTIFIC_GATE = "PENDING_NIKOLAS_REVIEW" as const;

type ReviewOnlyStatus =
  "unclassified" | "ambiguous" | "unit_review_required" | "source_unvalidated";

export interface ReviewSourceRow {
  label: string;
  unit: string;
  value: string;
  observedAt: string;
  sourceValidation?: "unvalidated";
  classification: IntakeClassification;
  sourceKind: string;
  sourceLabel: string;
  documentName?: string | undefined;
  documentSha256?: string | undefined;
  excerpt?: string | undefined;
  /** Set when an activated SYNTHETIC DEMO entry already covers this row (no new request is generated). */
  syntheticDemo?: { demoId: string } | null | undefined;
}

export interface ReviewEvidence {
  sourceKind: string;
  sourceLabel: string;
  documentName: string | null;
  documentSha256: string | null;
  excerpt: string | null;
}

export interface ReviewObservation {
  observationKey: string;
  value: string;
  observedAt: string | null;
  evidence: ReviewEvidence[];
}

export interface UnknownBiomarkerTerm {
  /** Deterministic: normalized label + exact original unit. */
  termId: string;
  normalizedLabel: string;
  originalLabels: string[];
  originalUnit: string;
  classification: ReviewOnlyStatus;
  candidateMetricIds: string[];
  observations: ReviewObservation[];
  /** Source rows collapsed into existing observations (same value, time and evidence). */
  duplicateRowsCollapsed: number;
}

export type ReviewerDecisionKind =
  | "propose_alias_to_existing_metric"
  | "propose_new_catalog_metric"
  | "not_a_biomarker"
  | "needs_more_evidence";

export const REVIEWER_DECISION_LABELS: Record<ReviewerDecisionKind, string> = {
  propose_alias_to_existing_metric: "Propose mapping to an existing catalog metric",
  propose_new_catalog_metric: "Propose a new catalog metric",
  not_a_biomarker: "Not a biomarker (keep excluded)",
  needs_more_evidence: "Needs more source evidence",
};

export interface ReviewScope {
  missionId: string;
  crewMemberId: string;
  provenance: "synthetic" | "real";
}

export interface ReviewerDecision {
  decisionId: string;
  sequence: number;
  termId: string;
  kind: ReviewerDecisionKind;
  targetMetricId: string | null;
  proposedName: string | null;
  proposedUnit: string | null;
  proposedDomain: string | null;
  rationale: string;
  reviewerUserId: string;
  reviewerRole: "ground_medical";
  decidedAt: string;
  scope: ReviewScope;
  scientificStatus: typeof REQUIRED_SCIENTIFIC_GATE;
  catalogChangeApplied: false;
}

export interface DecisionInput {
  termId: string;
  kind: ReviewerDecisionKind;
  targetMetricId?: string | undefined;
  proposedName?: string | undefined;
  proposedUnit?: string | undefined;
  proposedDomain?: string | undefined;
  rationale: string;
}

export interface DecisionContext {
  reviewerUserId: string;
  /** Roles held by the reviewer for exactly this mission + crew scope. */
  rolesForScope: readonly string[];
  scope: ReviewScope;
  decidedAt: string;
}

export const normalizeLabel = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

/** FNV-1a 32-bit — a stable identifier, never an integrity attestation. */
function stableId(prefix: string, text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}-${hash.toString(16).padStart(8, "0")}`;
}

export function termIdFor(label: string, unit: string): string {
  return stableId("ubt", `${normalizeLabel(label)}|${unit.trim()}`);
}

const P36_METRICS = p36Registry.metrics as readonly {
  id: string;
  name: string;
  originalUnit?: string;
}[];
const p36ById = new Map(P36_METRICS.map((m) => [m.id, m]));

/** Group review-only rows into catalog terms; matched rows are ignored. */
export function buildUnknownBiomarkerTerms(
  rows: readonly ReviewSourceRow[],
): UnknownBiomarkerTerm[] {
  const terms = new Map<string, UnknownBiomarkerTerm>();
  for (const row of rows) {
    if (row.classification.status === "matched" && row.sourceValidation !== "unvalidated") continue;
    // Already covered by an activated synthetic demo entry: never re-request the same term.
    if (row.syntheticDemo?.demoId && row.sourceValidation !== "unvalidated") continue;
    const status: ReviewOnlyStatus =
      row.sourceValidation === "unvalidated"
        ? "source_unvalidated"
        : row.classification.status === "matched"
          ? "unclassified"
          : row.classification.status;
    const unit = row.unit.trim();
    const termId = termIdFor(row.label, unit);
    let term = terms.get(termId);
    if (!term) {
      term = {
        termId,
        normalizedLabel: normalizeLabel(row.label),
        originalLabels: [],
        originalUnit: unit,
        classification: status,
        candidateMetricIds: [],
        observations: [],
        duplicateRowsCollapsed: 0,
      };
      terms.set(termId, term);
    }
    const label = row.label.trim();
    if (!term.originalLabels.includes(label)) term.originalLabels.push(label);
    for (const id of row.classification.status === "matched"
      ? [row.classification.metricId]
      : row.classification.candidateMetricIds)
      if (!term.candidateMetricIds.includes(id)) term.candidateMetricIds.push(id);
    // Same term from a different classification path is treated as the stricter state.
    if (
      term.classification !== row.classification.status &&
      row.classification.status === "ambiguous"
    )
      term.classification = "ambiguous";
    const evidence: ReviewEvidence = {
      sourceKind: row.sourceKind,
      sourceLabel: row.sourceLabel,
      documentName: row.documentName?.trim() || null,
      documentSha256: row.documentSha256?.trim() || null,
      excerpt: row.excerpt?.trim() || null,
    };
    const observedAt = row.observedAt.trim() || null;
    const observationKey = stableId("ubo", `${termId}|${row.value.trim()}|${observedAt ?? ""}`);
    const existing = term.observations.find((o) => o.observationKey === observationKey);
    if (!existing) {
      term.observations.push({
        observationKey,
        value: row.value.trim(),
        observedAt,
        evidence: [evidence],
      });
      continue;
    }
    const evidenceKey = (e: ReviewEvidence) =>
      JSON.stringify([e.sourceKind, e.sourceLabel, e.documentSha256, e.excerpt]);
    if (existing.evidence.some((e) => evidenceKey(e) === evidenceKey(evidence)))
      term.duplicateRowsCollapsed++;
    else existing.evidence.push(evidence);
  }
  return [...terms.values()]
    .map((t) => ({ ...t, candidateMetricIds: [...t.candidateMetricIds].sort() }))
    .sort(
      (a, b) =>
        a.normalizedLabel.localeCompare(b.normalizedLabel) ||
        a.originalUnit.localeCompare(b.originalUnit),
    );
}

/** Only an authenticated ground-medical reviewer for the exact scope may record decisions. */
export function canRecordReviewerDecision(rolesForScope: readonly string[]): boolean {
  return rolesForScope.includes("ground_medical");
}

export type DecisionResult =
  | { ok: true; ledger: ReviewerDecision[]; decision: ReviewerDecision }
  | { ok: false; reason: string; ledger: readonly ReviewerDecision[] };

/** Append-only: returns a new ledger; prior decisions are never edited or removed. */
export function recordReviewerDecision(
  ledger: readonly ReviewerDecision[],
  terms: readonly UnknownBiomarkerTerm[],
  input: DecisionInput,
  context: DecisionContext,
): DecisionResult {
  const fail = (reason: string): DecisionResult => ({ ok: false, reason, ledger });
  if (!context.reviewerUserId) return fail("Reviewer identity is unavailable.");
  if (!canRecordReviewerDecision(context.rolesForScope))
    return fail("Only a ground medical reviewer for this mission and crew can record decisions.");
  if (!context.scope.missionId || !context.scope.crewMemberId || !context.scope.provenance)
    return fail("Select an authorized mission, crew member and provenance first.");
  if (!Number.isFinite(Date.parse(context.decidedAt))) return fail("Decision time is invalid.");
  const term = terms.find((t) => t.termId === input.termId);
  if (!term) return fail("Unknown review term.");
  const rationale = input.rationale.trim();
  if (rationale.length < 10) return fail("A rationale of at least 10 characters is required.");
  let targetMetricId: string | null = null;
  let proposedName: string | null = null;
  let proposedUnit: string | null = null;
  let proposedDomain: string | null = null;
  if (input.kind === "propose_alias_to_existing_metric") {
    const target = p36ById.get((input.targetMetricId ?? "").trim());
    if (!target) return fail("The target metric is not in the P36 source catalog.");
    if (!domainForMetric(target.id)) return fail("The target metric has no health-domain routing.");
    if (!target.originalUnit?.trim() || target.originalUnit.trim() !== term.originalUnit)
      return fail(
        `Unit mismatch: the candidate unit "${term.originalUnit || "missing"}" must equal the catalog unit "${target.originalUnit ?? "missing"}". Unit conversion is not permitted.`,
      );
    targetMetricId = target.id;
  } else if (input.kind === "propose_new_catalog_metric") {
    proposedName = input.proposedName?.trim() || null;
    proposedUnit = input.proposedUnit?.trim() || null;
    proposedDomain = input.proposedDomain?.trim() || null;
    if (!proposedName || !proposedUnit || !proposedDomain)
      return fail("A new metric proposal needs a name, unit and domain.");
    if (!["bone", "immune", "cardiovascular", "behavioral"].includes(proposedDomain))
      return fail("The proposed domain must be one of the four health modules.");
    if (
      P36_METRICS.some(
        (m) =>
          normalizeLabel(m.name) === normalizeLabel(proposedName!) &&
          m.originalUnit?.trim() === proposedUnit,
      )
    )
      return fail(
        "An identical name and unit already exist in the catalog; propose a mapping instead.",
      );
  }
  const sequence = ledger.length + 1;
  const decision: ReviewerDecision = {
    decisionId: stableId(
      "ubd",
      `${sequence}|${term.termId}|${input.kind}|${context.reviewerUserId}|${context.decidedAt}`,
    ),
    sequence,
    termId: term.termId,
    kind: input.kind,
    targetMetricId,
    proposedName,
    proposedUnit,
    proposedDomain,
    rationale,
    reviewerUserId: context.reviewerUserId,
    reviewerRole: "ground_medical",
    decidedAt: new Date(context.decidedAt).toISOString(),
    scope: { ...context.scope },
    scientificStatus: REQUIRED_SCIENTIFIC_GATE,
    catalogChangeApplied: false,
  };
  return { ok: true, ledger: [...ledger, decision], decision };
}

/** Latest decision per term (history stays in the ledger). */
export function latestDecisions(
  ledger: readonly ReviewerDecision[],
): Map<string, ReviewerDecision> {
  const latest = new Map<string, ReviewerDecision>();
  for (const d of [...ledger].sort((a, b) => a.sequence - b.sequence)) latest.set(d.termId, d);
  return latest;
}

// ---------- Governed registry (versioned catalog extensions) ----------

export interface CatalogExtension {
  matchingContext?: { method: string | null; specimen: string | null };
  extensionId: string;
  version: number;
  kind: "alias_to_existing_metric";
  sourceLabel: string;
  sourceUnit: string;
  targetMetricId: string;
  status: "PENDING_NIKOLAS_REVIEW" | "APPROVED" | "REJECTED";
  evidenceRefs: string[];
}
export interface ApprovalRecord {
  extensionId: string;
  version: number;
  decision: "PENDING_NIKOLAS_REVIEW" | "APPROVED" | "REJECTED";
  reviewer: string;
  decidedAt: string;
  handbookEvidenceRefs: string[];
  note?: string;
}
export interface CatalogExtensionRegistry {
  schema: string;
  baseCatalogVersion: string;
  requiredScientificGate: string;
  extensions: CatalogExtension[];
  approvalHistory: ApprovalRecord[];
}
export interface EffectiveExtension {
  matchingContext?: { method: string | null; specimen: string | null };
  extensionId: string;
  version: number;
  normalizedLabel: string;
  unit: string;
  targetMetricId: string;
}
export interface RegistryEvaluation {
  registryVersion: string;
  effective: EffectiveExtension[];
  notEffective: { extensionId: string; version: number; reason: string }[];
  approvalHistory: ApprovalRecord[];
}

export const GOVERNED_CATALOG_EXTENSIONS = governedRegistry as unknown as CatalogExtensionRegistry;

/** Fail closed: anything not fully, explicitly approved is not effective. */
export function evaluateCatalogExtensionRegistry(
  registry: CatalogExtensionRegistry,
): RegistryEvaluation {
  const notEffective: RegistryEvaluation["notEffective"] = [];
  const valid =
    registry.schema === CATALOG_EXTENSION_REGISTRY_SCHEMA &&
    registry.requiredScientificGate === REQUIRED_SCIENTIFIC_GATE;
  const extensions = Array.isArray(registry.extensions) ? registry.extensions : [];
  const history = Array.isArray(registry.approvalHistory) ? registry.approvalHistory : [];
  const highest = new Map<string, CatalogExtension>();
  for (const ext of extensions) {
    const prior = highest.get(ext.extensionId);
    if (prior && prior.version >= ext.version) {
      notEffective.push({
        extensionId: ext.extensionId,
        version: ext.version,
        reason: "Superseded or duplicate version",
      });
      continue;
    }
    if (prior)
      notEffective.push({
        extensionId: prior.extensionId,
        version: prior.version,
        reason: "Superseded by a later version",
      });
    highest.set(ext.extensionId, ext);
  }
  const candidates: EffectiveExtension[] = [];
  for (const ext of highest.values()) {
    const reject = (reason: string) =>
      notEffective.push({ extensionId: ext.extensionId, version: ext.version, reason });
    if (!valid) {
      reject("Registry schema or scientific gate is invalid");
      continue;
    }
    if (ext.status !== "APPROVED") {
      reject(`Status ${ext.status}`);
      continue;
    }
    if (ext.kind !== "alias_to_existing_metric") {
      reject("Unsupported extension kind");
      continue;
    }
    const records = history
      .filter((h) => h.extensionId === ext.extensionId && h.version === ext.version)
      .sort((a, b) => Date.parse(a.decidedAt) - Date.parse(b.decidedAt));
    const last = records.at(-1);
    if (!last || last.decision !== "APPROVED") {
      reject("No approval record for this version");
      continue;
    }
    if (
      !last.reviewer?.trim() ||
      !Number.isFinite(Date.parse(last.decidedAt)) ||
      !last.handbookEvidenceRefs?.length
    ) {
      reject("Approval record lacks reviewer, decision time or handbook evidence");
      continue;
    }
    const target = p36ById.get(ext.targetMetricId);
    if (!target || !domainForMetric(target.id)) {
      reject("Target metric is not a routed P36 metric");
      continue;
    }
    if (!target.originalUnit?.trim() || target.originalUnit.trim() !== ext.sourceUnit.trim()) {
      reject("Source unit differs from the catalog unit (no conversion permitted)");
      continue;
    }
    if (
      ext.matchingContext &&
      (!ext.matchingContext.method?.trim() || !ext.matchingContext.specimen?.trim())
    ) {
      reject("Method and specimen matching context is incomplete");
      continue;
    }
    candidates.push({
      extensionId: ext.extensionId,
      version: ext.version,
      normalizedLabel: normalizeLabel(ext.sourceLabel),
      unit: ext.sourceUnit,
      targetMetricId: target.id,
      ...(ext.matchingContext ? { matchingContext: ext.matchingContext } : {}),
    });
  }
  // Two approved extensions for the same label+unit are ambiguous: neither applies.
  const effective = candidates.filter((c) => {
    const clash = candidates.some(
      (o) => o !== c && o.normalizedLabel === c.normalizedLabel && o.unit === c.unit,
    );
    if (clash)
      notEffective.push({
        extensionId: c.extensionId,
        version: c.version,
        reason: "Conflicts with another approved extension",
      });
    return !clash;
  });
  const maxVersion = extensions.reduce((m, e) => Math.max(m, e.version), 0);
  return {
    registryVersion: `${registry.baseCatalogVersion}+ext.${maxVersion}`,
    effective,
    notEffective,
    approvalHistory: [...history].sort((a, b) => Date.parse(a.decidedAt) - Date.parse(b.decidedAt)),
  };
}

export interface ExtendedClassification {
  classification: IntakeClassification;
  extension: { extensionId: string; version: number } | null;
  /** Set when an activated catalog entry (P37) recognized the row. */
  recognition?: { canonicalId: string; catalogVersion: number } | null;
  /** Set when an activated mission-scoped SYNTHETIC DEMO entry matched the row (synthetic only). */
  syntheticDemo?: SyntheticDemoCatalogBasis | null;
}

export interface GovernedClassificationInput {
  label: string;
  unit: string;
  method?: string | undefined;
  specimen?: string | undefined;
  sourceValidation?: "unvalidated" | undefined;
  provenance?: Provenance | undefined;
  /** "canonical": the label is an already-assigned canonical ID (stored-record review, sync). */
  identity?: "canonical" | undefined;
  /** For canonical re-validation of historical records only: accept since-revoked entries. */
  includeRevoked?: boolean | undefined;
  /** Mission of the row; required for mission-scoped SYNTHETIC DEMO entries. */
  missionId?: string | undefined;
  /** P39: domain of the row's explicit, recognized source section (compatibility check only). */
  sourceDomain?: HealthDomainId | undefined;
}

/**
 * Base P36 classification first; approved extensions, then the verified active
 * catalog, apply only to non-matched rows; the mission-scoped synthetic demo
 * catalog is the last stage and only for synthetic rows of that mission.
 */
export function classifyWithGovernedExtensions(
  input: GovernedClassificationInput,
  evaluation: RegistryEvaluation = evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS),
  catalog: EvaluatedCatalog = getActiveCatalog(),
  demoCatalogs: ReadonlyMap<string, EvaluatedDemoCatalog> = getSyntheticDemoCatalogs(),
): ExtendedClassification {
  const result = classifyGovernedCore(input, evaluation, catalog);
  if (result.classification.status === "matched" || input.sourceValidation === "unvalidated")
    return result;
  return classifySyntheticDemo(input, demoCatalogs) ?? result;
}

function classifyGovernedCore(
  input: GovernedClassificationInput,
  evaluation: RegistryEvaluation,
  catalog: EvaluatedCatalog,
): ExtendedClassification {
  const base = classifyIntakeObservation(input);
  if (input.sourceValidation === "unvalidated")
    return {
      classification: {
        status: "unclassified",
        originalLabel: input.label,
        originalUnit: input.unit,
        candidateMetricIds: [],
        reviewRequired: true,
      },
      extension: null,
    };
  if (base.status === "matched") return { classification: base, extension: null };
  const label = normalizeLabel(input.label);
  const unit = input.unit;
  const ext = evaluation.effective.find(
    (e) =>
      e.normalizedLabel === label &&
      e.unit === unit &&
      (!e.matchingContext ||
        (e.matchingContext.method === input.method &&
          e.matchingContext.specimen === input.specimen)),
  );
  const domain = ext ? domainForMetric(ext.targetMetricId) : null;
  if ((!ext || !domain) && base.status === "unclassified") {
    const matched = (canonicalId: string, d: HealthDomainId) => ({
      classification: {
        status: "matched" as const,
        metricId: canonicalId,
        domain: d,
        originalLabel: input.label.trim(),
        originalUnit: unit.trim(),
        reviewRequired: true as const,
      },
      extension: null,
      recognition: { canonicalId, catalogVersion: catalog.catalogVersion },
    });
    if (input.identity === "canonical") {
      const entry = canonicalCatalogEntry(
        input.label,
        unit,
        catalog,
        input.includeRevoked === true,
      );
      if (entry) return matched(entry.canonicalId, entry.domain);
    } else {
      const r = recognizeBiomarker(
        {
          label: input.label,
          unit,
          specimen: input.specimen,
          method: input.method,
          provenance: input.provenance,
        },
        catalog,
      );
      if (r.status === "RECOGNIZED") return matched(r.canonicalId, r.domain);
    }
  }
  if (!ext || !domain) return { classification: base, extension: null };
  return {
    classification: {
      status: "matched",
      metricId: ext.targetMetricId,
      domain,
      originalLabel: input.label.trim(),
      originalUnit: unit,
      reviewRequired: true,
    },
    extension: { extensionId: ext.extensionId, version: ext.version },
  };
}

// ---------- Proposal, export and re-evaluation ----------

export function buildCatalogExtensionProposal(
  terms: readonly UnknownBiomarkerTerm[],
  ledger: readonly ReviewerDecision[],
  registry: CatalogExtensionRegistry = GOVERNED_CATALOG_EXTENSIONS,
) {
  const latest = latestDecisions(ledger);
  const nextVersion = registry.extensions.reduce((m, e) => Math.max(m, e.version), 0) + 1;
  const draftExtensions: CatalogExtension[] = [];
  const newMetricRequests: {
    termId: string;
    proposedName: string;
    proposedUnit: string;
    proposedDomain: string;
    decisionId: string;
  }[] = [];
  const keptExcluded: { termId: string; kind: ReviewerDecisionKind; decisionId: string }[] = [];
  for (const term of terms) {
    const d = latest.get(term.termId);
    if (!d) continue;
    if (d.kind === "propose_alias_to_existing_metric" && d.targetMetricId)
      draftExtensions.push({
        extensionId: stableId(
          "ext",
          `${term.normalizedLabel}|${term.originalUnit}|${d.targetMetricId}`,
        ),
        version: nextVersion,
        kind: "alias_to_existing_metric",
        sourceLabel: term.originalLabels[0] ?? term.normalizedLabel,
        sourceUnit: term.originalUnit,
        targetMetricId: d.targetMetricId,
        status: REQUIRED_SCIENTIFIC_GATE,
        evidenceRefs: [],
      });
    else if (
      d.kind === "propose_new_catalog_metric" &&
      d.proposedName &&
      d.proposedUnit &&
      d.proposedDomain
    )
      newMetricRequests.push({
        termId: term.termId,
        proposedName: d.proposedName,
        proposedUnit: d.proposedUnit,
        proposedDomain: d.proposedDomain,
        decisionId: d.decisionId,
      });
    else keptExcluded.push({ termId: term.termId, kind: d.kind, decisionId: d.decisionId });
  }
  return {
    schema: CATALOG_EXTENSION_PROPOSAL_SCHEMA,
    baseCatalogVersion: registry.baseCatalogVersion,
    proposedExtensionVersion: nextVersion,
    status: REQUIRED_SCIENTIFIC_GATE,
    autoApproved: false as const,
    catalogChangeApplied: false as const,
    draftExtensions,
    newMetricRequests,
    keptExcluded,
    note: "Draft only. Each entry needs independent scientific approval (named reviewer, decision time, handbook evidence references) recorded in the governed registry through code review before it can affect classification.",
  };
}

export function buildReviewRequestExport(input: {
  scope: ReviewScope;
  terms: readonly UnknownBiomarkerTerm[];
  ledger: readonly ReviewerDecision[];
  generatedAt: string;
  registry?: CatalogExtensionRegistry;
}) {
  const registry = input.registry ?? GOVERNED_CATALOG_EXTENSIONS;
  const evaluation = evaluateCatalogExtensionRegistry(registry);
  return {
    schema: UNKNOWN_BIOMARKER_REVIEW_SCHEMA,
    generatedAt: input.generatedAt,
    scope: { ...input.scope },
    containsRealHealthData: input.scope.provenance === "real",
    scientificStatus: REQUIRED_SCIENTIFIC_GATE,
    provenanceNote: "Research-only local export. Not approved. Not uploaded by the application.",
    catalogChangeApplied: false as const,
    autoApproved: false as const,
    catalogRegistryVersion: evaluation.registryVersion,
    terms: input.terms,
    decisionHistory: [...input.ledger].sort((a, b) => a.sequence - b.sequence),
    proposal: buildCatalogExtensionProposal(input.terms, input.ledger, registry),
    approvalHistory: evaluation.approvalHistory,
  };
}

export type ReviewRequestExport = ReturnType<typeof buildReviewRequestExport>;

export interface ReevaluationResult {
  termId: string;
  label: string;
  unit: string;
  previous: string;
  outcome: "still_review_only" | "matched_by_base_catalog" | "matched_by_approved_extension";
  metricId: string | null;
  extension: { extensionId: string; version: number } | null;
}

export const REEVALUATION_MAX_TERMS = 1000;
export const REEVALUATION_MAX_BYTES = 5 * 1024 * 1024;

/** Re-evaluate a previously exported request; read-only, never saves or approves anything. */
export function reevaluateReviewRequest(
  request: unknown,
  scope: ReviewScope,
  evaluation: RegistryEvaluation = evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS),
): { ok: true; results: ReevaluationResult[] } | { ok: false; reason: string } {
  if (!request || typeof request !== "object")
    return { ok: false, reason: "Not a review request file." };
  const r = request as Partial<ReviewRequestExport>;
  if (r.schema !== UNKNOWN_BIOMARKER_REVIEW_SCHEMA || !Array.isArray(r.terms) || !r.scope)
    return { ok: false, reason: "Unsupported review request format." };
  if (
    r.scope.missionId !== scope.missionId ||
    r.scope.crewMemberId !== scope.crewMemberId ||
    r.scope.provenance !== scope.provenance
  )
    return {
      ok: false,
      reason: "The review request belongs to a different mission, crew member or provenance.",
    };
  if (r.terms.length > REEVALUATION_MAX_TERMS)
    return {
      ok: false,
      reason: `The review request lists more than ${REEVALUATION_MAX_TERMS} terms and was not evaluated.`,
    };
  if (r.autoApproved !== false || r.catalogChangeApplied !== false)
    return {
      ok: false,
      reason:
        "The file claims an approval or applied catalog change. Only unmodified exports can be re-evaluated.",
    };
  const results: ReevaluationResult[] = [];
  for (const term of r.terms) {
    if (!term || typeof term.originalUnit !== "string" || !Array.isArray(term.originalLabels))
      continue;
    const label = String(term.originalLabels[0] ?? term.normalizedLabel ?? "");
    if (!label.trim() || label.length > 300 || term.originalUnit.length > 60) continue;
    const { classification, extension } = classifyWithGovernedExtensions(
      { label, unit: term.originalUnit },
      evaluation,
    );
    results.push({
      termId: String(term.termId),
      label,
      unit: term.originalUnit,
      previous: String(term.classification),
      outcome:
        classification.status !== "matched"
          ? "still_review_only"
          : extension
            ? "matched_by_approved_extension"
            : "matched_by_base_catalog",
      metricId: classification.status === "matched" ? classification.metricId : null,
      extension,
    });
  }
  return { ok: true, results };
}
