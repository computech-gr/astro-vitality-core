import type { CanonicalMetricDefinition, DomainValidationIssue } from "./contracts";

export interface UnitNormalizationResult {
  valid: boolean;
  value?: number;
  unit?: string;
  normalizationMethod?: string;
  issues: DomainValidationIssue[];
}

const alias = (unit: string): string => unit.trim().replaceAll("μ", "µ");

function convertPressureToKpa(value: number, unit: string): number | undefined {
  if (unit === "kPa") return value;
  if (unit === "mmHg" || unit === "mm[Hg]") return value * 0.133322368;
  return undefined;
}

export function normalizeNumericUnit(metric: CanonicalMetricDefinition, value: number, sourceUnit: string): UnitNormalizationResult {
  const issues: DomainValidationIssue[] = [];
  if (!Number.isFinite(value)) {
    return { valid: false, issues: [{ path: "value.number", message: "Numeric value must be finite" }] };
  }
  if (!metric.canonicalUnit) {
    return { valid: false, issues: [{ path: "unit", message: `Metric ${metric.code} does not define a canonical numeric unit` }] };
  }

  const unit = alias(sourceUnit);
  const accepted = metric.acceptedUnitAliases.map(alias);
  const canonical = alias(metric.canonicalUnit);

  if (unit === canonical) return { valid: true, value, unit: metric.canonicalUnit, normalizationMethod: "identity", issues };

  if (metric.code === "phys.core_temperature" || metric.code === "environment.temperature") {
    if (unit === "°C" || unit === "degC") return { valid: true, value, unit: metric.canonicalUnit, normalizationMethod: "celsius-alias", issues };
    if (unit === "°F" || unit === "degF") return { valid: true, value: (value - 32) * (5 / 9), unit: metric.canonicalUnit, normalizationMethod: "fahrenheit-to-celsius", issues };
  }

  if (metric.code === "environment.cabin_pressure" || metric.code === "environment.oxygen_partial_pressure") {
    const converted = convertPressureToKpa(value, unit);
    if (converted !== undefined) return { valid: true, value: converted, unit: metric.canonicalUnit, normalizationMethod: `${unit}-to-kPa`, issues };
  }

  const identityAliases = new Map<string, string>([
    ["bpm", "{beats}/min"],
    ["beats/min", "{beats}/min"],
    ["breaths/min", "{breaths}/min"],
    ["percent", "%"],
    ["mmHg", "mm[Hg]"],
    ["hours", "h"],
    ["minutes", "min"],
    ["lux", "lx"],
    ["uSv/h", "µSv/h"],
    ["kcal/day", "kcal/d"],
    ["g/day", "g/d"],
    ["mL/day", "mL/d"],
    ["ratio", "1"],
    ["scale", "1"],
    ["score", "1"],
    ["workload", "1"],
    ["0-10", "1"],
  ]);
  if (identityAliases.get(unit) === canonical) {
    return { valid: true, value, unit: metric.canonicalUnit, normalizationMethod: "unit-alias", issues };
  }

  if (accepted.includes(unit) && unit !== canonical) {
    return {
      valid: false,
      issues: [{ path: "unit", message: `Metric ${metric.code} accepts ${sourceUnit} as a source unit, but P4 has no scientifically governed conversion to ${metric.canonicalUnit}; normalize upstream with a metric-specific method` }],
    };
  }

  return { valid: false, issues: [{ path: "unit", message: `Unsupported unit ${sourceUnit} for metric ${metric.code}` }] };
}
