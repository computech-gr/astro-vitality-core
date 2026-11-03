/**
 * P36 Scientific Authorization & Independent Approval (pure, deterministic).
 *
 * Final scientific decisions for the 12 handoff terms are recorded only in the
 * caller-scoped, append-only cloud ledger (staged SQL
 * supabase/pending/20261104000000_p36_scientific_authorization.sql). This module
 * builds the canonical event payloads, validates them against the bundled
 * dossiers, verifies ledger rows read back from the server, and derives each
 * term's scientific and activation status. It never activates anything:
 * activation still needs the governed catalog-extensions registry (code review).
 *
 * Authority boundaries:
 *  - Final decisions (APPROVE / REJECT / REQUEST_MORE_EVIDENCE) are researcher-only;
 *    the database derives the actor and role from auth.uid() and mission membership.
 *  - Ground Medical (and researchers) may submit recommendations (evidence), never
 *    a final decision.
 *  - An approval must reference another account's recommendation with the same
 *    canonical ID and exact unit, so nobody approves a mapping they authored.
 *  - Local worksheet entries, imported JSON and client state are never authority.
 *  - Reviewer name, qualification and conflict-of-interest text are recorded
 *    declarations; the application cannot verify credentials.
 */
import { canonicalJson } from "./observation-envelope";
import {
  EXTERNAL_REF,
  buildScientificReviewDossiers,
  catalogEntryFor,
  prohibitedContent,
  type ScientificReviewDossier,
} from "./p36-scientific-review";
import { sourceArtifactDigests } from "./p36-decision-dossier";
import { GOVERNED_CATALOG_EXTENSIONS, evaluateCatalogExtensionRegistry, normalizeLabel, type CatalogExtensionRegistry } from "./unknown-biomarker-review";
import { domainForMetric } from "@/domain/health-domains/document-domain-projection";

export const AUTHORIZATION_EVENT_SCHEMA = "mitochondria.p36-scientific-authorization.v1";
export const AUTHORIZATION_GENESIS = "GENESIS";

export type AuthorizationKind = "recommendation" | "decision";
export type FinalAction = "APPROVE" | "REJECT" | "REQUEST_MORE_EVIDENCE";
export type AuthorizationAction = "RECOMMEND" | FinalAction;
export type AuthorizationActorRole = "ground_medical" | "researcher";

export const FINAL_ACTION_LABELS: Record<FinalAction, string> = {
  APPROVE: "Approve mapping",
  REJECT: "Reject mapping",
  REQUEST_MORE_EVIDENCE: "Request more evidence",
};

export type ScientificStatus = "PENDING_NIKOLAS_REVIEW" | "MORE_EVIDENCE_REQUIRED" | "SCIENTIFICALLY_REJECTED" | "SCIENTIFICALLY_APPROVED";
export type ActivationStatus = "ACTIVATION_BLOCKED" | "ACTIVE";

export const SCIENTIFIC_STATUS_LABELS: Record<ScientificStatus, string> = {
  PENDING_NIKOLAS_REVIEW: "Pending Nikolas review",
  MORE_EVIDENCE_REQUIRED: "More evidence required",
  SCIENTIFICALLY_REJECTED: "Scientifically rejected",
  SCIENTIFICALLY_APPROVED: "Scientifically approved",
};

/** Mapping fields a decision or recommendation may carry. All text is reviewer-entered. */
export interface AuthorizationFields {
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
  reviewerName: string;
  reviewerQualification: string;
  conflictOfInterestDeclaration: string;
  independenceConfirmed: boolean;
  recommendationEventId: string | null;
  supersedesEventId: string | null;
}

export interface AuthorizationPayload extends AuthorizationFields {
  schema: typeof AUTHORIZATION_EVENT_SCHEMA;
  termId: string;
  sourceLabel: string;
  sourceUnit: string;
  kind: AuthorizationKind;
  action: AuthorizationAction;
  authorityMissionId: string;
  submissionId: string;
  /** Set by the server function from the verified session, never from the browser. */
  actorUserId: string;
  actorRole: AuthorizationActorRole;
  /** Server time (UTC) at submission. */
  decidedAt: string;
  catalogVersion: string;
  sourceFingerprint: string;
  termDossierFingerprint: string;
  researchOnly: true;
  activationApplied: false;
}

