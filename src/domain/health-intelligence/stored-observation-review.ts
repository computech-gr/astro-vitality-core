/**
 * Stored-observation review (v9) — pure and deterministic.
 *
 * Two separate concepts are kept apart on purpose:
 *  - Observation lifecycle: Active / Erroneous / Superseded (append-only
 *    corrections in the encrypted local store).
 *  - Ground Medical attestation: Not attested / Attested / Revoked / Stale
 *    (optional second stage in the append-only review ledger, reusing the
 *    evidence-attestation schema and fingerprints of the Unified Health Report).
 *
 * Initial intake acceptance is never re-labelled as a Ground Medical
 * attestation, and no stored observation is mutated or deleted here.
 */
import { classifyWithGovernedExtensions } from "./unknown-biomarker-review";
import {
  attestationStateFor,
  scopedAttestationEvents,
  type AttestationEvent,
  type AttestationStatus,
} from "./evidence-attestation";
import { buildUnifiedHealthReport, type ReportRow, type ReportScope, type UnifiedHealthReport } from "./unified-health-report";
import { DATED_OBSERVATION_SCHEMA, isUnifiedObservationSchema, validateUnifiedObservation, type UnifiedObservation } from "./observation-envelope";

import { isCalendarDate, validObservationDate, observationDateKey, type ObservationDatePrecision } from "./observation-date";

export type ObservationLifecycle = "active" | "erroneous" | "superseded";
export const LIFECYCLE_LABELS: Record<ObservationLifecycle, string> = {
  active: "Active",
  erroneous: "Erroneous",
  superseded: "Superseded",
};

export type GroundMedicalStatus = "not_attested" | "attested" | "revoked" | "stale" | "not_applicable";
export const GROUND_MEDICAL_LABELS: Record<GroundMedicalStatus, string> = {
  not_attested: "Not attested",
  attested: "Attested",
  revoked: "Revoked",
  stale: "Stale",
  not_applicable: "—",
};

const fromAttestation: Record<AttestationStatus, GroundMedicalStatus> = {
  accepted_not_attested: "not_attested",
  attested: "attested",
  revoked: "revoked",
  stale_record_changed: "stale",
};

/** Non-erroneous corrections supersede their target; erroneous corrections never do. */
export function supersededByMap(history: readonly UnifiedObservation[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const o of history) if (o.supersedesId && o.status !== "erroneous") map.set(o.supersedesId, o.id);
  return map;
}

export function observationLifecycle(o: UnifiedObservation, history: readonly UnifiedObservation[]): ObservationLifecycle {
  if (o.status === "erroneous") return "erroneous";
  return supersededByMap(history).has(o.id) ? "superseded" : "active";
}

export interface StoredObservationView {
  observation: UnifiedObservation;
  lifecycle: ObservationLifecycle;
  supersededBy: string | null;
  groundMedical: GroundMedicalStatus;
  /** The exact report row (same fingerprint as the Unified Health Report), when included. */
  row: ReportRow | null;
  /** Selectable for a NEW attestation in the current scope. */
  selectable: boolean;
  ineligibleReason: string | null;
  /** Ground Medical history for this record (append-only). */
  attestationHistory: AttestationEvent[];
  /** A correction exists but the original's erroneous-status event was not yet appended. */
  correctionIncomplete: boolean;
}

export interface StoredObservationReview {
  report: UnifiedHealthReport;
  views: StoredObservationView[];
  events: AttestationEvent[];
}

