/**
 * P36 Dynamic Reconciliation — Phase 1 (pure, read-only, local-only).
 *
 * Joins the fixed 12-term legacy handoff with terms from locally registered
 * Unknown Biomarker pending requests for ONE exact mission/crew/provenance
 * scope, without double-counting, and drafts bulk *proposals* that always
 * require an independent per-term scientific decision.
 *
 * Phase 1 boundaries (enforced here and by tests):
 *  - Every dynamic request is LOCAL_ONLY. Registration on one browser is never
 *    treated as server sync; no transport exists until a reviewed migration is
 *    approved by the owner.
 *  - A label match is never medical validation: candidate IDs are suggestions,
 *    never selected, and never change catalog classification.
 *  - Units are compared by exact text; no conversion.
 *  - Source-unvalidated, ambiguous and context-unrecorded terms stay blocked.
 *  - The submission draft carries no clinical values, observation times,
 *    excerpts or documents — only labels, exact units, term IDs, hashes and
 *    evidence pointers.
 */
import { buildReconciliationView, type HandoffRow } from "./catalog-reconciliation-handoff";
import {
  REQUIRED_SCIENTIFIC_GATE,
  normalizeLabel,
  termIdFor,
  type ReviewScope,
  type UnknownBiomarkerTerm,
} from "./unknown-biomarker-review";
import type { PendingReviewRequest } from "./review-ledger";

export const DYNAMIC_HANDOFF_SCHEMA = "mitochondria.p36-dynamic-handoff.v1";
export const DYNAMIC_SUBMISSION_DRAFT_SCHEMA =
  "mitochondria.p36-dynamic-handoff-submission-draft.v1";

/** Phase 1 has no server transport; see docs/P36_DYNAMIC_RECONCILIATION_PHASE1_AUDIT.md. */
export type RequestSyncState = "LOCAL_ONLY";
export const SYNC_STATE_LABELS: Record<RequestSyncState, string> = {
  LOCAL_ONLY:
    "Stored on this device only — not sent to the server and not visible to other reviewers",
};

export type DynamicBlocker =
  | "PENDING_SCIENTIFIC_REVIEW"
  | "SOURCE_UNVALIDATED"
  | "AMBIGUOUS_CANDIDATES"
  | "NO_CANDIDATE"
  | "METHOD_PROTOCOL_UNRECORDED"
  | "SPECIMEN_UNRECORDED"
  | "LEGACY_CONTEXT_REVIEW";

export const DYNAMIC_BLOCKER_LABELS: Record<DynamicBlocker, string> = {
  PENDING_SCIENTIFIC_REVIEW: "Independent Researcher scientific review pending",
  SOURCE_UNVALIDATED: "Source document is unvalidated; excluded from proposals",
  AMBIGUOUS_CANDIDATES: "More than one candidate catalog ID; identity unresolved",
  NO_CANDIDATE: "No candidate catalog ID",
  METHOD_PROTOCOL_UNRECORDED: "Assay method / protocol not recorded",
  SPECIMEN_UNRECORDED: "Specimen not recorded",
  LEGACY_CONTEXT_REVIEW:
    "Same label and unit as a legacy handoff term; counted once under the legacy dossier",
};

export interface DynamicTerm {
  /** Stable legacy-compatible ID: normalized label + exact unit. */
  termId: string;
  /** Canonical identity: normalized label + exact unit + method/specimen/source context. */
  canonicalKey: string;
  normalizedLabel: string;
  originalLabels: string[];
  exactUnit: string;
  classification: UnknownBiomarkerTerm["classification"];
  candidateMetricIds: string[];
  observationCount: number;
  sourceDocumentSha256: string[];
  evidencePointers: string[];
  requestIds: string[];
  syncState: RequestSyncState;
  inLegacyHandoff: boolean;
  blockers: DynamicBlocker[];
  scientificStatus: typeof REQUIRED_SCIENTIFIC_GATE;
}

export interface DynamicHandoffView {
  schema: typeof DYNAMIC_HANDOFF_SCHEMA;
  scope: ReviewScope;
  legacyCount: number;
  dynamicOnlyCount: number;
  overlappingLegacyCount: number;
  totalDistinct: number;
  terms: DynamicTerm[];
  rejectedRequests: { requestId: string; reason: string }[];
}

const sameScope = (a: ReviewScope, b: ReviewScope) =>
  a.missionId === b.missionId && a.crewMemberId === b.crewMemberId && a.provenance === b.provenance;

/** Method/specimen are not captured by intake today, so context is explicitly "unrecorded". */
export function canonicalKeyFor(
  label: string,
  unit: string,
  context: { method?: string | null; specimen?: string | null } = {},
) {
  const m = context.method?.trim() || "unrecorded";
  const s = context.specimen?.trim() || "unrecorded";
  return `${normalizeLabel(label)}|${unit.trim()}|method:${m}|specimen:${s}`;
}

