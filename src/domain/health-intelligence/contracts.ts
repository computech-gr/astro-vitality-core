import type {
  DataQualityLevel,
  HealthSignalDomain,
  MissionContextRef,
  RelationEvidenceLevel,
} from "../contracts";

export const INTELLIGENCE_ATTENTION_STATES = [
  "information",
  "review",
  "data_quality",
  "research_only",
] as const;
export type IntelligenceAttentionState = (typeof INTELLIGENCE_ATTENTION_STATES)[number];

export const EVIDENCE_DIRECTIONS = [
  "higher_than_baseline",
  "lower_than_baseline",
  "worsening_trend",
  "improving_trend",
  "changed_from_baseline",
  "context_present",
] as const;
export type EvidenceDirection = (typeof EVIDENCE_DIRECTIONS)[number];

export interface TrendDetectionPolicy {
  id: string;
  metricCode: string;
  windowMs: number;
  minimumSamples: number;
  minimumConsecutive: number;
  standardizedDeltaMagnitude?: number;
  percentDeltaMagnitude?: number;
  acceptedQualityLevels: DataQualityLevel[];
  requiredContextTags: string[];
  algorithmVersion: string;
  authority: string;
}

export interface TrendSample {
  observationId: string;
  metricCode: string;
  observedAt: string;
  qualityLevel: DataQualityLevel;
  sourceId: string;
  domain: HealthSignalDomain;
  contextTags: string[];
  standardizedDelta?: number;
  percentDelta?: number;
}

export interface TrendEvidence {
  evidenceId: string;
  metricCode: string;
  observationIds: string[];
  sourceIds: string[];
  domain: HealthSignalDomain;
  direction: EvidenceDirection;
  windowStart: string;
  windowEnd: string;
  qualityLevel: DataQualityLevel;
  magnitude?: number;
  policyId: string;
  policyAuthority: string;
  explanation: string;
}

export interface PatternSignalRole {
  role: string;
  anyMetricCodes: readonly string[];
  required: boolean;
  independentDomain?: HealthSignalDomain;
}

export interface IntelligencePatternDefinition {
  id: string;
  displayName: string;
  summary: string;
  evidenceLevel: RelationEvidenceLevel;
  roles: readonly PatternSignalRole[];
  minimumIndependentDomains: number;
  sourceIds: readonly string[];
  scientificBaselineVersion: "1.1";
  operationalStatus: "reviewed_non_diagnostic" | "contextual_only" | "research_only";
  interpretationGuardrails: readonly string[];
}

export interface PatternEvidenceInput {
  evidenceId: string;
  metricCode: string;
  observationIds: string[];
  sourceIds: string[];
  domain: HealthSignalDomain;
  direction: EvidenceDirection;
  observedAt: string;
  qualityLevel: DataQualityLevel;
  qualityScore?: number;
  contextTags: string[];
  missingContext: string[];
  confounders: string[];
  explanation: string;
}

export interface ConfidenceBreakdown {
  score: number;
  level: "low" | "moderate" | "high";
  independentDomains: number;
  independentSources: number;
  highQualityEvidence: number;
  degradedEvidence: number;
  missingContextCount: number;
  confounderCount: number;
  uncertaintyReasons: string[];
}

export interface HealthIntelligenceFinding {
  id: string;
  mission: MissionContextRef;
  patternId: string;
  patternName: string;
  evaluatedAt: string;
  attention: IntelligenceAttentionState;
  evidenceLevel: RelationEvidenceLevel;
  confidence: ConfidenceBreakdown;
  contributingEvidence: PatternEvidenceInput[];
  missingRoles: string[];
  whatChanged: string[];
  whyFlagged: string[];
  missingData: string[];
  confounders: string[];
  uncertainty: string[];
  interpretationGuardrails: string[];
  sourceIds: string[];
  scientificBaselineVersion: "1.1";
  nonDiagnostic: true;
}

export interface PatternEvaluationResult {
  matched: boolean;
  finding?: HealthIntelligenceFinding;
  reasons: string[];
}
