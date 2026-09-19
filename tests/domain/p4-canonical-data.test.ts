import { describe, expect, test } from "bun:test";

import {
  REVIEWED_MVP_METRICS,
  SCIENTIFIC_BASELINE_SHA256,
  deserializeObservationEnvelope,
  getCanonicalMetric,
  ingestCanonicalObservation,
  serializeObservationEnvelope,
  validateObservationInterpretation,
  validateRawSignalChunk,
  type CanonicalObservationDraft,
  type ObservationInterpretation,
  type RawSignalChunk,
} from "../../src/domain/index";

const baseDraft: CanonicalObservationDraft = {
  id: "obs-p4-synthetic-001",
  mission: { missionId: "mission-synthetic-001", crewMemberId: "crew-synthetic-001" },
  source: { sourceId: "wearable-synthetic-001", sourceType: "device", adapterId: "synthetic-adapter", adapterVersion: "1.0.0" },
  metricCode: "phys.heart_rate",
  value: { number: 72 },
  unit: "bpm",
  observedAt: "2026-09-19T12:00:00Z",
  status: "final",
  quality: { level: "good", score: 0.97, artifactFlags: [] },
  provenance: { kind: "raw", capturedAt: "2026-09-19T12:00:01Z", ingestionId: "ingestion-p4-001", inputObservationIds: [] },
  classification: "synthetic",
  tags: ["synthetic-test-fixture"],
  context: { tags: ["resting", "preflight-baseline"], completeness: 1 },
};

describe("P4 reviewed metric catalogue", () => {
  test("is traceable to the reviewed v1.1 scientific baseline", () => {
    expect(SCIENTIFIC_BASELINE_SHA256).toBe("ffed3a7f3afb844963900bd53cbb9edd74588f613c925d323fd58ded0cce7273");
    expect(REVIEWED_MVP_METRICS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(REVIEWED_MVP_METRICS.map((metric) => metric.code)).size).toBe(REVIEWED_MVP_METRICS.length);
    expect(REVIEWED_MVP_METRICS.every((metric) => metric.scientificBaselineVersion === "1.1")).toBe(true);
  });

  test("keeps absorbed dose and dose equivalent as distinct quantities", () => {
    expect(getCanonicalMetric("radiation.absorbed_dose")?.canonicalUnit).toBe("mGy");
    expect(getCanonicalMetric("radiation.dose_equivalent")?.canonicalUnit).toBe("mSv");
    expect(getCanonicalMetric("radiation.absorbed_dose")?.code).not.toBe(getCanonicalMetric("radiation.dose_equivalent")?.code);
  });
});

describe("P4 scalar ingestion and round trip", () => {
  test("normalizes aliases while preserving source provenance and quality", () => {
    const result = ingestCanonicalObservation(baseDraft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.observation.metric.unit).toBe("{beats}/min");
    expect(result.envelope.observation.value.number).toBe(72);
    expect(result.envelope.observation.provenance.sourceUnit).toBe("bpm");
    expect(result.envelope.observation.quality).toEqual(baseDraft.quality);

    const payload = serializeObservationEnvelope(result.envelope);
    const restored = deserializeObservationEnvelope(payload);
    expect(restored.valid).toBe(true);
    expect(restored.value?.observation.metric.unit).toBe("{beats}/min");
    expect(restored.value?.observation.quality).toEqual(baseDraft.quality);
    expect(restored.value?.context).toEqual(baseDraft.context);
  });

  test("rejects unknown metrics and series metrics on scalar ingestion", () => {
    expect(ingestCanonicalObservation({ ...baseDraft, metricCode: "unknown.metric" }).ok).toBe(false);
    expect(ingestCanonicalObservation({ ...baseDraft, metricCode: "phys.ecg_waveform", unit: "mV" }).ok).toBe(false);
  });

  test("converts only explicitly governed units", () => {
    const result = ingestCanonicalObservation({ ...baseDraft, metricCode: "environment.cabin_pressure", source: { sourceId: "cabin", sourceType: "environment" }, value: { number: 760 }, unit: "mmHg" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.observation.metric.unit).toBe("kPa");
    expect(result.envelope.observation.value.number).toBeCloseTo(101.325, 2);
  });

  test("refuses ungoverned analyte-specific conversions", () => {
    const result = ingestCanonicalObservation({ ...baseDraft, metricCode: "lab.glucose", source: { sourceId: "lab", sourceType: "laboratory" }, value: { number: 5 }, unit: "mmol/L" });
    expect(result.ok).toBe(false);
  });
});

describe("P4 series and interpretation safety", () => {
  test("validates an ECG waveform chunk with explicit channel and rate", () => {
    const chunk: RawSignalChunk = {
      id: "chunk-001",
      mission: baseDraft.mission,
      source: baseDraft.source,
      metricCode: "phys.ecg_waveform",
      startedAt: "2026-09-19T12:00:00Z",
      endedAt: "2026-09-19T12:00:00.008Z",
      samplingRateHz: 250,
      channelNames: ["lead-I"],
      unit: "mV",
      samples: [[0.1], [0.2], [0.15]],
      quality: baseDraft.quality,
      provenance: baseDraft.provenance,
      classification: "synthetic",
      context: { tags: ["resting"], completeness: 1 },
    };
    expect(validateRawSignalChunk(chunk)).toEqual({ valid: true, issues: [] });
  });

  test("keeps personal baseline, clinical interval and operational limit separate", () => {
    const interpretation: ObservationInterpretation = {
      observationId: "obs-1",
      metricCode: "lab.hemoglobin",
      personalBaseline: { baselineVersion: "baseline-1", expectedValue: 15, delta: -1 },
      referenceInterval: { lower: 13, upper: 17, unit: "g/dL", sourceId: "lab-reference-v1" },
      operationalLimit: { lower: 11, unit: "g/dL", authority: "mission-medical", sourceId: "flight-rule-demo", version: "1" },
      actionClass: "medical_escalation",
      interpretationTier: "operational",
      uncertainty: { modelConfidence: 0.8 },
      explanation: ["Synthetic separation-of-layers fixture"],
    };
    expect(validateObservationInterpretation(interpretation)).toEqual({ valid: true, issues: [] });
    expect(validateObservationInterpretation({ ...interpretation, interpretationTier: "research_only" }).valid).toBe(false);
  });
});
