/**
 * P3 canonical domain contracts for The Mitochondria.
 *
 * This module is intentionally framework- and vendor-neutral. It describes
 * mission-health information without embedding clinical thresholds, diagnoses,
 * treatment recommendations, device SDK types, persistence models, or UI state.
 */

export const HEALTH_SIGNAL_DOMAINS = [
  "physiological",
  "biological",
  "laboratory",
  "cognitive",
  "behavioral",
  "psychological",
  "sleep_circadian",
  "activity_performance",
  "nutrition_hydration",
  "environmental",
  "radiation",
  "symptom_report",
  "device_system",
] as const;

export type HealthSignalDomain = (typeof HEALTH_SIGNAL_DOMAINS)[number];

export const OBSERVATION_VALUE_KINDS = ["number", "boolean", "text", "category"] as const;
export type ObservationValueKind = (typeof OBSERVATION_VALUE_KINDS)[number];

export const OBSERVATION_STATUSES = ["preliminary", "final", "corrected", "invalid"] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export const DATA_QUALITY_LEVELS = ["good", "degraded", "poor", "unknown"] as const;
export type DataQualityLevel = (typeof DATA_QUALITY_LEVELS)[number];

export const PROVENANCE_KINDS = ["raw", "derived", "manual"] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export const SCIENTIFIC_REVIEW_STATES = [
  "draft",
  "evidence_review",
  "approved_for_research",
  "retired",
] as const;
export type ScientificReviewState = (typeof SCIENTIFIC_REVIEW_STATES)[number];

export const DATA_CLASSIFICATIONS = [
  "synthetic",
  "deidentified",
  "mission_sensitive",
  "medical_sensitive",
] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];


export const MISSION_STATUSES = ["planning", "active", "completed", "aborted"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const CREW_MEMBER_STATUSES = ["candidate", "active", "inactive"] as const;
export type CrewMemberStatus = (typeof CREW_MEMBER_STATUSES)[number];

export const CREW_ASSIGNMENT_ROLES = ["crew", "commander", "medical_officer", "researcher"] as const;
export type CrewAssignmentRole = (typeof CREW_ASSIGNMENT_ROLES)[number];

/** Stable, non-clinical identity for a person represented inside a mission context. */
export interface CrewMember {
  id: string;
  externalRef?: string;
  displayName: string;
  status: CrewMemberStatus;
  createdAt: string;
  updatedAt: string;
}

/** Mission identity and temporal envelope. No health or clinical state belongs here. */
export interface Mission {
  id: string;
  code: string;
  name: string;
  status: MissionStatus;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Versionable relationship between a crew member and a mission. */
export interface CrewAssignment {
  id: string;
  missionId: string;
  crewMemberId: string;
  role: CrewAssignmentRole;
  activeFrom: string;
  activeUntil?: string;
}

export interface MissionContextRef {
  missionId: string;
  crewMemberId: string;
}

export interface SourceRef {
  sourceId: string;
  sourceType: "device" | "laboratory" | "assessment" | "environment" | "manual" | "derived";
  manufacturer?: string;
  model?: string;
  adapterId?: string;
  adapterVersion?: string;
}

export interface MetricRef {
  code: string;
  displayName: string;
  domain: HealthSignalDomain;
  valueKind: ObservationValueKind;
  unit?: string;
  unitSystem?: "UCUM" | "SI" | "custom";
  interoperabilityCode?: {
    system: string;
    code: string;
    display?: string;
  };
}

export interface ObservationValue {
  number?: number;
  boolean?: boolean;
  text?: string;
  category?: string;
}

export interface DataQuality {
  level: DataQualityLevel;
  score?: number;
  artifactFlags: string[];
  notes?: string;
}

export interface Provenance {
  kind: ProvenanceKind;
  capturedAt: string;
  ingestionId: string;
  inputObservationIds: string[];
  derivationMethod?: string;
  algorithmVersion?: string;
}

export interface CanonicalObservation {
  id: string;
  mission: MissionContextRef;
  source: SourceRef;
  metric: MetricRef;
  value: ObservationValue;
  observedAt: string;
  effectiveStart?: string;
  effectiveEnd?: string;
  status: ObservationStatus;
  quality: DataQuality;
  provenance: Provenance;
  classification: DataClassification;
  tags: string[];
}

export interface ScientificEvidenceRef {
  citationId: string;
  url: string;
  note?: string;
}

export interface ScientificSignalDefinition {
  id: string;
  metric: MetricRef;
  description: string;
  intendedUse: string;
  limitations: string[];
  evidence: ScientificEvidenceRef[];
  reviewState: ScientificReviewState;
  version: string;
  nonDiagnostic: true;
}

export interface PersonalBaselineDefinition {
  id: string;
  metricCode: string;
  strategy: "individual_longitudinal";
  minimumObservations: number;
  minimumCoverageHours: number;
  algorithmId: string;
  algorithmVersion: string;
  qualityPolicyId: string;
  version: string;
}

export interface DomainValidationIssue {
  path: string;
  message: string;
}

export interface DomainValidationResult {
  valid: boolean;
  issues: DomainValidationIssue[];
}