export function buildStoredObservationReview(
  history: readonly UnifiedObservation[],
  scope: ReportScope,
  events: readonly unknown[],
  generatedAt = new Date().toISOString(),
): StoredObservationReview {
  const inScope = history.filter((o) => o.missionId === scope.missionId && o.crewMemberId === scope.crewMemberId);
  const report = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: inScope, deviceRecords: [] }, scope, {}, generatedAt);
  const scoped = scopedAttestationEvents(events, scope);
  const rows = new Map(report.rows.map((r) => [r.recordId, r]));
  const supersededBy = supersededByMap(inScope);
  const byId = new Map(inScope.map((o) => [o.id, o]));
  const views = inScope.map((o): StoredObservationView => {
    const lifecycle = observationLifecycle(o, inScope);
    const row = rows.get(o.id) ?? null;
    const recordEvents = scoped.filter((e) => e.recordId === o.id);
    let groundMedical: GroundMedicalStatus = "not_applicable";
    let attestationHistory: AttestationEvent[] = [];
    if (o.provenance === scope.provenance) {
      if (row) {
        const state = attestationStateFor(row, scoped);
        groundMedical = fromAttestation[state.status];
        attestationHistory = state.history;
      } else if (recordEvents.length) {
        const latest = [...recordEvents].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt) || a.eventId.localeCompare(b.eventId)).at(-1)!;
        groundMedical = latest.action === "revoke" ? "revoked" : "stale";
        attestationHistory = recordEvents;
      } else groundMedical = "not_attested";
    }
    let ineligibleReason: string | null = null;
    if (o.provenance !== scope.provenance) ineligibleReason = `Different provenance (${o.provenance}).`;
    else if (lifecycle === "erroneous") ineligibleReason = "Marked erroneous.";
    else if (lifecycle === "superseded") ineligibleReason = "Superseded by a correction.";
    else if (o.reviewState !== "accepted") ineligibleReason = "Not accepted at intake.";
    else if (!row) ineligibleReason = "Not included in the report scope (for example a duplicate projection).";
    else if (groundMedical === "attested") ineligibleReason = "Already attested for this record version.";
    const target = o.supersedesId ? byId.get(o.supersedesId) : undefined;
    const correctionIncomplete = Boolean(o.correction && o.status !== "erroneous" && target && target.status !== "erroneous");
    return {
      observation: o,
      lifecycle,
      supersededBy: supersededBy.get(o.id) ?? null,
      groundMedical,
      row,
      selectable: ineligibleReason === null,
      ineligibleReason,
      attestationHistory,
      correctionIncomplete,
    };
  });
  return { report, views, events: scoped };
}

export function eligibleRecordIds(views: readonly StoredObservationView[]): string[] {
  return views.filter((v) => v.selectable).map((v) => v.observation.id);
}

/** Header checkbox semantics: selects only currently eligible rows in this exact scope. */
export function toggleSelectAll(views: readonly StoredObservationView[], selected: ReadonlySet<string>): Set<string> {
  const eligible = eligibleRecordIds(views);
  const allSelected = eligible.length > 0 && eligible.every((id) => selected.has(id));
  return allSelected ? new Set() : new Set(eligible);
}

/** Drops selections that are no longer eligible (scope change, attested, corrected). */
export function pruneSelection(views: readonly StoredObservationView[], selected: ReadonlySet<string>): Set<string> {
  const eligible = new Set(eligibleRecordIds(views));
  return new Set([...selected].filter((id) => eligible.has(id)));
}

export function selectionCounts(views: readonly StoredObservationView[], selected: ReadonlySet<string>) {
  const eligible = eligibleRecordIds(views);
  return { eligible: eligible.length, selected: eligible.filter((id) => selected.has(id)).length };
}

// ---------------- Append-only correction ----------------

export const CORRECTION_REASON_MIN = 10;
const SAFE_DECIMAL = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

export interface CorrectionDraft {
  metricId: string;
  value: string;
  unit: string;
  /** ISO 8601 instant (UTC). */
  observedAt: string;
  datePrecision?: ObservationDatePrecision;
  reason: string;
  confirmed: boolean;
}

export interface CorrectionContext {
  actorUserId: string | null | undefined;
  /** Roles held for exactly this mission + crew. */
  rolesForScope: readonly string[];
  scope: ReportScope;
  decidedAt: string;
}

export type CorrectionPlan =
  | { ok: true; intentId: string; corrected: UnifiedObservation; erroneousMark: UnifiedObservation }
  | { ok: false; reason: string };

