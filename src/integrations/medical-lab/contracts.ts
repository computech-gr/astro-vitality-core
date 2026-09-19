import type { DataQuality } from "../../domain";

export const LAB_IMPORT_FORMATS = ["fhir", "csv", "manual"] as const;
export type LabImportFormat = (typeof LAB_IMPORT_FORMATS)[number];

export interface LabSpecimenContext {
  specimenId?: string;
  specimenType?: string;
  collectedAt?: string;
  fasting?: boolean;
  notes?: string;
}

export interface LabReferenceIntervalInput {
  low?: number;
  high?: number;
  unit?: string;
  text?: string;
  source?: string;
}

export interface LabResultInput {
  resultId: string;
  metricCode: string;
  value: number;
  unit: string;
  observedAt: string;
  sourceSystem: string;
  importFormat: LabImportFormat;
  quality?: DataQuality;
  specimen?: LabSpecimenContext;
  assayMethod?: string;
  referenceInterval?: LabReferenceIntervalInput;
  notes?: string;
}

export interface LabImportContext {
  missionId: string;
  crewMemberId: string;
  ingestionId: string;
  classification: "synthetic" | "research" | "operational";
}

export interface LabImportIssue {
  path: string;
  message: string;
}

export type LabImportResult<T> = { ok: true; value: T } | { ok: false; issues: LabImportIssue[] };

export interface LabResultViewModel {
  resultId: string;
  metricCode: string;
  metricLabel: string;
  valueLabel: string;
  observedAt: string;
  specimenLabel: string;
  sourceLabel: string;
  provenanceLabel: string;
  reviewStatus: string;
}
