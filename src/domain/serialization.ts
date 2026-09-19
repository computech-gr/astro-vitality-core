import type { DomainSerializationResult, ObservationEnvelope } from "./contracts";
import { getCanonicalMetric } from "./metric-registry";
import { validateCanonicalObservation, validateObservationEnvelope } from "./validation";

export function serializeObservationEnvelope(envelope: ObservationEnvelope): string {
  return JSON.stringify(envelope);
}

export function deserializeObservationEnvelope(payload: string): DomainSerializationResult<ObservationEnvelope> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { valid: false, issues: [{ path: "$", message: "Observation envelope is not valid JSON" }] };
  }
  if (!parsed || typeof parsed !== "object") return { valid: false, issues: [{ path: "$", message: "Observation envelope must be an object" }] };
  const envelope = parsed as ObservationEnvelope;
  const observationResult = validateCanonicalObservation(envelope.observation);
  const envelopeResult = validateObservationEnvelope(envelope);
  const metric = getCanonicalMetric(envelope.observation?.metric?.code ?? "");
  const issues = [...observationResult.issues, ...envelopeResult.issues];
  if (!metric) issues.push({ path: "observation.metric.code", message: "Observation metric is not present in the reviewed canonical registry" });
  if (issues.length) return { valid: false, issues };
  return { valid: true, value: envelope, issues: [] };
}