function fnv(text: string, seed = 0x811c9dc5): string {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Deterministic, UUID-shaped identifier (not a random UUID): retries map to the same record. */
export function deterministicUuid(text: string): string {
  const hex = [0x811c9dc5, 0x01234567, 0x89abcdef, 0x5bd1e995].map((s) => fnv(text, s)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function correctionIntentId(original: UnifiedObservation, draft: Pick<CorrectionDraft, "metricId" | "value" | "unit" | "observedAt" | "reason">): string {
  const key = JSON.stringify([original.id, draft.metricId.trim(), draft.value.trim(), draft.unit.trim(), draft.observedAt, draft.reason.trim()]);
  return `corr-${fnv(key)}${fnv(key, 0x01234567)}`;
}

/** Erroneous-status event for the original, derived only from the correction so retries are identical. */
export function erroneousMarkFor(original: UnifiedObservation, corrected: UnifiedObservation): UnifiedObservation {
  const reason = corrected.correction?.reason ?? "Corrected";
  return {
    ...original,
    status: "erroneous",
    statusReason: `Superseded by correction ${corrected.id}: ${reason}`.slice(0, 500),
  };
}

/**
 * Validate first, then plan the two append-only events. Nothing is written here.
 * Only Ground Medical for exactly this mission + crew + provenance may correct.
 */
export function planObservationCorrection(
  original: UnifiedObservation,
  history: readonly UnifiedObservation[],
  draft: CorrectionDraft,
  ctx: CorrectionContext,
): CorrectionPlan {
  if (!ctx.actorUserId) return { ok: false, reason: "Reviewer identity is unavailable. Sign in again." };
  if (!ctx.rolesForScope.includes("ground_medical"))
    return { ok: false, reason: "Only Ground Medical for this exact mission and crew member can correct stored observations." };
  if (original.missionId !== ctx.scope.missionId || original.crewMemberId !== ctx.scope.crewMemberId)
    return { ok: false, reason: "This record belongs to a different mission or crew member. Correction refused." };
  if (original.provenance !== ctx.scope.provenance)
    return { ok: false, reason: "This record has a different provenance than the selected scope. Correction refused." };
  if (!isUnifiedObservationSchema(original.schema) || validateUnifiedObservation(original))
    return { ok: false, reason: "The original record is not a valid stored observation." };
  const lifecycle = observationLifecycle(original, history);
  if (lifecycle !== "active")
    return { ok: false, reason: lifecycle === "superseded" ? "This record was already corrected; edit the latest version instead." : "Erroneous records cannot be corrected." };
  if (original.reviewState !== "accepted") return { ok: false, reason: "Only accepted observations can be corrected." };
  if (!Number.isFinite(Date.parse(ctx.decidedAt))) return { ok: false, reason: "Decision time is invalid." };
  const reason = draft.reason.trim();
  if (reason.length < CORRECTION_REASON_MIN)
    return { ok: false, reason: `A meaningful reason of at least ${CORRECTION_REASON_MIN} characters is required.` };
  if (!draft.confirmed) return { ok: false, reason: "Explicit confirmation is required." };
  const value = draft.value.trim();
  if (!SAFE_DECIMAL.test(value)) return { ok: false, reason: "Value must be a plain decimal number." };
  const unit = draft.unit.trim();
  if (!unit) return { ok: false, reason: "The exact reported unit is required." };
  const metricId = draft.metricId.trim();
  const datePrecision = draft.datePrecision ?? (isCalendarDate(draft.observedAt) ? "date" : "instant");
  if (!validObservationDate({ observedAt: draft.observedAt, datePrecision })) return { ok: false, reason: "Observation requires a valid calendar date or explicit zoned timestamp." };
  if (datePrecision === "instant" && Date.parse(draft.observedAt) > Date.parse(ctx.decidedAt) + 5 * 60_000) return { ok: false, reason: "Observation time cannot be in the future." };
  if (datePrecision === "date" && draft.observedAt > ctx.decidedAt.slice(0, 10)) return { ok: false, reason: "Observation date cannot be in the future." };
  // Exact catalog metric + unit pairing; no unit conversion, no inference.
  const classification = classifyWithGovernedExtensions({ label: metricId, unit, identity: "canonical" }).classification;
  if (classification.status !== "matched" || classification.metricId !== metricId)
    return { ok: false, reason: `"${metricId}" with unit "${unit}" is not an exact catalog metric/unit pair. Units are never converted.` };
  if (!original.source?.label?.trim()) return { ok: false, reason: "The original source is missing; correction refused." };
  const observedAt = datePrecision === "date" ? draft.observedAt : new Date(draft.observedAt).toISOString();
  if (
    metricId === original.metricId &&
    value === original.value.trim() &&
    unit === original.originalUnit.trim() &&
    observationDateKey({ observedAt, datePrecision }) === observationDateKey(original)
  )
    return { ok: false, reason: "Nothing changed. Use Mark erroneous if the record is wrong without a corrected value." };
  const decidedAt = new Date(ctx.decidedAt).toISOString();
  const intentId = correctionIntentId(original, { metricId, value, unit, observedAt, reason });
  const { statusReason: _drop, ...base } = original;
  void _drop;
  const corrected: UnifiedObservation = {
    ...base,
    ...(datePrecision === "date" || original.schema === DATED_OBSERVATION_SCHEMA ? { schema: DATED_OBSERVATION_SCHEMA, datePrecision } : {}),
    id: deterministicUuid(intentId),
    metricId,
    domain: classification.domain,
    value,
    originalUnit: unit,
    observedAt,
    source: { ...original.source },
    provenance: original.provenance,
    quality: { reviewerConfirmed: true },
    reviewState: "accepted",
    status: "active",
    supersedesId: original.id,
    correction: { intentId, originalRecordId: original.id, actorUserId: ctx.actorUserId, actorRole: "ground_medical", reason: reason.slice(0, 500), decidedAt },
    recordedAt: decidedAt,
  };
  const issue = validateUnifiedObservation(corrected);
  if (issue) return { ok: false, reason: issue };
  return { ok: true, intentId, corrected, erroneousMark: erroneousMarkFor(original, corrected) };
}

export interface CorrectionStore {
  save(observation: UnifiedObservation): Promise<void>;
}

export type CorrectionOutcome =
  | { status: "completed"; correctedId: string }
  | { status: "failed"; message: string }
  | { status: "partial"; correctedId: string; message: string };

/**
 * Two append-only writes in a recoverable order:
 *  1. append the corrected (superseding) observation — if this fails nothing changed;
 *  2. append the original's erroneous-status event.
 * If step 2 fails the original is already excluded as superseded everywhere
 * (report, domain projections) and the UI offers a deterministic retry
 * (completeCorrection) — the old record is never left unexplained.
 */
export async function executeCorrection(plan: Extract<CorrectionPlan, { ok: true }>, store: CorrectionStore): Promise<CorrectionOutcome> {
  try {
    await store.save(plan.corrected);
  } catch (error) {
    return { status: "failed", message: `Correction was not saved: ${error instanceof Error ? error.message : "storage error"}. Nothing changed.` };
  }
  try {
    await store.save(plan.erroneousMark);
  } catch (error) {
    return {
      status: "partial",
      correctedId: plan.corrected.id,
      message: `Corrected record saved, but marking the original erroneous failed (${error instanceof Error ? error.message : "storage error"}). The original is already superseded; use "Complete correction" to retry.`,
    };
  }
  return { status: "completed", correctedId: plan.corrected.id };
}

/** Retry step 2 for an incomplete correction. Idempotent: the status event is derived deterministically. */
export async function completeCorrection(
  corrected: UnifiedObservation,
  history: readonly UnifiedObservation[],
  ctx: Pick<CorrectionContext, "actorUserId" | "rolesForScope" | "scope">,
  store: CorrectionStore,
): Promise<CorrectionOutcome> {
  if (!ctx.actorUserId || !ctx.rolesForScope.includes("ground_medical"))
    return { status: "failed", message: "Only Ground Medical for this scope can complete a correction." };
  const original = history.find((o) => o.id === corrected.supersedesId && o.status !== "erroneous");
  if (!corrected.correction || !original) return { status: "completed", correctedId: corrected.id };
  if (original.missionId !== ctx.scope.missionId || original.crewMemberId !== ctx.scope.crewMemberId || original.provenance !== ctx.scope.provenance)
    return { status: "failed", message: "Correction scope mismatch. Nothing changed." };
  try {
    await store.save(erroneousMarkFor(original, corrected));
    return { status: "completed", correctedId: corrected.id };
  } catch (error) {
    return { status: "partial", correctedId: corrected.id, message: `Marking the original erroneous failed again: ${error instanceof Error ? error.message : "storage error"}.` };
  }
}