/** A row as returned by p36_sci_auth_list_v1 (snake_case, server-assigned columns). */
export interface AuthorizationLedgerRow {
  authority_mission_id: string;
  event_id: string;
  term_id: string;
  kind: AuthorizationKind;
  action: AuthorizationAction;
  submission_id: string;
  payload_canonical: string;
  payload_sha256: string;
  references_recommendation_id: string | null;
  supersedes_event_id: string | null;
  prev_event_hash: string;
  event_hash: string;
  actor_user_id: string;
  actor_role: AuthorizationActorRole;
  received_at: string;
  received_seq: number;
}

export interface VerifiedAuthorizationEvent {
  row: AuthorizationLedgerRow;
  payload: AuthorizationPayload;
}

export type ValidationOutcome = { ok: true } | { ok: false; reason: string };

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same formula as the SQL function public.p36_sci_auth_event_hash. */
export function eventHashInput(prev: string, payloadSha: string, actor: string, role: string, mission: string, termId: string): string {
  return [prev, payloadSha, actor, role, mission, termId].join("|");
}

// ---------------------------------------------------------------- context

export interface AuthorizationContext {
  dossiers: ScientificReviewDossier[];
  catalogVersion: string;
  sourceFingerprint: string;
  termFingerprints: Map<string, string>;
  sourceIntegrityOk: boolean;
}

let contextPromise: Promise<AuthorizationContext> | null = null;

/** Fingerprints of the bundled artifacts; deterministic across devices for the same build. */
export function authorizationContext(): Promise<AuthorizationContext> {
  contextPromise ??= (async () => {
    const build = buildScientificReviewDossiers();
    const termFingerprints = new Map<string, string>();
    for (const d of build.dossiers) termFingerprints.set(d.termId, await sha256Hex(canonicalJson(d)));
    return {
      dossiers: build.dossiers,
      catalogVersion: GOVERNED_CATALOG_EXTENSIONS.baseCatalogVersion,
      sourceFingerprint: await sha256Hex(canonicalJson(await sourceArtifactDigests())),
      termFingerprints,
      sourceIntegrityOk: build.ok,
    };
  })();
  return contextPromise;
}

// ---------------------------------------------------------------- validation

const PLACEHOLDER = /^(n\/?a|na|none|unknown|unk|tbd|tba|todo|\?+|-+|\.+|x+|same|as above|not sure|pending)$/i;
const PRIMARY_VALIDATION_REF = /^(doi:10\.\S+|pmid:\d+)$/;
const HS_CRP = /\bhs-?crp\b|high[\s-]*sensitiv/i;
const CRP_TERM_IDS = new Set(["ubt-1d9912f9"]);

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
function realText(v: unknown, min = 3): boolean {
  const t = text(v);
  return t.length >= min && !PLACEHOLDER.test(t);
}

function refsOk(refs: unknown, dossier: ScientificReviewDossier): ValidationOutcome {
  if (!Array.isArray(refs) || !refs.length) return { ok: false, reason: "Add at least one source evidence reference." };
  const known = new Set([`handoff:${dossier.termId}`, ...dossier.evidence.map((e) => e.ref)]);
  for (const r of refs) {
    const ref = text(r);
    if (!ref || ref !== r) return { ok: false, reason: "Evidence references must be non-empty and trimmed." };
    if (!known.has(ref) && !EXTERNAL_REF.test(ref))
      return { ok: false, reason: `Evidence reference "${ref}" is neither a listed dossier reference nor a doi:/pmid:/url:https:///doc: citation.` };
  }
  if (new Set(refs).size !== refs.length) return { ok: false, reason: "Duplicate evidence references." };
  return { ok: true };
}

export interface ValidationState {
  /** Verified recommendation referenced by an approval (same mission + term). */
  recommendation?: VerifiedAuthorizationEvent;
  /** Latest verified final decision for this mission + term, if any. */
  latestDecision?: VerifiedAuthorizationEvent;
}

/**
 * Validate a payload against the bundled dossier and verified ledger state.
 * Used by the server function before calling the RPC and again for every row
 * read back (fail closed). Fingerprint staleness is reported separately by
 * {@link isPayloadCurrent} so historical events remain verifiable.
 */
