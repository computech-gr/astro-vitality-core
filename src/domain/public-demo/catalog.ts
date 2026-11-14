/**
 * P69/P71 public NASA live-demo synthetic catalog and deterministic seed.
 *
 * Every value is copied from the owner-approved P63 synthetic Alex Morgan
 * examination (2026-11-15) and its exact active demo parameter IDs/units. The
 * demo subject "Alex Morgan — Synthetic Astronaut" is a synthetic persona inside
 * each isolated demo workspace; it is not linked to the MITO_DEMO_2026 crew
 * record, to any real account, or to any person.
 *
 * The SQL seed in supabase/pending/20261114000000_p69_public_demo_workspaces.sql
 * must equal buildP69SeedDocument() byte-for-byte as JSON (enforced by tests).
 */
import type { HealthDomainId } from "@/domain/health-domains/registry";

export const P69_DEMO_MISSION_CODE = "NASA-DEMO-304-001";
export const P69_DEMO_SEED_VERSION = "p69-seed-v1";
export const P69_DEMO_CREW_SUBJECT = {
  id: "synthetic-alex-morgan",
  name: "Alex Morgan — Synthetic Astronaut",
} as const;

export interface P69CatalogEntry {
  metricId: string;
  label: string;
  unit: string;
  domain: HealthDomainId;
  seedValue: string;
}

export const P69_DEMO_CATALOG: readonly P69CatalogEntry[] = [
  { metricId: "demo:ubt-e1140df3", label: "Systolic blood pressure", unit: "mmHg", domain: "cardiovascular", seedValue: "118" },
  { metricId: "demo:ubt-5d16fcaf", label: "Diastolic blood pressure", unit: "mmHg", domain: "cardiovascular", seedValue: "76" },
  { metricId: "demo:ubt-f4b8be7b", label: "Respiratory rate", unit: "breaths/min", domain: "cardiovascular", seedValue: "14" },
  { metricId: "demo:ubt-12f6e490", label: "SpO2", unit: "%", domain: "cardiovascular", seedValue: "98" },
  { metricId: "demo:ubt-33eb23f7", label: "ECG QTc interval", unit: "ms", domain: "cardiovascular", seedValue: "412" },
  { metricId: "demo:ubt-5c1e9b1d", label: "Ejection fraction", unit: "%", domain: "cardiovascular", seedValue: "61" },
  { metricId: "demo:ubt-40eb55be", label: "Stroke volume", unit: "mL", domain: "cardiovascular", seedValue: "72" },
  { metricId: "demo:ubt-a65dfc7c", label: "NT-proBNP", unit: "pg/mL", domain: "cardiovascular", seedValue: "48" },
  { metricId: "demo:ubt-508e453f", label: "Troponin I", unit: "ng/L", domain: "cardiovascular", seedValue: "3" },
  { metricId: "demo:ubt-26a9a98e", label: "LDL cholesterol", unit: "mg/dL", domain: "cardiovascular", seedValue: "104" },
  { metricId: "demo:ubt-300b410b", label: "Neutrophils", unit: "%", domain: "immune", seedValue: "58" },
  { metricId: "demo:ubt-323bb129", label: "Lymphocytes", unit: "%", domain: "immune", seedValue: "31" },
  { metricId: "demo:ubt-b4f34c19", label: "Monocytes", unit: "%", domain: "immune", seedValue: "7" },
  { metricId: "demo:ubt-4000bbfc", label: "CD4/CD8 ratio", unit: "ratio", domain: "immune", seedValue: "1.8" },
  { metricId: "demo:ubt-c87840cb", label: "IgG", unit: "mg/dL", domain: "immune", seedValue: "1050" },
  { metricId: "demo:ubt-ead50a31", label: "IgA", unit: "mg/dL", domain: "immune", seedValue: "210" },
  { metricId: "demo:ubt-068660b8", label: "Complement C3", unit: "mg/dL", domain: "immune", seedValue: "118" },
  { metricId: "demo:ubt-91ab6b12", label: "Neopterin", unit: "nmol/L", domain: "immune", seedValue: "6.1" },
  { metricId: "demo:ubt-60942680", label: "Serum phosphate", unit: "mg/dL", domain: "bone", seedValue: "3.6" },
  { metricId: "demo:ubt-d71e8b4d", label: "Ionized Calcium", unit: "mmol/L", domain: "bone", seedValue: "1.22" },
  { metricId: "demo:ubt-7419a93b", label: "Serum albumin", unit: "g/dL", domain: "bone", seedValue: "4.3" },
  { metricId: "demo:ubt-12c22152", label: "Osteocalcin", unit: "ng/mL", domain: "bone", seedValue: "18" },
  { metricId: "demo:ubt-7d17696e", label: "Urinary Magnesium", unit: "mg/day", domain: "bone", seedValue: "110" },
  { metricId: "demo:ubt-da887734", label: "Urinary Citrate", unit: "mg/day", domain: "bone", seedValue: "640" },
  { metricId: "demo:ubt-14cbc5f0", label: "Urine pH", unit: "pH", domain: "bone", seedValue: "6.1" },
  { metricId: "demo:ubt-b4ce4929", label: "DXA femoral neck, T-score", unit: "SD", domain: "bone", seedValue: "-0.4" },
  { metricId: "demo:ubt-db1ff862", label: "Hydration intake", unit: "L/day", domain: "behavioral", seedValue: "2.4" },
  { metricId: "demo:ubt-dfd7c929", label: "Sedentary time", unit: "hours/day", domain: "behavioral", seedValue: "9.5" },
  { metricId: "demo:ubt-efe7e2fb", label: "Sleep efficiency", unit: "%", domain: "behavioral", seedValue: "88" },
  { metricId: "demo:ubt-c5a76e59", label: "Total sleep time, last night", unit: "h", domain: "behavioral", seedValue: "6.8" },
] as const;

