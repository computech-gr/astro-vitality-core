/** Value-free handoff transport. Local requests and observations are never rewritten. */
import { z } from "zod";
import { canonicalJson } from "./observation-envelope";
import { sha256Hex, authorizationContext, type AuthorizationContext } from "./p36-scientific-authorization";
import { buildDynamicHandoff } from "./p36-dynamic-handoff";
import { catalogEntryFor, compareUnit, type ScientificReviewDossier } from "./p36-scientific-review";
import { REQUIRED_SCIENTIFIC_GATE, termIdFor, normalizeLabel, type ReviewScope } from "./unknown-biomarker-review";
import type { PendingReviewRequest } from "./review-ledger";

const hex = z.string().regex(/^[0-9a-f]{64}$/);
export const handoffScopeSchema = z.object({ missionId: z.string().min(1).max(128), crewMemberId: z.string().min(1).max(128), provenance: z.enum(["synthetic", "real"]) }).strict();
export const handoffTermSchema = z.object({
  termId: z.string().regex(/^ubt-[0-9a-f]{8}$/),
  originalLabels: z.array(z.string().min(1).max(300)).min(1).max(20),
  exactUnit: z.string().max(64),
  classification: z.enum(["unclassified", "ambiguous", "unit_review_required", "source_unvalidated"]),
  candidateMetricIds: z.array(z.string().min(1).max(64)).max(30),
  sourceDocumentSha256: z.array(hex).max(100),
  evidencePointers: z.array(hex).max(1000),
  method: z.null(), specimen: z.null(),
}).strict();
export const cloudHandoffSchema = z.object({
  schema: z.literal("mitochondria.p36-cloud-handoff.v1"), scope: handoffScopeSchema,
  requestId: z.string().regex(/^ubr-[0-9a-f]{8}$/),
  terms: z.array(handoffTermSchema).min(1).max(1000),
  scientificStatus: z.literal(REQUIRED_SCIENTIFIC_GATE), catalogChangeApplied: z.literal(false),
}).strict();
export type CloudHandoff = z.infer<typeof cloudHandoffSchema>;
export type CloudTerm = z.infer<typeof handoffTermSchema>;
export type HandoffSyncState = "LOCAL_ONLY" | "SUBMITTING" | "SUBMITTED" | "FAILED" | "CONFLICT";
export interface HandoffReceipt { requestId: string; payloadSha256: string; scope: ReviewScope; actorUserId: string; status: "SUBMITTED" | "CONFLICT"; receivedAt: string; submissionId: string }
export interface CloudSubmission { submissionId: string; payloadSha256: string; payloadCanonical: string; receivedAt: string; actorUserId: string }

export function validateCloudHandoff(input: unknown): CloudHandoff {
  const parsed = cloudHandoffSchema.parse(input);
  const ids = new Set<string>();
  for (const t of parsed.terms) {
    if (ids.has(t.termId) || t.originalLabels.some((l) => termIdFor(l, t.exactUnit) !== t.termId)) throw new Error("Duplicate or conflicting term identity.");
    ids.add(t.termId);
    if (new Set(t.candidateMetricIds).size !== t.candidateMetricIds.length) throw new Error("Duplicate candidates.");
  }
  if (new TextEncoder().encode(canonicalJson(parsed)).length > 1024 * 1024) throw new Error("Handoff exceeds 1 MiB.");
  return parsed;
}

export async function prepareCloudHandoff(request: PendingReviewRequest): Promise<CloudHandoff> {
  const view = buildDynamicHandoff(request.scope, [request]);
  if (view.rejectedRequests.length) throw new Error(view.rejectedRequests[0]?.reason ?? "Invalid request");
  const terms = await Promise.all(view.terms.map(async (t): Promise<CloudTerm> => ({
    termId: t.termId, originalLabels: t.originalLabels, exactUnit: t.exactUnit,
    classification: t.classification, candidateMetricIds: t.candidateMetricIds,
    sourceDocumentSha256: t.sourceDocumentSha256,
    evidencePointers: await Promise.all(t.evidencePointers.map((p) => sha256Hex(canonicalJson([request.scope, request.requestId, p])))),
    method: null, specimen: null,
  })));
  return validateCloudHandoff({ schema: "mitochondria.p36-cloud-handoff.v1", scope: request.scope, requestId: request.requestId, terms, scientificStatus: REQUIRED_SCIENTIFIC_GATE, catalogChangeApplied: false });
}

