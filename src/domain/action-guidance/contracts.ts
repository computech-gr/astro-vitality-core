import type { HealthIntelligenceFinding } from "../health-intelligence";
import type { MissionContextRef } from "../contracts";

export const ACTION_SEVERITIES = ["info", "watch", "action", "escalate", "data_quality"] as const;
export type ActionSeverity = (typeof ACTION_SEVERITIES)[number];

export const GUIDANCE_ACTION_CLASSES = [
  "none",
  "repeat-quality-check",
  "recovery-workload-review",
  "hydration-nutrition-review",
  "exercise-review",
  "environmental-review",
  "medical-escalation",
] as const;
export type GuidanceActionClass = (typeof GUIDANCE_ACTION_CLASSES)[number];

export interface ProtocolStep {
  id: string;
  label: string;
  instruction: string;
  category: "verify" | "repeat" | "review" | "countermeasure_review" | "escalate";
}

export interface ProtocolDefinition {
  id: string;
  version: string;
  title: string;
  actionClass: GuidanceActionClass;
  purpose: string;
  steps: readonly ProtocolStep[];
  requiresAcknowledgement: boolean;
  authority: string;
  sourceIds: readonly string[];
  scientificBaselineVersion: "1.1";
  status: "reviewed_category" | "governed_trigger_required";
  safetyWording: readonly string[];
}

export interface ActionCard {
  id: string;
  mission: MissionContextRef;
  findingId: string;
  patternId: string;
  protocolId: string;
  protocolVersion: string;
  severity: ActionSeverity;
  actionClass: GuidanceActionClass;
  title: string;
  rationale: string[];
  steps: ProtocolStep[];
  evidenceIds: string[];
  uncertainty: string[];
  confounders: string[];
  requiresAcknowledgement: boolean;
  generatedAt: string;
  nonDiagnostic: true;
}

export interface ActionGuidancePlan {
  finding: HealthIntelligenceFinding;
  severity: ActionSeverity;
  actions: ActionCard[];
  blockedReasons: string[];
  escalationAvailableOnlyWithGovernedTrigger: true;
}

export interface GovernedEscalationTrigger {
  id: string;
  authority: string;
  version: string;
  reasonCode: string;
  findingId: string;
  activatedAt: string;
}

export const ACKNOWLEDGEMENT_STATES = ["acknowledged", "deferred", "escalated"] as const;
export type AcknowledgementState = (typeof ACKNOWLEDGEMENT_STATES)[number];

export interface ActionAcknowledgement {
  id: string;
  actionId: string;
  findingId: string;
  mission: MissionContextRef;
  actorId: string;
  state: AcknowledgementState;
  reasonCode?: string;
  acknowledgedAt: string;
  protocolId: string;
  protocolVersion: string;
}
