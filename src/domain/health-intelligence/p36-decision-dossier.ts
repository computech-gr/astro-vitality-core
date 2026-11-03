/**
 * P36 Scientific Decision & Evidence Closure dossier (pure, deterministic).
 *
 * One consolidated, reviewer-ready dossier for Nikolas covering all 12 handoff
 * terms, built only from the existing review dossiers, crosswalk, activation
 * manifest and repository artifacts joined by exact ID. Every field states its
 * basis: a verified fact is only a statement of what a named repository source
 * records; everything else is an explicit unresolved assumption, conflict or
 * gap. Missing laboratory methods, protocols, units, validation evidence and
 * approvals are reported as missing, never filled in.
 *
 * Read-only: never activates catalogs, never changes observations, sync,
 * reports or PDF output of the Unified Health Report. All terms stay
 * PENDING_NIKOLAS_REVIEW.
 */
import handoffJson from "../../../data/scientific/p36-unknown-biomarker-reconciliation-handoff.v1.json";
import crosswalkJson from "../../../data/scientific/p36-scientific-review-crosswalk.v1.json";
import p36Registry from "../../../data/scientific/p36-biomarker-source-registry.v1.json";
import p355Catalog from "../../../data/scientific/p355-proposed-domain-catalog.v1.json";
import boneCatalog from "../../../data/scientific/bone-health-handbook-v7.catalog.json";
import boneEnglish from "../../../data/scientific/bone-health-handbook-v7.en.json";
import immuneIntake from "../../../data/scientific/nikolas-immune-intake.v1.json";
import behavioralIntake from "../../../data/scientific/nikolas-behavioral-intake.v1.json";
import p38Reconciliation from "../../../data/scientific/p38-nikolas-reconciliation.v1.json";
import p40Ledger from "../../../data/scientific/p40-independent-review-ledger.v1.json";
import p42Triage from "../../../data/scientific/p42-semantic-triage.v1.json";
import p43Proposals from "../../../data/scientific/p43-semantic-decision-proposals.v1.json";
import governedRegistry from "../../../data/scientific/catalog-extensions.v1.json";
import { canonicalJson } from "./observation-envelope";
import { REQUIRED_SCIENTIFIC_GATE } from "./unknown-biomarker-review";
import type { ActivationStatus, AuthorizationView, GateResult, ScientificStatus } from "./p36-scientific-authorization";
import {
  ACTIVATION_BLOCKER_LABELS,
  GLOBAL_ACTIVATION_PREREQUISITES,
  MANIFEST_SOURCE_ARTIFACTS,
  SCIENTIFIC_REVIEW_DECISION_LABELS,
  boneHandbookFact,
  buildActivationManifest,
  buildScientificReviewDossiers,
  catalogEntryFor,
  latestEntryByTerm,
  p43DispositionFor,
  verifyScientificReviewChain,
  type ScientificReviewDossier,
  type ScientificReviewEntry,
} from "./p36-scientific-review";

export const DECISION_DOSSIER_SCHEMA = "mitochondria.p36-scientific-decision-dossier.v1";

/** Artifact objects keyed by repository path, in MANIFEST_SOURCE_ARTIFACTS order. */
const ARTIFACTS: Record<(typeof MANIFEST_SOURCE_ARTIFACTS)[number], unknown> = {
  "data/scientific/p36-unknown-biomarker-reconciliation-handoff.v1.json": handoffJson,
  "data/scientific/p36-scientific-review-crosswalk.v1.json": crosswalkJson,
  "data/scientific/p36-biomarker-source-registry.v1.json": p36Registry,
  "data/scientific/p355-proposed-domain-catalog.v1.json": p355Catalog,
  "data/scientific/bone-health-handbook-v7.catalog.json": boneCatalog,
  "data/scientific/bone-health-handbook-v7.en.json": boneEnglish,
  "data/scientific/nikolas-immune-intake.v1.json": immuneIntake,
  "data/scientific/nikolas-behavioral-intake.v1.json": behavioralIntake,
  "data/scientific/p38-nikolas-reconciliation.v1.json": p38Reconciliation,
  "data/scientific/p40-independent-review-ledger.v1.json": p40Ledger,
  "data/scientific/p42-semantic-triage.v1.json": p42Triage,
  "data/scientific/p43-semantic-decision-proposals.v1.json": p43Proposals,
  "data/scientific/catalog-extensions.v1.json": governedRegistry,
};

