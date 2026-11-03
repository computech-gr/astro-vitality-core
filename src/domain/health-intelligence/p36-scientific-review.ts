/**
 * P36 Scientific Review & Governed Activation Preparation (pure, deterministic).
 *
 * Builds one reviewer dossier per term of the 12-term P36 reconciliation
 * handoff by joining EXACT record IDs listed in
 * data/scientific/p36-scientific-review-crosswalk.v1.json against existing
 * repository artifacts (P36 registry, P35.5 draft catalog, Bone handbook v7 +
 * English layer, Nikolas source intakes, P38/P40/P42/P43 worksheets). Records
 * documentary reviewer worksheet entries in a SHA-256 hash-chained append-only
 * history and prepares a versioned activation manifest.
 *
 * Never activates anything: the effective status is always
 * PENDING_NIKOLAS_REVIEW, proposed extensions are always PENDING_NIKOLAS_REVIEW,
 * units are compared by exact string only (never converted or equated), and
 * the governed catalog-extensions registry is never written. Only a separate,
 * code-reviewed activation patch can change catalogs.
 */
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
import {
  BLOCK_REASON_LABELS,
  buildReconciliationView,
  type BlockReason,
  type ReconciliationRowView,
} from "./catalog-reconciliation-handoff";

export const SCIENTIFIC_REVIEW_ENTRY_SCHEMA = "mitochondria.p36-scientific-review-entry.v1";
export const ACTIVATION_MANIFEST_SCHEMA = "mitochondria.p36-activation-manifest.v1";
export const CROSSWALK_SCHEMA = "mitochondria.p36-scientific-review-crosswalk.v1";
export const CHAIN_GENESIS = "GENESIS";

// ---------- Source record lookups (exact ID only) ----------

type P36Metric = { id: string; name: string; originalUnit?: string | null; sourceClassification?: string; integrationStatus?: string };
type P355Entry = { id: string; name: string; domain: string; status: string };
type BoneVar = { id: string; name: string; handbookEvidenceTier?: string; reviewStatus?: string };
type BoneEn = { id: string; what_en?: string; specimen_en?: string; unit_en?: string; reviewFlag?: string };
type NikolasEntry = { source_id: string; name: string; unit: string; source: string; status: string; approval: string };
type P38Row = { source_id: string; disposition: string; unit_check: string };
type P40Row = { source_id: string; candidate_catalog_id: string | null; candidate_relation: string | null; unit_review: string; review_decision: string; reviewer: string | null };
type P42Row = { source_id: string; candidate_catalog_id: string; triage_bucket: string; review_questions: string[] };
type P43Row = { source_id: string; candidate_catalog_id: string; provisional_semantic_disposition: string; scientific_rationale: string; required_checks: string[]; evidence_status: string };

const byId = <T, K extends keyof T>(rows: readonly T[], key: K) => new Map(rows.map((r) => [r[key] as unknown as string, r]));
const P36 = byId(p36Registry.metrics as readonly P36Metric[], "id");
const P355 = byId(p355Catalog.entries as readonly P355Entry[], "id");
const BONE = byId(boneCatalog.variables as readonly BoneVar[], "id");
const BONE_EN = byId(boneEnglish.variables as readonly BoneEn[], "id");
const NIKOLAS = byId([...(immuneIntake.entries as readonly NikolasEntry[]), ...(behavioralIntake.entries as readonly NikolasEntry[])], "source_id");
const NIKOLAS_DOC = new Map<string, string>([
  ...(immuneIntake.entries as readonly NikolasEntry[]).map((e) => [e.source_id, immuneIntake.source_doc] as [string, string]),
  ...(behavioralIntake.entries as readonly NikolasEntry[]).map((e) => [e.source_id, behavioralIntake.source_doc] as [string, string]),
]);
const P38 = byId(p38Reconciliation.rows as readonly P38Row[], "source_id");
const P40 = byId(p40Ledger.rows as readonly P40Row[], "source_id");
const P42 = byId(p42Triage.rows as readonly P42Row[], "source_id");
const P43 = byId(p43Proposals.rows as readonly P43Row[], "source_id");

// ---------- Crosswalk + dossier ----------

export interface CrosswalkTerm {
  termId: string;
  p36Ids: string[];
  p355Ids: string[];
  boneHandbookIds: string[];
  nikolasSourceIds: string[];
  questions: string[];
}
export interface Crosswalk {
  schema: string;
  status: string;
  activationAllowed: boolean;
  terms: CrosswalkTerm[];
}

