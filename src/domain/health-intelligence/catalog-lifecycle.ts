/**
 * P37 governed biomarker catalog lifecycle (pure, browser-safe, deterministic).
 *
 *   UNKNOWN -> ACCEPTED_FOR_REVIEW -> SCIENTIFICALLY_VALIDATED
 *   -> SCIENTIFICALLY_APPROVED -> CATALOG_PROPOSED -> CATALOG_ACTIVE -> RECOGNIZED
 *
 * - Triage acceptance, scientific validation, scientific approval and catalog
 *   activation are separate events by separate authorities.
 * - A scientific approval cites an independently provisioned source-validation
 *   receipt; identity, exact unit, specimen and method come from that receipt,
 *   never from free text. The catalog proposal is derived automatically from the
 *   approval (no source-code edit) and carries a SHA-256 over its canonical JSON.
 * - Activation/revocation require an active Ground Medical membership in the
 *   approval's originating mission (role-based, never an email-specific grant),
 *   a different identity from the approver, the exact proposal digest and no
 *   conflicting definition.
 * - Revocation is a later event; history is append-only and stored observations
 *   are never rewritten.
 * - Recognition never converts units and never infers missing specimen/method.
 */
import { classifyIntakeObservation } from "@/domain/health-domains/unified-intake-classification";
import type { HealthDomainId } from "@/domain/health-domains/registry";
import p36Registry from "../../../data/scientific/p36-biomarker-source-registry.v1.json";
import { canonicalJson } from "./observation-envelope";

export const CATALOG_PROPOSAL_SCHEMA = "mitochondria.catalog-entry-proposal.v2" as const;
export const ACTIVE_CATALOG_SNAPSHOT_SCHEMA = "mitochondria.active-catalog-snapshot.v1" as const;
export const BASE_CATALOG_VERSION = "p36.1.0" as const;
export const NEW_METRIC_ID = /^ext:[a-z0-9][a-z0-9-]{2,62}$/;
const DOMAINS: readonly HealthDomainId[] = ["bone", "immune", "cardiovascular", "behavioral"];

export type LifecycleState =
  | "UNKNOWN"
  | "ACCEPTED_FOR_REVIEW"
  | "SCIENTIFICALLY_VALIDATED"
  | "SCIENTIFICALLY_APPROVED"
  | "CATALOG_PROPOSED"
  | "CATALOG_ACTIVE"
  | "CATALOG_REVOKED"
  | "RECOGNIZED";
export type Provenance = "synthetic" | "real";
export type CatalogEnvironment = "test" | "production";

export const normalizeCatalogText = (v: string) =>
  v.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- inputs

/** A submitted unknown term (cloud handoff metadata; values never included). */
export interface SubmittedTerm {
  missionId: string;
  provenance: Provenance;
  submissionId: string;
  termId: string;
  originalLabels: string[];
  exactUnit: string;
  submittedBy: string;
}
/** Independently provisioned receipt (p36_dynamic_source_validation). Never created by the app. */
export interface SourceValidationReceipt {
  termId: string;
  canonicalMetricId: string;
  exactUnit: string;
  specimen: string;
  method: string;
  protocol: string;
  protocolVersion: string;
  validationReference: string;
  sourceSha256: string;
  verifiedBy: string;
  verifiedAt: string;
}
export interface TriageSummary {
  termId: string;
  latestAction: "ACCEPT_FOR_REVIEW" | "REQUEST_MORE_EVIDENCE" | "REJECT_REVIEW_REQUEST" | null;
}
export interface Grant {
  userId: string;
  revoked: boolean;
}
/** Mission membership used for role-based catalog activation (Ground Medical of the approval mission). */
export interface MissionRoleMembership {
  userId: string;
  missionId: string;
  role: string;
  active: boolean;
}
export function isCatalogActivatorFor(
  memberships: readonly MissionRoleMembership[],
  userId: string,
  missionId: string,
): boolean {
  return memberships.some(
    (m) => m.userId === userId && m.missionId === missionId && m.role === "ground_medical" && m.active,
  );
}

