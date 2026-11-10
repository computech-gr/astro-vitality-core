/** Research-only, deterministic document intake. Never makes clinical or approval decisions. */
import registry from "../../../data/scientific/p36-biomarker-source-registry.v1.json";
import { domainForMetric } from "./document-domain-projection";
import type { HealthDomainId } from "./registry";

export type IntakeClassification =
  | {
      status: "matched";
      metricId: string;
      domain: HealthDomainId;
      originalLabel: string;
      originalUnit: string;
      reviewRequired: true;
      /**
       * P61.3: the reported unit (originalUnit, verbatim) is the catalog unit written in another notation
       * (closed typographic rules, synthetic demo only); saved records use catalogUnit. Never a conversion.
       */
      unitNotation?: { reportedUnit: string; catalogUnit: string; ruleIds: string[] } | undefined;
    }
  | {
      status: "unit_review_required";
      candidateMetricIds: string[];
      originalLabel: string;
      originalUnit: string;
      reviewRequired: true;
    }
  | {
      status: "ambiguous";
      candidateMetricIds: string[];
      originalLabel: string;
      originalUnit: string;
      reviewRequired: true;
    }
  | {
      status: "unclassified";
      candidateMetricIds: [];
      originalLabel: string;
      originalUnit: string;
      reviewRequired: true;
    };

const normalized = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

type RegistryMetric = (typeof registry.metrics)[number];
// Lookup indexes built once (same first-match / registry-order semantics as a linear scan).
const metricsById = new Map<string, RegistryMetric>();
const metricsByName = new Map<string, RegistryMetric[]>();
for (const metric of registry.metrics) {
  const id = normalized(metric.id);
  if (!metricsById.has(id)) metricsById.set(id, metric);
  const name = normalized(metric.name);
  const list = metricsByName.get(name) ?? [];
  list.push(metric);
  metricsByName.set(name, list);
}

/** Explicit reviewed aliases to existing P36 source-registry entries only.
 * Never infer a metric from a unit alone or convert values/units.
 * The P36 registry currently has no behavioral-domain entries.
 */
const reviewedAliases: Readonly<Record<string, { metricId: string; unit: string }>> = {
  "heart rate": { metricId: "cv-001", unit: "bpm" },
  "hrv rmssd": { metricId: "cv-027", unit: "ms" },
};

/** Exact catalog label/unit or explicitly reviewed alias; always requires review. */
export function classifyIntakeObservation(input: {
  label: string;
  unit: string;
}): IntakeClassification {
  const originalLabel = input.label.trim();
  const originalUnit = input.unit.trim();
  // Canonical IDs are unambiguous identifiers, but only a reviewed P36 unit may be saved.
  const byId = metricsById.get(normalized(originalLabel));
  if (byId) {
    const base = { originalLabel, originalUnit, reviewRequired: true as const };
    if (!byId.originalUnit?.trim() || byId.originalUnit.trim() !== originalUnit)
      return { ...base, status: "unit_review_required" as const, candidateMetricIds: [byId.id] };
    const domain = domainForMetric(byId.id);
    if (domain) return { ...base, status: "matched" as const, metricId: byId.id, domain };
    return { ...base, status: "unclassified" as const, candidateMetricIds: [] };
  }
  const alias = reviewedAliases[normalized(originalLabel)];
  const aliasMetric = alias && registry.metrics.find((metric) => metric.id === alias.metricId);
  const sameName = metricsByName.get(normalized(originalLabel)) ?? [];
  const exact = sameName.filter(
    (metric) => metric.originalUnit?.trim() && metric.originalUnit.trim() === originalUnit,
  );
  const base = { originalLabel, originalUnit, reviewRequired: true as const };
  if (alias && aliasMetric && aliasMetric.originalUnit === alias.unit) {
    if (originalUnit !== alias.unit)
      return { ...base, status: "unit_review_required", candidateMetricIds: [alias.metricId] };
    const domain = domainForMetric(alias.metricId);
    if (domain) return { ...base, status: "matched", metricId: alias.metricId, domain };
  }
  if (exact.length > 1)
    return { ...base, status: "ambiguous", candidateMetricIds: exact.map((m) => m.id) };
  if (exact.length === 1) {
    const domain = domainForMetric(exact[0]!.id);
    if (domain) return { ...base, status: "matched", metricId: exact[0]!.id, domain };
  }
  if (sameName.length > 0)
    return {
      ...base,
      status: "unit_review_required",
      candidateMetricIds: sameName.map((m) => m.id),
    };
  return { ...base, status: "unclassified", candidateMetricIds: [] };
}

export function classifyIntakeDocument(rows: readonly { label: string; unit: string }[]) {
  const observations = rows.map(classifyIntakeObservation);
  const domainCounts = { bone: 0, immune: 0, cardiovascular: 0, behavioral: 0 };
  for (const item of observations) if (item.status === "matched") domainCounts[item.domain] += 1;
  return {
    observations,
    domainCounts,
    requiresHumanReview: true as const,
    automaticallyApproved: false as const,
  };
}
