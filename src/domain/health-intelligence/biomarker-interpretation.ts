/**
 * P40 — Scientific Biomarker Interpretation Registry and review lifecycle (pure).
 *
 * One versioned registry (data/scientific/biomarker-interpretation-registry.v1.json)
 * holds a traceable interpretation record per catalog identity: canonical
 * catalog ID + exact unit (or "not unit-bound" for handbook-level text) +
 * domain, including P37/P38 synthetic demo identities of one mission.
 *
 * Rules (never relaxed here):
 * - Nothing is approved automatically. Handbook text is quoted verbatim as a
 *   pending hypothesis; Immune, Behavioral and demo identities have no content
 *   until a Researcher authors, cites and approves it entry by entry.
 * - Approval binds an exact unit, requires a citation for every claim and an
 *   explicit evidence-strength basis, and rejects reference intervals or alert
 *   thresholds (those need a separately validated assay-specific rule).
 * - Synthetic demo approvals are labelled SYNTHETIC DEMO and never count as
 *   production scientific validation.
 * - Device-local review events form an append-only SHA-256 chain; a broken chain
 *   is ignored entirely (fail closed) so the registry state is shown instead.
 * - Interpretation never rewrites observations, catalog entries or activation
 *   history, and never generates abnormality alerts.
 */
import { canonicalJson } from "./observation-envelope";
import { sha256Hex } from "./catalog-lifecycle";
import {
  BUNDLED_ATTESTATION_KEYS,
  verifyAttestation,
  type AttestationTrustedKey,
  type SignedAttestation,
} from "./interpretation-attestation";

export const INTERPRETATION_REGISTRY_SCHEMA = "mitochondria.biomarker-interpretation-registry.v1" as const;
export const INTERPRETATION_EVENT_SCHEMA = "mitochondria.biomarker-interpretation-event.v1" as const;
export const INTERPRETATION_SNAPSHOT_SCHEMA = "mitochondria.biomarker-interpretation-snapshot.v1" as const;
export const INTERPRETATION_PACKAGE_SCHEMA = "mitochondria.biomarker-interpretation-approval-package.v1" as const;

export const PENDING_INTERPRETATION_TEXT = "Biological interpretation pending scientific review";
export const NO_VALIDATED_ALERT_TEXT =
  "No abnormality alert is generated: no reference interval, alert threshold or clinically significant-change rule has been independently validated for this assay, specimen, unit, protocol and population.";
export const DESCRIPTIVE_CHANGE_NOTE =
  "A recorded increase or decrease is descriptive only; it does not imply improvement, deterioration, disease or clinical risk.";
export const SERIES_ALERT_TEXT = "None generated (no independently validated assay-specific rule).";
export const PRODUCTION_APPROVAL_ACK = "I reviewed every claim and its citation for this exact biomarker, unit and domain";
export const SYNTHETIC_DEMO_APPROVAL_ACK = "SYNTHETIC DEMO INTERPRETATION - NOT PRODUCTION SCIENTIFIC VALIDATION";
export const SYNTHETIC_DEMO_INTERPRETATION_LABEL =
  "SYNTHETIC DEMO interpretation — not production scientific validation";

export const INTERPRETATION_DOMAINS = ["bone", "cardiovascular", "immune", "behavioral"] as const;
export type InterpretationDomain = (typeof INTERPRETATION_DOMAINS)[number];
export type InterpretationEnvironment =
  | "governed_handbook"
  | "domain_catalog"
  | "production_catalog"
  | "synthetic_demo";

export interface InterpretationIdentity {
  environment: InterpretationEnvironment;
  catalogId: string;
  domain: InterpretationDomain;
  /** Exact unit text; null = handbook-level text that is not bound to one unit. */
  unit: string | null;
  /** Synthetic demo identities belong to exactly one mission; null otherwise. */
  missionId: string | null;
  displayName: string;
}
export interface Claim {
  text: string;
  citationIds: string[];
  /** P41: general biomedical vs spaceflight-specific evidence (optional; absent on P40 claims). */
  evidenceScope?: "general_biomedical" | "spaceflight_specific";
}
/**
 * P41: documented measurement context an interpretation applies to. Every field
 * is null unless documented by a cited source; a different specimen, method,
 * assay or protocol is never treated as equivalent.
 */
export interface MeasurementContext {
  specimen: string | null;
  method: string | null;
  assayType: string | null;
  collectionProtocol: string | null;
  population: string | null;
  measurementContext: string | null;
}
export const EMPTY_MEASUREMENT_CONTEXT: MeasurementContext = {
  specimen: null,
  method: null,
  assayType: null,
  collectionProtocol: null,
  population: null,
  measurementContext: null,
};
export interface InterpretationContent {
  function: Claim | null;
  increaseContext: Claim | null;
  decreaseContext: Claim | null;
  generalContext: Claim | null;
  spaceflightRelevance: Claim | null;
  associatedBiomarkers: Claim | null;
  comparabilityRequirements: Claim[];
  limitations: string[];
}
export type CitationKind = "governed_handbook" | "peer_reviewed" | "agency_document" | "other";
export interface Citation {
  id: string;
  kind: CitationKind;
  title: string;
  locator: string;
  url: string | null;
}
export type EvidenceLevel = "not_assessed" | "low" | "moderate" | "high";
export interface EvidenceStrength {
  level: EvidenceLevel;
  basis: string;
}
export type RegistryStatus = "PENDING_SCIENTIFIC_REVIEW" | "APPROVED" | "REVOKED";
export interface ReviewerRef {
  userId: string;
  name: string | null;
}
export interface ApprovalHistoryItem {
  action: "APPROVE" | "REVOKE";
  eventId: string;
  reviewer: ReviewerRef;
  decidedAt: string;
  contentSha256: string | null;
  reason: string | null;
  basis: "registry" | "device_local";
}
export interface RegistryRecord {
  key: string;
  identity: InterpretationIdentity;
  /** Unit and specimen text exactly as written in the source handbook (display only). */
  sourceUnitText: string | null;
  specimenText: string | null;
  content: InterpretationContent | null;
  contentOrigin: "handbook_verbatim_pending" | "reviewer_authored" | "none";
  citations: Citation[];
  evidenceStrength: EvidenceStrength;
  reviewStatus: RegistryStatus;
  /** Review status of the source handbook entry, verbatim. */
  sourceReviewStatus: string | null;
  reviewer: ReviewerRef | null;
  approvalHistory: ApprovalHistoryItem[];
  contentSha256: string | null;
  /** Proposals only (never applied): e.g. a submitted candidate handbook ID with identical unit. */
  proposedLinks: { catalogId: string; basis: string }[];
  /** P41: recognized source labels for this identity (display/search only; never an equivalence). */
  aliases?: string[];
  /** P41: documented measurement context (nulls when undocumented). */
  measurementContext?: MeasurementContext;
  /** Catalog activation the record was backfilled from (never modified). */
  activation: {
    termId: string;
    submissionId: string;
    decisionEventId: string;
    activationEventId: string;
    activatedAt: string;
  } | null;
}
export interface InterpretationRegistry {
  schema: typeof INTERPRETATION_REGISTRY_SCHEMA;
  version: number;
  note: string;
  sources: { file: string; sha256: string }[];
  records: RegistryRecord[];
}

