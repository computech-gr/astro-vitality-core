import {
  getCanonicalMetric,
  ingestCanonicalObservation,
  type CanonicalObservationDraft,
  type ObservationEnvelope,
} from "../../domain";
import type {
  LabImportContext,
  LabImportIssue,
  LabImportResult,
  LabResultInput,
  LabResultViewModel,
} from "./contracts";

const GOOD_LAB_QUALITY = { level: "good" as const, score: 1, artifactFlags: [] as string[] };

function validateLabInput(input: LabResultInput): LabImportIssue[] {
  const issues: LabImportIssue[] = [];
  const metric = getCanonicalMetric(input.metricCode);
  if (!metric) return [{ path: "metricCode", message: `Unknown canonical metric: ${input.metricCode}` }];
  if (!metric.sourceTypes.includes("laboratory")) {
    issues.push({ path: "metricCode", message: `${input.metricCode} is not approved for laboratory provenance` });
  }
  if (!Number.isFinite(input.value)) issues.push({ path: "value", message: "Laboratory value must be finite" });
  if (!input.unit.trim()) issues.push({ path: "unit", message: "Laboratory unit is required" });
  if (!Number.isFinite(Date.parse(input.observedAt))) issues.push({ path: "observedAt", message: "observedAt must be ISO-8601 compatible" });
  if (!input.sourceSystem.trim()) issues.push({ path: "sourceSystem", message: "sourceSystem is required for provenance" });
  return issues;
}

export function ingestLabResult(
  input: LabResultInput,
  context: LabImportContext,
): LabImportResult<ObservationEnvelope> {
  const issues = validateLabInput(input);
  if (issues.length) return { ok: false, issues };

  const draft: CanonicalObservationDraft = {
    id: `lab:${input.sourceSystem}:${input.resultId}`,
    mission: { missionId: context.missionId, crewMemberId: context.crewMemberId },
    source: {
      sourceId: `lab:${input.sourceSystem}`,
      sourceType: "laboratory",
      model: input.sourceSystem,
      adapterId: `org.mitochondria.lab.${input.importFormat}`,
      adapterVersion: "1.0.0",
    },
    metricCode: input.metricCode,
    value: { number: input.value },
    unit: input.unit,
    observedAt: input.observedAt,
    status: "final",
    quality: input.quality ?? GOOD_LAB_QUALITY,
    provenance: {
      kind: input.importFormat === "manual" ? "manual" : "raw",
      capturedAt: input.observedAt,
      ingestionId: context.ingestionId,
      inputObservationIds: [],
      ...(input.assayMethod ? { derivationMethod: input.assayMethod } : {}),
    },
    classification: context.classification,
    tags: [
      `lab-import:${input.importFormat}`,
      ...(input.specimen?.specimenType ? [`specimen:${input.specimen.specimenType}`] : []),
    ],
    context: {
      tags: [
        ...(input.specimen?.specimenId ? [`specimen-id:${input.specimen.specimenId}`] : []),
        ...(input.specimen?.fasting === true ? ["fasting:true"] : []),
        ...(input.specimen?.fasting === false ? ["fasting:false"] : []),
      ],
      notes: [
        ...(input.specimen?.collectedAt ? [`specimen-collected-at:${input.specimen.collectedAt}`] : []),
        ...(input.referenceInterval?.text ? [`reference-interval:${input.referenceInterval.text}`] : []),
        ...(input.referenceInterval?.source ? [`reference-source:${input.referenceInterval.source}`] : []),
        ...(input.notes ? [input.notes] : []),
      ].join(" | ") || undefined,
    },
  };

  const ingested = ingestCanonicalObservation(draft);
  return ingested.ok
    ? { ok: true, value: ingested.envelope }
    : { ok: false, issues: ingested.issues.map((issue) => ({ path: issue.path, message: issue.message })) };
}

export function labResultViewModel(input: LabResultInput): LabImportResult<LabResultViewModel> {
  const metric = getCanonicalMetric(input.metricCode);
  if (!metric) return { ok: false, issues: [{ path: "metricCode", message: `Unknown canonical metric: ${input.metricCode}` }] };
  const issues = validateLabInput(input);
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      resultId: input.resultId,
      metricCode: metric.code,
      metricLabel: metric.displayName,
      valueLabel: `${input.value} ${input.unit}`,
      observedAt: input.observedAt,
      specimenLabel: input.specimen?.specimenType ?? "Not specified",
      sourceLabel: input.sourceSystem,
      provenanceLabel: `${input.importFormat.toUpperCase()} · ${input.assayMethod ?? "method not specified"}`,
      reviewStatus: metric.review,
    },
  };
}
