/**
 * Ground Medical second-stage evidence attestation — pure and deterministic.
 *
 * Stored report rows are already accepted observations (module entries,
 * reviewer-accepted intake rows or declared device rows). Attestation is an
 * ADDITIONAL, optional, append-only confirmation by an authenticated
 * ground_medical member for exactly the same mission + crew + provenance.
 * Pre-existing rows without an attestation remain accepted; nothing is marked
 * unreviewed and no retroactive approval is required.
 *
 * An attestation confirms the evidence record only. It never changes catalog
 * classification, scientific review status (PENDING_NIKOLAS_REVIEW) or the
 * stored observation, and it is not a diagnosis or a legal signature.
 */
import type { ReportRow, ReportScope, UnifiedHealthReport } from "./unified-health-report";

export const EVIDENCE_ATTESTATION_SCHEMA = "mitochondria.evidence-attestation.v1";
export const ATTESTATION_REASON_MIN = 10;
export const ATTESTATION_BATCH_MAX = 500;

export type AttestationAction = "attest" | "revoke";

export interface AttestationEvent {
  schema: typeof EVIDENCE_ATTESTATION_SCHEMA;
  /** Deterministic: replaying the same intent yields the same ID (idempotent). */
  eventId: string;
  action: AttestationAction;
  recordId: string;
  /** Fingerprint of the exact attested record version. */
  recordFingerprint: string;
  metricId: string;
  badge: ReportRow["badge"];
  scope: ReportScope;
  actorUserId: string;
  actorRole: "ground_medical";
  reason: string;
  confirmed: true;
  decidedAt: string;
  batchId: string;
  /** The event this one supersedes (revocation of an attestation, or re-attestation after revocation). */
  supersedesEventId: string | null;
  scientificCatalogStatus: "unchanged";
  catalogApprovalOverride: false;
}

export type AttestationStatus =
  | "accepted_not_attested"
  | "attested"
  | "revoked"
  | "stale_record_changed";

export const ATTESTATION_STATUS_LABELS: Record<AttestationStatus, string> = {
  accepted_not_attested: "Accepted (stored) — no Ground Medical attestation",
  attested: "Ground Medical attested",
  revoked: "Attestation revoked — accepted (stored)",
  stale_record_changed: "Attestation applies to an earlier record version",
};

export interface AttestationContext {
  actorUserId: string | null | undefined;
  /** Roles held by the actor for exactly this mission + crew. */
  rolesForScope: readonly string[];
  scope: ReportScope;
  decidedAt: string;
}

