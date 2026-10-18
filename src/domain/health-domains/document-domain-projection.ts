/** P35.6: deterministic, read-only projection. Never infers from filenames, text, or unapproved catalogs. */
import registry from "../../../data/scientific/p36-biomarker-source-registry.v1.json";
import { HEALTH_DOMAINS, type HealthDomainId } from "./registry";

export const DOMAIN_LABELS: Record<HealthDomainId, string> = {
  bone: "Bone Health",
  immune: "Immune Changes",
  cardiovascular: "Cardiovascular Health",
  behavioral: "Behavioral Health",
};

type CandidateReference = { id: string; selected: boolean };
// Registry uses "bone_health"; health-domain IDs use "bone". Exact alias only, no guessing.
const REGISTRY_DOMAIN_ALIASES: Record<string, HealthDomainId> = { bone_health: "bone", cardiovascular: "cardiovascular" };
const metricDomains = new Map<string, HealthDomainId>(
  registry.metrics.flatMap((metric) => {
    const domain = REGISTRY_DOMAIN_ALIASES[metric.domain];
    return domain ? [[metric.id, domain] as const] : [];
  }),
);

export function domainForMetric(id: string): HealthDomainId | undefined {
  return metricDomains.get(id);
}

export function getDocumentDomainProjection(candidates: readonly CandidateReference[]) {
  return HEALTH_DOMAINS.map((domain) => {
    const matching = candidates.filter((candidate) => metricDomains.get(candidate.id) === domain.id);
    return {
      id: domain.id,
      path: domain.path,
      count: matching.length,
      selectedCount: matching.filter((candidate) => candidate.selected).length,
    };
  }).filter((domain) => domain.count > 0);
}

/** Advisory only: catalog names without approved units must never become reviewed candidates. */
export function getUnitPendingBoneHints(text: string): Array<{ id: string; name: string; excerpt: string }> {
  const lines = text.split(/\r?\n/).slice(0, 1000);
  const boneMetrics = registry.metrics.filter((metric) => metric.domain === "bone_health" && !metric.originalUnit?.trim());
  const hints: Array<{ id: string; name: string; excerpt: string }> = [];
  for (const line of lines) {
    if (line.length > 350 || /(?:reference|normal|interval|range|ref\.|[<>≤≥]|\d\s*[-–]\s*\d)/i.test(line)) continue;
    const match = /^\s*(.+?)\s*[:=]\s*[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)\s+([^\s;,|]+)\s*$/.exec(line);
    if (!match) continue;
    const matches = boneMetrics.filter((metric) => metric.name.trim().toLocaleLowerCase("en-US") === match[1]!.trim().toLocaleLowerCase("en-US"));
    if (matches.length !== 1) continue;
    hints.push({ id: matches[0]!.id, name: matches[0]!.name, excerpt: line });
    if (hints.length >= 50) break;
  }
  return hints;
}