export const interpretationKey = (i: InterpretationIdentity) =>
  [i.environment, i.missionId ?? "-", i.catalogId, i.unit ?? "*", i.domain].join("|");

export const NOT_ASSESSED: EvidenceStrength = {
  level: "not_assessed",
  basis: "Evidence strength has not been independently appraised.",
};

const isDomain = (d: unknown): d is InterpretationDomain =>
  (INTERPRETATION_DOMAINS as readonly unknown[]).includes(d);
const filled = (s: unknown, min = 1): s is string => typeof s === "string" && s.trim().length >= min;

export function claimsOf(c: InterpretationContent): { field: string; claim: Claim }[] {
  const named: [string, Claim | null][] = [
    ["function", c.function],
    ["increaseContext", c.increaseContext],
    ["decreaseContext", c.decreaseContext],
    ["generalContext", c.generalContext],
    ["spaceflightRelevance", c.spaceflightRelevance],
    ["associatedBiomarkers", c.associatedBiomarkers],
  ];
  return [
    ...named.flatMap(([field, claim]) => (claim ? [{ field, claim }] : [])),
    ...c.comparabilityRequirements.map((claim, i) => ({ field: `comparabilityRequirements[${i}]`, claim })),
  ];
}

/** Content fingerprint bound into every approval (identity + content + citations + strength). */
export async function interpretationContentSha256(
  identity: InterpretationIdentity,
  draft: InterpretationDraft,
): Promise<string> {
  return sha256Hex(
    canonicalJson({
      identity,
      content: draft.content,
      citations: draft.citations,
      evidenceStrength: draft.evidenceStrength,
      // P41: the documented measurement context is bound only when present (P40 fingerprints unchanged).
      ...(draft.context ? { context: draft.context } : {}),
    }),
  );
}

// ------------------------------------------------------------ registry validation

/**
 * Structural, fail-closed validation of the bundled registry. An APPROVED or
 * REVOKED record that is not fully traceable is downgraded to pending and
 * listed in `excluded`; pending records are never upgraded.
 */
export function validateRegistry(raw: unknown): {
  registry: InterpretationRegistry;
  excluded: { key: string; reason: string }[];
} {
  const r = raw as Partial<InterpretationRegistry> | null;
  if (!r || r.schema !== INTERPRETATION_REGISTRY_SCHEMA || !Array.isArray(r.records))
    return {
      registry: { schema: INTERPRETATION_REGISTRY_SCHEMA, version: 0, note: "Invalid registry", sources: [], records: [] },
      excluded: [{ key: "*", reason: "Registry schema not recognized; no interpretation is used." }],
    };
  const excluded: { key: string; reason: string }[] = [];
  const seen = new Set<string>();
  const records: RegistryRecord[] = [];
  for (const rec of r.records) {
    const id = rec?.identity;
    if (!id || !filled(id.catalogId) || !isDomain(id.domain) || interpretationKey(id) !== rec.key) {
      excluded.push({ key: String(rec?.key ?? "?"), reason: "Identity or key mismatch" });
      continue;
    }
    if (seen.has(rec.key)) {
      excluded.push({ key: rec.key, reason: "Duplicate key" });
      continue;
    }
    seen.add(rec.key);
    if (id.environment === "synthetic_demo" && (!filled(id.missionId) || !/^demo:ubt-[0-9a-f]{8}$/.test(id.catalogId))) {
      excluded.push({ key: rec.key, reason: "Synthetic demo identity needs a demo ID and mission" });
      continue;
    }
    if (rec.reviewStatus !== "PENDING_SCIENTIFIC_REVIEW") {
      const problem = approvedRecordProblem(rec);
      if (problem) {
        excluded.push({ key: rec.key, reason: problem });
        records.push({ ...rec, reviewStatus: "PENDING_SCIENTIFIC_REVIEW", reviewer: null, approvalHistory: [], contentSha256: null, content: null, contentOrigin: "none" });
        continue;
      }
    }
    records.push(rec);
  }
  return {
    registry: { schema: INTERPRETATION_REGISTRY_SCHEMA, version: Number(r.version) || 0, note: String(r.note ?? ""), sources: r.sources ?? [], records },
    excluded,
  };
}

function approvedRecordProblem(rec: RegistryRecord): string | null {
  const last = rec.approvalHistory.at(-1);
  if (!last) return "No approval history";
  if (rec.reviewStatus === "APPROVED" && last.action !== "APPROVE") return "Last history entry is not an approval";
  if (rec.reviewStatus === "REVOKED" && last.action !== "REVOKE") return "Last history entry is not a revocation";
  if (!rec.identity.unit) return "Approval is not bound to an exact unit";
  if (!rec.content || !filled(rec.contentSha256)) return "Approved content or fingerprint missing";
  const draftProblem = approvalProblem(rec.identity, { content: rec.content, citations: rec.citations, evidenceStrength: rec.evidenceStrength });
  if (draftProblem) return draftProblem;
  if (!rec.reviewer || !filled(rec.reviewer.userId)) return "Reviewer identity missing";
  return null;
}

// ------------------------------------------------------------ drafts and approval rules

export interface InterpretationDraft {
  content: InterpretationContent;
  citations: Citation[];
  evidenceStrength: EvidenceStrength;
  /** P41: documented specimen/method/assay/protocol/population (optional). */
  context?: MeasurementContext;
}