export type FieldBasis =
  | "VERIFIED_SOURCE_FACT"
  | "PROPOSED_UNCONFIRMED"
  | "CONFLICTING_SOURCES"
  | "UNRESOLVED"
  | "NOT_IN_SOURCES"
  | "NOT_VALIDATED";

export const FIELD_BASIS_LABELS: Record<FieldBasis, string> = {
  VERIFIED_SOURCE_FACT: "Verified: stated in a named repository source",
  PROPOSED_UNCONFIRMED: "Proposed, not confirmed",
  CONFLICTING_SOURCES: "Sources conflict",
  UNRESOLVED: "Unresolved",
  NOT_IN_SOURCES: "Not recorded in any repository source",
  NOT_VALIDATED: "Explicitly not validated",
};

export interface DossierField {
  value: string;
  basis: FieldBasis;
  refs: string[];
}

export interface RequiredDecision {
  id: "IDENTITY" | "DOMAIN" | "RELATION" | "SPECIMEN" | "METHOD" | "PROTOCOL" | "UNIT" | "VALIDATION" | "SOURCE" | "EVIDENCE";
  text: string;
}

export interface DecisionMatrixRow {
  termId: string;
  sourceLabel: string;
  sourceUnit: string;
  identity: string;
  domain: string;
  specimen: string;
  method: string;
  protocol: string;
  unit: string;
  validation: string;
  status: typeof REQUIRED_SCIENTIFIC_GATE;
}

export interface DossierTerm {
  termId: string;
  sourceLabel: string;
  observations: number;
  status: typeof REQUIRED_SCIENTIFIC_GATE;
  activationAllowed: false;
  sourceReferences: { ref: string; title: string }[];
  fields: {
    proposedCanonicalIdentity: DossierField;
    domain: DossierField;
    specimen: DossierField;
    assayOrMethod: DossierField;
    protocol: DossierField;
    sourceUnit: DossierField;
    candidateCatalogUnit: DossierField;
  };
  verifiedFacts: { statement: string; ref: string }[];
  unresolvedAssumptions: string[];
  scientificUncertainties: string[];
  requiredDecisions: RequiredDecision[];
  /** Latest documentary worksheet entry, if any. Never an approval. */
  latestWorksheetEntry: null | { sequence: number; decision: string; targetCatalogId: string | null; reviewerName: string; recordedAt: string; hash: string; note: string };
  blockers: string[];
}

export interface DecisionDossier {
  schema: typeof DECISION_DOSSIER_SCHEMA;
  title: string;
  addressedTo: string;
  generatedAt: string | null;
  status: typeof REQUIRED_SCIENTIFIC_GATE;
  activationAllowed: false;
  appliesChanges: false;
  /** Count of verified, current Researcher approvals in the cloud authorization ledger at export (0 when not loaded). */
  scientificApprovals: number;
  manifestVersion: string;
  baseCatalogVersion: string;
  basisLegend: Record<FieldBasis, string>;
  counts: { terms: number; observations: number; blocked: number; requiredDecisions: number; conflicts: number; missingMethods: number };
  decisionMatrix: DecisionMatrixRow[];
  terms: DossierTerm[];
  activationPrerequisites: readonly string[];
  finalAuthorization: FinalAuthorizationSection;
  integrity: {
    algorithm: "SHA-256";
    /** SHA-256 of the canonical (sorted-key) JSON of this dossier with contentDigest emptied and generatedAt null. */
    contentDigest: string;
    manifestDigest: string;
    reviewHistory: { entries: number; headHash: string; integrity: "VERIFIED" | "FAILED" };
    sourceIntegrity: "VERIFIED" | "FAILED";
    sourceProblems: string[];
    /** SHA-256 of each artifact's canonical JSON content (independent of whitespace). */
    sourceArtifactDigests: { path: string; canonicalSha256: string }[];
  };
}

