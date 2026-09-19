import type { ConfidenceBreakdown, IntelligencePatternDefinition, PatternEvidenceInput } from "./contracts";

export function calculatePatternConfidence(
  pattern: IntelligencePatternDefinition,
  evidence: readonly PatternEvidenceInput[],
  missingRoles: readonly string[],
): ConfidenceBreakdown {
  const independentDomains = new Set(evidence.map((item) => item.domain)).size;
  const independentSources = new Set(evidence.flatMap((item) => item.sourceIds)).size;
  const highQualityEvidence = evidence.filter((item) => item.qualityLevel === "good").length;
  const degradedEvidence = evidence.filter((item) => item.qualityLevel !== "good").length;
  const missingContextCount = evidence.reduce((sum, item) => sum + item.missingContext.length, 0);
  const confounderCount = evidence.reduce((sum, item) => sum + item.confounders.length, 0);
  const uncertaintyReasons: string[] = [];

  let score = 0.35;
  score += Math.min(0.24, independentDomains * 0.08);
  score += Math.min(0.15, independentSources * 0.05);
  score += Math.min(0.16, highQualityEvidence * 0.04);
  score -= Math.min(0.24, degradedEvidence * 0.08);
  score -= Math.min(0.2, missingContextCount * 0.05);
  score -= Math.min(0.2, confounderCount * 0.04);
  score -= Math.min(0.24, missingRoles.length * 0.08);

  if (pattern.evidenceLevel === "limited") {
    score = Math.min(score, 0.69);
    uncertaintyReasons.push("The reviewed relationship has limited or conflicting evidence.");
  }
  if (pattern.operationalStatus === "contextual_only") {
    score = Math.min(score, 0.69);
    uncertaintyReasons.push("This pattern is contextual and must not be interpreted causally.");
  }
  if (pattern.operationalStatus === "research_only" || pattern.evidenceLevel === "research_only") {
    score = Math.min(score, 0.49);
    uncertaintyReasons.push("This relationship is Research Only and excluded from operational alerting.");
  }
  if (degradedEvidence) uncertaintyReasons.push(`${degradedEvidence} contributing signal(s) have degraded/poor/unknown quality.`);
  if (missingContextCount) uncertaintyReasons.push(`${missingContextCount} required/context item(s) are missing.`);
  if (confounderCount) uncertaintyReasons.push(`${confounderCount} active confounder(s) reduce interpretive confidence.`);
  if (missingRoles.length) uncertaintyReasons.push(`Missing evidence roles: ${missingRoles.join(", ")}.`);

  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  const level = score >= 0.75 ? "high" : score >= 0.5 ? "moderate" : "low";
  return {
    score,
    level,
    independentDomains,
    independentSources,
    highQualityEvidence,
    degradedEvidence,
    missingContextCount,
    confounderCount,
    uncertaintyReasons,
  };
}