export const EMPTY_CONTENT: InterpretationContent = {
  function: null,
  increaseContext: null,
  decreaseContext: null,
  generalContext: null,
  spaceflightRelevance: null,
  associatedBiomarkers: null,
  comparabilityRequirements: [],
  limitations: [],
};

export const THRESHOLD_LANGUAGE = /\breference (?:interval|range)s?\b|\bnormal range\b|\bcut-?offs?\b|\bthresholds?\b|\balert (?:level|limit)s?\b/i;

/** Returns null when an approval may be recorded; otherwise the exact reason it is refused. */
export function approvalProblem(identity: InterpretationIdentity, d: InterpretationDraft): string | null {
  if (!filled(identity.unit)) return "Set the exact unit this interpretation applies to; approvals are never unit-independent.";
  const claims = claimsOf(d.content);
  if (!d.content.function) return "Describe what the biomarker measures (function) before approval.";
  const ids = new Set(d.citations.map((c) => c.id));
  for (const c of d.citations) {
    if (!filled(c.id) || !filled(c.title, 3) || !filled(c.locator, 3))
      return "Every citation needs a title and a locator (page, section, DOI or item ID).";
  }
  for (const { field, claim } of claims) {
    if (!filled(claim.text, 3)) return `The ${field} statement is empty.`;
    if (!claim.citationIds.length) return `The ${field} statement has no citation.`;
    if (claim.citationIds.some((id) => !ids.has(id))) return `The ${field} statement cites an unknown source.`;
    if (THRESHOLD_LANGUAGE.test(claim.text))
      return `The ${field} statement mentions a reference interval or threshold. Those require a separately validated assay-, specimen-, unit-, protocol- and population-specific rule and are not accepted in interpretation text.`;
  }
  if (!d.evidenceStrength || !["not_assessed", "low", "moderate", "high"].includes(d.evidenceStrength.level))
    return "Choose an evidence strength.";
  if (!filled(d.evidenceStrength.basis, 10)) return "Explain the basis for the evidence strength (at least 10 characters).";
  return null;
}

export const requiredAcknowledgement = (i: InterpretationIdentity) =>
  i.environment === "synthetic_demo" ? SYNTHETIC_DEMO_APPROVAL_ACK : PRODUCTION_APPROVAL_ACK;

// ------------------------------------------------------------ device-local event chain

/**
 * P41 adds ATTEST (server signature over an earlier APPROVE/REVOKE event) and
 * REJECT_DRAFT (Researcher rejects the current draft; nothing is approved).
 */
export type InterpretationAction = "TASK_OPENED" | "DRAFT_SAVED" | "APPROVE" | "REVOKE" | "ATTEST" | "REJECT_DRAFT";
export interface InterpretationEventBody {
  schema: typeof INTERPRETATION_EVENT_SCHEMA;
  seq: number;
  prevHash: string;
  action: InterpretationAction;
  key: string;
  identity: InterpretationIdentity;
  actorUserId: string;
  actorName: string | null;
  recordedAt: string;
  draft: InterpretationDraft | null;
  contentSha256: string | null;
  reason: string | null;
  acknowledgement: string | null;
  taskOrigin: string | null;
  /** P41: present only on ATTEST events (absent keys keep P40 event hashes unchanged). */
  attestation?: SignedAttestation;
}
export interface InterpretationEvent extends InterpretationEventBody {
  hash: string;
}
export const GENESIS_HASH = "GENESIS";

export async function sealInterpretationEvent(body: InterpretationEventBody): Promise<InterpretationEvent> {
  return { ...body, hash: await sha256Hex(canonicalJson(body)) };
}

/** Full chain check: order, links, hashes, keys and approval fingerprints. */
export async function verifyInterpretationChain(
  events: readonly InterpretationEvent[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let prev = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.schema !== INTERPRETATION_EVENT_SCHEMA || e.seq !== i + 1) return { ok: false, reason: `Event ${i + 1} out of order` };
    if (e.prevHash !== prev) return { ok: false, reason: `Event ${e.seq} does not link to the previous event` };
    const { hash, ...body } = e;
    if ((await sha256Hex(canonicalJson(body))) !== hash) return { ok: false, reason: `Event ${e.seq} content changed` };
    if (interpretationKey(e.identity) !== e.key) return { ok: false, reason: `Event ${e.seq} identity mismatch` };
    if (e.action === "APPROVE") {
      if (!e.draft || approvalProblem(e.identity, e.draft)) return { ok: false, reason: `Event ${e.seq} approval is incomplete` };
      if ((await interpretationContentSha256(e.identity, e.draft)) !== e.contentSha256)
        return { ok: false, reason: `Event ${e.seq} approval fingerprint mismatch` };
      if (e.acknowledgement !== requiredAcknowledgement(e.identity)) return { ok: false, reason: `Event ${e.seq} acknowledgement missing` };
    }
    if (e.action === "REVOKE" && !filled(e.reason, 10)) return { ok: false, reason: `Event ${e.seq} revocation has no reason` };
    if (e.action === "REJECT_DRAFT" && !filled(e.reason, 10)) return { ok: false, reason: `Event ${e.seq} rejection has no reason` };
    if (e.action === "ATTEST") {
      const st = e.attestation?.statement;
      const target = st ? events.slice(0, i).find((x) => x.hash === st.eventHash) : undefined;
      if (!st || !target || (target.action !== "APPROVE" && target.action !== "REVOKE") || target.key !== e.key || st.key !== e.key || st.action !== target.action || st.contentSha256 !== target.contentSha256 || st.actorUserId !== target.actorUserId)
        return { ok: false, reason: `Event ${e.seq} attestation does not match an earlier decision` };
    } else if (e.attestation !== undefined) return { ok: false, reason: `Event ${e.seq} carries an unexpected attestation` };
    prev = hash;
  }
  return { ok: true };
}

/**
 * Event hashes of APPROVE/REVOKE decisions carrying a valid trusted server
 * attestation (signature + statement matching the attested event).
 */
export async function attestedDecisionHashes(
  events: readonly InterpretationEvent[],
  trustedKeys: readonly AttestationTrustedKey[] = BUNDLED_ATTESTATION_KEYS,
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.action !== "ATTEST" || !e.attestation) continue;
    if (await verifyAttestation(e.attestation, trustedKeys)) out.add(e.attestation.statement.eventHash);
  }
  return out;
}