/** Dynamic dossier is derived only from authorized cloud metadata, never from submitted clinical text. */
export function cloudTermDossier(t: CloudTerm): ScientificReviewDossier {
  const candidate = t.candidateMetricIds.length === 1 ? catalogEntryFor(t.candidateMetricIds[0] ?? "") : null;
  return {
    termId: t.termId, sourceLabel: t.originalLabels[0] ?? "", sourceUnit: t.exactUnit, observations: 0,
    candidateCatalogIds: t.classification === "ambiguous" ? [] : t.candidateMetricIds,
    specimen: [], assayProtocolNotes: ["Method, specimen and protocol not recorded in intake; documentary evidence is required."],
    unitComparisons: t.candidateMetricIds.map((id) => compareUnit(t.exactUnit, id, [catalogEntryFor(id)?.unit])),
    noValidatedCatalogUnit: !candidate?.unit,
    evidence: [...t.sourceDocumentSha256.map((h) => ({ ref: `doc:${h}`, title: "Source document fingerprint (not validation)", details: [h] })), ...t.evidencePointers.map((h) => ({ ref: `doc:${h}`, title: "Opaque local evidence pointer", details: ["Medical contents remain encrypted on the originating device."] }))],
    unresolvedQuestions: ["Independent Researcher review pending", "Verify exact identity, specimen, method, protocol/version and source validation; no automatic conversions.", ...(t.classification === "source_unvalidated" ? ["Source explicitly unvalidated; approval blocked."] : [])],
    status: REQUIRED_SCIENTIFIC_GATE,
    handoff: { termId: t.termId, sourceLabel: t.originalLabels[0] ?? "", sourceUnit: t.exactUnit, observations: 0,
      candidateCatalogId: candidate?.id ?? null, candidateCatalogName: candidate?.name ?? null,
      candidateCatalogStatus: candidate?.catalog === "P36" ? "P36_PROVISIONAL" : "UNRESOLVED",
      sourceCatalogUnit: candidate?.unit ?? null, reviewStatus: REQUIRED_SCIENTIFIC_GATE, scientificApproval: false,
      proposedAction: "Independent per-term review", notes: "Cloud metadata only; no measurements or observation dates.", activationAllowed: false,
      blockReasons: ["pending_scientific_review", "assay_protocol_identity_required", ...(t.classification === "source_unvalidated" ? ["protocol_unvalidated" as const] : [])],
      catalogCrossCheck: { found: Boolean(candidate), catalogStatus: null, catalogUnit: candidate?.unit ?? null } },
  };
}

export async function cloudAuthorizationContext(terms: readonly CloudTerm[]): Promise<AuthorizationContext> {
  const base = await authorizationContext();
  const dossiers = [...base.dossiers];
  const termFingerprints = new Map(base.termFingerprints);
  for (const t of terms) {
    const prior = dossiers.find((d) => d.termId === t.termId);
    if (prior) {
      if (normalizeLabel(prior.sourceLabel) !== normalizeLabel(t.originalLabels[0] ?? "") || prior.sourceUnit !== t.exactUnit) throw new Error("Legacy identity collision.");
      continue;
    }
    const d = cloudTermDossier(t);
    dossiers.push(d);
    termFingerprints.set(t.termId, await sha256Hex(canonicalJson(d)));
  }
  return { ...base, dossiers, termFingerprints };
}

/** Conflicting immutable submissions are held, never resolved by last-write-wins. */
export function mergeCloudTerms(submissions: readonly CloudHandoff[]): { terms: CloudTerm[]; conflicts: string[] } {
  const terms = new Map<string, CloudTerm>();
  const conflicts = new Set<string>();
  for (const s of submissions) for (const t of s.terms) {
    const prior = terms.get(t.termId);
    if (prior && canonicalJson(prior) !== canonicalJson(t)) conflicts.add(t.termId);
    else terms.set(t.termId, t);
  }
  return { terms: [...terms.values()].filter((t) => !conflicts.has(t.termId)), conflicts: [...conflicts] };
}