export interface CatalogEntryDefinition {
  canonicalId: string;
  canonicalName: string;
  aliases: string[];
  unit: string;
  specimen: string;
  method: string;
  protocol: string;
  protocolVersion: string;
  domain: HealthDomainId;
  provenance: Provenance;
  evidenceRefs: string[];
}
export interface CatalogProposal {
  schema: typeof CATALOG_PROPOSAL_SCHEMA;
  entry: CatalogEntryDefinition;
  source: {
    missionId: string;
    submissionId: string;
    termId: string;
    validationReference: string;
    sourceSha256: string;
  };
  approval: { approvalEventId: string; approverId: string; approvedAt: string };
}

export type LedgerEvent =
  | {
      type: "APPROVE";
      eventId: string;
      seq: number;
      actorId: string;
      at: string;
      proposal: CatalogProposal;
      proposalSha256: string;
    }
  | {
      type: "ACTIVATE";
      eventId: string;
      seq: number;
      actorId: string;
      at: string;
      approvalEventId: string;
      proposalSha256: string;
    }
  | {
      type: "REVOKE";
      eventId: string;
      seq: number;
      actorId: string;
      at: string;
      activationEventId: string;
      reason: string;
    };

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: string };
const fail = <T>(reason: string): Outcome<T> => ({ ok: false, reason });

const P36_IDS = new Set(
  (p36Registry.metrics as { id: string }[]).map((m) => normalizeCatalogText(m.id)),
);

/** Exact-key reason for conflicts with the bundled base catalog. */
function baseCatalogConflict(
  entry: Pick<CatalogEntryDefinition, "canonicalId" | "aliases" | "canonicalName" | "unit">,
): string | null {
  if (P36_IDS.has(normalizeCatalogText(entry.canonicalId)))
    return "Canonical ID collides with the base catalog.";
  for (const label of [entry.canonicalName, ...entry.aliases])
    if (classifyIntakeObservation({ label, unit: entry.unit }).status !== "unclassified")
      return `"${label}" already resolves in the base catalog; a new definition would be ambiguous.`;
  return null;
}

// ------------------------------------------------- approval -> proposal

export interface ApprovalInput {
  term: SubmittedTerm;
  triage: TriageSummary;
  receipt: SourceValidationReceipt | null;
  approverId: string;
  approverGrant: Grant | null;
  canonicalName: string;
  domain: HealthDomainId;
  approvalEventId: string;
  approvedAt: string;
}

/** Scientific approval of a new biomarker; yields the auditable catalog proposal. */
export async function approveNewBiomarker(
  input: ApprovalInput,
): Promise<Outcome<{ proposal: CatalogProposal; proposalSha256: string }>> {
  const { term, triage, receipt } = input;
  if (
    !input.approverGrant ||
    input.approverGrant.revoked ||
    input.approverGrant.userId !== input.approverId
  )
    return fail("Scientific approval requires an explicit, unrevoked scientific approver grant.");
  if (input.approverId === term.submittedBy)
    return fail("The submitter cannot approve their own request.");
  if (triage.termId !== term.termId || triage.latestAction !== "ACCEPT_FOR_REVIEW")
    return fail("The term must be accepted for scientific review first.");
  if (!receipt || receipt.termId !== term.termId)
    return fail("An independently provisioned source-validation receipt is required.");
  if (receipt.verifiedBy === input.approverId)
    return fail("Source validation and scientific approval must be independent identities.");
  if (!NEW_METRIC_ID.test(receipt.canonicalMetricId))
    return fail("Validated canonical ID must be a new ext: identifier.");
  if (receipt.exactUnit.trim() !== term.exactUnit.trim())
    return fail("Validated unit differs from the submitted unit; no conversion is permitted.");
  for (const [k, v] of Object.entries({
    specimen: receipt.specimen,
    method: receipt.method,
    protocol: receipt.protocol,
    validationReference: receipt.validationReference,
  }))
    if (!v?.trim()) return fail(`Validated ${k} is required.`);
  if (!/^[0-9a-f]{64}$/.test(receipt.sourceSha256))
    return fail("Validated source digest is invalid.");
  const name = input.canonicalName.trim();
  if (name.length < 3 || name.length > 120)
    return fail("Canonical name must be 3 to 120 characters.");
  if (!DOMAINS.includes(input.domain)) return fail("Unknown scientific domain.");
  const aliases = [...new Set(term.originalLabels.map((l) => l.trim()).filter(Boolean))].sort();
  if (!aliases.length) return fail("The submitted term has no observed label.");
  const entry: CatalogEntryDefinition = {
    canonicalId: receipt.canonicalMetricId,
    canonicalName: name,
    aliases,
    unit: receipt.exactUnit.trim(),
    specimen: receipt.specimen.trim(),
    method: receipt.method.trim(),
    protocol: receipt.protocol.trim(),
    protocolVersion: receipt.protocolVersion.trim(),
    domain: input.domain,
    provenance: term.provenance,
    evidenceRefs: [receipt.validationReference.trim(), `sha256:${receipt.sourceSha256}`],
  };
  const conflict = baseCatalogConflict(entry);
  if (conflict) return fail(conflict);
  const proposal: CatalogProposal = {
    schema: CATALOG_PROPOSAL_SCHEMA,
    entry,
    source: {
      missionId: term.missionId,
      submissionId: term.submissionId,
      termId: term.termId,
      validationReference: receipt.validationReference,
      sourceSha256: receipt.sourceSha256,
    },
    approval: {
      approvalEventId: input.approvalEventId,
      approverId: input.approverId,
      approvedAt: input.approvedAt,
    },
  };
  return {
    ok: true,
    value: { proposal, proposalSha256: await sha256Hex(canonicalJson(proposal)) },
  };
}

