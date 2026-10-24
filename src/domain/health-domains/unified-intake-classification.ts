/** Research-only, deterministic document intake. Never makes clinical or approval decisions. */
import registry from "../../../data/scientific/p36-biomarker-source-registry.v1.json";
import { domainForMetric } from "./document-domain-projection";
import type { HealthDomainId } from "./registry";

export type IntakeClassification =
  | { status: "matched"; metricId: string; domain: HealthDomainId; originalLabel: string; originalUnit: string; reviewRequired: true }
  | { status: "unit_review_required"; candidateMetricIds: string[]; originalLabel: string; originalUnit: string; reviewRequired: true }
  | { status: "ambiguous"; candidateMetricIds: string[]; originalLabel: string; originalUnit: string; reviewRequired: true }
  | { status: "unclassified"; candidateMetricIds: []; originalLabel: string; originalUnit: string; reviewRequired: true };

const normalized = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

/** Exact label and unit only; never guesses synonyms, converts units or infers a diagnosis. */
export function classifyIntakeObservation(input: { label: string; unit: string }): IntakeClassification {
  const originalLabel = input.label.trim();
  const originalUnit = input.unit.trim();
  const sameName = registry.metrics.filter((metric) => normalized(metric.name) === normalized(originalLabel));
  const exact = sameName.filter((metric) => metric.originalUnit?.trim() && metric.originalUnit.trim() === originalUnit);
  const base = { originalLabel, originalUnit, reviewRequired: true as const };
  if (exact.length > 1) return { ...base, status: "ambiguous", candidateMetricIds: exact.map((m) => m.id) };
  if (exact.length === 1) {
    const domain = domainForMetric(exact[0]!.id);
    if (domain) return { ...base, status: "matched", metricId: exact[0]!.id, domain };
  }
  if (sameName.length > 0) return { ...base, status: "unit_review_required", candidateMetricIds: sameName.map((m) => m.id) };
  return { ...base, status: "unclassified", candidateMetricIds: [] };
}

export function classifyIntakeDocument(rows: readonly { label: string; unit: string }[]) {
  const observations = rows.map(classifyIntakeObservation);
  const domainCounts = { bone: 0, immune: 0, cardiovascular: 0, behavioral: 0 };
  for (const item of observations) if (item.status === "matched") domainCounts[item.domain] += 1;
  return { observations, domainCounts, requiresHumanReview: true as const, automaticallyApproved: false as const };
}
