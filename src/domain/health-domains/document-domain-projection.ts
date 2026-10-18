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
const metricDomains = new Map<string, string>(registry.metrics.map((metric) => [metric.id, metric.domain]));

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