// ------------------------------------------------------- ledger rules

const activeKeys = (e: CatalogEntryDefinition) =>
  [e.canonicalName, ...e.aliases].map(
    (a) =>
      `${normalizeCatalogText(a)}|${e.unit}|${normalizeCatalogText(e.specimen)}|${normalizeCatalogText(e.method)}`,
  );

export interface LedgerView {
  approvals: Map<string, Extract<LedgerEvent, { type: "APPROVE" }>>;
  activations: Map<string, Extract<LedgerEvent, { type: "ACTIVATE" }>>; // by approvalEventId
  revocations: Map<string, Extract<LedgerEvent, { type: "REVOKE" }>>; // by activationEventId
}
export function viewLedger(events: readonly LedgerEvent[]): LedgerView {
  const v: LedgerView = { approvals: new Map(), activations: new Map(), revocations: new Map() };
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.type === "APPROVE") v.approvals.set(e.eventId, e);
    else if (e.type === "ACTIVATE") v.activations.set(e.approvalEventId, e);
    else v.revocations.set(e.activationEventId, e);
  }
  return v;
}

const ACTIVATOR_DENIED =
  "Catalog activation requires active Ground Medical membership in the approval mission.";

/** Role-based catalog activation by Ground Medical of the approval mission. Returns the ACTIVATE event to append. */
export function activateCatalogEntry(
  events: readonly LedgerEvent[],
  input: {
    approvalEventId: string;
    expectedProposalSha256: string;
    activatorId: string;
    activatorMemberships: readonly MissionRoleMembership[];
    eventId: string;
    at: string;
  },
): Outcome<Extract<LedgerEvent, { type: "ACTIVATE" }>> {
  const v = viewLedger(events);
  const approval = v.approvals.get(input.approvalEventId);
  // Same refusal for unknown approvals and unauthorized callers (no existence oracle).
  if (
    !approval ||
    !isCatalogActivatorFor(
      input.activatorMemberships,
      input.activatorId,
      approval.proposal.source.missionId,
    )
  )
    return fail(ACTIVATOR_DENIED);
  if (approval.proposalSha256 !== input.expectedProposalSha256)
    return fail("Proposal digest does not match the approved proposal.");
  if (approval.actorId === input.activatorId)
    return fail("The scientific approver cannot activate their own approval.");
  if (v.activations.has(approval.eventId))
    return fail("This approval was already activated; a revoked entry needs a new approval.");
  const keys = new Set(activeKeys(approval.proposal.entry));
  for (const act of v.activations.values()) {
    if (v.revocations.has(act.eventId)) continue;
    const other = v.approvals.get(act.approvalEventId)?.proposal.entry;
    if (!other) continue;
    if (other.canonicalId === approval.proposal.entry.canonicalId)
      return fail("An active entry already uses this canonical ID.");
    if (activeKeys(other).some((k) => keys.has(k)))
      return fail(
        `Conflicts with active entry ${other.canonicalId} (same label, unit, specimen and method).`,
      );
  }
  const seq = Math.max(0, ...events.map((e) => e.seq)) + 1;
  return {
    ok: true,
    value: {
      type: "ACTIVATE",
      eventId: input.eventId,
      seq,
      actorId: input.activatorId,
      at: input.at,
      approvalEventId: approval.eventId,
      proposalSha256: approval.proposalSha256,
    },
  };
}

