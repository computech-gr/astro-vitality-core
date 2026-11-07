/**
 * Unified Medical Data Intake — versioned observation envelope.
 * Research-only: an "accepted" review state means a human reviewer confirmed
 * the row; it is never a scientific approval, clinical interpretation or
 * diagnostic claim. PENDING_NIKOLAS_REVIEW and independent acceptance gates
 * remain unchanged.
 */
import type { HealthDomainId } from "@/domain/health-domains/registry";
import { isCalendarDate, isExplicitInstant, validObservationDate, type ObservationDatePrecision } from "./observation-date";

export const UNIFIED_OBSERVATION_SCHEMA = "mitochondria.unified-observation.v1";
export const DATED_OBSERVATION_SCHEMA = "mitochondria.unified-observation.v2";
export function isUnifiedObservationSchema(schema: unknown): boolean {
  return schema === UNIFIED_OBSERVATION_SCHEMA || schema === DATED_OBSERVATION_SCHEMA;
}

export type ObservationSourceKind =
  "manual" | "csv" | "xlsx" | "json" | "fhir" | "pdf_text" | "ocr" | "device" | "self_assessment";

export type ObservationReviewState = "pending_review" | "accepted" | "rejected";

export interface UnifiedObservationSource {
  kind: ObservationSourceKind;
  /** Human-readable origin, e.g. filename or "Manual entry". */
  label: string;
  /** Original document identity is preserved; bytes are never uploaded automatically. */
  documentName?: string;
  documentSha256?: string;
  excerpt?: string;
}

export interface UnifiedObservation {
  schema: typeof UNIFIED_OBSERVATION_SCHEMA | typeof DATED_OBSERVATION_SCHEMA;
  id: string;
  missionId: string;
  crewMemberId: string;
  /** Canonical P36 catalog metric ID; never a free-typed or invented biomarker. */
  metricId: string;
  domain: HealthDomainId;
  /** Value and unit are stored exactly as reported; no unit conversion. */
  value: string;
  originalUnit: string;
  /** Explicit zoned ISO instant, or ISO calendar date when precision is date. */
  observedAt: string;
  datePrecision?: ObservationDatePrecision;
  /** Exact source collection date; never a fabricated observation instant. */
  collectionDate?: string;
  source: UnifiedObservationSource;
  provenance: "synthetic" | "real";
  quality: {
    reviewerConfirmed: boolean;
    duplicateWarningAcknowledged?: boolean;
  };
  reviewState: ObservationReviewState;
  /** Append-only correction metadata; history is never rewritten. */
  status?: "active" | "erroneous";
  statusReason?: string;
  supersedesId?: string;
  /**
   * Present only on a superseding correction appended by Ground Medical
   * (stored-observation-review.ts). Records who corrected what and why; the
   * original record is never rewritten.
   */
  correction?: {
    intentId: string;
    originalRecordId: string;
    actorUserId: string;
    actorRole: "ground_medical";
    reason: string;
    decidedAt: string;
  };
  /**
   * Present only when the metric came from an activated mission-scoped
   * SYNTHETIC DEMO catalog entry (metricId "demo:ubt-…"). Never a scientific
   * approval, source validation or production catalog entry.
   */
  catalogBasis?: {
    kind: "synthetic_demo";
    demoId: string;
    termId: string;
    displayName: string;
    demoCatalogVersion: number;
    classification: typeof SYNTHETIC_DEMO_BASIS_CLASSIFICATION;
  };
  recordedAt: string;
}

/** Equal to SYNTHETIC_DEMO_CLASSIFICATION in synthetic-demo-catalog.ts (kept literal to avoid an import cycle). */
export const SYNTHETIC_DEMO_BASIS_CLASSIFICATION = "SYNTHETIC_DEMO_NOT_SCIENTIFICALLY_VALIDATED" as const;
const DEMO_METRIC = /^demo:(ubt-[0-9a-f]{8})$/;

/** Demo metric IDs and the demo basis always appear together, on synthetic records only. */
export function syntheticDemoBasisIssue(observation: UnifiedObservation): string | null {
  const demo = DEMO_METRIC.exec(observation.metricId);
  const b = observation.catalogBasis;
  if (!demo && b === undefined) return null;
  if (!demo || !b) return "Synthetic demo metrics and the synthetic demo catalog basis must appear together.";
  if (
    typeof b !== "object" ||
    b.kind !== "synthetic_demo" ||
    b.demoId !== observation.metricId ||
    b.termId !== demo[1] ||
    b.classification !== SYNTHETIC_DEMO_BASIS_CLASSIFICATION ||
    typeof b.displayName !== "string" ||
    !b.displayName.trim() ||
    b.displayName.length > 200 ||
    !Number.isInteger(b.demoCatalogVersion) ||
    b.demoCatalogVersion < 1 ||
    Object.keys(b).some((k) => !["kind", "demoId", "termId", "displayName", "demoCatalogVersion", "classification"].includes(k))
  )
    return "The synthetic demo catalog basis is inconsistent.";
  if (observation.provenance !== "synthetic") return "Synthetic demo catalog records must be synthetic.";
  return null;
}

const OBSERVATION_ID = /^[a-z0-9][a-z0-9-]{7,127}$/i;
const SAFE_DECIMAL = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

export function validateUnifiedObservation(observation: UnifiedObservation): string | null {
  if (!isUnifiedObservationSchema(observation.schema)) return "Unknown observation schema.";
  if (observation.schema === DATED_OBSERVATION_SCHEMA && !observation.datePrecision) return "Date precision is required for v2 observations.";
  if (observation.schema === UNIFIED_OBSERVATION_SCHEMA && observation.datePrecision === "date") return "Date-only observations require the v2 schema.";
  if (observation.collectionDate !== undefined && !isCalendarDate(observation.collectionDate)) return "Collection date must be a valid ISO calendar date.";
  if (!OBSERVATION_ID.test(observation.id)) return "Invalid observation id.";
  if (!observation.missionId || !observation.crewMemberId)
    return "Mission and crew identity are required.";
  if (!observation.metricId.trim()) return "A canonical catalog metric ID is required.";
  if (!SAFE_DECIMAL.test(observation.value.trim())) return "Value must be a plain decimal number.";
  if (!observation.originalUnit.trim()) return "The original reported unit is required.";
  if (!validObservationDate(observation))
    return "Observation date must be a valid calendar date or explicit zoned instant at its declared precision.";
  if (!isExplicitInstant(observation.recordedAt))
    return "Recording time must be a valid date.";
  if (observation.provenance !== "synthetic" && observation.provenance !== "real")
    return "Provenance must be explicitly synthetic or real.";
  if (observation.reviewState === "accepted" && !observation.quality.reviewerConfirmed)
    return "Accepted observations require explicit reviewer confirmation.";
  if (observation.status && observation.status !== "active" && observation.status !== "erroneous")
    return "Unknown observation status.";
  return syntheticDemoBasisIssue(observation);
}

/**
 * Domain read-model connection rule: only reviewer-accepted, non-erroneous
 * observations route to domain read models and Health Intelligence evidence
 * adapters. Everything else stays review-only. Acceptance is a human review
 * decision, never a scientific or clinical approval.
 */
export function isDomainReadable(observation: UnifiedObservation): boolean {
  return observation.reviewState === "accepted" && observation.status !== "erroneous";
}

/**
 * Deterministic sorted-key JSON (undefined members omitted) used to compare
 * observation versions across devices and as the input of sync fingerprints.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
    .join(",")}}`;
}
