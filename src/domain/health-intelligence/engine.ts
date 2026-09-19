import type { MissionContextRef } from "../contracts";
import { calculatePatternConfidence } from "./confidence";
import type {
  HealthIntelligenceFinding,
  IntelligencePatternDefinition,
  PatternEvaluationResult,
  PatternEvidenceInput,
} from "./contracts";

function evidenceForRole(
  role: IntelligencePatternDefinition["roles"][number],
  evidence: readonly PatternEvidenceInput[],
) {
  return evidence.filter((item) => role.anyMetricCodes.includes(item.metricCode));
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function evaluateIntelligencePattern(input: {
  mission: MissionContextRef;
  pattern: IntelligencePatternDefinition;
  evidence: readonly PatternEvidenceInput[];
  evaluatedAt: string;
}): PatternEvaluationResult {
  const { mission, pattern, evidence, evaluatedAt } = input;
  if (pattern.operationalStatus === "research_only") {
    const confidence = calculatePatternConfidence(pattern, [], []);
    const finding: HealthIntelligenceFinding = {
      id: `finding:${pattern.id}:${evaluatedAt}`,
      mission,
      patternId: pattern.id,
      patternName: pattern.displayName,
      evaluatedAt,
      attention: "research_only",
      evidenceLevel: pattern.evidenceLevel,
      confidence,
      contributingEvidence: [],
      missingRoles: [],
      whatChanged: [],
      whyFlagged: [pattern.summary],
      missingData: [],
      confounders: [],
      uncertainty: confidence.uncertaintyReasons,
      interpretationGuardrails: [...pattern.interpretationGuardrails],
      sourceIds: [...pattern.sourceIds],
      scientificBaselineVersion: "1.1",
      nonDiagnostic: true,
    };
    return { matched: false, finding, reasons: ["research_only_pattern"] };
  }

  const matchedByRole = pattern.roles.map((role) => ({ role, evidence: evidenceForRole(role, evidence) }));
  const missingRoles = matchedByRole
    .filter(({ role, evidence: roleEvidence }) => role.required && roleEvidence.length === 0)
    .map(({ role }) => role.role);
  const contributingEvidence = unique(
    matchedByRole.flatMap(({ evidence: roleEvidence }) => roleEvidence.map((item) => item.evidenceId)),
  ).map((id) => evidence.find((item) => item.evidenceId === id)!)
    .filter(Boolean);

  const independentDomains = new Set(contributingEvidence.map((item) => item.domain)).size;
  const confidence = calculatePatternConfidence(pattern, contributingEvidence, missingRoles);
  const qualityBlocking = contributingEvidence.length > 0 && contributingEvidence.every((item) => item.qualityLevel === "poor" || item.qualityLevel === "unknown");
  const matched = missingRoles.length === 0 && independentDomains >= pattern.minimumIndependentDomains && !qualityBlocking;

  const attention: HealthIntelligenceFinding["attention"] = qualityBlocking
    ? "data_quality"
    : matched
      ? "review"
      : "information";
  const missingData = unique([
    ...missingRoles.map((role) => `Missing required pattern role: ${role}`),
    ...contributingEvidence.flatMap((item) => item.missingContext.map((context) => `Missing context: ${context}`)),
  ]);
  const confounders = unique(contributingEvidence.flatMap((item) => item.confounders));
  const whatChanged = contributingEvidence.map(
    (item) => `${item.metricCode}: ${item.direction.replaceAll("_", " ")} — ${item.explanation}`,
  );
  const whyFlagged = matched
    ? [
        pattern.summary,
        `${independentDomains} independent health/context domain(s) contributed within the evaluated evidence set.`,
      ]
    : [pattern.summary, "Evidence is incomplete or insufficient for a matched multi-signal pattern."];

  const finding: HealthIntelligenceFinding = {
    id: `finding:${pattern.id}:${evaluatedAt}`,
    mission,
    patternId: pattern.id,
    patternName: pattern.displayName,
    evaluatedAt,
    attention,
    evidenceLevel: pattern.evidenceLevel,
    confidence,
    contributingEvidence,
    missingRoles,
    whatChanged,
    whyFlagged,
    missingData,
    confounders,
    uncertainty: unique([
      ...confidence.uncertaintyReasons,
      ...(qualityBlocking ? ["All available contributing evidence is poor/unknown quality; health interpretation is suppressed."] : []),
    ]),
    interpretationGuardrails: [...pattern.interpretationGuardrails],
    sourceIds: [...pattern.sourceIds],
    scientificBaselineVersion: "1.1",
    nonDiagnostic: true,
  };
  return {
    matched,
    finding,
    reasons: matched ? [] : qualityBlocking ? ["data_quality_block"] : ["insufficient_pattern_evidence"],
  };
}

export function evaluateReviewedPatterns(input: {
  mission: MissionContextRef;
  patterns: readonly IntelligencePatternDefinition[];
  evidence: readonly PatternEvidenceInput[];
  evaluatedAt: string;
}): HealthIntelligenceFinding[] {
  return input.patterns.map((pattern) =>
    evaluateIntelligencePattern({
      mission: input.mission,
      pattern,
      evidence: input.evidence,
      evaluatedAt: input.evaluatedAt,
    }).finding,
  ).filter((finding): finding is HealthIntelligenceFinding => Boolean(finding));
}