export function revokeCatalogEntry(
  events: readonly LedgerEvent[],
  input: {
    activationEventId: string;
    activatorId: string;
    activatorMemberships: readonly MissionRoleMembership[];
    reason: string;
    eventId: string;
    at: string;
  },
): Outcome<Extract<LedgerEvent, { type: "REVOKE" }>> {
  const v = viewLedger(events);
  const activation = [...v.activations.values()].find((a) => a.eventId === input.activationEventId);
  const approval = activation ? v.approvals.get(activation.approvalEventId) : undefined;
  if (
    !approval ||
    !isCatalogActivatorFor(
      input.activatorMemberships,
      input.activatorId,
      approval.proposal.source.missionId,
    )
  )
    return fail("Revocation requires active Ground Medical membership in the approval mission.");
  if (v.revocations.has(input.activationEventId)) return fail("Already revoked.");
  if (input.reason.trim().length < 8)
    return fail("A documented revocation reason (8+ characters) is required.");
  const seq = Math.max(0, ...events.map((e) => e.seq)) + 1;
  return {
    ok: true,
    value: {
      type: "REVOKE",
      eventId: input.eventId,
      seq,
      actorId: input.activatorId,
      at: input.at,
      activationEventId: input.activationEventId,
      reason: input.reason.trim(),
    },
  };
}

// ----------------------------------------------------------- snapshot

export interface CatalogEntry extends CatalogEntryDefinition {
  status: "ACTIVE" | "REVOKED";
  approval: {
    approvalEventId: string;
    approverId: string;
    approvedAt: string;
    proposalSha256: string;
  };
  activation: {
    activationEventId: string;
    activatorId: string;
    activatedAt: string;
    catalogVersion: number;
  };
  revocation: {
    revocationEventId: string;
    revokedAt: string;
    reason: string;
    catalogVersion: number;
  } | null;
}
export interface ActiveCatalogSnapshot {
  schema: typeof ACTIVE_CATALOG_SNAPSHOT_SCHEMA;
  environment: CatalogEnvironment;
  baseCatalogVersion: typeof BASE_CATALOG_VERSION;
  catalogVersion: number;
  issuedAt: string;
  entries: CatalogEntry[];
}

/** Deterministic snapshot of every activated entry (revoked ones retained for history). */
export function deriveCatalogSnapshot(
  events: readonly LedgerEvent[],
  environment: CatalogEnvironment,
  issuedAt: string,
): ActiveCatalogSnapshot {
  const v = viewLedger(events);
  const entries: CatalogEntry[] = [];
  for (const act of v.activations.values()) {
    const ap = v.approvals.get(act.approvalEventId);
    if (!ap) continue;
    const rev = v.revocations.get(act.eventId) ?? null;
    entries.push({
      ...ap.proposal.entry,
      status: rev ? "REVOKED" : "ACTIVE",
      approval: { ...ap.proposal.approval, proposalSha256: ap.proposalSha256 },
      activation: {
        activationEventId: act.eventId,
        activatorId: act.actorId,
        activatedAt: act.at,
        catalogVersion: act.seq,
      },
      revocation: rev
        ? {
            revocationEventId: rev.eventId,
            revokedAt: rev.at,
            reason: rev.reason,
            catalogVersion: rev.seq,
          }
        : null,
    });
  }
  entries.sort(
    (a, b) =>
      a.canonicalId.localeCompare(b.canonicalId) ||
      a.activation.catalogVersion - b.activation.catalogVersion,
  );
  const catalogVersion = Math.max(
    0,
    ...events.filter((e) => e.type !== "APPROVE").map((e) => e.seq),
  );
  return {
    schema: ACTIVE_CATALOG_SNAPSHOT_SCHEMA,
    environment,
    baseCatalogVersion: BASE_CATALOG_VERSION,
    catalogVersion,
    issuedAt,
    entries,
  };
}

export interface EvaluatedCatalog {
  catalogVersion: number;
  environment: CatalogEnvironment;
  active: CatalogEntry[];
  historical: CatalogEntry[];
  excluded: { canonicalId: string; reason: string }[];
}
export const EMPTY_CATALOG: EvaluatedCatalog = {
  catalogVersion: 0,
  environment: "production",
  active: [],
  historical: [],
  excluded: [],
};