export interface ActorContext {
  userId: string;
  name: string | null;
  /** Roles held by the signed-in user, freshly read before recording. */
  roles: readonly string[];
  now: string;
}
export const canReviewInterpretations = (roles: readonly string[]) => roles.includes("researcher");

type PlanResult = { ok: true; body: InterpretationEventBody } | { ok: false; reason: string };

function nextBody(
  events: readonly InterpretationEvent[],
  ctx: ActorContext,
  part: Pick<InterpretationEventBody, "action" | "identity" | "draft" | "contentSha256" | "reason" | "acknowledgement" | "taskOrigin">,
): InterpretationEventBody {
  const last = events.at(-1);
  return {
    schema: INTERPRETATION_EVENT_SCHEMA,
    seq: (last?.seq ?? 0) + 1,
    prevHash: last?.hash ?? GENESIS_HASH,
    key: interpretationKey(part.identity),
    actorUserId: ctx.userId,
    actorName: ctx.name,
    recordedAt: ctx.now,
    ...part,
  };
}

export function planTaskOpened(events: readonly InterpretationEvent[], identity: InterpretationIdentity, origin: string, ctx: ActorContext): PlanResult {
  if (!filled(ctx.userId)) return { ok: false, reason: "Sign in first." };
  if (!canReviewInterpretations(ctx.roles)) return { ok: false, reason: "Only a Researcher records interpretation review tasks." };
  const key = interpretationKey(identity);
  if (events.some((e) => e.key === key)) return { ok: false, reason: "A review record already exists." };
  return { ok: true, body: nextBody(events, ctx, { action: "TASK_OPENED", identity, draft: null, contentSha256: null, reason: null, acknowledgement: null, taskOrigin: origin }) };
}

export function planDraft(events: readonly InterpretationEvent[], identity: InterpretationIdentity, draft: InterpretationDraft, ctx: ActorContext): PlanResult {
  if (!canReviewInterpretations(ctx.roles)) return { ok: false, reason: "Only a Researcher can edit interpretations." };
  return { ok: true, body: nextBody(events, ctx, { action: "DRAFT_SAVED", identity, draft, contentSha256: null, reason: null, acknowledgement: null, taskOrigin: null }) };
}

/** One entry per call: there is deliberately no bulk approval. */
export async function planApproval(
  events: readonly InterpretationEvent[],
  identity: InterpretationIdentity,
  draft: InterpretationDraft,
  acknowledgement: string,
  ctx: ActorContext,
): Promise<PlanResult> {
  if (!canReviewInterpretations(ctx.roles)) return { ok: false, reason: "Only a Researcher can approve interpretations." };
  const problem = approvalProblem(identity, draft);
  if (problem) return { ok: false, reason: problem };
  if (acknowledgement !== requiredAcknowledgement(identity)) return { ok: false, reason: "Confirm the review acknowledgement first." };
  const contentSha256 = await interpretationContentSha256(identity, draft);
  return { ok: true, body: nextBody(events, ctx, { action: "APPROVE", identity, draft, contentSha256, reason: null, acknowledgement, taskOrigin: null }) };
}

export function planRevocation(
  events: readonly InterpretationEvent[],
  current: ResolvedInterpretation | null,
  reason: string,
  ctx: ActorContext,
): PlanResult {
  if (!canReviewInterpretations(ctx.roles)) return { ok: false, reason: "Only a Researcher can revoke interpretations." };
  if (!current || current.status !== "approved") return { ok: false, reason: "Only an approved interpretation can be revoked." };
  if (!filled(reason, 10)) return { ok: false, reason: "Give a revocation reason (at least 10 characters)." };
  return { ok: true, body: nextBody(events, ctx, { action: "REVOKE", identity: current.identity, draft: null, contentSha256: current.contentSha256, reason: reason.trim(), acknowledgement: null, taskOrigin: null }) };
}

/** P41: Researcher rejects the current draft (e.g. an AI-assisted draft); nothing is approved or removed. */
export function planRejectDraft(events: readonly InterpretationEvent[], identity: InterpretationIdentity, reason: string, ctx: ActorContext): PlanResult {
  if (!canReviewInterpretations(ctx.roles)) return { ok: false, reason: "Only a Researcher can reject interpretation drafts." };
  if (!filled(reason, 10)) return { ok: false, reason: "Give a rejection reason (at least 10 characters)." };
  return { ok: true, body: nextBody(events, ctx, { action: "REJECT_DRAFT", identity, draft: null, contentSha256: null, reason: reason.trim(), acknowledgement: null, taskOrigin: null }) };
}

/**
 * P41: record the server's signed attestation of an earlier decision on this
 * device. The signature is verified before it is stored; an attestation for a
 * different caller, event or fingerprint is refused.
 */
export async function planAttestation(
  events: readonly InterpretationEvent[],
  attestation: SignedAttestation,
  ctx: Pick<ActorContext, "userId" | "now" | "name">,
  trustedKeys: readonly AttestationTrustedKey[] = BUNDLED_ATTESTATION_KEYS,
): Promise<PlanResult> {
  const st = attestation.statement;
  const target = events.find((e) => e.hash === st.eventHash);
  if (!target || (target.action !== "APPROVE" && target.action !== "REVOKE")) return { ok: false, reason: "The attested decision is not in this device's review history." };
  if (st.actorUserId !== ctx.userId || target.actorUserId !== ctx.userId) return { ok: false, reason: "The attestation belongs to a different account." };
  if (events.some((e) => e.action === "ATTEST" && e.attestation?.statement.eventHash === st.eventHash)) return { ok: false, reason: "This decision is already attested." };
  if (!(await verifyAttestation(attestation, trustedKeys))) return { ok: false, reason: "The server attestation failed signature verification; nothing was applied." };
  const last = events.at(-1);
  return {
    ok: true,
    body: {
      schema: INTERPRETATION_EVENT_SCHEMA,
      seq: (last?.seq ?? 0) + 1,
      prevHash: last?.hash ?? GENESIS_HASH,
      action: "ATTEST",
      key: target.key,
      identity: target.identity,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      recordedAt: ctx.now,
      draft: null,
      contentSha256: target.contentSha256,
      reason: null,
      acknowledgement: null,
      taskOrigin: null,
      attestation,
    },
  };
}

// ------------------------------------------------------------ resolution and snapshot

