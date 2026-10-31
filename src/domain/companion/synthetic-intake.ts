/**
 * P48 FINAL — Crew Self-only synthetic observation intake (pure rules).
 *
 * Builds `ingest_mission_event` payloads exactly as the live RPC reads them
 * (p_event: id, kind, mission.{missionId,crewMemberId}, eventTimestamp, createdAt,
 * sourceId, sourceVersion, sourcePriority, classification, payload; p_idempotency_key
 * 16–256 chars). Classification is fixed to "synthetic" in code, every payload carries an
 * explicit synthetic label, and every value passes the canonical metric pipeline.
 * Nothing here performs I/O; the server function is the only caller that writes.
 */
import { ingestCanonicalObservation } from "@/domain/ingestion";
import type { DataQuality, SourceRef } from "@/domain/contracts";

export const P48_SYNTHETIC_MISSION_CODE = "P48_SYNTHETIC_DEMO";
export const P48_SYNTHETIC_SCHEMA = "mitochondria.p48.synthetic-demo-plan.v1";
export const P48_SYNTHETIC_LABEL =
  "SYNTHETIC DEMONSTRATION — not a real sensor reading, medical record or clinical baseline";
export const P48_MAX_BATCH = 12;
const SOURCE_VERSION = "p48-final-1";
const MAX_AGE_DAYS = 400;
const FUTURE_SKEW_MS = 5 * 60_000;

export const P48_SYNTHETIC_SOURCES = {
  alpha: {
    sourceId: "p48-synthetic-source-alpha",
    sourceType: "device",
    manufacturer: "Synthetic",
    model: "P48 synthetic demo source alpha (not a real sensor)",
    adapterId: "org.mitochondria.synthetic.p48",
    adapterVersion: SOURCE_VERSION,
  },
  beta: {
    sourceId: "p48-synthetic-source-beta",
    sourceType: "device",
    manufacturer: "Synthetic",
    model: "P48 synthetic demo source beta (not a real sensor)",
    adapterId: "org.mitochondria.synthetic.p48",
    adapterVersion: SOURCE_VERSION,
  },
} as const satisfies Record<string, SourceRef>;
export type SyntheticSourceKey = keyof typeof P48_SYNTHETIC_SOURCES;

/** Canonical catalog metrics the Companion charts; units are catalog aliases only. */
export const P48_SYNTHETIC_METRICS = {
  "phys.heart_rate": { label: "Heart rate", units: ["bpm", "{beats}/min"] },
  "phys.hrv_rmssd": { label: "Heart-rate variability (RMSSD)", units: ["ms"] },
  "sleep.duration": { label: "Sleep duration", units: ["h", "hours"] },
} as const;
export type SyntheticMetricCode = keyof typeof P48_SYNTHETIC_METRICS;
export const SYNTHETIC_QUALITY_LEVELS = ["good", "degraded", "unknown"] as const;
export type SyntheticQualityLevel = (typeof SYNTHETIC_QUALITY_LEVELS)[number];

export interface SyntheticReadingInput {
  metricCode: string;
  value: number;
  unit: string;
  observedAt: string;
  source: string;
  quality: string;
}

export interface SyntheticScope {
  missionId: string;
  crewMemberId: string;
}

export interface IngestEventPayload {
  id: string;
  kind: "observation";
  mission: SyntheticScope;
  eventTimestamp: string;
  createdAt: string;
  sourceId: string;
  sourceVersion: string;
  sourcePriority: number;
  classification: "synthetic";
  payload: Record<string, unknown>;
}

export interface PlannedSyntheticEvent {
  event: IngestEventPayload;
  idempotencyKey: string;
}

export type SyntheticBatchResult =
  { ok: true; events: PlannedSyntheticEvent[] } | { ok: false; issues: string[] };

const isMetric = (code: string): code is SyntheticMetricCode => code in P48_SYNTHETIC_METRICS;
const isSource = (key: string): key is SyntheticSourceKey => key in P48_SYNTHETIC_SOURCES;
const isQuality = (q: string): q is SyntheticQualityLevel =>
  (SYNTHETIC_QUALITY_LEVELS as readonly string[]).includes(q);