export function validateAuthorizationPayload(p: AuthorizationPayload, ctx: AuthorizationContext, state: ValidationState = {}): ValidationOutcome {
  const no = (reason: string): ValidationOutcome => ({ ok: false, reason });
  if (!p || p.schema !== AUTHORIZATION_EVENT_SCHEMA) return no("Unsupported authorization payload schema.");
  const dossier = ctx.dossiers.find((d) => d.termId === p.termId);
  if (!dossier) return no("Unknown term; only the 12 handoff terms can be authorized.");
  if (p.sourceLabel !== dossier.sourceLabel || p.sourceUnit !== dossier.sourceUnit) return no("Source label or unit does not match the handoff term.");
  if (p.researchOnly !== true || p.activationApplied !== false) return no("Authorization events never activate catalogs.");
  const pairs: Record<AuthorizationKind, AuthorizationAction[]> = { recommendation: ["RECOMMEND"], decision: ["APPROVE", "REJECT", "REQUEST_MORE_EVIDENCE"] };
  if (!pairs[p.kind]?.includes(p.action)) return no("Action does not match the event kind.");
  if (p.kind === "decision" && p.actorRole !== "researcher") return no("Only an authorized Researcher can record a final scientific decision.");
  if (p.actorRole !== "researcher" && p.actorRole !== "ground_medical") return no("Unsupported actor role.");
  if (!/^[0-9a-f]{64}$/.test(p.sourceFingerprint ?? "") || !/^[0-9a-f]{64}$/.test(p.termDossierFingerprint ?? "")) return no("Catalog and source fingerprints are required.");
  if (!realText(p.catalogVersion, 2)) return no("Catalog version is required.");
  if (!Number.isFinite(Date.parse(p.decidedAt)) || !p.decidedAt.endsWith("Z")) return no("Decision time must be a UTC timestamp.");
  if (!realText(p.reviewerName)) return no("Enter the reviewer's name.");
  if (!realText(p.reviewerQualification)) return no("Enter the reviewer's scientific qualification.");
  if (text(p.rationale).length < 20 || PLACEHOLDER.test(text(p.rationale))) return no("Enter a rationale of at least 20 characters.");
  const r = refsOk(p.sourceRefs, dossier);
  if (!r.ok) return r;
  for (const [field, value] of [
    ["rationale", p.rationale],
    ["specimen or acquisition context", p.specimenOrAcquisitionContext],
    ["method or instrument", p.methodOrInstrument],
    ["protocol", p.protocol],
    ["conflict-of-interest declaration", p.conflictOfInterestDeclaration],
  ] as const) {
    const hit = prohibitedContent(value ?? "");
    if (hit) return no(`The ${field} mentions ${hit}; scientific authorization does not accept ${hit}.`);
  }

  const mappingRequired = p.kind === "recommendation" || p.action === "APPROVE";
  if (mappingRequired) {
    const id = text(p.canonicalCatalogId);
    if (!id) return no("Choose the canonical catalog ID.");
    if (!dossier.candidateCatalogIds.includes(id)) return no(`${id} is not a candidate for this term; free-form or automatic aliases are not permitted.`);
    const entry = catalogEntryFor(id);
    if (!entry) return no(`${id} is not in a repository catalog.`);
    if (text(p.domain) !== entry.domain) return no(`Domain "${text(p.domain)}" contradicts the catalog domain "${entry.domain}" of ${id}.`);
    if (p.validatedUnit !== dossier.sourceUnit) return no(`Unit must be the exact source unit text "${dossier.sourceUnit}"; no aliases or conversions are permitted.`);
    if (entry.unit && entry.unit !== p.validatedUnit) return no(`The catalog unit "${entry.unit}" differs from "${p.validatedUnit}"; incompatible units cannot be approved.`);
    if (CRP_TERM_IDS.has(p.termId) && HS_CRP.test(`${p.methodOrInstrument ?? ""} ${p.rationale}`))
      return no("High-sensitivity CRP is related to but not interchangeable with C-reactive protein; it needs its own catalog metric.");
  }

  if (p.kind === "recommendation") {
    if (p.recommendationEventId !== null || p.supersedesEventId !== null) return no("Recommendations do not reference or supersede other events.");
    return { ok: true };
  }

  // Final decisions
  if (p.independenceConfirmed !== true) return no("Confirm that you are independent of the mapping under review.");
  if (!realText(p.conflictOfInterestDeclaration, 10)) return no("Enter a conflict-of-interest declaration (at least 10 characters).");
  const latest = state.latestDecision;
  if (latest ? p.supersedesEventId !== latest.row.event_id : p.supersedesEventId !== null)
    return no("Stale decision: another decision was recorded for this term; reload and review the current history.");

  if (p.action !== "APPROVE") {
    if (p.recommendationEventId !== null) return no("Only approvals reference a recommendation.");
    return { ok: true };
  }

  for (const [label, value] of [
    ["specimen or acquisition context", p.specimenOrAcquisitionContext],
    ["laboratory method or measurement instrument", p.methodOrInstrument],
    ["protocol", p.protocol],
    ["protocol version", p.protocolVersion],
  ] as const)
    if (!realText(value)) return no(`Approval requires the ${label}; it is never inferred.`);
  if (CRP_TERM_IDS.has(p.termId) && !/\bcrp\b|c-reactive/i.test(p.methodOrInstrument ?? ""))
    return no("State the CRP assay explicitly; standard CRP and hsCRP are not interchangeable.");
  const v = refsOk(p.validationEvidenceRefs, dossier);
  if (!v.ok) return { ok: false, reason: `Validation evidence: ${v.reason}` };
  const reasons = new Set(dossier.handoff.blockReasons);
  if ((reasons.has("scale_unvalidated") || reasons.has("protocol_unvalidated")) && !p.validationEvidenceRefs.some((x) => PRIMARY_VALIDATION_REF.test(x)))
    return no("This term's scale or protocol is explicitly unvalidated; cite primary validation evidence (doi: or pmid:).");

  const rec = state.recommendation;
  if (!p.recommendationEventId || !rec || rec.row.event_id !== p.recommendationEventId) return no("Approval must reference a recorded recommendation for this term.");
  if (rec.payload.kind !== "recommendation" || rec.payload.termId !== p.termId || rec.payload.authorityMissionId !== p.authorityMissionId)
    return no("The referenced recommendation belongs to another term or mission.");
  if (rec.payload.actorUserId === p.actorUserId) return no("Self-approval is not permitted: you authored this mapping recommendation.");
  if (rec.payload.canonicalCatalogId !== p.canonicalCatalogId || rec.payload.validatedUnit !== p.validatedUnit || rec.payload.domain !== p.domain)
    return no("Approval contradicts the referenced recommendation (canonical ID, domain or unit).");
  return { ok: true };
}

