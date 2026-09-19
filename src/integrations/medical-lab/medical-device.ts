import type { CanonicalObservationDraft } from "../../domain";
import { getCanonicalMetric } from "../../domain";
import type { LabImportContext, LabImportIssue, LabImportResult } from "./contracts";

export interface MedicalDeviceReading {
  readingId: string;
  metricCode: "phys.spo2" | "phys.bp_systolic" | "phys.bp_diastolic";
  value: number;
  unit: string;
  observedAt: string;
  deviceId: string;
  manufacturer?: string;
  model?: string;
  qualityFlags?: string[];
}

export interface MedicalDeviceBridge {
  deviceId(): Promise<string>;
  displayName(): Promise<string>;
  supportedMetricCodes(): Promise<string[]>;
  read(signal?: AbortSignal): AsyncIterable<MedicalDeviceReading>;
}

export function medicalDeviceReadingToDraft(
  reading: MedicalDeviceReading,
  context: LabImportContext,
): LabImportResult<CanonicalObservationDraft> {
  const issues: LabImportIssue[] = [];
  const metric = getCanonicalMetric(reading.metricCode);
  if (!metric || !metric.sourceTypes.includes("device")) issues.push({ path: "metricCode", message: `${reading.metricCode} is not an approved device metric` });
  if (!Number.isFinite(reading.value)) issues.push({ path: "value", message: "Medical-device value must be finite" });
  if (!reading.unit.trim()) issues.push({ path: "unit", message: "Medical-device unit is required" });
  if (!Number.isFinite(Date.parse(reading.observedAt))) issues.push({ path: "observedAt", message: "observedAt must be ISO-8601 compatible" });
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      id: `medical-device:${reading.deviceId}:${reading.readingId}`,
      mission: { missionId: context.missionId, crewMemberId: context.crewMemberId },
      source: {
        sourceId: reading.deviceId,
        sourceType: "device",
        ...(reading.manufacturer ? { manufacturer: reading.manufacturer } : {}),
        ...(reading.model ? { model: reading.model } : {}),
        adapterId: "org.mitochondria.medical-device-bridge",
        adapterVersion: "1.0.0",
      },
      metricCode: reading.metricCode,
      value: { number: reading.value },
      unit: reading.unit,
      observedAt: reading.observedAt,
      status: "final",
      quality: {
        level: reading.qualityFlags?.length ? "questionable" : "good",
        artifactFlags: reading.qualityFlags ?? [],
      },
      provenance: {
        kind: "raw",
        capturedAt: reading.observedAt,
        ingestionId: context.ingestionId,
        inputObservationIds: [],
      },
      classification: context.classification,
      tags: ["medical-device"],
      context: { tags: [] },
    },
  };
}