/** Fail closed: malformed, base-conflicting or mutually conflicting entries never match. */
export function evaluateCatalogSnapshot(s: ActiveCatalogSnapshot): EvaluatedCatalog {
  const excluded: EvaluatedCatalog["excluded"] = [];
  const candidates: CatalogEntry[] = [];
  const historical: CatalogEntry[] = [];
  for (const e of s.entries) {
    const bad = !NEW_METRIC_ID.test(e.canonicalId)
      ? "Invalid canonical ID"
      : !e.unit?.trim() || !e.specimen?.trim() || !e.method?.trim()
        ? "Unit, specimen and method are required"
        : !DOMAINS.includes(e.domain)
          ? "Unknown domain"
          : !e.aliases?.length
            ? "No validated alias"
            : baseCatalogConflict(e);
    if (bad) {
      excluded.push({ canonicalId: e.canonicalId, reason: bad });
      continue;
    }
    historical.push(e);
    if (e.status === "ACTIVE") candidates.push(e);
  }
  const active = candidates.filter((c) => {
    const keys = new Set(activeKeys(c));
    const clash = candidates.some(
      (o) => o !== c && (o.canonicalId === c.canonicalId || activeKeys(o).some((k) => keys.has(k))),
    );
    if (clash)
      excluded.push({ canonicalId: c.canonicalId, reason: "Conflicts with another active entry" });
    return !clash;
  });
  return {
    catalogVersion: s.catalogVersion,
    environment: s.environment,
    active,
    historical,
    excluded,
  };
}

// ---------------------------------------------------------- recognition

export interface RecognitionInput {
  label: string;
  unit: string;
  specimen?: string | undefined;
  method?: string | undefined;
  provenance?: Provenance | undefined;
}
export type Recognition =
  | {
      status: "RECOGNIZED";
      canonicalId: string;
      domain: HealthDomainId;
      catalogVersion: number;
      entryActivatedAt: number;
      originalLabel: string;
      originalUnit: string;
      specimen: string;
      method: string;
    }
  | { status: "UNKNOWN"; reason: string };

/** Match by validated alias + exact unit + exact specimen + exact method in the active catalog. */
export function recognizeBiomarker(
  input: RecognitionInput,
  catalog: EvaluatedCatalog,
): Recognition {
  const label = normalizeCatalogText(input.label);
  const unit = input.unit.trim();
  const named = catalog.active.filter((e) =>
    [e.canonicalName, ...e.aliases].some((a) => normalizeCatalogText(a) === label),
  );
  if (!named.length)
    return { status: "UNKNOWN", reason: "No active catalog entry for this label." };
  const unitOk = named.filter((e) => e.unit === unit);
  if (!unitOk.length)
    return {
      status: "UNKNOWN",
      reason: "Unit is not the validated unit; units are never converted.",
    };
  if (!input.specimen?.trim())
    return {
      status: "UNKNOWN",
      reason: "Specimen is required for this biomarker and was not reported.",
    };
  if (!input.method?.trim())
    return {
      status: "UNKNOWN",
      reason: "Measurement method is required for this biomarker and was not reported.",
    };
  const spec = normalizeCatalogText(input.specimen);
  const meth = normalizeCatalogText(input.method);
  const matches = unitOk.filter(
    (e) =>
      normalizeCatalogText(e.specimen) === spec &&
      normalizeCatalogText(e.method) === meth &&
      (e.provenance === "real" || input.provenance === "synthetic"),
  );
  if (!matches.length)
    return {
      status: "UNKNOWN",
      reason: "Specimen, method or provenance differs from the validated definition.",
    };
  if (matches.length > 1)
    return { status: "UNKNOWN", reason: "Ambiguous: more than one active definition matches." };
  const e = matches[0]!;
  return {
    status: "RECOGNIZED",
    canonicalId: e.canonicalId,
    domain: e.domain,
    catalogVersion: catalog.catalogVersion,
    entryActivatedAt: e.activation.catalogVersion,
    originalLabel: input.label.trim(),
    originalUnit: unit,
    specimen: e.specimen,
    method: e.method,
  };
}