export function isPayloadCurrent(p: AuthorizationPayload, ctx: AuthorizationContext): boolean {
  return p.sourceFingerprint === ctx.sourceFingerprint && p.termDossierFingerprint === ctx.termFingerprints.get(p.termId) && p.catalogVersion === ctx.catalogVersion;
}

// ---------------------------------------------------------------- payload construction

export interface SubmissionInput extends AuthorizationFields {
  termId: string;
  kind: AuthorizationKind;
  action: AuthorizationAction;
  authorityMissionId: string;
  submissionId: string;
}

export function buildAuthorizationPayload(
  input: SubmissionInput,
  actor: { userId: string; role: AuthorizationActorRole; now: string },
  ctx: AuthorizationContext,
): AuthorizationPayload {
  const dossier = ctx.dossiers.find((d) => d.termId === input.termId);
  const trimOrNull = (v: string | null) => (v == null ? null : v.trim() || null);
  return {
    schema: AUTHORIZATION_EVENT_SCHEMA,
    termId: input.termId,
    sourceLabel: dossier?.sourceLabel ?? "",
    sourceUnit: dossier?.sourceUnit ?? "",
    kind: input.kind,
    action: input.action,
    authorityMissionId: input.authorityMissionId,
    submissionId: input.submissionId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    decidedAt: actor.now,
    catalogVersion: ctx.catalogVersion,
    sourceFingerprint: ctx.sourceFingerprint,
    termDossierFingerprint: ctx.termFingerprints.get(input.termId) ?? "",
    canonicalCatalogId: trimOrNull(input.canonicalCatalogId),
    domain: trimOrNull(input.domain),
    specimenOrAcquisitionContext: trimOrNull(input.specimenOrAcquisitionContext),
    methodOrInstrument: trimOrNull(input.methodOrInstrument),
    protocol: trimOrNull(input.protocol),
    protocolVersion: trimOrNull(input.protocolVersion),
    // Units are never trimmed or normalized: exact text only.
    validatedUnit: input.validatedUnit,
    sourceRefs: input.sourceRefs.map((x) => x.trim()).filter(Boolean),
    validationEvidenceRefs: input.validationEvidenceRefs.map((x) => x.trim()).filter(Boolean),
    rationale: input.rationale.trim(),
    reviewerName: input.reviewerName.trim(),
    reviewerQualification: input.reviewerQualification.trim(),
    conflictOfInterestDeclaration: input.conflictOfInterestDeclaration.trim(),
    independenceConfirmed: input.independenceConfirmed === true,
    recommendationEventId: input.recommendationEventId,
    supersedesEventId: input.supersedesEventId,
    researchOnly: true,
    activationApplied: false,
  };
}

