import type { LabImportIssue, LabImportResult, LabResultInput } from "./contracts";

interface FhirCoding { system?: string; code?: string; display?: string }
interface FhirObservation {
  resourceType?: string;
  id?: string;
  status?: string;
  code?: { coding?: FhirCoding[]; text?: string };
  valueQuantity?: { value?: number; unit?: string; code?: string };
  effectiveDateTime?: string;
  issued?: string;
  specimen?: { reference?: string; display?: string };
  method?: { text?: string; coding?: FhirCoding[] };
  referenceRange?: { low?: { value?: number; unit?: string }; high?: { value?: number; unit?: string }; text?: string }[];
}
interface FhirBundle { resourceType?: string; entry?: { resource?: FhirObservation }[] }

export type FhirMetricMap = Record<string, string>;

function mappingKey(coding: FhirCoding): string | undefined {
  return coding.system && coding.code ? `${coding.system}|${coding.code}` : coding.code;
}

function parseObservation(
  observation: FhirObservation,
  sourceSystem: string,
  metricMap: FhirMetricMap,
  index: number,
): LabImportResult<LabResultInput> {
  const issues: LabImportIssue[] = [];
  const codings = observation.code?.coding ?? [];
  const mapped = codings.map(mappingKey).filter((key): key is string => Boolean(key)).find((key) => metricMap[key]);
  const metricCode = mapped ? metricMap[mapped] : undefined;
  if (!metricCode) issues.push({ path: `fhir.${index}.code`, message: "FHIR Observation code is not mapped to a reviewed canonical metric" });
  if (typeof observation.valueQuantity?.value !== "number") issues.push({ path: `fhir.${index}.valueQuantity.value`, message: "Numeric valueQuantity is required" });
  const unit = observation.valueQuantity?.code ?? observation.valueQuantity?.unit;
  if (!unit) issues.push({ path: `fhir.${index}.valueQuantity.unit`, message: "FHIR quantity unit/code is required" });
  const observedAt = observation.effectiveDateTime ?? observation.issued;
  if (!observedAt) issues.push({ path: `fhir.${index}.effectiveDateTime`, message: "FHIR observation time is required" });
  if (issues.length || !metricCode || typeof observation.valueQuantity?.value !== "number" || !unit || !observedAt) return { ok: false, issues };
  const range = observation.referenceRange?.[0];
  const rangeUnit = range?.low?.unit ?? range?.high?.unit;
  return {
    ok: true,
    value: {
      resultId: observation.id ?? `observation-${index}`,
      metricCode,
      value: observation.valueQuantity.value,
      unit,
      observedAt,
      sourceSystem,
      importFormat: "fhir",
      ...(observation.specimen
        ? { specimen: { ...(observation.specimen.reference ? { specimenId: observation.specimen.reference } : {}), ...(observation.specimen.display ? { specimenType: observation.specimen.display } : {}) } }
        : {}),
      ...(observation.method?.text ? { assayMethod: observation.method.text } : {}),
      ...(range
        ? {
            referenceInterval: {
              ...(typeof range.low?.value === "number" ? { low: range.low.value } : {}),
              ...(typeof range.high?.value === "number" ? { high: range.high.value } : {}),
              ...(range.low?.unit || range.high?.unit ? { unit: range.low?.unit ?? range.high?.unit } : {}),
              ...(range.text ? { text: range.text } : {}),
            },
          }
        : {}),
    },
  };
}

export function parseFhirLabResource(
  resource: FhirObservation | FhirBundle,
  sourceSystem: string,
  metricMap: FhirMetricMap,
): LabImportResult<LabResultInput[]> {
  const observations: FhirObservation[] = resource.resourceType === "Bundle"
    ? ((resource as FhirBundle).entry ?? []).map((entry) => entry.resource).filter((item): item is FhirObservation => item?.resourceType === "Observation")
    : resource.resourceType === "Observation"
      ? [resource as FhirObservation]
      : [];
  if (!observations.length) return { ok: false, issues: [{ path: "fhir.resourceType", message: "Expected a FHIR Observation or Bundle containing Observations" }] };
  const output: LabResultInput[] = [];
  const issues: LabImportIssue[] = [];
  observations.forEach((observation, index) => {
    const parsed = parseObservation(observation, sourceSystem, metricMap, index);
    if (parsed.ok) output.push(parsed.value);
    else issues.push(...parsed.issues);
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: output };
}
