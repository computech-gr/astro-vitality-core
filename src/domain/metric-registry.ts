import type { CanonicalMetricDefinition } from "./contracts";
import { REVIEWED_MVP_METRICS } from "./catalog/reviewed-mvp-v1.1";

const metricMap = new Map<string, CanonicalMetricDefinition>();
for (const metric of REVIEWED_MVP_METRICS) {
  if (metricMap.has(metric.code)) throw new Error(`Duplicate canonical metric code: ${metric.code}`);
  metricMap.set(metric.code, metric);
}

export function listCanonicalMetrics(): readonly CanonicalMetricDefinition[] {
  return REVIEWED_MVP_METRICS;
}

export function getCanonicalMetric(code: string): CanonicalMetricDefinition | undefined {
  return metricMap.get(code);
}

export function requireCanonicalMetric(code: string): CanonicalMetricDefinition {
  const metric = getCanonicalMetric(code);
  if (!metric) throw new Error(`Unknown canonical metric code: ${code}`);
  return metric;
}

export function isOperationalMetric(code: string): boolean {
  return getCanonicalMetric(code)?.interpretationTier === "operational";
}