// ---------------------------------------------------------------- ledger verification

export interface TermLedger {
  termId: string;
  events: VerifiedAuthorizationEvent[];
  integrity: "VERIFIED" | "FAILED";
  problems: string[];
}

/** Verify server rows: payload digests, event IDs, per-(mission, term) hash chains, actor binding and rule validity. */
export async function verifyAuthorizationLedger(rows: readonly AuthorizationLedgerRow[], missionId: string, ctx: AuthorizationContext): Promise<Map<string, TermLedger>> {
  const byTerm = new Map<string, TermLedger>();
  for (const d of ctx.dossiers) byTerm.set(d.termId, { termId: d.termId, events: [], integrity: "VERIFIED", problems: [] });
  const sorted = [...rows].sort((a, b) => a.received_seq - b.received_seq);
  const heads = new Map<string, string>();
  for (const row of sorted) {
    const term = byTerm.get(row.term_id);
    if (!term) continue;
    const fail = (p: string) => {
      term.integrity = "FAILED";
      term.problems.push(`Event #${row.received_seq}: ${p}`);
    };
    if (term.integrity === "FAILED") continue;
    if (row.authority_mission_id !== missionId) { fail("event from another mission"); continue; }
    const sha = await sha256Hex(row.payload_canonical);
    if (sha !== row.payload_sha256 || sha !== row.event_id) { fail("payload digest mismatch"); continue; }
    let payload: AuthorizationPayload;
    try {
      payload = JSON.parse(row.payload_canonical) as AuthorizationPayload;
    } catch {
      fail("payload is not JSON");
      continue;
    }
    const prev = heads.get(row.term_id) ?? AUTHORIZATION_GENESIS;
    if (row.prev_event_hash !== prev) { fail("hash chain is broken"); continue; }
    const hash = await sha256Hex(eventHashInput(prev, sha, row.actor_user_id, row.actor_role, row.authority_mission_id, row.term_id));
    if (hash !== row.event_hash) { fail("event hash mismatch"); continue; }
    if (
      payload.termId !== row.term_id ||
      payload.kind !== row.kind ||
      payload.action !== row.action ||
      payload.actorUserId !== row.actor_user_id ||
      payload.actorRole !== row.actor_role ||
      payload.authorityMissionId !== row.authority_mission_id ||
      payload.submissionId !== row.submission_id ||
      (payload.recommendationEventId ?? null) !== (row.references_recommendation_id ?? null) ||
      (payload.supersedesEventId ?? null) !== (row.supersedes_event_id ?? null)
    ) { fail("columns do not match the signed payload"); continue; }
    const recommendation = payload.recommendationEventId ? term.events.find((e) => e.row.event_id === payload.recommendationEventId) : undefined;
    const latestDecision = [...term.events].reverse().find((e) => e.payload.kind === "decision");
    const v = validateAuthorizationPayload(payload, ctx, { recommendation, latestDecision });
    if (!v.ok) { fail(`rule violation: ${v.reason}`); continue; }
    heads.set(row.term_id, hash);
    term.events.push({ row, payload });
  }
  return byTerm;
}

// ---------------------------------------------------------------- status and activation gates

export type ActivationGate =
  | "INDEPENDENT_APPROVAL_VERIFIED"
  | "IDENTITY_UNAMBIGUOUS"
  | "CATALOG_UNIT_VALIDATED"
  | "SPECIMEN_METHOD_PROTOCOL_RECORDED"
  | "VALIDATION_EVIDENCE_PRESENT"
  | "GOVERNED_REGISTRY_APPROVAL"
  | "FINGERPRINTS_CURRENT"
  | "RELEASE_VERIFIERS_PASSED";