const ID_TEXT = /^[A-Za-z0-9_.:-]{1,128}$/;

export function syntheticEventId(scope: SyntheticScope, r: SyntheticReadingInput): string {
  return `p48syn:${scope.crewMemberId}:${r.metricCode}:${r.source}:${new Date(r.observedAt).toISOString()}`;
}

/**
 * Validate a human-reviewed batch and build the exact RPC inputs. Event ids and
 * idempotency keys are deterministic per crew/metric/source/time, so a retry is
 * reported as a duplicate by the database instead of creating a second record.
 */
export function buildSyntheticBatch(
  scope: SyntheticScope,
  readings: readonly SyntheticReadingInput[],
  now: Date,
): SyntheticBatchResult {
  const issues: string[] = [];
  if (!ID_TEXT.test(scope.missionId) || !ID_TEXT.test(scope.crewMemberId))
    issues.push("Mission and crew identifiers are invalid.");
  if (readings.length === 0) issues.push("Add at least one synthetic reading.");
  if (readings.length > P48_MAX_BATCH)
    issues.push(`At most ${P48_MAX_BATCH} synthetic readings per batch.`);
  if (issues.length) return { ok: false, issues };

  const createdAt = now.toISOString();
  const seen = new Set<string>();
  const events: PlannedSyntheticEvent[] = [];
  readings.forEach((r, index) => {
    const n = index + 1;
    if (!isMetric(r.metricCode)) return void issues.push(`Reading ${n}: metric is not allowed.`);
    const metric = P48_SYNTHETIC_METRICS[r.metricCode];
    if (!(metric.units as readonly string[]).includes(r.unit))
      return void issues.push(`Reading ${n}: unit must be one of ${metric.units.join(", ")}.`);
    if (typeof r.value !== "number" || !Number.isFinite(r.value) || r.value <= 0)
      return void issues.push(`Reading ${n}: value must be a finite number above 0.`);
    if (r.metricCode === "sleep.duration" && r.value > 24)
      return void issues.push(`Reading ${n}: sleep duration cannot exceed 24 hours.`);
    const ts = Date.parse(r.observedAt);
    if (!Number.isFinite(ts) || !/^\d{4}-\d{2}-\d{2}T/.test(r.observedAt))
      return void issues.push(`Reading ${n}: date and time are invalid.`);
    if (ts > now.getTime() + FUTURE_SKEW_MS)
      return void issues.push(`Reading ${n}: date cannot be in the future.`);
    if (ts < now.getTime() - MAX_AGE_DAYS * 86_400_000)
      return void issues.push(`Reading ${n}: date is older than ${MAX_AGE_DAYS} days.`);
    if (!isSource(r.source)) return void issues.push(`Reading ${n}: source is not allowed.`);
    if (!isQuality(r.quality)) return void issues.push(`Reading ${n}: quality is not allowed.`);

    const observedAt = new Date(ts).toISOString();
    const id = syntheticEventId(scope, { ...r, observedAt });
    if (seen.has(id))
      return void issues.push(
        `Reading ${n}: duplicates another reading (same metric, source and time).`,
      );
    seen.add(id);
    if (id.length > 160) return void issues.push(`Reading ${n}: identifier too long.`);

    const source = P48_SYNTHETIC_SOURCES[r.source];
    const quality: DataQuality = {
      level: r.quality,
      score: r.quality === "good" ? 1 : r.quality === "degraded" ? 0.5 : 0,
      artifactFlags: [],
    };
    const result = ingestCanonicalObservation({
      id,
      mission: { missionId: scope.missionId, crewMemberId: scope.crewMemberId },
      source,
      metricCode: r.metricCode,
      value: { number: r.value },
      unit: r.unit,
      observedAt,
      status: "final",
      quality,
      provenance: {
        kind: "raw",
        capturedAt: observedAt,
        ingestionId: `p48-synthetic-intake:${createdAt}`,
        inputObservationIds: [],
        algorithmVersion: SOURCE_VERSION,
      },
      classification: "synthetic",
      tags: ["synthetic:true", "scenario:p48-final"],
      context: { tags: ["synthetic:true"], completeness: 1 },
      reviewStatus: "raw",
    });
    if (!result.ok)
      return void issues.push(`Reading ${n}: ${result.issues.map((i) => i.message).join("; ")}`);
    events.push({
      idempotencyKey: `p48-idem:${id}`,
      event: {
        id,
        kind: "observation",
        mission: { missionId: scope.missionId, crewMemberId: scope.crewMemberId },
        eventTimestamp: observedAt,
        createdAt,
        sourceId: source.sourceId,
        sourceVersion: SOURCE_VERSION,
        sourcePriority: 10,
        classification: "synthetic",
        payload: {
          ...result.envelope,
          syntheticDemonstration: {
            schema: P48_SYNTHETIC_SCHEMA,
            label: P48_SYNTHETIC_LABEL,
            synthetic: true,
          },
        },
      },
    });
  });
  return issues.length ? { ok: false, issues } : { ok: true, events };
}