export interface FinalAuthorizationTerm {
  termId: string;
  sourceLabel: string;
  scientificStatus: ScientificStatus;
  activationStatus: ActivationStatus;
  ledgerIntegrity: "VERIFIED" | "FAILED" | "NOT_LOADED";
  stale: boolean;
  recommendations: number;
  historyEvents: number;
  latestDecision: null | {
    eventId: string;
    eventHash: string;
    action: string;
    actorRole: string;
    reviewerName: string;
    reviewerQualification: string;
    conflictOfInterestDeclaration: string;
    decidedAt: string;
    receivedAt: string;
    canonicalCatalogId: string | null;
    domain: string | null;
    specimenOrAcquisitionContext: string | null;
    methodOrInstrument: string | null;
    protocol: string | null;
    protocolVersion: string | null;
    validatedUnit: string | null;
    sourceRefs: string[];
    validationEvidenceRefs: string[];
    rationale: string;
  };
  gates: GateResult[];
  blockers: string[];
}

export interface FinalAuthorizationSection {
  source: "NOT_LOADED" | "CLOUD_LEDGER_READ_AT_EXPORT";
  authorityMissionId: string | null;
  /** An exported dossier never grants or proves authorization; only the live cloud ledger does. */
  notAnAuthorizationToken: true;
  note: string;
  counts: Record<ScientificStatus | ActivationStatus, number>;
  terms: FinalAuthorizationTerm[];
}