export const P69_SCIENTIFIC_OUTCOMES = [
  "consistent_with_synthetic_reference",
  "requires_more_evidence",
  "outside_synthetic_reference",
] as const;
export const P69_MEDICAL_OUTCOMES = [
  "no_follow_up_needed",
  "follow_up_recommended",
  "repeat_measurement_requested",
] as const;

export const P69_SEED_CONTEXT = [
  {
    parameterId: "radiation_dose_rate",
    metricCode: "radiation.dose_rate",
    value: 17.2,
    unit: "uSv/h",
    observedAt: "2026-11-15T07:55:00Z",
    sourceId: "synthetic-habitat-dosimeter",
    sourceLabel: "Synthetic habitat dosimeter (seed)",
    sourceQuality: "good",
    measurementSite: null,
    measurementMethod: null,
  },
  {
    parameterId: "cabin_co2",
    metricCode: "environment.co2",
    value: 2600,
    unit: "ppm",
    observedAt: "2026-11-15T07:55:00Z",
    sourceId: "synthetic-cabin-gateway",
    sourceLabel: "Synthetic cabin environment gateway (seed)",
    sourceQuality: "good",
    measurementSite: null,
    measurementMethod: null,
  },
  {
    parameterId: "cabin_air_temperature",
    metricCode: "environment.temperature",
    value: 22.4,
    unit: "°C",
    observedAt: "2026-11-15T07:55:00Z",
    sourceId: "synthetic-cabin-gateway",
    sourceLabel: "Synthetic cabin environment gateway (seed)",
    sourceQuality: "good",
    measurementSite: null,
    measurementMethod: null,
  },
  {
    parameterId: "body_temperature",
    metricCode: null,
    value: 36.7,
    unit: "°C",
    observedAt: "2026-11-15T07:40:00Z",
    sourceId: "synthetic-crew-thermometer",
    sourceLabel: "Synthetic crew oral thermometer (seed)",
    sourceQuality: "good",
    measurementSite: "oral",
    measurementMethod: "Synthetic oral digital thermometer reading",
  },
] as const;

export const P69_SEED_NOTE_SCIENTIFIC =
  "Deterministic seed history: illustrative synthetic entry, not a human scientific review.";
export const P69_SEED_NOTE_MEDICAL =
  "Deterministic seed history: illustrative synthetic entry, not a human medical review.";

/** Canonical seed document mirrored as a JSON literal in the pending SQL. */
export function buildP69SeedDocument() {
  return {
    seedVersion: P69_DEMO_SEED_VERSION,
    missionCode: P69_DEMO_MISSION_CODE,
    crewSubject: { id: P69_DEMO_CREW_SUBJECT.id, name: P69_DEMO_CREW_SUBJECT.name },
    catalog: P69_DEMO_CATALOG.map(({ metricId, label, unit, domain }) => ({ metricId, label, unit, domain })),
    examinations: [
      {
        recordRef: "EXAM-0001",
        observedOn: "2026-11-15",
        sourceQuality: "good",
        sourceLabel: "Seed copy of the owner-approved P63 synthetic examination",
        measurements: P69_DEMO_CATALOG.map(({ metricId, seedValue, unit }) => ({
          metricId,
          value: seedValue,
          unit,
        })),
        scientific: { outcome: "consistent_with_synthetic_reference", note: P69_SEED_NOTE_SCIENTIFIC },
        medical: { outcome: "no_follow_up_needed", note: P69_SEED_NOTE_MEDICAL },
      },
    ],
    context: P69_SEED_CONTEXT.map((c) => ({ ...c })),
  };
}

export function getP69CatalogEntry(metricId: string): P69CatalogEntry | undefined {
  return P69_DEMO_CATALOG.find((entry) => entry.metricId === metricId);
}
