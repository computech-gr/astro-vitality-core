export const VALIDATION_STATUSES = ["pass", "fail", "pending_human", "known_limitation"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const VALIDATION_METHODS = ["automated", "manual_browser", "hardware"] as const;
export type ValidationMethod = (typeof VALIDATION_METHODS)[number];

export const VALIDATION_AREAS = [
  "scientific_review",
  "scenario_review",
  "accessibility",
  "cognitive_load",
  "latency",
  "battery",
  "critical_workflow",
] as const;
export type ValidationArea = (typeof VALIDATION_AREAS)[number];

export interface ValidationCriterion {
  id: string;
  area: ValidationArea;
  title: string;
  method: ValidationMethod;
  critical: boolean;
  acceptance: string;
  source: string;
}

export interface ValidationEvidence {
  criterionId: string;
  status: ValidationStatus;
  checkedAt?: string;
  evidence?: string;
  measuredValue?: number;
  measuredUnit?: string;
  reviewer?: string;
}

export interface KnownLimitation {
  id: string;
  title: string;
  impact: "low" | "moderate" | "high";
  statement: string;
  mitigation: string;
  blocksCriticalWorkflow: boolean;
}

export interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  pendingHuman: number;
  knownLimitations: number;
  criticalFailures: string[];
  criticalPending: string[];
  readyForP18Closure: boolean;
}