function blockersFor(term: UnknownBiomarkerTerm, inLegacy: boolean): DynamicBlocker[] {
  const b: DynamicBlocker[] = [
    "PENDING_SCIENTIFIC_REVIEW",
    "METHOD_PROTOCOL_UNRECORDED",
    "SPECIMEN_UNRECORDED",
  ];
  if (term.classification === "source_unvalidated") b.push("SOURCE_UNVALIDATED");
  if (term.classification === "ambiguous" || term.candidateMetricIds.length > 1)
    b.push("AMBIGUOUS_CANDIDATES");
  if (term.candidateMetricIds.length === 0) b.push("NO_CANDIDATE");
  if (inLegacy) b.push("LEGACY_CONTEXT_REVIEW");
  return b;
}

function validRequest(r: PendingReviewRequest, scope: ReviewScope): string | null {
  if (!r || typeof r !== "object") return "Not a pending request";
  if (r.status !== REQUIRED_SCIENTIFIC_GATE || r.catalogChangeApplied !== false)
    return "Request claims approval or an applied catalog change";
  if (!r.scope || !sameScope(r.scope, scope))
    return "Request belongs to a different mission, crew member or provenance";
  if (!Array.isArray(r.terms)) return "Request has no terms";
  for (const t of r.terms) {
    if (
      typeof t?.termId !== "string" ||
      termIdFor(t.originalLabels?.[0] ?? t.normalizedLabel ?? "", t.originalUnit ?? "") !== t.termId
    )
      return "A term ID does not match its label and exact unit (tampered or corrupted)";
  }
  return null;
}

export function buildDynamicHandoff(
  scope: ReviewScope,
  requests: readonly PendingReviewRequest[],
  legacyRows: readonly HandoffRow[] = buildReconciliationView().rows,
): DynamicHandoffView {
  const legacyIds = new Set(legacyRows.map((r) => r.termId));
  const byKey = new Map<string, DynamicTerm>();
  const rejected: DynamicHandoffView["rejectedRequests"] = [];
  for (const r of requests) {
    const reason = validRequest(r, scope);
    if (reason) {
      rejected.push({ requestId: String(r?.requestId ?? "unknown"), reason });
      continue;
    }
    for (const t of r.terms) {
      const key = canonicalKeyFor(t.normalizedLabel, t.originalUnit);
      const inLegacy = legacyIds.has(t.termId);
      const existing = byKey.get(key);
      const docs = t.observations.flatMap((o) =>
        o.evidence.map((e) => e.documentSha256).filter((x): x is string => !!x),
      );
      const pointers = t.observations.map((o) => o.observationKey);
      if (existing) {
        for (const l of t.originalLabels)
          if (!existing.originalLabels.includes(l)) existing.originalLabels.push(l);
        for (const d of docs)
          if (!existing.sourceDocumentSha256.includes(d)) existing.sourceDocumentSha256.push(d);
        for (const p of pointers)
          if (!existing.evidencePointers.includes(p)) existing.evidencePointers.push(p);
        if (!existing.requestIds.includes(r.requestId)) existing.requestIds.push(r.requestId);
        existing.observationCount = existing.evidencePointers.length;
        // Stricter classification wins; never relaxed by a later request.
        if (t.classification === "source_unvalidated" || t.classification === "ambiguous")
          existing.classification = t.classification;
        existing.blockers = blockersFor(
          {
            ...t,
            classification: existing.classification,
            candidateMetricIds: existing.candidateMetricIds,
          },
          inLegacy,
        );
        continue;
      }
      byKey.set(key, {
        termId: t.termId,
        canonicalKey: key,
        normalizedLabel: t.normalizedLabel,
        originalLabels: [...t.originalLabels],
        exactUnit: t.originalUnit,
        classification: t.classification,
        candidateMetricIds: [...t.candidateMetricIds].sort(),
        observationCount: pointers.length,
        sourceDocumentSha256: [...new Set(docs)],
        evidencePointers: [...new Set(pointers)],
        requestIds: [r.requestId],
        syncState: "LOCAL_ONLY",
        inLegacyHandoff: inLegacy,
        blockers: blockersFor(t, inLegacy),
        scientificStatus: REQUIRED_SCIENTIFIC_GATE,
      });
    }
  }
  const terms = [...byKey.values()].sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey));
  const overlapping = terms.filter((t) => t.inLegacyHandoff).length;
  const dynamicOnly = terms.length - overlapping;
  return {
    schema: DYNAMIC_HANDOFF_SCHEMA,
    scope,
    legacyCount: legacyRows.length,
    dynamicOnlyCount: dynamicOnly,
    overlappingLegacyCount: overlapping,
    totalDistinct: legacyRows.length + dynamicOnly,
    terms,
    rejectedRequests: rejected,
  };
}

