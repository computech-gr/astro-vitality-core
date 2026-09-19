import type {
  CanonicalObservation,
  CanonicalObservationDraft,
  DomainValidationIssue,
  ObservationEnvelope,
  ObservationValue,
} from "./contracts";
import { getCanonicalMetric } from "./metric-registry";
import { normalizeNumericUnit } from "./units";
import { validateCanonicalObservation } from "./validation";

export type IngestionResult =
  | { ok: true; envelope: ObservationEnvelope }
  | { ok: false; issues: DomainValidationIssue[] };

function normalizedValue(draft: CanonicalObservationDraft): { value?: ObservationValue; unit?: string; method?: string; issues: DomainValidationIssue[] } {
  const metric = getCanonicalMetric(draft.metricCode);
  if (!metric) return { issues: [{ path: "metricCode", message: `Unknown canonical metric code: ${draft.metricCode}` }] };
  if (metric.dataShape === "series" || metric.dataShape === "vector") {
    return { issues: [{ path: "metricCode", message: `Metric ${metric.code} must use the raw-signal ingestion path` }] };
  }
  if (metric.valueKind !== "number") return { value: draft.value, issues: [] };
  if (typeof draft.value.number !== "number") return { issues: [{ path: "value", message: `Metric ${metric.code} requires a numeric value` }] };
  if (!draft.unit) return { issues: [{ path: "unit", message: `Metric ${metric.code} requires a source unit` }] };
  const result = normalizeNumericUnit(metric, draft.value.number, draft.unit);
  if (!result.valid || result.value === undefined || !result.unit) return { issues: result.issues };
  return {
    value: { number: result.value },
    unit: result.unit,
    ...(result.normalizationMethod ? { method: result.normalizationMethod } : {}),
    issues: [],
  };
}

export function ingestCanonicalObservation(draft: CanonicalObservationDraft): IngestionResult {
  const metricDefinition = getCanonicalMetric(draft.metricCode);
  if (!metricDefinition) return { ok: false, issues: [{ path: "metricCode", message: `Unknown canonical metric code: ${draft.metricCode}` }] };
  if (!metricDefinition.sourceTypes.includes(draft.source.sourceType)) {
    return { ok: false, issues: [{ path: "source.sourceType", message: `Source type ${draft.source.sourceType} is not approved for ${metricDefinition.code}` }] };
  }
  const normalized = normalizedValue(draft);
  if (normalized.issues.length || !normalized.value) return { ok: false, issues: normalized.issues };

  const provenance = {
    ...draft.provenance,
    ...(draft.unit ? { sourceUnit: draft.unit } : {}),
    ...(typeof draft.value.number === "number" ? { sourceNumericValue: draft.value.number } : {}),
    ...(normalized.method ? { normalizationMethod: normalized.method } : {}),
  };

  const metric = {
    code: metricDefinition.code,
    displayName: metricDefinition.displayName,
    domain: metricDefinition.domain,
    valueKind: metricDefinition.valueKind,
    ...(normalized.unit ? { unit: normalized.unit } : metricDefinition.canonicalUnit ? { unit: metricDefinition.canonicalUnit } : {}),
    ...(metricDefinition.canonicalUnit ? { unitSystem: "UCUM" as const } : {}),
  };

  const observation: CanonicalObservation = {
    id: draft.id,
    mission: draft.mission,
    source: draft.source,
    metric,
    value: normalized.value,
    observedAt: draft.observedAt,
    ...(draft.effectiveStart ? { effectiveStart: draft.effectiveStart } : {}),
    ...(draft.effectiveEnd ? { effectiveEnd: draft.effectiveEnd } : {}),
    status: draft.status,
    quality: draft.quality,
    provenance,
    classification: draft.classification,
    tags: draft.tags,
  };

  const validation = validateCanonicalObservation(observation);
  if (!validation.valid) return { ok: false, issues: validation.issues };

  return {
    ok: true,
    envelope: {
      observation,
      metricDefinitionVersion: metricDefinition.scientificBaselineVersion,
      interpretationTier: metricDefinition.interpretationTier,
      reviewStatus: draft.reviewStatus ?? "raw",
      context: draft.context ?? { tags: [] },
    },
  };
}
