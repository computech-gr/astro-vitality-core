import { getCanonicalMetric } from "../../domain";
import type { LabImportResult, LabResultInput } from "./contracts";

export interface ManualBiomarkerEntry {
  resultId: string;
  metricCode: string;
  value: number;
  unit: string;
  observedAt: string;
  sourceLabel: string;
  specimenType?: string;
  collectedAt?: string;
  assayMethod?: string;
  notes?: string;
}

export function createManualBiomarkerResult(
  entry: ManualBiomarkerEntry,
): LabImportResult<LabResultInput> {
  const metric = getCanonicalMetric(entry.metricCode);
  if (!metric)
    return {
      ok: false,
      issues: [{ path: "metricCode", message: `Unknown canonical metric: ${entry.metricCode}` }],
    };
  if (!metric.sourceTypes.includes("laboratory"))
    return {
      ok: false,
      issues: [
        {
          path: "metricCode",
          message: `${entry.metricCode} is not reviewed as a laboratory metric`,
        },
      ],
    };
  if (!Number.isFinite(entry.value))
    return { ok: false, issues: [{ path: "value", message: "Value must be finite" }] };
  if (!entry.sourceLabel.trim())
    return {
      ok: false,
      issues: [{ path: "sourceLabel", message: "Original laboratory/source label is required" }],
    };
  return {
    ok: true,
    value: {
      resultId: entry.resultId,
      metricCode: entry.metricCode,
      value: entry.value,
      unit: entry.unit,
      observedAt: entry.observedAt,
      sourceSystem: `manual:${entry.sourceLabel}`,
      importFormat: "manual",
      ...(entry.assayMethod ? { assayMethod: entry.assayMethod } : {}),
      ...(entry.specimenType || entry.collectedAt
        ? {
            specimen: {
              ...(entry.specimenType ? { specimenType: entry.specimenType } : {}),
              ...(entry.collectedAt ? { collectedAt: entry.collectedAt } : {}),
            },
          }
        : {}),
      ...(entry.notes ? { notes: entry.notes } : {}),
    },
  };
}
