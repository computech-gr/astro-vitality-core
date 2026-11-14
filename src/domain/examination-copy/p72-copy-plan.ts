/**
 * P72 synthetic examination copy plan (pure, browser-safe, no keys).
 *
 * Turns decrypted Alex Morgan synthetic sync events (MITO_DEMO_2026) into
 * deterministic copies for the target mission/crew. Copies:
 *  - keep metric, value, unit, dates, precision and source document provenance exactly;
 *  - get a deterministic new ID (idempotent re-runs) and a label that names the source record;
 *  - never carry the source reviewer's confirmation: every copy starts "pending_review"
 *    and must be confirmed again in the target mission by its own reviewers;
 *  - are eligible only when they pass the normal sync validation for the target scope
 *    (demo-catalog terms are bound to their own mission and are therefore held).
 * Ground Medical attestations, corrections and approvals are never copied.
 */
import { canonicalJson, type UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import { checkObservationSyncEvent, type ObservationSyncEvent, type SyncScope } from "@/domain/health-intelligence/observation-sync";

export const P72_COPY_VERSION = "p72-copy-v1" as const;

export const P72_SOURCE_SCOPE: SyncScope = {
  missionId: "mission-9d8ce8f3e5554509a0885461f9ad2e1c",
  crewMemberId: "crew-9806e7e611f44dc38dac5e23f7740f1a",
  provenance: "synthetic",
};

export const P72_TARGET_SCOPE: SyncScope = {
  missionId: "mission-3fd366c331ed46afb0645cced1d45294",
  crewMemberId: "crew-43f5fe4d102f40d19ced676dabd3b672",
  provenance: "synthetic",
};

export interface P72SourceEvent {
  event: ObservationSyncEvent;
  /** Server fingerprint of the source row (provenance only; never reused for the copy). */
  sourceFingerprint: string;
}

export interface P72CopyEntry {
  sourceEventId: string;
  sourceObservationId: string;
  sourceFingerprint: string;
  copyObservationId: string;
  copyEventId: string;
  metricId: string;
  domain: string;
  value: string;
  unit: string;
  observedAt: string;
  datePrecision: string;
  documentName: string;
  documentSha256: string | null;
  decision: "copy" | "already_copied" | "held";
  reason: string | null;
  copy: ObservationSyncEvent | null;
}

export interface P72CopyPlan {
  version: typeof P72_COPY_VERSION;
  source: SyncScope;
  target: SyncScope;
  entries: P72CopyEntry[];
  counts: { source: number; copy: number; alreadyCopied: number; held: number };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Deterministic UUID-shaped copy ID bound to source record + target scope + copy version. */
export async function p72CopyObservationId(sourceObservationId: string, target: SyncScope): Promise<string> {
  const h = await sha256Hex(JSON.stringify([P72_COPY_VERSION, sourceObservationId, target.missionId, target.crewMemberId, target.provenance]));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function p72CopyLabel(sourceLabel: string, sourceObservationId: string): string {
  return `${sourceLabel} · P72 synthetic copy of ${sourceObservationId} (MITO_DEMO_2026)`;
}

/** Builds the copy observation; returns null fields only through validation, never silently. */
export function p72CopyObservation(source: UnifiedObservation, copyId: string, target: SyncScope): UnifiedObservation {
  const { catalogBasis: _drop, ...rest } = source as UnifiedObservation & { catalogBasis?: unknown };
  void _drop;
  const copy: UnifiedObservation = {
    ...rest,
    id: copyId,
    missionId: target.missionId,
    crewMemberId: target.crewMemberId,
    source: { ...source.source, label: p72CopyLabel(source.source.label, source.id) },
    quality: { reviewerConfirmed: false },
    reviewState: "pending_review",
    status: "active",
  };
  // Demo-catalog records keep their basis so validation can refuse them for another mission.
  if ((source as { catalogBasis?: unknown }).catalogBasis !== undefined)
    (copy as { catalogBasis?: unknown }).catalogBasis = (source as { catalogBasis?: unknown }).catalogBasis;
  return copy;
}

export function p72SourceIssue(e: ObservationSyncEvent, source: SyncScope): string | null {
  const o = e.observation;
  if (e.eventKind !== "entry") return "Only original entries are copied; status events are not.";
  if (o.provenance !== "synthetic") return "Only synthetic records are copied.";
  if (o.missionId !== source.missionId || o.crewMemberId !== source.crewMemberId) return "Record is outside the Alex Morgan source scope.";
  if (o.status === "erroneous") return "Withdrawn records are not copied.";
  if (o.correction || o.supersedesId) return "Ground Medical corrections are not copied.";
  return null;
}

export async function buildP72CopyPlan(
  sources: readonly P72SourceEvent[],
  existingTargetEventIds: ReadonlySet<string>,
  target: SyncScope = P72_TARGET_SCOPE,
  source: SyncScope = P72_SOURCE_SCOPE,
): Promise<P72CopyPlan> {
  const entries: P72CopyEntry[] = [];
  const ordered = [...sources].sort((a, b) => a.event.eventId.localeCompare(b.event.eventId));
  for (const s of ordered) {
    const o = s.event.observation;
    const copyObservationId = await p72CopyObservationId(o.id, target);
    const copyEventId = `${copyObservationId}:entry`;
    const base = {
      sourceEventId: s.event.eventId,
      sourceObservationId: o.id,
      sourceFingerprint: s.sourceFingerprint,
      copyObservationId,
      copyEventId,
      metricId: o.metricId,
      domain: o.domain,
      value: o.value,
      unit: o.originalUnit,
      observedAt: o.observedAt,
      datePrecision: o.datePrecision ?? "instant",
      documentName: o.source.documentName ?? o.source.label,
      documentSha256: o.source.documentSha256 ?? null,
    };
    const sourceIssue = p72SourceIssue(s.event, source);
    if (sourceIssue) {
      entries.push({ ...base, decision: "held", reason: sourceIssue, copy: null });
      continue;
    }
    if (existingTargetEventIds.has(copyEventId)) {
      entries.push({ ...base, decision: "already_copied", reason: null, copy: null });
      continue;
    }
    const copy: ObservationSyncEvent = { eventId: copyEventId, eventKind: "entry", observation: p72CopyObservation(o, copyObservationId, target) };
    const issue = checkObservationSyncEvent(copy, target);
    entries.push(issue ? { ...base, decision: "held", reason: issue, copy: null } : { ...base, decision: "copy", reason: null, copy });
  }
  return {
    version: P72_COPY_VERSION,
    source,
    target,
    entries,
    counts: {
      source: entries.length,
      copy: entries.filter((e) => e.decision === "copy").length,
      alreadyCopied: entries.filter((e) => e.decision === "already_copied").length,
      held: entries.filter((e) => e.decision === "held").length,
    },
  };
}

/** Stable digest of what would be written (copies only, ciphertext-free). */
export async function p72PlanDigest(plan: P72CopyPlan): Promise<string> {
  return sha256Hex(canonicalJson(plan.entries.map((e) => ({ s: e.sourceEventId, c: e.copyEventId, d: e.decision, o: e.copy?.observation ?? null }))));
}
