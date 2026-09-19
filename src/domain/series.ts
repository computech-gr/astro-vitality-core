import type { DomainValidationIssue, DomainValidationResult, RawSignalChunk } from "./contracts";
import { getCanonicalMetric } from "./metric-registry";

const isIsoInstant = (value: string): boolean => Boolean(value) && !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);

export function validateRawSignalChunk(chunk: RawSignalChunk): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  const metric = getCanonicalMetric(chunk.metricCode);
  if (!metric) issues.push({ path: "metricCode", message: `Unknown canonical metric code: ${chunk.metricCode}` });
  else if (metric.dataShape !== "series" && metric.dataShape !== "vector") issues.push({ path: "metricCode", message: `Metric ${chunk.metricCode} is not registered for raw-series ingestion` });
  if (!chunk.id.trim()) issues.push({ path: "id", message: "Chunk id is required" });
  if (!chunk.mission.missionId.trim() || !chunk.mission.crewMemberId.trim()) issues.push({ path: "mission", message: "Mission and crew member ids are required" });
  if (!(chunk.samplingRateHz > 0)) issues.push({ path: "samplingRateHz", message: "Sampling rate must be positive" });
  if (!isIsoInstant(chunk.startedAt) || !isIsoInstant(chunk.endedAt)) issues.push({ path: "time", message: "Chunk timestamps must be ISO-8601 instants with timezone" });
  if (isIsoInstant(chunk.startedAt) && isIsoInstant(chunk.endedAt) && Date.parse(chunk.endedAt) < Date.parse(chunk.startedAt)) issues.push({ path: "endedAt", message: "Chunk end cannot precede start" });
  if (!chunk.channelNames.length) issues.push({ path: "channelNames", message: "At least one channel is required" });
  if (!chunk.samples.length) issues.push({ path: "samples", message: "At least one sample is required" });
  for (const [index, sample] of chunk.samples.entries()) {
    if (sample.length !== chunk.channelNames.length || sample.some((value) => !Number.isFinite(value))) issues.push({ path: `samples[${index}]`, message: "Each sample must contain one finite value per channel" });
  }
  return { valid: issues.length === 0, issues };
}
