/**
 * Unified Medical Data Intake — versioned observation envelope.
 * Research-only: an "accepted" review state means a human reviewer confirmed
 * the row; it is never a scientific approval, clinical interpretation or
 * diagnostic claim. PENDING_NIKOLAS_REVIEW and independent acceptance gates
 * remain unchanged.
 */
import type { HealthDomainId } from "@/domain/health-domains/registry";

export const UNIFIED_OBSERVATION_SCHEMA = "mitochondria.unified-observation.v1";

export type ObservationSourceKind =
  "manual" | "csv" | "pdf_text" | "ocr" | "device" | "self_assessment";

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
  schema: typeof UNIFIED_OBSERVATION_SCHEMA;
  id: string;
  missionId: string;
  crewMemberId: string;
  /** Canonical P36 catalog metric ID; never a free-typed or invented biomarker. */
  metricId: string;
  domain: HealthDomainId;
  /** Value and unit are stored exactly as reported; no unit conversion. */
  value: string;
  originalUnit: string;
  /** ISO 8601 UTC instant of the observation. */
  observedAt: string;
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
  recordedAt: string;
}

const OBSERVATION_ID = /^[a-z0-9][a-z0-9-]{7,127}$/i;
const SAFE_DECIMAL = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

export function validateUnifiedObservation(observation: UnifiedObservation): string | null {
  if (observation.schema !== UNIFIED_OBSERVATION_SCHEMA) return "Unknown observation schema.";
  if (!OBSERVATION_ID.test(observation.id)) return "Invalid observation id.";
  if (!observation.missionId || !observation.crewMemberId)
    return "Mission and crew identity are required.";
  if (!observation.metricId.trim()) return "A canonical catalog metric ID is required.";
  if (!SAFE_DECIMAL.test(observation.value.trim())) return "Value must be a plain decimal number.";
  if (!observation.originalUnit.trim()) return "The original reported unit is required.";
  if (Number.isNaN(Date.parse(observation.observedAt)))
    return "Observation time must be a valid date.";
  if (Number.isNaN(Date.parse(observation.recordedAt)))
    return "Recording time must be a valid date.";
  if (observation.provenance !== "synthetic" && observation.provenance !== "real")
    return "Provenance must be explicitly synthetic or real.";
  if (observation.reviewState === "accepted" && !observation.quality.reviewerConfirmed)
    return "Accepted observations require explicit reviewer confirmation.";
  if (observation.status && observation.status !== "active" && observation.status !== "erroneous")
    return "Unknown observation status.";
  return null;
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