export type UnitComparisonStatus = "EXACT_STRING_MATCH" | "STRING_DIFFERS_NO_CONVERSION" | "NO_REFERENCE_UNIT";
export interface UnitComparison {
  reference: string;
  referenceUnits: string[];
  status: UnitComparisonStatus;
}

export interface EvidenceItem {
  /** Stable reference usable in reviewer entries, e.g. "handbook:bone-019". */
  ref: string;
  title: string;
  details: string[];
}

export interface ScientificReviewDossier {
  termId: string;
  sourceLabel: string;
  sourceUnit: string;
  observations: number;
  handoff: ReconciliationRowView;
  /** Candidate catalog IDs a reviewer may choose from (handoff + crosswalk). Never auto-selected. */
  candidateCatalogIds: string[];
  specimen: string[];
  assayProtocolNotes: string[];
  unitComparisons: UnitComparison[];
  /** Always true while no catalog unit is validated for any candidate. */
  noValidatedCatalogUnit: boolean;
  evidence: EvidenceItem[];
  unresolvedQuestions: string[];
  status: typeof REQUIRED_SCIENTIFIC_GATE;
}

/** Exact trimmed string equality only; no case folding, Unicode folding or dimensional reasoning. */
export function compareUnit(sourceUnit: string, reference: string, units: readonly (string | null | undefined)[]): UnitComparison {
  const referenceUnits = units.map((u) => (u ?? "").trim()).filter(Boolean);
  if (!referenceUnits.length) return { reference, referenceUnits: [], status: "NO_REFERENCE_UNIT" };
  return {
    reference,
    referenceUnits,
    status: referenceUnits.includes(sourceUnit.trim()) ? "EXACT_STRING_MATCH" : "STRING_DIFFERS_NO_CONVERSION",
  };
}

/** Handbook unit text such as "pg/mL or ng/L" lists alternatives verbatim. */
const splitHandbookUnits = (text: string | undefined) => (text ?? "").split(/\s+or\s+/).map((u) => u.trim()).filter(Boolean);

export interface DossierBuild {
  ok: boolean;
  problems: string[];
  dossiers: ScientificReviewDossier[];
}