export interface ResolvedInterpretation {
  key: string;
  identity: InterpretationIdentity;
  status: "approved" | "revoked" | "pending";
  basis: "registry" | "device_local" | null;
  /** Approved content only; null while pending or revoked. */
  content: InterpretationContent | null;
  /** Verbatim handbook text kept as a pending hypothesis (never approved content). */
  pendingContent: InterpretationContent | null;
  citations: Citation[];
  evidenceStrength: EvidenceStrength;
  reviewer: ReviewerRef | null;
  decidedAt: string | null;
  contentSha256: string | null;
  approvalHistory: ApprovalHistoryItem[];
  /** Latest unapproved device-local draft (Researcher workflow only; never shown in reports). */
  latestDraft: InterpretationDraft | null;
  synthetic: boolean;
  sourceUnitText: string | null;
  sourceReviewStatus: string | null;
  proposedLinks: { catalogId: string; basis: string }[];
  activation: RegistryRecord["activation"];
  inRegistry: boolean;
  taskOrigin: string | null;
  /** P41 lifecycle shown to Researchers; reports use `status` only. */
  lifecycle: InterpretationLifecycle;
  /** P41: a device-local approval recorded but not (yet) attested by the server; never applied. */
  awaitingAttestation: { eventHash: string; recordedAt: string } | null;
  /** P41: latest Researcher draft rejection, if the draft was rejected after the last draft save. */
  rejection: { reason: string; at: string } | null;
  aliases: string[];
  measurementContext: MeasurementContext | null;
}
export type InterpretationLifecycle = "pending_review" | "draft" | "awaiting_attestation" | "approved" | "rejected" | "revoked";
export const LIFECYCLE_LABELS: Record<InterpretationLifecycle, string> = {
  pending_review: "Pending scientific review",
  draft: "Draft",
  awaiting_attestation: "Approval awaiting server attestation (not applied)",
  approved: "Approved",
  rejected: "Draft rejected",
  revoked: "Revoked",
};
export interface InterpretationSnapshot {
  schema: typeof INTERPRETATION_SNAPSHOT_SCHEMA;
  registryVersion: number;
  ledger: { events: number; head: string; verified: boolean; note: string | null };
  records: ResolvedInterpretation[];
  excluded: { key: string; reason: string }[];
  /** SHA-256 of the resolved records; null until computed asynchronously. */
  digest: string | null;
}

function fromRecord(rec: RegistryRecord): ResolvedInterpretation {
  const approved = rec.reviewStatus === "APPROVED";
  const last = rec.approvalHistory.at(-1) ?? null;
  return {
    key: rec.key,
    identity: rec.identity,
    status: approved ? "approved" : rec.reviewStatus === "REVOKED" ? "revoked" : "pending",
    basis: rec.reviewStatus === "PENDING_SCIENTIFIC_REVIEW" ? null : "registry",
    content: approved ? rec.content : null,
    pendingContent: rec.contentOrigin === "handbook_verbatim_pending" ? rec.content : null,
    citations: rec.citations,
    evidenceStrength: rec.evidenceStrength,
    reviewer: rec.reviewStatus === "PENDING_SCIENTIFIC_REVIEW" ? null : rec.reviewer,
    decidedAt: last?.decidedAt ?? null,
    contentSha256: rec.contentSha256,
    approvalHistory: [...rec.approvalHistory],
    latestDraft: null,
    synthetic: rec.identity.environment === "synthetic_demo",
    sourceUnitText: rec.sourceUnitText,
    sourceReviewStatus: rec.sourceReviewStatus,
    proposedLinks: rec.proposedLinks,
    activation: rec.activation,
    inRegistry: true,
    taskOrigin: rec.activation ? "registry_backfill_from_activation" : "registry",
    lifecycle: approved ? "approved" : rec.reviewStatus === "REVOKED" ? "revoked" : "pending_review",
    awaitingAttestation: null,
    rejection: null,
    aliases: rec.aliases ?? [],
    measurementContext: rec.measurementContext ?? null,
  };
}

function lifecycleOf(r: ResolvedInterpretation): InterpretationLifecycle {
  if (r.status === "approved") return "approved";
  if (r.awaitingAttestation) return "awaiting_attestation";
  if (r.rejection) return "rejected";
  if (r.latestDraft) return "draft";
  return r.status === "revoked" ? "revoked" : "pending_review";
}

/**
 * Registry + verified device-local events → resolved records (sync; events must be verified).
 * P41: a device-local APPROVE is applied only when its hash is in `attested`
 * (valid server attestation, see attestedDecisionHashes); otherwise it is shown
 * as awaiting attestation and reports keep the pending text. Revocations apply
 * immediately (they can only remove authority).
 */