// ---------- Bulk proposal workbench (drafts only) ----------

export interface ProposalGroup {
  groupKey: string;
  candidateMetricId: string | null;
  exactUnit: string;
  termIds: string[];
  selectable: boolean;
  reason: string | null;
}

/** Groups by single candidate ID + exact unit. Blocked terms are listed but never selectable. */
export function groupForProposal(terms: readonly DynamicTerm[]): ProposalGroup[] {
  const groups = new Map<string, ProposalGroup>();
  for (const t of terms) {
    const candidate = t.candidateMetricIds.length === 1 ? t.candidateMetricIds[0]! : null;
    const hard = t.blockers.filter(
      (b) =>
        b === "SOURCE_UNVALIDATED" ||
        b === "AMBIGUOUS_CANDIDATES" ||
        b === "NO_CANDIDATE" ||
        b === "LEGACY_CONTEXT_REVIEW",
    );
    const groupKey = hard.length ? `blocked|${t.termId}` : `${candidate}|${t.exactUnit}`;
    const g = groups.get(groupKey) ?? {
      groupKey,
      candidateMetricId: candidate,
      exactUnit: t.exactUnit,
      termIds: [],
      selectable: hard.length === 0,
      reason: hard.length ? hard.map((b) => DYNAMIC_BLOCKER_LABELS[b]).join("; ") : null,
    };
    g.termIds.push(t.termId);
    groups.set(groupKey, g);
  }
  return [...groups.values()].sort((a, b) => a.groupKey.localeCompare(b.groupKey));
}

export type BulkProposalResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      proposal: {
        candidateMetricId: string;
        exactUnit: string;
        termIds: string[];
        /** Bulk is a convenience only: each term still needs its own independent decision. */
        perTermDecisionRequired: true;
        approved: false;
        activationAllowed: false;
        status: typeof REQUIRED_SCIENTIFIC_GATE;
        outstandingEvidence: DynamicBlocker[];
      };
    };

export function draftBulkProposal(
  terms: readonly DynamicTerm[],
  selectedTermIds: readonly string[],
): BulkProposalResult {
  const unique = [...new Set(selectedTermIds)];
  if (unique.length === 0) return { ok: false, reason: "Select at least one term." };
  const picked = unique.map((id) => terms.find((t) => t.termId === id));
  if (picked.some((t) => !t))
    return { ok: false, reason: "A selected term is not in this scope's handoff." };
  const sel = picked as DynamicTerm[];
  const groups = groupForProposal(sel);
  if (groups.some((g) => !g.selectable))
    return {
      ok: false,
      reason: `Blocked term selected: ${groups.find((g) => !g.selectable)!.reason}`,
    };
  if (groups.length !== 1)
    return {
      ok: false,
      reason: "Selected terms differ in candidate ID or exact unit; no conversion is performed.",
    };
  const g = groups[0]!;
  return {
    ok: true,
    proposal: {
      candidateMetricId: g.candidateMetricId!,
      exactUnit: g.exactUnit,
      termIds: [...g.termIds].sort(),
      perTermDecisionRequired: true,
      approved: false,
      activationAllowed: false,
      status: REQUIRED_SCIENTIFIC_GATE,
      outstandingEvidence: [
        "PENDING_SCIENTIFIC_REVIEW",
        "METHOD_PROTOCOL_UNRECORDED",
        "SPECIMEN_UNRECORDED",
      ],
    },
  };
}

// ---------- Value-free submission draft (not transmitted in Phase 1) ----------

export function buildSubmissionDraft(view: DynamicHandoffView) {
  return {
    schema: DYNAMIC_SUBMISSION_DRAFT_SCHEMA,
    scope: view.scope,
    transmitted: false as const,
    ownerApprovalRequired: true as const,
    terms: view.terms
      .filter((t) => !t.inLegacyHandoff)
      .map((t) => ({
        termId: t.termId,
        canonicalKey: t.canonicalKey,
        originalLabels: [...t.originalLabels],
        exactUnit: t.exactUnit,
        sourceValidation:
          t.classification === "source_unvalidated"
            ? ("unvalidated" as const)
            : ("not_flagged" as const),
        sourceDocumentSha256: [...t.sourceDocumentSha256],
        evidencePointers: [...t.evidencePointers],
        candidateMetricIds: [...t.candidateMetricIds],
        status: REQUIRED_SCIENTIFIC_GATE,
      })),
  };
}
