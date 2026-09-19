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
  "mission_context",
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
  sourceUnit?: string;
  sourceNumericValue?: number;
  normalizationMethod?: string;
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

export const METRIC_PRIORITIES = ["P0", "P1", "P2"] as const;
export type MetricPriority = (typeof METRIC_PRIORITIES)[number];

export const SCIENTIFIC_REVIEW_DISPOSITIONS = ["KEEP", "MODIFY", "DISCUSS"] as const;
export type ScientificReviewDisposition = (typeof SCIENTIFIC_REVIEW_DISPOSITIONS)[number];

export const INTERPRETATION_TIERS = ["operational", "medical_context", "research_only"] as const;
export type InterpretationTier = (typeof INTERPRETATION_TIERS)[number];

export const MEASUREMENT_CADENCE_CLASSES = [
  "continuous_live",
  "near_live_sync",
  "daily",
  "weekly",
  "periodic",
  "event_driven",
  "preflight_baseline",
  "postflight_recovery",
  "research_only",
  "event_driven_medical",
  "contextual",
] as const;
export type MeasurementCadenceClass = (typeof MEASUREMENT_CADENCE_CLASSES)[number];

export const METRIC_DATA_SHAPES = ["scalar", "event", "series", "vector"] as const;
export type MetricDataShape = (typeof METRIC_DATA_SHAPES)[number];

export const OBSERVATION_REVIEW_STATUSES = ["raw", "validated", "reviewed", "invalidated"] as const;
export type ObservationReviewStatus = (typeof OBSERVATION_REVIEW_STATUSES)[number];

export const OPERATIONAL_ACTION_CLASSES = [
  "none",
  "repeat_quality_check",
  "recovery_workload_review",
  "hydration_nutrition_review",
  "exercise_review",
  "environmental_review",
  "medical_escalation",
] as const;
export type OperationalActionClass = (typeof OPERATIONAL_ACTION_CLASSES)[number];

export const RELATION_EVIDENCE_LEVELS = ["supported", "limited", "uncertain", "research_only"] as const;
export type RelationEvidenceLevel = (typeof RELATION_EVIDENCE_LEVELS)[number];

export interface ScientificMatrixRef {
  workbookVersion: "1.1";
  sheet: "01_BIOMARKER_MATRIX" | "02_LIVE_SIGNALS" | "03_FUNCTIONAL_COGNITIVE" | "04_ENV_RADIATION";
  rowId: number;
}

export interface CanonicalMetricDefinition {
  code: string;
  displayName: string;
  domain: HealthSignalDomain;
  valueKind: ObservationValueKind;
  dataShape: MetricDataShape;
  canonicalUnit?: string;
  acceptedUnitAliases: string[];
  cadence: MeasurementCadenceClass;
  priority: MetricPriority;
  review: ScientificReviewDisposition;
  interpretationTier: InterpretationTier;
  personalBaseline: boolean;
  sourceTypes: SourceRef["sourceType"][];
  evidenceSourceIds: string[];
  matrixRef: ScientificMatrixRef;
  scientificBaselineVersion: "1.1";
  notes: string[];
}

export interface ObservationContext {
  tags: string[];
  completeness?: number;
  missingRequiredContext?: string[];
}

export interface ClinicalReferenceInterval {
  text?: string;
  lower?: number;
  upper?: number;
  unit?: string;
  assay?: string;
  population?: string;
  sourceId: string;
}

export interface MissionOperationalLimit {
  lower?: number;
  upper?: number;
  unit?: string;
  authority: string;
  sourceId: string;
  version: string;
}

export interface PersonalBaselineComparison {
  baselineVersion: string;
  expectedValue?: number;
  delta?: number;
  percentDelta?: number;
  standardizedDelta?: number;
  uncertainty?: number;
}

export interface ObservationUncertainty {
  measurement?: number;
  baseline?: number;
  modelConfidence?: number;
  notes?: string[];
}

export interface ObservationInterpretation {
  observationId: string;
  metricCode: string;
  personalBaseline?: PersonalBaselineComparison;
  referenceInterval?: ClinicalReferenceInterval;
  operationalLimit?: MissionOperationalLimit;
  relationId?: string;
  relationEvidenceLevel?: RelationEvidenceLevel;
  actionClass: OperationalActionClass;
  interpretationTier: InterpretationTier;
  uncertainty?: ObservationUncertainty;
  explanation: string[];
}

export interface CanonicalObservationDraft {
  id: string;
  mission: MissionContextRef;
  source: SourceRef;
  metricCode: string;
  value: ObservationValue;
  unit?: string;
  observedAt: string;
  effectiveStart?: string;
  effectiveEnd?: string;
  status: ObservationStatus;
  quality: DataQuality;
  provenance: Provenance;
  classification: DataClassification;
  tags: string[];
  context?: ObservationContext;
  reviewStatus?: ObservationReviewStatus;
}

export interface ObservationEnvelope {
  observation: CanonicalObservation;
  metricDefinitionVersion: string;
  interpretationTier: InterpretationTier;
  reviewStatus: ObservationReviewStatus;
  context: ObservationContext;
}

export interface RawSignalChunk {
  id: string;
  mission: MissionContextRef;
  source: SourceRef;
  metricCode: string;
  startedAt: string;
  endedAt: string;
  samplingRateHz: number;
  channelNames: string[];
  unit: string;
  samples: number[][];
  quality: DataQuality;
  provenance: Provenance;
  classification: DataClassification;
  context: ObservationContext;
}

export interface DomainSerializationResult<T> {
  valid: boolean;
  value?: T;
  issues: DomainValidationIssue[];
}