export const ACTIVATION_GATE_LABELS: Record<ActivationGate, string> = {
  INDEPENDENT_APPROVAL_VERIFIED: "Independent Researcher approval verified in the cloud ledger",
  IDENTITY_UNAMBIGUOUS: "Canonical identity is a routed P36 metric in the approved domain",
  CATALOG_UNIT_VALIDATED: "Catalog unit is validated and exactly matches the approved unit",
  SPECIMEN_METHOD_PROTOCOL_RECORDED: "Specimen/context, method, protocol and version recorded; no unvalidated scale or protocol",
  VALIDATION_EVIDENCE_PRESENT: "Validation evidence references recorded",
  GOVERNED_REGISTRY_APPROVAL: "Governed catalog-extensions registry approves this exact alias and cites the decision (p36-auth:<event>)",
  FINGERPRINTS_CURRENT: "Decision fingerprints match the current catalog and source artifacts",
  RELEASE_VERIFIERS_PASSED: "Registry approval records passing scientific and security verifiers (verifiers-passed:<commit>)",
};

export interface GateResult {
  gate: ActivationGate;
  passed: boolean;
  detail: string;
}

export interface TermAuthorizationState {
  termId: string;
  sourceLabel: string;
  sourceUnit: string;
  scientificStatus: ScientificStatus;
  activationStatus: ActivationStatus;
  latestDecision: VerifiedAuthorizationEvent | null;
  recommendations: VerifiedAuthorizationEvent[];
  history: VerifiedAuthorizationEvent[];
  stale: boolean;
  integrity: "VERIFIED" | "FAILED" | "NOT_LOADED";
  gates: GateResult[];
  blockers: string[];
}

