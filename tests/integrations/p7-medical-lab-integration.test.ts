import { describe, expect, test } from "bun:test";
import { ingestCanonicalObservation } from "../../src/domain";
import {
  createManualBiomarkerResult,
  ingestLabResult,
  labResultViewModel,
  medicalDeviceReadingToDraft,
  parseFhirLabResource,
  parseLabCsv,
} from "../../src/integrations/medical-lab";

const context = {
  missionId: "mission-synthetic-001",
  crewMemberId: "crew-synthetic-001",
  ingestionId: "p7-ingestion-001",
  classification: "synthetic" as const,
};

describe("P7 medical and laboratory integration", () => {
  test("CSV biomarker import round-trips through the P4 canonical ingestion boundary with provenance", () => {
    const parsed = parseLabCsv(
      "result_id,metric_code,value,unit,observed_at,specimen_id,specimen_type,assay_method\nr1,lab.hemoglobin,14.2,g/dL,2026-09-19T08:00:00Z,s1,blood,CBC analyzer",
      "synthetic-lab",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ingested = ingestLabResult(parsed.value[0]!, context);
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) return;
    expect(ingested.value.observation.metric.code).toBe("lab.hemoglobin");
    expect(ingested.value.observation.source.sourceType).toBe("laboratory");
    expect(ingested.value.observation.provenance.derivationMethod).toBe("CBC analyzer");
  });

  test("FHIR import is explicit-map and fail-closed instead of guessing clinical terminology", () => {
    const resource = {
      resourceType: "Observation",
      id: "obs-hgb-1",
      code: { coding: [{ system: "http://loinc.org", code: "synthetic-hgb-code" }] },
      valueQuantity: { value: 13.9, unit: "g/dL", code: "g/dL" },
      effectiveDateTime: "2026-09-19T08:00:00Z",
      specimen: { reference: "Specimen/s1", display: "blood" },
    };
    const rejected = parseFhirLabResource(resource, "synthetic-fhir", {});
    expect(rejected.ok).toBe(false);
    const mapped = parseFhirLabResource(resource, "synthetic-fhir", {
      "http://loinc.org|synthetic-hgb-code": "lab.hemoglobin",
    });
    expect(mapped.ok).toBe(true);
  });

  test("manual biomarker fallback preserves manual provenance and produces a visible provenance model", () => {
    const manual = createManualBiomarkerResult({
      resultId: "manual-ctx-1",
      metricCode: "lab.ctx",
      value: 410,
      unit: "ng/L",
      observedAt: "2026-09-19T08:00:00Z",
      sourceLabel: "Synthetic onboard assay",
      specimenType: "blood",
      assayMethod: "synthetic immunoassay",
    });
    expect(manual.ok).toBe(true);
    if (!manual.ok) return;
    const ingested = ingestLabResult(manual.value, context);
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) return;
    expect(ingested.value.observation.provenance.kind).toBe("manual");
    const view = labResultViewModel(manual.value);
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.value.metricLabel).toContain("CTX");
      expect(view.value.provenanceLabel).toContain("MANUAL");
      expect(view.value.sourceLabel).toContain("Synthetic onboard assay");
    }
  });

  test("SpO2 and blood-pressure medical-device readings normalize through the same canonical model", () => {
    const readings = [
      {
        readingId: "spo2-1",
        metricCode: "phys.spo2" as const,
        value: 98,
        unit: "%",
        observedAt: "2026-09-19T08:00:00Z",
        deviceId: "medical:spo2-1",
      },
      {
        readingId: "bp-s-1",
        metricCode: "phys.bp_systolic" as const,
        value: 118,
        unit: "mmHg",
        observedAt: "2026-09-19T08:01:00Z",
        deviceId: "medical:bp-1",
      },
      {
        readingId: "bp-d-1",
        metricCode: "phys.bp_diastolic" as const,
        value: 76,
        unit: "mmHg",
        observedAt: "2026-09-19T08:01:00Z",
        deviceId: "medical:bp-1",
      },
    ];
    const results = readings.map((reading) => medicalDeviceReadingToDraft(reading, context));
    for (const result of results) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const ingested = ingestCanonicalObservation(result.value);
      expect(ingested.ok).toBe(true);
      if (ingested.ok) expect(ingested.envelope.observation.source.sourceType).toBe("device");
    }
  });

  test("unreviewed laboratory metrics fail closed", () => {
    const manual = createManualBiomarkerResult({
      resultId: "bad-1",
      metricCode: "vendor.magic-biomarker",
      value: 42,
      unit: "1",
      observedAt: "2026-09-19T08:00:00Z",
      sourceLabel: "Unknown",
    });
    expect(manual.ok).toBe(false);
  });
});