export function resolveInterpretations(
  registry: InterpretationRegistry,
  events: readonly InterpretationEvent[],
  ledger: InterpretationSnapshot["ledger"] = { events: 0, head: GENESIS_HASH, verified: true, note: null },
  excluded: InterpretationSnapshot["excluded"] = [],
  attested: ReadonlySet<string> = new Set(),
): InterpretationSnapshot {
  const map = new Map<string, ResolvedInterpretation>();
  for (const rec of registry.records) map.set(rec.key, fromRecord(rec));
  for (const e of ledger.verified ? events : []) {
    const cur = map.get(e.key);
    const base: ResolvedInterpretation =
      cur ?? {
        key: e.key,
        identity: e.identity,
        status: "pending",
        basis: null,
        content: null,
        pendingContent: null,
        citations: [],
        evidenceStrength: NOT_ASSESSED,
        reviewer: null,
        decidedAt: null,
        contentSha256: null,
        approvalHistory: [],
        latestDraft: null,
        synthetic: e.identity.environment === "synthetic_demo",
        sourceUnitText: null,
        sourceReviewStatus: null,
        proposedLinks: [],
        activation: null,
        inRegistry: false,
        taskOrigin: null,
        lifecycle: "pending_review",
        awaitingAttestation: null,
        rejection: null,
        aliases: [],
        measurementContext: null,
      };
    const reviewer = { userId: e.actorUserId, name: e.actorName };
    if (e.action === "TASK_OPENED") map.set(e.key, { ...base, taskOrigin: base.taskOrigin ?? e.taskOrigin });
    else if (e.action === "DRAFT_SAVED") map.set(e.key, { ...base, latestDraft: e.draft, rejection: null });
    else if (e.action === "REJECT_DRAFT") map.set(e.key, { ...base, rejection: { reason: e.reason ?? "", at: e.recordedAt }, awaitingAttestation: null });
    else if (e.action === "ATTEST") continue;
    else if (e.action === "APPROVE" && e.draft && !attested.has(e.hash))
      map.set(e.key, { ...base, latestDraft: e.draft, awaitingAttestation: { eventHash: e.hash, recordedAt: e.recordedAt }, rejection: null });
    else if (e.action === "APPROVE" && e.draft)
      map.set(e.key, {
        ...base,
        status: "approved",
        basis: "device_local",
        content: e.draft.content,
        citations: e.draft.citations,
        evidenceStrength: e.draft.evidenceStrength,
        reviewer,
        decidedAt: e.recordedAt,
        contentSha256: e.contentSha256,
        latestDraft: null,
        awaitingAttestation: null,
        rejection: null,
        measurementContext: e.draft.context ?? base.measurementContext,
        approvalHistory: [...base.approvalHistory, { action: "APPROVE", eventId: e.hash, reviewer, decidedAt: e.recordedAt, contentSha256: e.contentSha256, reason: null, basis: "device_local" }],
      });
    else if (e.action === "REVOKE" && base.status === "approved")
      map.set(e.key, {
        ...base,
        status: "revoked",
        basis: "device_local",
        content: null,
        reviewer,
        decidedAt: e.recordedAt,
        approvalHistory: [...base.approvalHistory, { action: "REVOKE", eventId: e.hash, reviewer, decidedAt: e.recordedAt, contentSha256: base.contentSha256, reason: e.reason, basis: "device_local" }],
      });
  }
  const records = [...map.values()].map((r) => ({ ...r, lifecycle: lifecycleOf(r) })).sort((a, b) => a.key.localeCompare(b.key));
  return { schema: INTERPRETATION_SNAPSHOT_SCHEMA, registryVersion: registry.version, ledger, records, excluded, digest: null };
}

/** Verified snapshot: chain-checked events (ignored entirely on failure) and a content digest. */
export async function buildVerifiedSnapshot(
  rawRegistry: unknown,
  events: readonly InterpretationEvent[],
): Promise<InterpretationSnapshot> {
  const validated = validateRegistry(rawRegistry);
  const excluded = [...validated.excluded];
  // Approved/revoked registry records must reproduce their bound content fingerprint, otherwise they are pending.
  const records: RegistryRecord[] = [];
  for (const rec of validated.registry.records) {
    if (rec.reviewStatus !== "PENDING_SCIENTIFIC_REVIEW" && rec.content) {
      const sha = await interpretationContentSha256(rec.identity, { content: rec.content, citations: rec.citations, evidenceStrength: rec.evidenceStrength });
      const lastApproval = [...rec.approvalHistory].reverse().find((h) => h.action === "APPROVE");
      if (sha !== rec.contentSha256 || lastApproval?.contentSha256 !== sha) {
        excluded.push({ key: rec.key, reason: "Approved content fingerprint mismatch" });
        records.push({ ...rec, reviewStatus: "PENDING_SCIENTIFIC_REVIEW", reviewer: null, approvalHistory: [], contentSha256: null, content: null, contentOrigin: "none" });
        continue;
      }
    }
    records.push(rec);
  }
  const registry = { ...validated.registry, records };
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const check = await verifyInterpretationChain(sorted);
  const ledger = check.ok
    ? { events: sorted.length, head: sorted.at(-1)?.hash ?? GENESIS_HASH, verified: true, note: null }
    : { events: sorted.length, head: GENESIS_HASH, verified: false, note: `Device review history failed its integrity check (${check.reason}); only the shared registry is used.` };
  const snap = resolveInterpretations(registry, check.ok ? sorted : [], ledger, excluded);
  const digestable = snap.records.map(({ latestDraft: _d, ...r }) => r);
  return { ...snap, digest: await sha256Hex(canonicalJson({ registryVersion: snap.registryVersion, records: digestable })) };
}

// ------------------------------------------------------------ lookup for report series

export interface SeriesKey {
  metricId: string;
  unit: string;
  domain: InterpretationDomain;
  missionId: string;
  /** Report provenance; SYNTHETIC DEMO interpretations never apply to real data. */
  provenance?: string;
}
export interface InterpretationMatch {
  /** Exact-unit record (approved, revoked or pending), if any. */
  exact: ResolvedInterpretation | null;
  /** Unit-independent handbook/catalog record for the same ID and domain (pending text only). */
  general: ResolvedInterpretation | null;
  /** Unit-bound records for other units (never applied to this series). */
  otherUnits: string[];
}

export function matchInterpretation(snapshot: InterpretationSnapshot, k: SeriesKey): InterpretationMatch {
  const same = snapshot.records.filter(
    (r) =>
      r.identity.catalogId === k.metricId &&
      r.identity.domain === k.domain &&
      (r.identity.environment !== "synthetic_demo" || (r.identity.missionId === k.missionId && (k.provenance === undefined || k.provenance === "synthetic"))),
  );
  const exact = same.find((r) => r.identity.unit === k.unit) ?? null;
  const general = same.find((r) => r.identity.unit === null) ?? null;
  const otherUnits = [...new Set(same.filter((r) => r.identity.unit !== null && r.identity.unit !== k.unit && r.status === "approved").map((r) => r.identity.unit!))].sort();
  return { exact, general, otherUnits };
}

// ------------------------------------------------------------ shared display text (screen = PDF = TXT)

export type SeriesComparisonKind = "multi_day_comparison" | "same_utc_day_only" | "insufficient_time_points" | "non_numeric";
export type SeriesDirection = "higher" | "lower" | "no_recorded_difference" | null;

export interface SeriesInterpretation {
  key: string | null;
  status: "approved" | "revoked" | "pending";
  syntheticDemo: boolean;
  basis: "registry" | "device_local" | null;
  /** Status, review and approval basis (always first). */
  statusLine: string;
  /** Biological context lines (approved content or pending handbook hypothesis), each with citation markers. */
  contextLines: string[];
  /** Numbered citations, e.g. "[1] Title — locator (kind)". */
  citations: string[];
  uncertainty: string[];
  alert: string;
}

const cite = (ids: readonly string[], order: readonly string[]) =>
  ids.length ? ` [${ids.map((id) => order.indexOf(id) + 1).filter((n) => n > 0).join(", ")}]` : "";