/** FNV-1a 32-bit — stable identifier, never an integrity attestation. */
function stableId(prefix: string, text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}-${hash.toString(16).padStart(8, "0")}`;
}

export function recordFingerprint(row: Pick<ReportRow, "recordId" | "metricId" | "value" | "unit" | "observedAt" | "provenance" | "badge">): string {
  return stableId("rfp", JSON.stringify([row.recordId, row.badge, row.metricId, row.value, row.unit, row.observedAt, row.provenance]));
}

export function canAttestEvidence(rolesForScope: readonly string[]): boolean {
  return rolesForScope.includes("ground_medical");
}

const sameScope = (a: ReportScope, b: ReportScope) =>
  a.missionId === b.missionId && a.crewMemberId === b.crewMemberId && a.provenance === b.provenance;

/** Keep only well-formed events for exactly this scope (defence against foreign or tampered rows). */
export function scopedAttestationEvents(events: readonly unknown[], scope: ReportScope): AttestationEvent[] {
  return events.filter((e): e is AttestationEvent => {
    if (!e || typeof e !== "object") return false;
    const x = e as Partial<AttestationEvent>;
    return (
      x.schema === EVIDENCE_ATTESTATION_SCHEMA &&
      (x.action === "attest" || x.action === "revoke") &&
      typeof x.eventId === "string" &&
      typeof x.recordId === "string" &&
      typeof x.recordFingerprint === "string" &&
      x.actorRole === "ground_medical" &&
      typeof x.actorUserId === "string" &&
      x.actorUserId.length > 0 &&
      x.confirmed === true &&
      x.catalogApprovalOverride === false &&
      typeof x.reason === "string" &&
      x.reason.trim().length >= ATTESTATION_REASON_MIN &&
      Number.isFinite(Date.parse(x.decidedAt ?? "")) &&
      !!x.scope &&
      sameScope(x.scope, scope)
    );
  });
}

const ordered = (events: readonly AttestationEvent[]) =>
  [...events].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt) || a.eventId.localeCompare(b.eventId));

export interface RecordAttestationState {
  status: AttestationStatus;
  latest: AttestationEvent | null;
  history: AttestationEvent[];
}

export function attestationStateFor(row: ReportRow, events: readonly AttestationEvent[]): RecordAttestationState {
  const history = ordered(events.filter((e) => e.recordId === row.recordId));
  const latest = history.at(-1) ?? null;
  if (!latest) return { status: "accepted_not_attested", latest, history };
  if (latest.action === "revoke") return { status: "revoked", latest, history };
  if (latest.recordFingerprint !== recordFingerprint(row)) return { status: "stale_record_changed", latest, history };
  return { status: "attested", latest, history };
}

/** Rows a ground-medical reviewer may newly attest (included and not currently attested). */
export function eligibleForAttestation(report: UnifiedHealthReport, events: readonly AttestationEvent[]): ReportRow[] {
  return report.rows.filter(
    (r) => r.status === "included" && r.provenance === report.scope.provenance && attestationStateFor(r, events).status !== "attested",
  );
}

export type AttestationPlan =
  | { ok: true; events: AttestationEvent[]; skipped: { recordId: string; reason: string }[]; batchId: string }
  | { ok: false; reason: string };

function authorize(report: UnifiedHealthReport, ctx: AttestationContext, reason: string, confirmed: boolean): string | null {
  if (!ctx.actorUserId) return "Reviewer identity is unavailable. Sign in again.";
  if (!canAttestEvidence(ctx.rolesForScope))
    return "Only an authenticated Ground Medical member for this exact mission and crew member can attest evidence.";
  if (!sameScope(report.scope, ctx.scope))
    return "The report scope differs from the authorized mission, crew member or provenance. Attestation refused.";
  if (!Number.isFinite(Date.parse(ctx.decidedAt))) return "Decision time is invalid.";
  if (reason.trim().length < ATTESTATION_REASON_MIN) return `A reason of at least ${ATTESTATION_REASON_MIN} characters is required.`;
  if (!confirmed) return "Explicit confirmation is required.";
  return null;
}

/**
 * Plan attestation events for the selected record IDs (individual or Select All).
 * Already-attested rows are skipped (idempotent); unknown IDs are refused.
 */
export function planAttestation(
  report: UnifiedHealthReport,
  selectedRecordIds: readonly string[],
  existing: readonly AttestationEvent[],
  ctx: AttestationContext,
  input: { reason: string; confirmed: boolean },
): AttestationPlan {
  const denied = authorize(report, ctx, input.reason, input.confirmed);
  if (denied) return { ok: false, reason: denied };
  const unique = [...new Set(selectedRecordIds)];
  if (!unique.length) return { ok: false, reason: "Select at least one record." };
  if (unique.length > ATTESTATION_BATCH_MAX) return { ok: false, reason: `Attest at most ${ATTESTATION_BATCH_MAX} records at a time.` };
  const scoped = scopedAttestationEvents(existing, report.scope);
  const decidedAt = new Date(ctx.decidedAt).toISOString();
  const batchId = stableId("atb", JSON.stringify([ctx.actorUserId, decidedAt, [...unique].sort()]));
  const events: AttestationEvent[] = [];
  const skipped: { recordId: string; reason: string }[] = [];
  for (const recordId of unique) {
    const row = report.rows.find((r) => r.recordId === recordId);
    if (!row || row.status !== "included" || row.provenance !== report.scope.provenance) {
      skipped.push({ recordId, reason: "Not an included, catalog-validated record in this report scope." });
      continue;
    }
    const state = attestationStateFor(row, scoped);
    if (state.status === "attested") {
      skipped.push({ recordId, reason: "Already attested for this record version." });
      continue;
    }
    const fingerprint = recordFingerprint(row);
    const supersedes = state.latest?.eventId ?? null;
    events.push({
      schema: EVIDENCE_ATTESTATION_SCHEMA,
      eventId: stableId("att", JSON.stringify(["attest", row.recordId, fingerprint, ctx.actorUserId, supersedes])),
      action: "attest",
      recordId: row.recordId,
      recordFingerprint: fingerprint,
      metricId: row.metricId,
      badge: row.badge,
      scope: { ...report.scope },
      actorUserId: ctx.actorUserId!,
      actorRole: "ground_medical",
      reason: input.reason.trim().slice(0, 500),
      confirmed: true,
      decidedAt,
      batchId,
      supersedesEventId: supersedes,
      scientificCatalogStatus: "unchanged",
      catalogApprovalOverride: false,
    });
  }
  if (!events.length) return { ok: false, reason: skipped[0]?.reason ?? "Nothing to attest." };
  return { ok: true, events, skipped, batchId };
}

/** Revocation appends a superseding event; the attestation itself is never edited or deleted. */
export function planRevocation(
  report: UnifiedHealthReport,
  recordId: string,
  existing: readonly AttestationEvent[],
  ctx: AttestationContext,
  input: { reason: string; confirmed: boolean },
): AttestationPlan {
  const denied = authorize(report, ctx, input.reason, input.confirmed);
  if (denied) return { ok: false, reason: denied };
  const row = report.rows.find((r) => r.recordId === recordId);
  if (!row) return { ok: false, reason: "Record is not in this report scope." };
  const state = attestationStateFor(row, scopedAttestationEvents(existing, report.scope));
  if (!state.latest || state.latest.action !== "attest") return { ok: false, reason: "There is no active attestation to revoke." };
  const decidedAt = new Date(ctx.decidedAt).toISOString();
  const batchId = stableId("atb", JSON.stringify([ctx.actorUserId, decidedAt, [recordId]]));
  const event: AttestationEvent = {
    ...state.latest,
    eventId: stableId("att", JSON.stringify(["revoke", recordId, state.latest.eventId, ctx.actorUserId])),
    action: "revoke",
    actorUserId: ctx.actorUserId!,
    reason: input.reason.trim().slice(0, 500),
    decidedAt,
    batchId,
    supersedesEventId: state.latest.eventId,
  };
  return { ok: true, events: [event], skipped: [], batchId };
}

export interface AttestationSummary {
  attested: number;
  notAttested: number;
  revoked: number;
  stale: number;
  events: number;
}

export function summarizeAttestations(report: UnifiedHealthReport, events: readonly AttestationEvent[]): AttestationSummary {
  const scoped = scopedAttestationEvents(events, report.scope);
  const s: AttestationSummary = { attested: 0, notAttested: 0, revoked: 0, stale: 0, events: scoped.length };
  for (const row of report.rows) {
    const status = attestationStateFor(row, scoped).status;
    if (status === "attested") s.attested++;
    else if (status === "revoked") s.revoked++;
    else if (status === "stale_record_changed") s.stale++;
    else s.notAttested++;
  }
  return s;
}

export function attestationPlainText(report: UnifiedHealthReport, events: readonly AttestationEvent[]): string {
  const scoped = ordered(scopedAttestationEvents(events, report.scope));
  const summary = summarizeAttestations(report, scoped);
  return [
    "GROUND MEDICAL EVIDENCE ATTESTATION (second stage, optional)",
    `Attested ${summary.attested} · accepted without attestation ${summary.notAttested} · revoked ${summary.revoked} · earlier version ${summary.stale}.`,
    "Attestation confirms the evidence record only; it does not change catalog or scientific review status and is not a diagnosis or legal signature.",
    ...report.rows.map((r) => `- ${r.recordId}: ${ATTESTATION_STATUS_LABELS[attestationStateFor(r, scoped).status]}`),
    "Audit history (append-only):",
    ...(scoped.length
      ? scoped.map((e) => `- ${e.decidedAt} ${e.action.toUpperCase()} ${e.recordId} by ${e.actorUserId} (ground_medical) event ${e.eventId}${e.supersedesEventId ? ` supersedes ${e.supersedesEventId}` : ""}: ${e.reason}`)
      : ["- No attestation events."]),
  ].join("\n");
}