/** Planned scenario rows (6 per crew, two sources, >90-day coverage), relative to `now`. */
export function syntheticScenario(variant: "A" | "B", now: Date): SyntheticReadingInput[] {
  const day = (offset: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8));
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString();
  };
  const v = variant === "A" ? [64, 52, 7.1, 66, 55, 65] : [71, 44, 6.4, 73, 47, 72];
  return [
    {
      metricCode: "phys.heart_rate",
      value: v[0]!,
      unit: "bpm",
      observedAt: day(120),
      source: "alpha",
      quality: "good",
    },
    {
      metricCode: "phys.hrv_rmssd",
      value: v[1]!,
      unit: "ms",
      observedAt: day(60),
      source: "beta",
      quality: "good",
    },
    {
      metricCode: "sleep.duration",
      value: v[2]!,
      unit: "h",
      observedAt: day(25),
      source: "alpha",
      quality: "good",
    },
    {
      metricCode: "phys.heart_rate",
      value: v[3]!,
      unit: "bpm",
      observedAt: day(6),
      source: "beta",
      quality: "degraded",
    },
    {
      metricCode: "phys.hrv_rmssd",
      value: v[4]!,
      unit: "ms",
      observedAt: day(2),
      source: "alpha",
      quality: "good",
    },
    {
      metricCode: "phys.heart_rate",
      value: v[5]!,
      unit: "bpm",
      observedAt: day(1),
      source: "alpha",
      quality: "good",
    },
  ];
}

export interface EligibilityFacts {
  flagEnabled: boolean;
  mission: { code: string; status: string } | null;
  /** Caller's own active memberships in this mission (RLS: self rows). */
  memberships: Array<{ role: string; crewMemberId: string | null }>;
}

export type EligibilityReason =
  | "disabled"
  | "not_synthetic_mission"
  | "mission_closed"
  | "not_crew_self"
  | "other_role_present"
  | "eligible";

/** Crew Self of exactly this crew, in the dedicated mission, holding no other role there. */
export function syntheticIntakeEligibility(
  facts: EligibilityFacts,
  crewMemberId: string,
): EligibilityReason {
  if (!facts.flagEnabled) return "disabled";
  if (!facts.mission || facts.mission.code !== P48_SYNTHETIC_MISSION_CODE)
    return "not_synthetic_mission";
  if (facts.mission.status !== "planning" && facts.mission.status !== "active")
    return "mission_closed";
  const own = facts.memberships.filter(
    (m) => m.role === "crew_self" && m.crewMemberId === crewMemberId,
  );
  if (own.length !== 1) return "not_crew_self";
  if (facts.memberships.some((m) => m.role !== "crew_self")) return "other_role_present";
  return "eligible";
}

export interface SubmissionCounts {
  accepted: number;
  duplicate: number;
  conflict: number;
  rejected: number;
  notAttempted: number;
}

/** Counts only — never values, identifiers or tokens. */
export function tallyIngestStatuses(
  statuses: ReadonlyArray<"accepted" | "duplicate" | "conflict" | "rejected">,
  planned: number,
): SubmissionCounts {
  const counts: SubmissionCounts = {
    accepted: 0,
    duplicate: 0,
    conflict: 0,
    rejected: 0,
    notAttempted: 0,
  };
  for (const s of statuses) counts[s]++;
  counts.notAttempted = Math.max(0, planned - statuses.length);
  return counts;
}