export function buildScientificReviewDossiers(crosswalk: Crosswalk = crosswalkJson as Crosswalk): DossierBuild {
  const view = buildReconciliationView();
  const problems = [...view.problems];
  if (crosswalk.schema !== CROSSWALK_SCHEMA) problems.push(`Unexpected crosswalk schema ${crosswalk.schema}`);
  if (crosswalk.status !== REQUIRED_SCIENTIFIC_GATE || crosswalk.activationAllowed !== false) problems.push("Crosswalk claims a non-pending status or activation; refused");
  const linkFor = new Map(crosswalk.terms.map((t) => [t.termId, t]));
  if (linkFor.size !== crosswalk.terms.length) problems.push("Crosswalk lists a term more than once");
  for (const t of crosswalk.terms) if (!view.rows.some((r) => r.termId === t.termId)) problems.push(`Crosswalk term ${t.termId} is not in the handoff`);

  const dossiers = view.rows.map((row): ScientificReviewDossier => {
    const link = linkFor.get(row.termId);
    if (!link) problems.push(`${row.sourceLabel}: no crosswalk entry`);
    const l: CrosswalkTerm = link ?? { termId: row.termId, p36Ids: [], p355Ids: [], boneHandbookIds: [], nikolasSourceIds: [], questions: [] };
    const evidence: EvidenceItem[] = [];
    const units: UnitComparison[] = [];
    const specimen: string[] = [];
    const assay: string[] = [];
    const questions: string[] = [...l.questions];

    for (const id of l.p36Ids) {
      const m = P36.get(id);
      if (!m) { problems.push(`${row.sourceLabel}: P36 ${id} not found`); continue; }
      evidence.push({ ref: `p36:${id}`, title: `P36 catalog ${id} — ${m.name}`, details: [`Catalog unit: ${m.originalUnit ?? "not validated"}`, `Source classification: ${m.sourceClassification ?? "unknown"}`, `Integration: ${m.integrationStatus ?? "unknown"}`] });
      units.push(compareUnit(row.sourceUnit, `P36 catalog ${id}`, [m.originalUnit]));
    }
    for (const id of l.p355Ids) {
      const e = P355.get(id);
      if (!e) { problems.push(`${row.sourceLabel}: P35.5 ${id} not found`); continue; }
      evidence.push({ ref: `p355:${id}`, title: `P35.5 draft ${id} — ${e.name}`, details: [`Domain: ${e.domain}`, `Status: ${e.status}`, "Draft catalog has no units"] });
      units.push(compareUnit(row.sourceUnit, `P35.5 draft ${id}`, []));
    }
    for (const id of l.boneHandbookIds) {
      const v = BONE.get(id);
      const en = BONE_EN.get(id);
      if (!v || !en) { problems.push(`${row.sourceLabel}: Bone handbook ${id} not found`); continue; }
      if (en.specimen_en) specimen.push(`${en.specimen_en} (Bone handbook v7, ${id})`);
      evidence.push({
        ref: `handbook:${id}`,
        title: `Bone handbook v7 ${id} — ${v.name}`,
        details: [en.what_en ?? "", `Specimen: ${en.specimen_en ?? "not stated"}`, `Units listed: ${en.unit_en ?? "not stated"}`, `Evidence tier: ${v.handbookEvidenceTier ?? "?"}`, `Review: ${v.reviewStatus ?? "?"}`, ...(en.reviewFlag ? [`Review flag: ${en.reviewFlag}`] : [])].filter(Boolean),
      });
      units.push(compareUnit(row.sourceUnit, `Bone handbook v7 ${id}`, splitHandbookUnits(en.unit_en)));
    }
    for (const id of l.nikolasSourceIds) {
      const n = NIKOLAS.get(id);
      if (!n) { problems.push(`${row.sourceLabel}: Nikolas source ${id} not found`); continue; }
      evidence.push({ ref: `nikolas:${id}`, title: `Nikolas source ${id} — ${n.name}`, details: [`Unit: ${n.unit}`, `Source: ${n.source}`, `Document: ${NIKOLAS_DOC.get(id) ?? "unknown"}`, `Status: ${n.status}`, `Approval: ${n.approval}`] });
      units.push(compareUnit(row.sourceUnit, `Nikolas source ${id}`, [n.unit]));
      const p38 = P38.get(id);
      if (p38) evidence.push({ ref: `p38:${id}`, title: `P38 reconciliation ${id}`, details: [`Disposition: ${p38.disposition}`, `Unit check: ${p38.unit_check}`] });
      const p40 = P40.get(id);
      if (p40) evidence.push({ ref: `p40:${id}`, title: `P40 independent review worksheet ${id}`, details: [`Candidate: ${p40.candidate_catalog_id ?? "none"} (${p40.candidate_relation ?? "not evaluated"})`, `Unit review: ${p40.unit_review}`, `Decision: ${p40.review_decision}`, `Reviewer: ${p40.reviewer ?? "none"}`] });
      const p42 = P42.get(id);
      if (p42) {
        evidence.push({ ref: `p42:${id}`, title: `P42 semantic triage ${id}`, details: [`Bucket: ${p42.triage_bucket}`] });
        for (const q of p42.review_questions) if (!questions.includes(q)) questions.push(q);
      }
      const p43 = P43.get(id);
      if (p43) {
        evidence.push({ ref: `p43:${id}`, title: `P43 semantic proposal ${id}`, details: [`Provisional disposition: ${p43.provisional_semantic_disposition}`, p43.scientific_rationale, `Evidence status: ${p43.evidence_status}`] });
        for (const c of p43.required_checks) if (!assay.includes(c)) assay.push(c);
      }
    }

    const candidateCatalogIds = [...new Set([row.candidateCatalogId, ...l.p36Ids, ...l.p355Ids].filter((x): x is string => Boolean(x)))].sort();
    const catalogUnits = candidateCatalogIds.map((id) => P36.get(id)?.originalUnit ?? null);
    return {
      termId: row.termId,
      sourceLabel: row.sourceLabel,
      sourceUnit: row.sourceUnit,
      observations: row.observations,
      handoff: row,
      candidateCatalogIds,
      specimen,
      assayProtocolNotes: assay,
      unitComparisons: units,
      noValidatedCatalogUnit: catalogUnits.every((u) => !u?.trim()),
      evidence,
      unresolvedQuestions: questions,
      status: REQUIRED_SCIENTIFIC_GATE,
    };
  });
  return { ok: problems.length === 0, problems, dossiers };
}

// ---------- Reviewer worksheet entries (documentary, append-only, hash-chained) ----------

/** P40 decision vocabulary. None of them is an activation. */
export type ScientificReviewDecision =
  | "ACCEPT_ALIAS_WITH_EVIDENCE"
  | "ACCEPT_RELATED_DISTINCT_MEASURE"
  | "REJECT_CANDIDATE_MAPPING"
  | "NEEDS_MORE_EVIDENCE";

