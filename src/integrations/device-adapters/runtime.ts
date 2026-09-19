import { getCanonicalMetric, ingestCanonicalObservation, validateRawSignalChunk, type ObservationEnvelope, type RawSignalChunk } from "../../domain";
import type { AdapterNormalizationContext, AdapterStreamItem, DeviceAdapter } from "./contracts";

export type AdapterIngestionResult =
  | { ok: true; kind: "observation"; value: ObservationEnvelope; cursor?: string }
  | { ok: true; kind: "series"; value: RawSignalChunk; cursor?: string }
  | { ok: false; issues: { path: string; message: string }[]; cursor?: string };

export function validateAdapterCapabilityMetric(metricCode: string): { valid: boolean; message?: string } {
  return getCanonicalMetric(metricCode)
    ? { valid: true }
    : { valid: false, message: `Adapter capability references unknown canonical metric: ${metricCode}` };
}

export function ingestAdapterItem(adapter: DeviceAdapter, item: AdapterStreamItem, context: AdapterNormalizationContext): AdapterIngestionResult {
  const normalized = adapter.normalize(item, context);
  const cursor = item.packet.cursor;

  if (item.kind === "series") {
    const validation = validateRawSignalChunk(normalized as RawSignalChunk);
    if (!validation.valid) return { ok: false, issues: validation.issues, ...(cursor ? { cursor } : {}) };
    return { ok: true, kind: "series", value: normalized as RawSignalChunk, ...(cursor ? { cursor } : {}) };
  }

  const result = ingestCanonicalObservation(normalized);
  if (!result.ok) return { ok: false, issues: result.issues, ...(cursor ? { cursor } : {}) };
  return { ok: true, kind: "observation", value: result.envelope, ...(cursor ? { cursor } : {}) };
}