const KIND_LABELS: Record<CitationKind, string> = {
  governed_handbook: "governed handbook",
  peer_reviewed: "peer-reviewed",
  agency_document: "agency document",
  other: "other",
};
export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  not_assessed: "Not assessed",
  low: "Low",
  moderate: "Moderate",
  high: "High",
};

export function citationLines(citations: readonly Citation[]): string[] {
  return citations.map((c, i) => `[${i + 1}] ${c.title} — ${c.locator} (${KIND_LABELS[c.kind]})${c.url ? ` ${c.url}` : ""}`);
}

function who(r: ReviewerRef | null) {
  return r ? (r.name ? `${r.name} (${r.userId})` : r.userId) : "unknown reviewer";
}

/**
 * Deterministic interpretation text for one metric/unit series. Direction-specific
 * context is shown only for a multi-day first-to-last difference and is always
 * phrased as documented context, never as improvement, deterioration or risk.
 */
export function seriesInterpretation(
  match: InterpretationMatch,
  comparison: SeriesComparisonKind,
  direction: SeriesDirection,
  handbookLineText: string,
): SeriesInterpretation {
  const r = match.exact;
  const directionNote =
    comparison === "multi_day_comparison"
      ? direction === "no_recorded_difference"
        ? "No recorded difference; direction-specific context is not applied."
        : null
      : comparison === "same_utc_day_only"
        ? "Readings fall on one UTC day; direction-specific context is not applied."
        : "Fewer than two comparable time points; direction-specific context is not applied.";
  const otherUnitNote = match.otherUnits.length
    ? [`An approved interpretation exists only for ${match.otherUnits.join(", ")}; it is not applied to this unit and values are never converted.`]
    : [];

  if (r && r.status === "approved" && r.content) {
    const order = r.citations.map((c) => c.id);
    const c = r.content;
    const lines: string[] = [];
    if (c.function) lines.push(`Measure: ${c.function.text}${cite(c.function.citationIds, order)}`);
    if (directionNote) lines.push(directionNote);
    else if (direction === "higher" && c.increaseContext)
      lines.push(`Context documented for a higher value (not an improvement, deterioration or diagnosis): ${c.increaseContext.text}${cite(c.increaseContext.citationIds, order)}`);
    else if (direction === "lower" && c.decreaseContext)
      lines.push(`Context documented for a lower value (not an improvement, deterioration or diagnosis): ${c.decreaseContext.text}${cite(c.decreaseContext.citationIds, order)}`);
    else lines.push("No direction-specific context is documented for the recorded direction.");
    if (c.generalContext) lines.push(`General context: ${c.generalContext.text}${cite(c.generalContext.citationIds, order)}`);
    if (c.spaceflightRelevance) lines.push(`Spaceflight relevance: ${c.spaceflightRelevance.text}${cite(c.spaceflightRelevance.citationIds, order)}`);
    if (c.associatedBiomarkers) lines.push(`Associated biomarkers: ${c.associatedBiomarkers.text}${cite(c.associatedBiomarkers.citationIds, order)}`);
    for (const req of c.comparabilityRequirements) lines.push(`Comparability requirement: ${req.text}${cite(req.citationIds, order)}`);
    const basis = r.basis === "registry" ? "shared registry" : "device-local Researcher ledger, not yet in the shared registry";
    return {
      key: r.key,
      status: "approved",
      syntheticDemo: r.synthetic,
      basis: r.basis,
      statusLine: `${r.synthetic ? `${SYNTHETIC_DEMO_INTERPRETATION_LABEL}. ` : ""}Interpretation APPROVED by Researcher ${who(r.reviewer)} on ${r.decidedAt} (${basis}); evidence strength: ${EVIDENCE_LEVEL_LABELS[r.evidenceStrength.level]} — ${r.evidenceStrength.basis}`,
      contextLines: lines,
      citations: citationLines(r.citations),
      uncertainty: [
        ...c.limitations,
        "Describes the measure in general; it is not a finding, diagnosis or risk statement about this crew member.",
        ...otherUnitNote,
      ],
      alert: SERIES_ALERT_TEXT,
    };
  }

  const revoked = r && r.status === "revoked" ? r : null;
  const general = match.general;
  const proposed = [...(r?.proposedLinks ?? []), ...(general?.proposedLinks ?? [])];
  const pendingCitations = general?.pendingContent ? citationLines(general.citations) : [];
  return {
    key: r?.key ?? general?.key ?? null,
    status: revoked ? "revoked" : "pending",
    syntheticDemo: Boolean(r?.synthetic),
    basis: revoked?.basis ?? null,
    statusLine: revoked
      ? `Interpretation REVOKED by Researcher ${who(revoked.reviewer)} on ${revoked.decidedAt} (${revoked.approvalHistory.at(-1)?.reason ?? "no reason recorded"}). ${PENDING_INTERPRETATION_TEXT}.`
      : `${PENDING_INTERPRETATION_TEXT}.`,
    contextLines: [
      `Biological context: ${handbookLineText}`,
      ...proposed.map((p) => `Proposed link awaiting review (not applied): ${p.catalogId} — ${p.basis}`),
    ],
    citations: pendingCitations,
    uncertainty: [
      "No scientifically approved interpretation exists for this exact biomarker, unit and domain; no biological explanation is generated.",
      ...otherUnitNote,
    ],
    alert: SERIES_ALERT_TEXT,
  };
}

/** Flattened lines shared by the PDF and TXT exports. */
export function seriesInterpretationText(s: SeriesInterpretation): string[] {
  return [
    `Interpretation status: ${s.statusLine}`,
    ...s.contextLines,
    ...(s.citations.length ? [`Citations: ${s.citations.join("; ")}`] : ["Citations: none"]),
    ...s.uncertainty.map((u) => `Uncertainty: ${u}`),
    `Alerts: ${s.alert}`,
  ];
}

// ------------------------------------------------------------ tasks and coverage

export interface CatalogIdentitySource {
  identity: InterpretationIdentity;
  origin: "synthetic_demo_activation" | "production_catalog_activation";
}
export interface InterpretationTask {
  taskId: string;
  key: string;
  identity: InterpretationIdentity;
  status: "open" | "revoked_needs_review";
  origin: string;
  hasDraft: boolean;
  hasHandbookText: boolean;
  proposedLinks: { catalogId: string; basis: string }[];
}