export const SCIENTIFIC_REVIEW_DECISION_LABELS: Record<ScientificReviewDecision, string> = {
  ACCEPT_ALIAS_WITH_EVIDENCE: "Recommend same measure (alias) — evidence supplied",
  ACCEPT_RELATED_DISTINCT_MEASURE: "Related but distinct measure (needs its own metric)",
  REJECT_CANDIDATE_MAPPING: "Reject candidate mapping",
  NEEDS_MORE_EVIDENCE: "Needs more evidence",
};

export const RECORDER_ROLES = ["ground_medical", "researcher"] as const;
export type RecorderRole = (typeof RECORDER_ROLES)[number];

export interface ScientificReviewInput {
  termId: string;
  decision: ScientificReviewDecision;
  targetCatalogId?: string | undefined;
  /** The exact catalog unit the reviewer confirms; must equal the source unit string for an alias. */
  confirmedUnit?: string | undefined;
  specimen?: string | undefined;
  assayMethod?: string | undefined;
  protocol?: string | undefined;
  evidenceRefs: string[];
  rationale: string;
  reviewerName: string;
  reviewerQualification: string;
  /** Reviewer states they did not author the candidate mapping and have no conflict. */
  independenceConfirmed: boolean;
}

export interface ScientificReviewEntry {
  schema: typeof SCIENTIFIC_REVIEW_ENTRY_SCHEMA;
  sequence: number;
  prevHash: string;
  hash: string;
  termId: string;
  decision: ScientificReviewDecision;
  targetCatalogId: string | null;
  confirmedUnit: string | null;
  specimen: string | null;
  assayMethod: string | null;
  protocol: string | null;
  evidenceRefs: string[];
  rationale: string;
  reviewerName: string;
  reviewerQualification: string;
  independenceConfirmed: true;
  recordedByUserId: string;
  recordedByRole: RecorderRole;
  recordedAt: string;
  /** Fixed: worksheet entries are documentary, never approvals or activations. */
  scientificStatus: typeof REQUIRED_SCIENTIFIC_GATE;
  documentaryOnly: true;
  activationApplied: false;
}

export function recorderRoleFor(roles: readonly string[]): RecorderRole | null {
  if (roles.includes("ground_medical")) return "ground_medical";
  if (roles.includes("researcher")) return "researcher";
  return null;
}

const EXTERNAL_REF = /^(doi:10\.\S+|pmid:\d+|url:https:\/\/\S+|doc:\S.{2,})$/;
const PROHIBITED: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bdiagnos\w*/i, reason: "diagnoses" },
  { pattern: /\b(threshold|cut-?off|reference\s+range|normal\s+range|upper\s+limit|lower\s+limit)\b/i, reason: "clinical thresholds or reference ranges" },
  { pattern: /[<>≤≥]\s*\d/, reason: "numeric limits" },
  { pattern: /\bfit(ness)?[\s-]+for[\s-]+duty\b/i, reason: "fitness-for-duty conclusions" },
  { pattern: /\b(convert\w*|conversion|multiply|divide\s+by|conversion\s+factor)\b/i, reason: "unit conversions" },
];

