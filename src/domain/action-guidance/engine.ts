import type { HealthIntelligenceFinding, IntelligencePatternDefinition } from "../health-intelligence";
import { REVIEWED_INTELLIGENCE_PATTERNS_V1_1 } from "../health-intelligence";
import type {
  ActionAcknowledgement,
  ActionCard,
  ActionGuidancePlan,
  ActionSeverity,
  AcknowledgementState,
  GovernedEscalationTrigger,
  GuidanceActionClass,
} from "./contracts";
import { getProtocolByActionClass } from "./protocols";

const PATTERN_ACTIONS: Readonly<Record<string, readonly GuidanceActionClass[]>> = {
  "sleep-fatigue-cognition-v1": ["repeat-quality-check", "recovery-workload-review"],
  "workload-recovery-autonomic-v1": ["repeat-quality-check", "recovery-workload-review"],
  "hydration-volume-orthostatic-v1": ["repeat-quality-check", "hydration-nutrition-review"],
  "co2-cognition-context-v1": ["repeat-quality-check", "environmental-review"],
  "bone-unloading-renal-stone-v1": ["hydration-nutrition-review", "exercise-review"],
  "microbiome-immune-research-v1": [],
};

function patternForFinding(finding: HealthIntelligenceFinding): IntelligencePatternDefinition | undefined {
  return REVIEWED_INTELLIGENCE_PATTERNS_V1_1.find((pattern) => pattern.id === finding.patternId);
}

function severityForFinding(finding: HealthIntelligenceFinding, pattern?: IntelligencePatternDefinition): ActionSeverity {
  if (finding.attention === "data_quality") return "data_quality";
  if (finding.attention === "research_only" || finding.attention === "information") return "info";
  if (pattern?.operationalStatus === "contextual_only") return "watch";
  return "action";
}

function buildActionCard(input: {
  finding: HealthIntelligenceFinding;
  actionClass: GuidanceActionClass;
  severity: ActionSeverity;
  generatedAt: string;
}): ActionCard | undefined {
  const protocol = getProtocolByActionClass(input.actionClass);
  if (!protocol || protocol.actionClass === "medical-escalation") return undefined;
  return {
    id: `action:${input.finding.id}:${protocol.id}`,
    mission: input.finding.mission,
    findingId: input.finding.id,
    patternId: input.finding.patternId,
    protocolId: protocol.id,
    protocolVersion: protocol.version,
    severity: input.severity,
    actionClass: protocol.actionClass,
    title: protocol.title,
    rationale: [
      ...input.finding.whyFlagged,
      ...protocol.safetyWording,
    ],
    steps: [...protocol.steps],
    evidenceIds: input.finding.contributingEvidence.map((item) => item.evidenceId),
    uncertainty: [...input.finding.uncertainty],
    confounders: [...input.finding.confounders],
    requiresAcknowledgement: protocol.requiresAcknowledgement,
    generatedAt: input.generatedAt,
    nonDiagnostic: true,
  };
}

export function createActionGuidancePlan(input: {
  finding: HealthIntelligenceFinding;
  generatedAt: string;
}): ActionGuidancePlan {
  const pattern = patternForFinding(input.finding);
  const severity = severityForFinding(input.finding, pattern);
  const blockedReasons: string[] = [];

  if (input.finding.attention === "research_only") {
    blockedReasons.push("Research-only findings cannot generate operational action guidance.");
  }
  if (input.finding.attention === "information") {
    blockedReasons.push("Information-only findings do not require an operational action.");
  }

  let actionClasses: readonly GuidanceActionClass[] = [];
  if (input.finding.attention === "data_quality") {
    actionClasses = ["repeat-quality-check"];
  } else if (blockedReasons.length === 0) {
    actionClasses = PATTERN_ACTIONS[input.finding.patternId] ?? [];
  }

  const actions = actionClasses
    .map((actionClass) => buildActionCard({ finding: input.finding, actionClass, severity, generatedAt: input.generatedAt }))
    .filter((action): action is ActionCard => Boolean(action));

  if (blockedReasons.length === 0 && actions.length === 0) {
    blockedReasons.push("No reviewed protocol category is mapped to this finding.");
  }

  return {
    finding: input.finding,
    severity,
    actions,
    blockedReasons,
    escalationAvailableOnlyWithGovernedTrigger: true,
  };
}

export function createGovernedEscalationAction(input: {
  finding: HealthIntelligenceFinding;
  trigger: GovernedEscalationTrigger;
  generatedAt: string;
}): ActionCard {
  if (input.trigger.findingId !== input.finding.id) {
    throw new Error("Escalation trigger does not belong to the supplied finding");
  }
  if (!input.trigger.authority.trim() || !input.trigger.version.trim() || !input.trigger.reasonCode.trim()) {
    throw new Error("Governed escalation trigger requires authority, version and reason code");
  }
  const protocol = getProtocolByActionClass("medical-escalation");
  if (!protocol) throw new Error("Medical escalation protocol is unavailable");
  return {
    id: `action:${input.finding.id}:${protocol.id}:${input.trigger.id}`,
    mission: input.finding.mission,
    findingId: input.finding.id,
    patternId: input.finding.patternId,
    protocolId: protocol.id,
    protocolVersion: protocol.version,
    severity: "escalate",
    actionClass: "medical-escalation",
    title: protocol.title,
    rationale: [
      `Governed trigger ${input.trigger.reasonCode} activated by ${input.trigger.authority} (${input.trigger.version}).`,
      ...input.finding.whyFlagged,
      ...protocol.safetyWording,
    ],
    steps: [...protocol.steps],
    evidenceIds: input.finding.contributingEvidence.map((item) => item.evidenceId),
    uncertainty: [...input.finding.uncertainty],
    confounders: [...input.finding.confounders],
    requiresAcknowledgement: true,
    generatedAt: input.generatedAt,
    nonDiagnostic: true,
  };
}

export function acknowledgeAction(input: {
  action: ActionCard;
  actorId: string;
  state: AcknowledgementState;
  acknowledgedAt: string;
  reasonCode?: string;
}): ActionAcknowledgement {
  if (!input.actorId.trim()) throw new Error("Acknowledgement actor is required");
  if (!Number.isFinite(Date.parse(input.acknowledgedAt))) throw new Error("Acknowledgement timestamp must be valid ISO-8601");
  return {
    id: `ack:${input.action.id}:${input.acknowledgedAt}`,
    actionId: input.action.id,
    findingId: input.action.findingId,
    mission: input.action.mission,
    actorId: input.actorId,
    state: input.state,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    acknowledgedAt: input.acknowledgedAt,
    protocolId: input.action.protocolId,
    protocolVersion: input.action.protocolVersion,
  };
}
