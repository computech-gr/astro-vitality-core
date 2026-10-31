import type { DataQualityLevel, HealthSignalDomain, MissionContextRef } from "../contracts";
import type { HealthDomainId } from "@/domain/health-domains/registry";
import { REVIEWED_INTELLIGENCE_PATTERNS_V1_1 } from "./patterns";

/** A read-only projection. Neither correlation nor successive values establish causation. */
export interface ScientificObservation {
  id: string;
  missionId: string;
  crewMemberId: string;
  metricCode: string;
  value: number;
  unit: string;
  observedAt: string;
  quality: DataQualityLevel;
  sourceId: string;
  location: "local" | "cloud";
  classification: string;
  /** P49: health module for handbook/catalog formats (absent for device envelopes). */
  healthDomain?: HealthDomainId;
  /** P49: catalog display name, exactly as catalogued. */
  metricLabel?: string;
  /** P49: declared stored provenance (synthetic/real); never inferred. */
  provenance?: "synthetic" | "real";
  /** P49: original document or source label as stored. */
  sourceLabel?: string;
  /** P49: stored payload format the observation was projected from. */
  format?: "scalar-envelope" | "unified-observation" | "domain-entry";
}
/** P49: an in-scope stored record that could not be charted, with the reason. */
export interface ScientificNonChartableRecord {
  recordId: string;
  format: "scalar-envelope" | "unified-observation" | "domain-entry" | "unrecognized";
  healthDomain?: HealthDomainId;
  metricCode?: string;
  reason: string;
}
export interface ScientificMetricSummary {
  metricCode: string;
  unit: string;
  count: number;
  latest: ScientificObservation;
  earliest: ScientificObservation;
  previous?: ScientificObservation;
  baseline?: {
    mean: number;
    count: number;
    start: string;
    end: string;
    status: "descriptive_only";
  };
  changeFromPrevious?: number;
  status: "quality_blocked" | "insufficient_history" | "descriptive_only";
}
export interface ScientificPatternCoverage {
  id: string;
  name: string;
  status: "research_only" | "insufficient_evidence" | "evidence_present_not_interpreted";
  observedRoles: string[];
  missingRoles: string[];
  sources: string[];
}
export interface ScientificEvidenceReport {
  mission: MissionContextRef;
  generatedAt: string;
  observations: ScientificObservation[];
  metrics: ScientificMetricSummary[];
  patterns: ScientificPatternCoverage[];
  warnings: string[];
  /** P49: in-scope records that could not be charted, reported separately. */
  nonChartable?: ScientificNonChartableRecord[];
}
const qualityLevels: readonly string[] = ["good", "degraded", "poor", "unknown"];
const domainFor = (code: string): HealthSignalDomain => {
  if (code.startsWith("sleep.")) return "sleep_circadian";
  if (code.startsWith("cognition.")) return "cognitive";
  if (code.startsWith("behavior.")) return "behavioral";
  if (code.startsWith("environment.")) return "environmental";
  if (code.startsWith("hydration.") || code.startsWith("nutrition.")) return "nutrition_hydration";
  if (code.startsWith("lab.")) return "laboratory";
  if (code.startsWith("mission.")) return "mission_context";
  if (code.startsWith("symptom.")) return "symptom_report";
  return "physiological";
};
export { domainFor as scientificMetricDomain };

export function buildScientificEvidenceReport(input: {
  mission: MissionContextRef;
  observations: readonly ScientificObservation[];
  generatedAt: string;
}): ScientificEvidenceReport {
  const { mission, generatedAt } = input;
  // Defense in depth: never evaluate a different crew member or mission.
  const unique = new Map<string, ScientificObservation>();
  for (const item of input.observations) {
    if (item.missionId !== mission.missionId || item.crewMemberId !== mission.crewMemberId)
      continue;
    if (
      !item.metricCode ||
      !item.unit ||
      !Number.isFinite(item.value) ||
      !Number.isFinite(Date.parse(item.observedAt))
    )
      continue;
    if (!qualityLevels.includes(item.quality)) continue;
    // Same encrypted event may be projected both from local and cloud stores.
    const prior = unique.get(item.id);
    if (!prior || (prior.location === "local" && item.location === "cloud"))
      unique.set(item.id, item);
  }
  const observations = [...unique.values()].sort(
    (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
  );
  const groups = new Map<string, ScientificObservation[]>();
  for (const item of observations) {
    const key = `${item.metricCode}\u0000${item.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const metrics: ScientificMetricSummary[] = [...groups.values()]
    .map((samples) => {
      const latest = samples[samples.length - 1]!; // groups always non-empty
      const previous = samples.length > 1 ? samples[samples.length - 2] : undefined;
      const usable = samples.filter((s) => s.quality === "good");
      // Strictly descriptive, not an approved personal baseline. Avoid including latest sample.
      const historical = usable.filter((s) => s.id !== latest.id);
      const baseline =
        historical.length >= 3 &&
        Date.parse(historical[historical.length - 1]!.observedAt) -
          Date.parse(historical[0]!.observedAt) >=
          86400000
          ? {
              mean: historical.reduce((sum, s) => sum + s.value, 0) / historical.length,
              count: historical.length,
              start: historical[0]!.observedAt,
              end: historical[historical.length - 1]!.observedAt,
              status: "descriptive_only" as const,
            }
          : undefined;
      return {
        metricCode: latest.metricCode,
        unit: latest.unit,
        count: samples.length,
        earliest: samples[0]!,
        latest,
        ...(previous ? { previous, changeFromPrevious: latest.value - previous.value } : {}),
        ...(baseline ? { baseline } : {}),
        status:
          latest.quality === "poor" || latest.quality === "unknown"
            ? ("quality_blocked" as const)
            : baseline
              ? ("descriptive_only" as const)
              : ("insufficient_history" as const),
      };
    })
    .sort((a, b) => a.metricCode.localeCompare(b.metricCode));
  const validCodes = new Set(
    observations
      .filter((o) => o.quality === "good" || o.quality === "degraded")
      .map((o) => o.metricCode),
  );
  const patterns: ScientificPatternCoverage[] = REVIEWED_INTELLIGENCE_PATTERNS_V1_1.map(
    (pattern) => {
      const observedRoles = pattern.roles
        .filter((role) => role.anyMetricCodes.some((code) => validCodes.has(code)))
        .map((role) => role.role);
      const missingRoles = pattern.roles
        .filter((role) => role.required && !observedRoles.includes(role.role))
        .map((role) => role.role);
      return {
        id: pattern.id,
        name: pattern.displayName,
        status:
          pattern.operationalStatus === "research_only"
            ? "research_only"
            : missingRoles.length
              ? "insufficient_evidence"
              : "evidence_present_not_interpreted",
        observedRoles,
        missingRoles,
        sources: [...pattern.sourceIds],
      };
    },
  );
  return {
    mission,
    generatedAt,
    observations,
    metrics,
    patterns,
    warnings: [
      "Observations are read-only and scoped to one signed-in crew member and mission.",
      "Historical means are descriptive only: no approved baseline policy, matched context, or clinical threshold is inferred.",
      "Pattern role coverage does not establish temporal coincidence, directional change, causation, diagnosis, or readiness.",
      "Research-only patterns remain disabled. No automatic action or prediction is generated.",
    ],
  };
}