/**
 * Every catalog identity (registry, activated demo entries, active production
 * entries) without an approved interpretation gets exactly one review task.
 * Deterministic; never approves anything.
 */
export function deriveInterpretationTasks(
  snapshot: InterpretationSnapshot,
  catalog: readonly CatalogIdentitySource[] = [],
): InterpretationTask[] {
  const byKey = new Map(snapshot.records.map((r) => [r.key, r]));
  const out = new Map<string, InterpretationTask>();
  const add = (identity: InterpretationIdentity, origin: string) => {
    const key = interpretationKey(identity);
    const r = byKey.get(key);
    if (r?.status === "approved" || out.has(key)) return;
    out.set(key, {
      taskId: `interp-task:${key}`,
      key,
      identity: r?.identity ?? identity,
      status: r?.status === "revoked" ? "revoked_needs_review" : "open",
      origin: r?.taskOrigin ?? origin,
      hasDraft: Boolean(r?.latestDraft),
      hasHandbookText: Boolean(r?.pendingContent),
      proposedLinks: r?.proposedLinks ?? [],
    });
  };
  for (const r of snapshot.records) add(r.identity, r.taskOrigin ?? "registry");
  for (const c of catalog) add(c.identity, c.origin);
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface DomainCoverage {
  domain: InterpretationDomain;
  total: number;
  approvedProduction: number;
  approvedSyntheticDemo: number;
  revoked: number;
  pending: number;
  pendingWithProposedHandbookLink: number;
  pendingWithoutAnyContent: number;
}

/** Coverage of a set of identities (e.g. every activated demo entry) by domain. */
export function interpretationCoverage(
  snapshot: InterpretationSnapshot,
  identities: readonly InterpretationIdentity[],
): DomainCoverage[] {
  const byKey = new Map(snapshot.records.map((r) => [r.key, r]));
  return INTERPRETATION_DOMAINS.map((domain) => {
    const own = identities.filter((i) => i.domain === domain).map((i) => byKey.get(interpretationKey(i)) ?? null);
    const status = (r: ResolvedInterpretation | null) => r?.status ?? "pending";
    const pending = own.filter((r) => status(r) === "pending");
    return {
      domain,
      total: own.length,
      approvedProduction: own.filter((r) => r?.status === "approved" && !r.synthetic).length,
      approvedSyntheticDemo: own.filter((r) => r?.status === "approved" && r.synthetic).length,
      revoked: own.filter((r) => r?.status === "revoked").length,
      pending: pending.length,
      pendingWithProposedHandbookLink: pending.filter((r) => (r?.proposedLinks.length ?? 0) > 0).length,
      pendingWithoutAnyContent: pending.filter((r) => !(r?.proposedLinks.length) && !r?.pendingContent).length,
    };
  });
}

// ------------------------------------------------------------ approval packages (shared registry)

export interface ApprovalPackage {
  schema: typeof INTERPRETATION_PACKAGE_SCHEMA;
  exportedAt: string;
  events: InterpretationEvent[];
  ledgerHead: string;
}

export function buildApprovalPackage(events: readonly InterpretationEvent[], exportedAt: string): ApprovalPackage {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  return { schema: INTERPRETATION_PACKAGE_SCHEMA, exportedAt, events: sorted, ledgerHead: sorted.at(-1)?.hash ?? GENESIS_HASH };
}

/**
 * Owner-run, code-reviewed merge of a Researcher's exported package into the
 * shared registry. The full chain is re-verified; only APPROVE/REVOKE events
 * change records, and pending/handbook records are otherwise untouched.
 */
export async function mergeApprovalPackage(
  registry: InterpretationRegistry,
  pkg: unknown,
): Promise<{ ok: true; registry: InterpretationRegistry; changed: string[] } | { ok: false; reason: string }> {
  const p = pkg as Partial<ApprovalPackage> | null;
  if (!p || p.schema !== INTERPRETATION_PACKAGE_SCHEMA || !Array.isArray(p.events)) return { ok: false, reason: "Not an interpretation approval package" };
  const events = [...p.events].sort((a, b) => a.seq - b.seq);
  const check = await verifyInterpretationChain(events);
  if (!check.ok) return { ok: false, reason: check.reason };
  if ((events.at(-1)?.hash ?? GENESIS_HASH) !== p.ledgerHead) return { ok: false, reason: "Package head does not match its events" };
  const records = new Map(registry.records.map((r) => [r.key, r]));
  const changed: string[] = [];
  for (const e of events) {
    if (e.action !== "APPROVE" && e.action !== "REVOKE") continue;
    const cur = records.get(e.key);
    const reviewer = { userId: e.actorUserId, name: e.actorName };
    const history = cur?.approvalHistory ?? [];
    if (history.some((h) => h.eventId === e.hash)) continue;
    const item: ApprovalHistoryItem = { action: e.action, eventId: e.hash, reviewer, decidedAt: e.recordedAt, contentSha256: e.contentSha256, reason: e.reason, basis: "registry" };
    if (e.action === "APPROVE" && e.draft) {
      records.set(e.key, {
        key: e.key,
        identity: e.identity,
        sourceUnitText: cur?.sourceUnitText ?? null,
        specimenText: cur?.specimenText ?? null,
        content: e.draft.content,
        contentOrigin: "reviewer_authored",
        citations: e.draft.citations,
        evidenceStrength: e.draft.evidenceStrength,
        reviewStatus: "APPROVED",
        sourceReviewStatus: cur?.sourceReviewStatus ?? null,
        reviewer,
        approvalHistory: [...history, item],
        contentSha256: e.contentSha256,
        proposedLinks: cur?.proposedLinks ?? [],
        activation: cur?.activation ?? null,
      });
      changed.push(e.key);
    } else if (e.action === "REVOKE" && cur && cur.reviewStatus === "APPROVED") {
      records.set(e.key, { ...cur, reviewStatus: "REVOKED", reviewer, approvalHistory: [...history, item] });
      changed.push(e.key);
    }
  }
  if (!changed.length) return { ok: false, reason: "The package contains no new approvals or revocations" };
  return {
    ok: true,
    registry: { ...registry, version: registry.version + 1, records: [...records.values()].sort((a, b) => a.key.localeCompare(b.key)) },
    changed: [...new Set(changed)],
  };
}