function finalAuthorizationSection(view: AuthorizationView | undefined, dossiers: readonly ScientificReviewDossier[]): FinalAuthorizationSection {
  const note =
    "Read-only copy for review. Final scientific decisions exist only in the append-only cloud authorization ledger and are re-verified on every read; this file cannot approve, activate or be imported as authorization. Reviewer qualifications and conflict declarations are recorded declarations, not verified credentials.";
  if (!view || !view.loaded) {
    const counts = { PENDING_NIKOLAS_REVIEW: dossiers.length, MORE_EVIDENCE_REQUIRED: 0, SCIENTIFICALLY_REJECTED: 0, SCIENTIFICALLY_APPROVED: 0, ACTIVATION_BLOCKED: dossiers.length, ACTIVE: 0 };
    return {
      source: "NOT_LOADED",
      authorityMissionId: null,
      notAnAuthorizationToken: true,
      note,
      counts,
      terms: dossiers.map((d) => ({
        termId: d.termId,
        sourceLabel: d.sourceLabel,
        scientificStatus: "PENDING_NIKOLAS_REVIEW",
        activationStatus: "ACTIVATION_BLOCKED",
        ledgerIntegrity: "NOT_LOADED",
        stale: false,
        recommendations: 0,
        historyEvents: 0,
        latestDecision: null,
        gates: [],
        blockers: ["Cloud authorization ledger not loaded for this export; no final decision is shown"],
      })),
    };
  }
  return {
    source: "CLOUD_LEDGER_READ_AT_EXPORT",
    authorityMissionId: view.missionId,
    notAnAuthorizationToken: true,
    note,
    counts: view.counts,
    terms: view.terms.map((t) => {
      const p = t.latestDecision?.payload;
      return {
        termId: t.termId,
        sourceLabel: t.sourceLabel,
        scientificStatus: t.scientificStatus,
        activationStatus: t.activationStatus,
        ledgerIntegrity: t.integrity,
        stale: t.stale,
        recommendations: t.recommendations.length,
        historyEvents: t.history.length,
        latestDecision:
          t.latestDecision && p
            ? {
                eventId: t.latestDecision.row.event_id,
                eventHash: t.latestDecision.row.event_hash,
                action: p.action,
                actorRole: p.actorRole,
                reviewerName: p.reviewerName,
                reviewerQualification: p.reviewerQualification,
                conflictOfInterestDeclaration: p.conflictOfInterestDeclaration,
                decidedAt: p.decidedAt,
                receivedAt: t.latestDecision.row.received_at,
                canonicalCatalogId: p.canonicalCatalogId,
                domain: p.domain,
                specimenOrAcquisitionContext: p.specimenOrAcquisitionContext,
                methodOrInstrument: p.methodOrInstrument,
                protocol: p.protocol,
                protocolVersion: p.protocolVersion,
                validatedUnit: p.validatedUnit,
                sourceRefs: p.sourceRefs,
                validationEvidenceRefs: p.validationEvidenceRefs,
                rationale: p.rationale,
              }
            : null,
        gates: t.gates,
        blockers: t.blockers,
      };
    }),
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sourceArtifactDigests(): Promise<{ path: string; canonicalSha256: string }[]> {
  const out: { path: string; canonicalSha256: string }[] = [];
  for (const path of MANIFEST_SOURCE_ARTIFACTS) out.push({ path, canonicalSha256: await sha256Hex(canonicalJson(ARTIFACTS[path])) });
  return out;
}

const refsOf = (d: ScientificReviewDossier, prefix: string) => d.evidence.filter((e) => e.ref.startsWith(prefix)).map((e) => e.ref.slice(prefix.length));

function termDossier(d: ScientificReviewDossier, entry: ScientificReviewEntry | undefined, blockers: string[]): DossierTerm {
  const handoffRef = `handoff:${d.termId}`;
  const candidates = d.candidateCatalogIds.map((id) => catalogEntryFor(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const nikolasIds = refsOf(d, "nikolas:");
  const boneIds = refsOf(d, "handbook:");
  const facts: DossierTerm["verifiedFacts"] = [];
  const assumptions: string[] = [];
  const decisions: RequiredDecision[] = [];

  facts.push({ statement: `The P36 handoff records ${d.observations} held observation(s) labelled "${d.sourceLabel}" with unit "${d.sourceUnit}" and review status ${d.handoff.reviewStatus}.`, ref: handoffRef });
  for (const c of candidates)
    facts.push({ statement: `${c.catalog} ${c.id} is "${c.name}" (domain ${c.domain}, status ${c.status}); validated catalog unit: ${c.unit ?? "none"}.`, ref: `${c.catalog === "P36" ? "p36" : "p355"}:${c.id}` });
  for (const u of d.unitComparisons)
    if (u.referenceUnits.length)
      facts.push({ statement: `${u.reference} lists unit text ${u.referenceUnits.map((x) => `"${x}"`).join(" or ")}; exact text ${u.status === "EXACT_STRING_MATCH" ? "matches" : "differs from"} "${d.sourceUnit}".`, ref: u.reference });
  for (const id of nikolasIds) {
    const disp = p43DispositionFor(id);
    if (disp) facts.push({ statement: `P43 provisional, non-authoritative semantic disposition for ${id}: ${disp}.`, ref: `p43:${id}` });
  }

  // Identity
  const handoffId = d.handoff.candidateCatalogId;
  let identity: DossierField;
  if (d.candidateCatalogIds.length > 1)
    identity = { value: `Conflict: ${d.candidateCatalogIds.map((id) => `${id}${id === handoffId ? " (handoff)" : " (other source)"}`).join(" vs ")}`, basis: "CONFLICTING_SOURCES", refs: d.candidateCatalogIds };
  else if (handoffId)
    identity = { value: `${handoffId} — ${d.handoff.candidateCatalogName ?? candidates[0]?.name ?? ""} (proposed by the handoff)`, basis: "PROPOSED_UNCONFIRMED", refs: [handoffRef] };
  else if (candidates.length)
    identity = { value: `No canonical identity in the handoff; repository candidate ${candidates[0]!.id} — ${candidates[0]!.name}`, basis: "UNRESOLVED", refs: candidates.map((c) => c.id) };
  else identity = { value: "No canonical identity in any source", basis: "UNRESOLVED", refs: [] };
  if (handoffId || candidates.length) assumptions.push(`That the held observations measure the same analyte as ${d.candidateCatalogIds.join(" or ")} is an assumption until confirmed.`);
  decisions.push({ id: "IDENTITY", text: d.candidateCatalogIds.length ? `Confirm the canonical identity: choose ${d.candidateCatalogIds.join(" or ")}, propose a new metric, or reject.` : "Establish a canonical identity or reject the term." });

  // Domain
  const domains = [...new Set(candidates.map((c) => c.domain))];
  const domain: DossierField =
    domains.length > 1
      ? { value: `Conflict: ${domains.join(" vs ")}`, basis: "CONFLICTING_SOURCES", refs: candidates.map((c) => c.id) }
      : domains.length === 1
        ? { value: `${domains[0]} (from candidate catalog entry)`, basis: "PROPOSED_UNCONFIRMED", refs: candidates.map((c) => c.id) }
        : { value: "Not determined", basis: "UNRESOLVED", refs: [] };
  if (domains.length > 1) decisions.push({ id: "DOMAIN", text: `Assign one owning domain (${domains.join(" or ")}).` });

  // Relation (P43 dispositions other than potential equivalence)
  const relationNotes = nikolasIds.map((id) => [id, p43DispositionFor(id)] as const).filter(([, v]) => v && v !== "POTENTIAL_EQUIVALENCE_VERIFY_PROTOCOL");
  for (const [id, v] of relationNotes)
    decisions.push({ id: "RELATION", text: `Decide alias vs related distinct measure vs component (P43 provisional for ${id}: ${v}).` });

  // Specimen
  const specimenFacts = boneIds.map((id) => [id, boneHandbookFact(id)?.specimen] as const).filter(([, s]) => s);
  const specimen: DossierField = specimenFacts.length
    ? { value: specimenFacts.map(([id, s]) => `Bone handbook v7 ${id} states: ${s}`).join("; "), basis: "VERIFIED_SOURCE_FACT", refs: specimenFacts.map(([id]) => `handbook:${id}`) }
    : { value: "No specimen recorded in repository sources", basis: "NOT_IN_SOURCES", refs: [] };
  for (const [id, s] of specimenFacts) facts.push({ statement: `Bone handbook v7 ${id} states the specimen is "${s}".`, ref: `handbook:${id}` });
  assumptions.push("The specimen actually used for the held observations is not recorded with them.");
  decisions.push({ id: "SPECIMEN", text: "Confirm the specimen used for these observations." });

  // Method
  const method: DossierField = { value: "No assay or measurement method is recorded in any repository source", basis: "NOT_IN_SOURCES", refs: [] };
  assumptions.push("The assay or measurement method is unknown; comparability across methods cannot be assumed.");
  decisions.push({ id: "METHOD", text: "Confirm the assay or measurement method." });

  // Protocol (+ explicit non-validation)
  const reasons = new Set(d.handoff.blockReasons);
  const protocol: DossierField = reasons.has("protocol_unvalidated")
    ? { value: "Test protocol explicitly unvalidated", basis: "NOT_VALIDATED", refs: [handoffRef] }
    : reasons.has("scale_unvalidated")
      ? { value: "Scale explicitly unvalidated; protocol not recorded", basis: "NOT_VALIDATED", refs: [handoffRef] }
      : { value: "No collection or test protocol recorded in repository sources", basis: "NOT_IN_SOURCES", refs: [] };
  decisions.push({ id: "PROTOCOL", text: "Confirm the collection or test protocol." });
  if (reasons.has("scale_unvalidated")) decisions.push({ id: "VALIDATION", text: "Supply validation evidence for the scale (instrument, range, anchors)." });
  if (reasons.has("protocol_unvalidated")) decisions.push({ id: "VALIDATION", text: "Supply validation evidence for the test protocol." });

  // Units
  const sourceUnit: DossierField = { value: d.sourceUnit, basis: "VERIFIED_SOURCE_FACT", refs: [handoffRef] };
  const differs = d.unitComparisons.filter((u) => u.status === "STRING_DIFFERS_NO_CONVERSION");
  const candidateUnits = candidates.map((c) => c.unit).filter((u): u is string => Boolean(u));
  const candidateCatalogUnit: DossierField = candidateUnits.length
    ? { value: candidateUnits.join(" / "), basis: "VERIFIED_SOURCE_FACT", refs: candidates.map((c) => c.id) }
    : { value: "None validated in the candidate catalog entr" + (candidates.length === 1 ? "y" : "ies"), basis: "NOT_VALIDATED", refs: candidates.map((c) => c.id) };
  for (const u of differs) assumptions.push(`"${d.sourceUnit}" differs in exact text from ${u.reference} (${u.referenceUnits.join(" or ")}); no equivalence or conversion is assumed.`);
  decisions.push({
    id: "UNIT",
    text: differs.length
      ? `Confirm the exact catalog unit text; the observed "${d.sourceUnit}" differs from ${differs.map((u) => u.reference).join(", ")}. No conversion is permitted.`
      : `Confirm "${d.sourceUnit}" as the exact catalog unit text.`,
  });

  if (!nikolasIds.length) {
    assumptions.push("No Nikolas source record supports this term.");
    decisions.push({ id: "SOURCE", text: "Identify the source document that supports this term." });
  }
  decisions.push({ id: "EVIDENCE", text: "Cite handbook or primary-source evidence references for each confirmation." });

  return {
    termId: d.termId,
    sourceLabel: d.sourceLabel,
    observations: d.observations,
    status: REQUIRED_SCIENTIFIC_GATE,
    activationAllowed: false,
    sourceReferences: [{ ref: handoffRef, title: "P36 reconciliation handoff row" }, ...d.evidence.map((e) => ({ ref: e.ref, title: e.title }))],
    fields: { proposedCanonicalIdentity: identity, domain, specimen, assayOrMethod: method, protocol, sourceUnit, candidateCatalogUnit },
    verifiedFacts: facts,
    unresolvedAssumptions: assumptions,
    scientificUncertainties: d.unresolvedQuestions,
    requiredDecisions: decisions,
    latestWorksheetEntry: entry
      ? {
          sequence: entry.sequence,
          decision: SCIENTIFIC_REVIEW_DECISION_LABELS[entry.decision],
          targetCatalogId: entry.targetCatalogId,
          reviewerName: entry.reviewerName,
          recordedAt: entry.recordedAt,
          hash: entry.hash,
          note: "Documentary worksheet entry; not a scientific approval.",
        }
      : null,
    blockers,
  };
}


function matrixRow(t: DossierTerm, d: ScientificReviewDossier): DecisionMatrixRow {
  const f = t.fields;
  const has = (id: RequiredDecision["id"]) => t.requiredDecisions.some((r) => r.id === id);
  const specimenShort = f.specimen.basis === "VERIFIED_SOURCE_FACT" ? f.specimen.value.replace(/Bone handbook v7 \S+ states: /g, "") : "not recorded";
  const differs = d.unitComparisons.filter((u) => u.status === "STRING_DIFFERS_NO_CONVERSION").flatMap((u) => u.referenceUnits);
  return {
    termId: t.termId,
    sourceLabel: t.sourceLabel,
    sourceUnit: d.sourceUnit,
    identity: f.proposedCanonicalIdentity.basis === "CONFLICTING_SOURCES" ? `Resolve: ${d.candidateCatalogIds.join(" vs ")}` : d.candidateCatalogIds.length ? `Confirm ${d.candidateCatalogIds.join("/")}${d.handoff.candidateCatalogId ? "" : " (handoff unresolved)"}` : "Establish identity",
    domain: f.domain.basis === "CONFLICTING_SOURCES" ? `Resolve: ${f.domain.value.replace("Conflict: ", "")}` : `Confirm ${f.domain.value.replace(" (from candidate catalog entry)", "")}`,
    specimen: f.specimen.basis === "VERIFIED_SOURCE_FACT" ? `Confirm (handbook: ${specimenShort})` : "Confirm (not recorded)",
    method: "Confirm (not recorded)",
    protocol: f.protocol.basis === "NOT_VALIDATED" ? "Validate (unvalidated)" : "Confirm (not recorded)",
    unit: differs.length ? `Confirm "${d.sourceUnit}" vs ${[...new Set(differs)].map((u) => `"${u}"`).join(", ")} (no conversion)` : `Confirm "${d.sourceUnit}" (no catalog unit)`,
    validation: has("VALIDATION") ? "Validation evidence required" : has("SOURCE") ? "Source document required" : has("RELATION") ? "Alias vs distinct measure" : "Evidence references",
    status: REQUIRED_SCIENTIFIC_GATE,
  };
}

export async function buildDecisionDossier(
  entries: readonly ScientificReviewEntry[],
  options: { generatedAt: string | null; authorization?: AuthorizationView } = { generatedAt: null },
): Promise<DecisionDossier> {
  const build = buildScientificReviewDossiers();
  const manifest = await buildActivationManifest(entries);
  const chain = await verifyScientificReviewChain(entries);
  const latest = chain.ok ? latestEntryByTerm(entries) : new Map<string, ScientificReviewEntry>();
  const terms = build.dossiers.map((d) => {
    const mt = manifest.terms.find((t) => t.termId === d.termId);
    const blockers = (mt?.blockers ?? ["SOURCE_ARTIFACT_INTEGRITY_FAILED" as const]).map((b) => ACTIVATION_BLOCKER_LABELS[b]);
    return termDossier(d, latest.get(d.termId), blockers);
  });
  const matrix = terms.map((t, i) => matrixRow(t, build.dossiers[i]!));
  const finalAuthorization = finalAuthorizationSection(options.authorization, build.dossiers);
  const body: DecisionDossier = {
    schema: DECISION_DOSSIER_SCHEMA,
    title: "P36 Scientific Decision Dossier — 12 catalog reconciliation terms",
    addressedTo: "Nikolas (independent scientific reviewer)",
    generatedAt: null,
    status: REQUIRED_SCIENTIFIC_GATE,
    activationAllowed: false,
    appliesChanges: false,
    scientificApprovals: finalAuthorization.counts.SCIENTIFICALLY_APPROVED,
    manifestVersion: manifest.manifestVersion,
    baseCatalogVersion: manifest.baseCatalogVersion,
    basisLegend: FIELD_BASIS_LABELS,
    counts: {
      terms: terms.length,
      observations: terms.reduce((n, t) => n + t.observations, 0),
      blocked: terms.filter((t) => t.blockers.length).length,
      requiredDecisions: terms.reduce((n, t) => n + t.requiredDecisions.length, 0),
      conflicts: terms.filter((t) => Object.values(t.fields).some((f) => f.basis === "CONFLICTING_SOURCES")).length,
      missingMethods: terms.filter((t) => t.fields.assayOrMethod.basis === "NOT_IN_SOURCES").length,
    },
    decisionMatrix: matrix,
    terms,
    activationPrerequisites: GLOBAL_ACTIVATION_PREREQUISITES,
    finalAuthorization,
    integrity: {
      algorithm: "SHA-256",
      contentDigest: "",
      manifestDigest: manifest.manifestDigest,
      reviewHistory: manifest.reviewHistory,
      sourceIntegrity: build.ok ? "VERIFIED" : "FAILED",
      sourceProblems: build.problems,
      sourceArtifactDigests: await sourceArtifactDigests(),
    },
  };
  const contentDigest = await sha256Hex(canonicalJson(body));
  return { ...body, generatedAt: options.generatedAt, integrity: { ...body.integrity, contentDigest } };
}

export interface DossierVerification {
  ok: boolean;
  problems: string[];
  /** True when the dossier's source digests equal the artifacts in this build. */
  sourcesCurrent: boolean;
}

/** Verify an exported dossier JSON: content digest, pending statuses and source digests. Read-only. */
export async function verifyDecisionDossier(input: unknown): Promise<DossierVerification> {
  const problems: string[] = [];
  const d = input as Partial<DecisionDossier> | null;
  if (!d || typeof d !== "object" || d.schema !== DECISION_DOSSIER_SCHEMA || !d.integrity || !Array.isArray(d.terms))
    return { ok: false, problems: ["Not a P36 decision dossier."], sourcesCurrent: false };
  if (d.status !== REQUIRED_SCIENTIFIC_GATE || d.activationAllowed !== false || d.appliesChanges !== false)
    problems.push("Dossier claims approval or activation.");
  const fa = d.finalAuthorization;
  if (!fa || fa.notAnAuthorizationToken !== true || !Array.isArray(fa.terms)) problems.push("Final authorization section is missing or claims to be an authorization token.");
  else {
    const approved = fa.terms.filter((t) => t.scientificStatus === "SCIENTIFICALLY_APPROVED").length;
    if (d.scientificApprovals !== approved) problems.push("Approval count does not match the final authorization section.");
    if (fa.source === "NOT_LOADED" && approved !== 0) problems.push("An export without the cloud ledger claims approvals.");
    if (fa.terms.some((t) => t.activationStatus === "ACTIVE" && (!t.gates.length || t.gates.some((g) => !g.passed))))
      problems.push("A term claims activation without passing every activation gate.");
  }
  if (d.terms.some((t) => t.status !== REQUIRED_SCIENTIFIC_GATE || t.activationAllowed !== false || !t.blockers?.length))
    problems.push("A term claims a non-pending status, activation or no blockers.");
  const claimed = d.integrity.contentDigest;
  const recomputed = await sha256Hex(canonicalJson({ ...d, generatedAt: null, integrity: { ...d.integrity, contentDigest: "" } }));
  if (claimed !== recomputed) problems.push("Content digest does not match; the file was modified after export.");
  const current = await sourceArtifactDigests();
  const sourcesCurrent = canonicalJson(current) === canonicalJson(d.integrity.sourceArtifactDigests ?? []);
  return { ok: problems.length === 0, problems, sourcesCurrent };
}