/** Exact canonical-ID re-validation for already-stored records (sync, stored review). */
export function canonicalCatalogEntry(
  id: string,
  unit: string,
  catalog: EvaluatedCatalog,
  includeRevoked: boolean,
): CatalogEntry | null {
  const pool = includeRevoked ? catalog.historical : catalog.active;
  return pool.find((e) => e.canonicalId === id.trim() && e.unit === unit.trim()) ?? null;
}

// ------------------------------------------------------- lifecycle state

export function lifecycleState(input: {
  termId: string;
  triage: TriageSummary | null;
  receipt: SourceValidationReceipt | null;
  events: readonly LedgerEvent[];
  recognizedInLaterExamination?: boolean;
}): LifecycleState {
  const v = viewLedger(input.events);
  const approval = [...v.approvals.values()]
    .filter((a) => a.proposal.source.termId === input.termId)
    .at(-1);
  if (approval) {
    const act = v.activations.get(approval.eventId);
    if (act) {
      if (v.revocations.has(act.eventId)) return "CATALOG_REVOKED";
      return input.recognizedInLaterExamination ? "RECOGNIZED" : "CATALOG_ACTIVE";
    }
    return "CATALOG_PROPOSED";
  }
  if (input.receipt?.termId === input.termId && input.triage?.latestAction === "ACCEPT_FOR_REVIEW")
    return "SCIENTIFICALLY_VALIDATED";
  if (input.triage?.latestAction === "ACCEPT_FOR_REVIEW") return "ACCEPTED_FOR_REVIEW";
  return "UNKNOWN";
}
export const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  UNKNOWN: "Unknown",
  ACCEPTED_FOR_REVIEW: "Accepted for review (triage)",
  SCIENTIFICALLY_VALIDATED: "Source validated",
  SCIENTIFICALLY_APPROVED: "Scientifically approved",
  CATALOG_PROPOSED: "Approved · catalog proposal ready",
  CATALOG_ACTIVE: "Catalog active",
  CATALOG_REVOKED: "Catalog entry revoked",
  RECOGNIZED: "Recognized in later examination",
};

// ------------------------------------------------- server snapshot mapping

/** Shape returned by the p37_catalog_snapshot_v1 RPC (identities never included). */
export interface LedgerSnapshotRpc {
  catalog_version: number;
  entries: (CatalogEntryDefinition & {
    status: "ACTIVE" | "REVOKED";
    approval: { approvalEventId: string; approvedAt: string; proposalSha256: string };
    activation: { activationEventId: string; activatedAt: string; catalogVersion: number };
    revocation: {
      revocationEventId: string;
      revokedAt: string;
      reason: string;
      catalogVersion: number;
    } | null;
  })[];
}

/** Map the server ledger read into the snapshot that the server signs for devices. */
export function snapshotFromLedgerRpc(
  rpc: LedgerSnapshotRpc,
  environment: CatalogEnvironment,
  issuedAt: string,
): ActiveCatalogSnapshot {
  const entries: CatalogEntry[] = (rpc.entries ?? []).map((e) => ({
    canonicalId: e.canonicalId,
    canonicalName: e.canonicalName,
    aliases: [...e.aliases],
    unit: e.unit,
    specimen: e.specimen,
    method: e.method,
    protocol: e.protocol,
    protocolVersion: e.protocolVersion,
    domain: e.domain,
    provenance: e.provenance,
    evidenceRefs: [...e.evidenceRefs],
    status: e.status,
    approval: {
      approvalEventId: e.approval.approvalEventId,
      approverId: "authorized-scientific-approver",
      approvedAt: e.approval.approvedAt,
      proposalSha256: e.approval.proposalSha256,
    },
    activation: {
      activationEventId: e.activation.activationEventId,
      activatorId: "authorized-catalog-activator",
      activatedAt: e.activation.activatedAt,
      catalogVersion: Number(e.activation.catalogVersion),
    },
    revocation: e.revocation
      ? { ...e.revocation, catalogVersion: Number(e.revocation.catalogVersion) }
      : null,
  }));
  return {
    schema: ACTIVE_CATALOG_SNAPSHOT_SCHEMA,
    environment,
    baseCatalogVersion: BASE_CATALOG_VERSION,
    catalogVersion: Number(rpc.catalog_version) || 0,
    issuedAt,
    entries,
  };
}