export function evaluateTermAuthorization(
  dossier: ScientificReviewDossier,
  ledger: TermLedger | undefined,
  ctx: AuthorizationContext,
  registry: CatalogExtensionRegistry = GOVERNED_CATALOG_EXTENSIONS,
): TermAuthorizationState {
  const loaded = Boolean(ledger);
  const ok = ledger?.integrity === "VERIFIED";
  const history = ok ? ledger!.events : [];
  const decision = [...history].reverse().find((e) => e.payload.kind === "decision") ?? null;
  const stale = decision ? !isPayloadCurrent(decision.payload, ctx) : false;
  let scientificStatus: ScientificStatus = "PENDING_NIKOLAS_REVIEW";
  if (decision && !stale)
    scientificStatus =
      decision.payload.action === "APPROVE" ? "SCIENTIFICALLY_APPROVED" : decision.payload.action === "REJECT" ? "SCIENTIFICALLY_REJECTED" : "MORE_EVIDENCE_REQUIRED";

  const approved = scientificStatus === "SCIENTIFICALLY_APPROVED" ? decision!.payload : null;
  const reasons = new Set(dossier.handoff.blockReasons);
  const routedDomain = approved?.canonicalCatalogId ? domainForMetric(approved.canonicalCatalogId) : undefined;
  const entry = approved?.canonicalCatalogId ? catalogEntryFor(approved.canonicalCatalogId) : null;
  const evaluation = evaluateCatalogExtensionRegistry(registry);
  const effective = evaluation.effective.find((e) => e.normalizedLabel === normalizeLabel(dossier.sourceLabel) && e.unit === dossier.sourceUnit);
  const record = effective
    ? [...evaluation.approvalHistory].reverse().find((h) => h.extensionId === effective.extensionId && h.version === effective.version)
    : undefined;
  const citesDecision = Boolean(decision && record?.handbookEvidenceRefs?.includes(`p36-auth:${decision.row.event_id}`));
  const verifiers = /verifiers-passed:[0-9a-f]{40}\b/.test(record?.note ?? "");

  const gate = (g: ActivationGate, passed: boolean, detail: string): GateResult => ({ gate: g, passed, detail });
  const gates: GateResult[] = [
    gate(
      "INDEPENDENT_APPROVAL_VERIFIED",
      Boolean(approved),
      !loaded ? "Cloud authorization ledger not loaded" : !ok ? "Cloud authorization ledger failed verification" : stale ? "Latest decision is stale; re-review required" : approved ? `Approved by ${approved.reviewerName}` : `Status: ${SCIENTIFIC_STATUS_LABELS[scientificStatus]}`,
    ),
    gate("IDENTITY_UNAMBIGUOUS", Boolean(approved && entry?.catalog === "P36" && routedDomain), approved ? (entry?.catalog === "P36" && routedDomain ? `${approved.canonicalCatalogId} routed to ${routedDomain}` : `${approved.canonicalCatalogId} is not a routed P36 metric; catalog promotion needs a governed patch`) : "No approved identity"),
    gate("CATALOG_UNIT_VALIDATED", Boolean(approved && entry?.unit && entry.unit === approved.validatedUnit), entry?.unit ? `Catalog unit "${entry.unit}"` : "Catalog has no validated unit for the target"),
    gate(
      "SPECIMEN_METHOD_PROTOCOL_RECORDED",
      Boolean(approved && !reasons.has("scale_unvalidated") && !reasons.has("protocol_unvalidated")),
      reasons.has("scale_unvalidated") ? "Scale explicitly unvalidated in the handoff" : reasons.has("protocol_unvalidated") ? "Protocol explicitly unvalidated in the handoff" : approved ? "Recorded in the approval" : "No approval",
    ),
    gate("VALIDATION_EVIDENCE_PRESENT", Boolean(approved?.validationEvidenceRefs.length), approved ? approved.validationEvidenceRefs.join(", ") : "No approval"),
    gate("GOVERNED_REGISTRY_APPROVAL", Boolean(approved && effective && effective.targetMetricId === approved.canonicalCatalogId && citesDecision), effective ? (citesDecision ? `Registry ${effective.extensionId} v${effective.version}` : "Registry entry does not cite this decision") : "No effective registry extension"),
    gate("FINGERPRINTS_CURRENT", Boolean(decision && !stale), decision ? (stale ? "Fingerprints differ from current artifacts" : "Current") : "No decision"),
    gate("RELEASE_VERIFIERS_PASSED", Boolean(approved && verifiers), verifiers ? "Recorded in registry approval" : "No verifier record in the registry approval"),
  ];
  const active = gates.every((g) => g.passed) && ctx.sourceIntegrityOk;
  const blockers = gates.filter((g) => !g.passed).map((g) => `${ACTIVATION_GATE_LABELS[g.gate]} — ${g.detail}`);
  if (!ctx.sourceIntegrityOk) blockers.push("Handoff or crosswalk failed its integrity check");
  if (effective && !active) blockers.push("Inconsistency: the registry lists an effective alias without satisfying every authorization gate; review the registry patch");
  return {
    termId: dossier.termId,
    sourceLabel: dossier.sourceLabel,
    sourceUnit: dossier.sourceUnit,
    scientificStatus,
    activationStatus: active ? "ACTIVE" : "ACTIVATION_BLOCKED",
    latestDecision: decision,
    recommendations: history.filter((e) => e.payload.kind === "recommendation"),
    history,
    stale,
    integrity: !loaded ? "NOT_LOADED" : ok ? "VERIFIED" : "FAILED",
    gates,
    blockers,
  };
}

export interface AuthorizationView {
  missionId: string | null;
  loaded: boolean;
  terms: TermAuthorizationState[];
  counts: Record<ScientificStatus | ActivationStatus, number>;
}

export async function buildAuthorizationView(rows: readonly AuthorizationLedgerRow[] | null, missionId: string | null, registry?: CatalogExtensionRegistry): Promise<AuthorizationView> {
  const ctx = await authorizationContext();
  const ledgers = rows && missionId ? await verifyAuthorizationLedger(rows, missionId, ctx) : null;
  const terms = ctx.dossiers.map((d) => evaluateTermAuthorization(d, ledgers?.get(d.termId), ctx, registry));
  const counts = { PENDING_NIKOLAS_REVIEW: 0, MORE_EVIDENCE_REQUIRED: 0, SCIENTIFICALLY_REJECTED: 0, SCIENTIFICALLY_APPROVED: 0, ACTIVATION_BLOCKED: 0, ACTIVE: 0 };
  for (const t of terms) {
    counts[t.scientificStatus] += 1;
    counts[t.activationStatus] += 1;
  }
  return { missionId, loaded: Boolean(ledgers), terms, counts };
}