export function prohibitedContent(text: string): string | null {
  for (const p of PROHIBITED) if (p.pattern.test(text)) return p.reason;
  return null;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/** Validate a worksheet input against the term's dossier. Fails closed with a specific reason. */
export function validateScientificReviewInput(input: ScientificReviewInput, dossier: ScientificReviewDossier | undefined): ValidationResult {
  const no = (reason: string): ValidationResult => ({ ok: false, reason });
  if (!dossier || dossier.termId !== input.termId) return no("Unknown term; only the 12 handoff terms can be reviewed.");
  if (!(input.decision in SCIENTIFIC_REVIEW_DECISION_LABELS)) return no("Unsupported decision.");
  if (!input.reviewerName?.trim()) return no("Enter the independent scientific reviewer's name.");
  if (!input.reviewerQualification?.trim()) return no("Enter the reviewer's scientific qualification.");
  if (input.independenceConfirmed !== true) return no("The reviewer must confirm independence (did not author the candidate mapping, no conflict).");
  if ((input.rationale ?? "").trim().length < 20) return no("Enter a rationale of at least 20 characters.");
  const refs = (input.evidenceRefs ?? []).map((r) => r.trim()).filter(Boolean);
  if (!refs.length) return no("Add at least one evidence reference.");
  const known = new Set(dossier.evidence.map((e) => e.ref));
  const bad = refs.find((r) => !known.has(r) && !EXTERNAL_REF.test(r));
  if (bad) return no(`Evidence reference "${bad}" is neither a listed dossier reference nor doi:/pmid:/url:https:///doc: citation.`);
  for (const [field, text] of [["rationale", input.rationale], ["specimen", input.specimen], ["assay/method", input.assayMethod], ["protocol", input.protocol]] as const) {
    const hit = prohibitedContent(text ?? "");
    if (hit) return no(`The ${field} mentions ${hit}; the review worksheet does not accept ${hit}.`);
  }
  const target = input.targetCatalogId?.trim() ?? "";
  if (input.decision === "ACCEPT_ALIAS_WITH_EVIDENCE" || input.decision === "ACCEPT_RELATED_DISTINCT_MEASURE") {
    if (!target) return no("Choose the candidate catalog ID this decision refers to.");
    if (!dossier.candidateCatalogIds.includes(target)) return no(`${target} is not a candidate for this term; automatic or free-form aliases are not permitted.`);
  }
  if (input.decision === "ACCEPT_ALIAS_WITH_EVIDENCE") {
    if (!input.specimen?.trim()) return no("Confirm the specimen.");
    if (!input.assayMethod?.trim()) return no("Confirm the assay or measurement method.");
    if (!input.protocol?.trim()) return no("Confirm the collection or test protocol.");
    const unit = input.confirmedUnit?.trim() ?? "";
    if (!unit) return no("Confirm the exact catalog unit.");
    if (unit !== dossier.sourceUnit.trim())
      return no(`The confirmed unit "${unit}" differs from the observed unit "${dossier.sourceUnit}". An alias requires the identical unit string; no conversion or equivalence is permitted.`);
  }
  return { ok: true };
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const entryHashInput = (e: Omit<ScientificReviewEntry, "hash">) => canonicalJson(e);

export async function buildScientificReviewEntry(
  input: ScientificReviewInput,
  dossier: ScientificReviewDossier | undefined,
  prior: readonly ScientificReviewEntry[],
  recorder: { userId: string; roles: readonly string[]; recordedAt: string },
): Promise<{ ok: true; entry: ScientificReviewEntry } | { ok: false; reason: string }> {
  const role = recorderRoleFor(recorder.roles);
  if (!recorder.userId || !role) return { ok: false, reason: "Only a signed-in Ground Medical or Researcher member can record review worksheet entries." };
  if (!Number.isFinite(Date.parse(recorder.recordedAt))) return { ok: false, reason: "Invalid recording time." };
  const chain = await verifyScientificReviewChain(prior);
  if (!chain.ok) return { ok: false, reason: `The review history failed its integrity check; nothing can be appended (${chain.problems[0]}).` };
  const v = validateScientificReviewInput(input, dossier);
  if (!v.ok) return v;
  const last = prior.at(-1);
  const opt = (s: string | undefined) => (s?.trim() ? s.trim() : null);
  const isTargeted = input.decision === "ACCEPT_ALIAS_WITH_EVIDENCE" || input.decision === "ACCEPT_RELATED_DISTINCT_MEASURE";
  const body: Omit<ScientificReviewEntry, "hash"> = {
    schema: SCIENTIFIC_REVIEW_ENTRY_SCHEMA,
    sequence: (last?.sequence ?? 0) + 1,
    prevHash: last?.hash ?? CHAIN_GENESIS,
    termId: input.termId,
    decision: input.decision,
    targetCatalogId: isTargeted ? opt(input.targetCatalogId) : null,
    confirmedUnit: input.decision === "ACCEPT_ALIAS_WITH_EVIDENCE" ? opt(input.confirmedUnit) : null,
    specimen: opt(input.specimen),
    assayMethod: opt(input.assayMethod),
    protocol: opt(input.protocol),
    evidenceRefs: [...new Set(input.evidenceRefs.map((r) => r.trim()).filter(Boolean))].sort(),
    rationale: input.rationale.trim(),
    reviewerName: input.reviewerName.trim(),
    reviewerQualification: input.reviewerQualification.trim(),
    independenceConfirmed: true,
    recordedByUserId: recorder.userId,
    recordedByRole: role,
    recordedAt: recorder.recordedAt,
    scientificStatus: REQUIRED_SCIENTIFIC_GATE,
    documentaryOnly: true,
    activationApplied: false,
  };
  return { ok: true, entry: { ...body, hash: await sha256Hex(entryHashInput(body)) } };
}

export async function verifyScientificReviewChain(entries: readonly ScientificReviewEntry[]): Promise<{ ok: boolean; problems: string[]; head: string }> {
  const problems: string[] = [];
  let prev = CHAIN_GENESIS;
  for (const [i, e] of entries.entries()) {
    if (e.sequence !== i + 1) problems.push(`Entry ${i + 1}: sequence ${e.sequence} breaks the order`);
    if (e.prevHash !== prev) problems.push(`Entry ${e.sequence}: previous-hash link broken`);
    if (e.scientificStatus !== REQUIRED_SCIENTIFIC_GATE || e.documentaryOnly !== true || e.activationApplied !== false)
      problems.push(`Entry ${e.sequence}: claims approval or activation`);
    const { hash, ...body } = e;
    if ((await sha256Hex(entryHashInput(body))) !== hash) problems.push(`Entry ${e.sequence}: content hash mismatch`);
    prev = e.hash;
  }
  return { ok: problems.length === 0, problems, head: prev };
}

export function latestEntryByTerm(entries: readonly ScientificReviewEntry[]): Map<string, ScientificReviewEntry> {
  const map = new Map<string, ScientificReviewEntry>();
  for (const e of entries) map.set(e.termId, e);
  return map;
}

// ---------- Activation manifest (prepared, never applied) ----------

export type ActivationBlocker =
  | "NO_INDEPENDENT_REVIEW_DECISION"
  | "DECISION_IS_NOT_ALIAS_RECOMMENDATION"
  | "NEW_CATALOG_METRIC_REQUIRED"
  | "TARGET_NOT_ROUTED_P36_METRIC"
  | "CATALOG_UNIT_NOT_VALIDATED"
  | "SCALE_UNVALIDATED"
  | "PROTOCOL_UNVALIDATED"
  | "IN_APP_RECORD_IS_NOT_GOVERNED_APPROVAL"
  | "REVIEW_HISTORY_INTEGRITY_FAILED"
  | "SOURCE_ARTIFACT_INTEGRITY_FAILED";

export const ACTIVATION_BLOCKER_LABELS: Record<ActivationBlocker, string> = {
  NO_INDEPENDENT_REVIEW_DECISION: "No independent scientific reviewer decision recorded",
  DECISION_IS_NOT_ALIAS_RECOMMENDATION: "Latest decision is not an evidence-backed alias recommendation",
  NEW_CATALOG_METRIC_REQUIRED: "Reviewer judged it a distinct measure; a new catalog metric would need its own governed patch",
  TARGET_NOT_ROUTED_P36_METRIC: "Target is a P35.5 draft entry, not a routed P36 metric; catalog promotion needs a separate governed patch",
  CATALOG_UNIT_NOT_VALIDATED: "Target catalog metric has no validated unit; a governed catalog patch must set the exact unit first",
  SCALE_UNVALIDATED: "Scale is explicitly unvalidated",
  PROTOCOL_UNVALIDATED: "Test protocol is explicitly unvalidated",
  IN_APP_RECORD_IS_NOT_GOVERNED_APPROVAL: "Worksheet entries are documentary; approval must be recorded in the versioned catalog-extensions registry through code review",
  REVIEW_HISTORY_INTEGRITY_FAILED: "Review history failed its integrity check",
  SOURCE_ARTIFACT_INTEGRITY_FAILED: "Handoff or crosswalk failed its integrity check",
};

export const GLOBAL_ACTIVATION_PREREQUISITES = [
  "A named, independent, qualified scientific reviewer (not the author of the candidate mapping) records an explicit decision for each term.",
  "Each decision cites handbook or primary-source evidence references.",
  "The reviewer confirms the specimen, assay or measurement method, and collection or test protocol.",
  "The exact catalog unit is confirmed and is identical to the observed unit string; no conversion or equivalence is applied.",
  "A separate governed catalog patch sets the validated unit on the target P36 metric (or promotes the P35.5 draft entry) with code review.",
  "BSC-008 scale validation and PVT protocol validation evidence are supplied before either can be considered.",
  "A separate code-reviewed patch adds the APPROVED extension and approval-history record to data/scientific/catalog-extensions.v1.json.",
  "Blocked observations are re-imported and confirmed row by row afterwards; stored records are never rewritten.",
  "PDF and report interpretation safeguards are reviewed in that separate activation patch.",
] as const;

export interface ProposedExtension {
  extensionId: string;
  version: number;
  kind: "alias_to_existing_metric";
  sourceLabel: string;
  sourceUnit: string;
  targetMetricId: string;
  /** Always pending: the manifest never writes an approval. */
  status: typeof REQUIRED_SCIENTIFIC_GATE;
  evidenceRefs: string[];
}

export interface ManifestTerm {
  termId: string;
  sourceLabel: string;
  sourceUnit: string;
  observations: number;
  candidateCatalogIds: string[];
  status: typeof REQUIRED_SCIENTIFIC_GATE;
  activationAllowed: false;
  latestDecision: null | {
    sequence: number;
    decision: ScientificReviewDecision;
    targetCatalogId: string | null;
    confirmedUnit: string | null;
    reviewerName: string;
    reviewerQualification: string;
    recordedAt: string;
    entryHash: string;
  };
  proposedExtension: ProposedExtension | null;
  blockers: ActivationBlocker[];
  handoffBlockReasons: string[];
  unresolvedQuestions: string[];
}

export interface ActivationManifest {
  schema: typeof ACTIVATION_MANIFEST_SCHEMA;
  manifestVersion: string;
  baseCatalogVersion: string;
  generatedAt: string | null;
  status: typeof REQUIRED_SCIENTIFIC_GATE;
  activationAllowed: false;
  appliesChanges: false;
  sourceArtifacts: string[];
  reviewHistory: { entries: number; headHash: string; integrity: "VERIFIED" | "FAILED" };
  counts: { terms: number; observations: number; withDecision: number; readyForGovernedActivation: 0; blocked: number };
  terms: ManifestTerm[];
  prerequisites: readonly string[];
  manifestDigest: string;
}

export const MANIFEST_SOURCE_ARTIFACTS = [
  "data/scientific/p36-unknown-biomarker-reconciliation-handoff.v1.json",
  "data/scientific/p36-scientific-review-crosswalk.v1.json",
  "data/scientific/p36-biomarker-source-registry.v1.json",
  "data/scientific/p355-proposed-domain-catalog.v1.json",
  "data/scientific/bone-health-handbook-v7.catalog.json",
  "data/scientific/bone-health-handbook-v7.en.json",
  "data/scientific/nikolas-immune-intake.v1.json",
  "data/scientific/nikolas-behavioral-intake.v1.json",
  "data/scientific/p38-nikolas-reconciliation.v1.json",
  "data/scientific/p40-independent-review-ledger.v1.json",
  "data/scientific/p42-semantic-triage.v1.json",
  "data/scientific/p43-semantic-decision-proposals.v1.json",
  "data/scientific/catalog-extensions.v1.json",
] as const;

const HANDOFF_TO_BLOCKER: Partial<Record<BlockReason, ActivationBlocker>> = {
  scale_unvalidated: "SCALE_UNVALIDATED",
  protocol_unvalidated: "PROTOCOL_UNVALIDATED",
};

export async function buildActivationManifest(
  entries: readonly ScientificReviewEntry[],
  options: { generatedAt: string | null } = { generatedAt: null },
): Promise<ActivationManifest> {
  const { ok: sourcesOk, dossiers } = buildScientificReviewDossiers();
  const chain = await verifyScientificReviewChain(entries);
  const latest = chain.ok ? latestEntryByTerm(entries) : new Map<string, ScientificReviewEntry>();
  const terms: ManifestTerm[] = dossiers.map((d) => {
    const e = latest.get(d.termId);
    const blockers = new Set<ActivationBlocker>();
    if (!sourcesOk) blockers.add("SOURCE_ARTIFACT_INTEGRITY_FAILED");
    if (!chain.ok) blockers.add("REVIEW_HISTORY_INTEGRITY_FAILED");
    if (!e) blockers.add("NO_INDEPENDENT_REVIEW_DECISION");
    else if (e.decision === "ACCEPT_RELATED_DISTINCT_MEASURE") blockers.add("NEW_CATALOG_METRIC_REQUIRED");
    else if (e.decision !== "ACCEPT_ALIAS_WITH_EVIDENCE") blockers.add("DECISION_IS_NOT_ALIAS_RECOMMENDATION");
    const target = e?.targetCatalogId ?? null;
    if (target) {
      const p36 = P36.get(target);
      if (!p36) blockers.add("TARGET_NOT_ROUTED_P36_METRIC");
      else if (!p36.originalUnit?.trim() || p36.originalUnit.trim() !== d.sourceUnit.trim()) blockers.add("CATALOG_UNIT_NOT_VALIDATED");
    } else if (d.noValidatedCatalogUnit) blockers.add("CATALOG_UNIT_NOT_VALIDATED");
    for (const r of d.handoff.blockReasons) {
      const b = HANDOFF_TO_BLOCKER[r];
      if (b) blockers.add(b);
    }
    blockers.add("IN_APP_RECORD_IS_NOT_GOVERNED_APPROVAL");
    const proposedExtension: ProposedExtension | null =
      e && e.decision === "ACCEPT_ALIAS_WITH_EVIDENCE" && target
        ? { extensionId: `ext-p36-${d.termId}`, version: e.sequence, kind: "alias_to_existing_metric", sourceLabel: d.sourceLabel, sourceUnit: d.sourceUnit, targetMetricId: target, status: REQUIRED_SCIENTIFIC_GATE, evidenceRefs: e.evidenceRefs }
        : null;
    return {
      termId: d.termId,
      sourceLabel: d.sourceLabel,
      sourceUnit: d.sourceUnit,
      observations: d.observations,
      candidateCatalogIds: d.candidateCatalogIds,
      status: REQUIRED_SCIENTIFIC_GATE,
      activationAllowed: false,
      latestDecision: e
        ? { sequence: e.sequence, decision: e.decision, targetCatalogId: e.targetCatalogId, confirmedUnit: e.confirmedUnit, reviewerName: e.reviewerName, reviewerQualification: e.reviewerQualification, recordedAt: e.recordedAt, entryHash: e.hash }
        : null,
      proposedExtension,
      blockers: [...blockers],
      handoffBlockReasons: d.handoff.blockReasons.map((r) => BLOCK_REASON_LABELS[r]),
      unresolvedQuestions: d.unresolvedQuestions,
    };
  });
  const body: Omit<ActivationManifest, "manifestDigest"> = {
    schema: ACTIVATION_MANIFEST_SCHEMA,
    manifestVersion: `${governedRegistry.baseCatalogVersion}+p36-review.${entries.length}`,
    baseCatalogVersion: governedRegistry.baseCatalogVersion,
    generatedAt: options.generatedAt,
    status: REQUIRED_SCIENTIFIC_GATE,
    activationAllowed: false,
    appliesChanges: false,
    sourceArtifacts: [...MANIFEST_SOURCE_ARTIFACTS],
    reviewHistory: { entries: entries.length, headHash: chain.head, integrity: chain.ok ? "VERIFIED" : "FAILED" },
    counts: {
      terms: terms.length,
      observations: terms.reduce((n, t) => n + t.observations, 0),
      withDecision: terms.filter((t) => t.latestDecision).length,
      readyForGovernedActivation: 0,
      blocked: terms.filter((t) => t.blockers.length > 0).length,
    },
    terms,
    prerequisites: GLOBAL_ACTIVATION_PREREQUISITES,
  };
  // Digest excludes generatedAt so identical review states produce identical digests.
  const digest = await sha256Hex(canonicalJson({ ...body, generatedAt: null }));
  return { ...body, manifestDigest: digest };
}

// ---------- Exact-ID catalog lookup (read-only) ----------

export interface CatalogEntryFact {
  id: string;
  catalog: "P36" | "P35.5 draft";
  name: string;
  domain: string;
  /** Validated catalog unit; null when the catalog records none. */
  unit: string | null;
  status: string;
}

/** Exact ID lookup in the P36 registry, then the P35.5 draft catalog. Never fuzzy. */
export function catalogEntryFor(id: string): CatalogEntryFact | null {
  const m = P36.get(id) as (P36Metric & { domain?: string }) | undefined;
  if (m) return { id, catalog: "P36", name: m.name, domain: m.domain ?? "unknown", unit: m.originalUnit?.trim() || null, status: m.sourceClassification ?? "unknown" };
  const e = P355.get(id);
  if (e) return { id, catalog: "P35.5 draft", name: e.name, domain: e.domain, unit: null, status: e.status };
  return null;
}

/** Exact ID lookup of a P43 provisional semantic disposition (non-authoritative). */
export function p43DispositionFor(sourceId: string): string | null {
  return P43.get(sourceId)?.provisional_semantic_disposition ?? null;
}

/** Bone handbook v7 English layer, exact ID. */
export function boneHandbookFact(id: string): { specimen: string | null; units: string[] } | null {
  const en = BONE_EN.get(id);
  return en ? { specimen: en.specimen_en?.trim() || null, units: splitHandbookUnits(en.unit_en) } : null;
}
