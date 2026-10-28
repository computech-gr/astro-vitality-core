// P26 — Domain profiles for the shared measurement workflow.
// Each profile binds one validated, existing catalog to its own append-only
// source ID, event prefix and session key, so domains never co-mingle.
// Catalog approval states are read-only here and never promoted.
import { BONE_HEALTH_VARIABLES } from "@/domain/bone-health/catalog";
import { boneUnitSuggestions } from "@/domain/bone-health/unit-suggestions";
import proposedCatalog from "../../../data/scientific/p355-proposed-domain-catalog.v1.json";
import cardiovascularSource from "../../../data/scientific/cardiovascular-handbook.catalog.v1.json";

export type MeasurementDomainId = "bone" | "immune" | "cardiovascular" | "behavioral";
export interface MeasurementVariable { id: string; name: string }

export interface MeasurementProfile {
  domainId: MeasurementDomainId;
  title: string;
  /** Exact catalog ID prefix, e.g. "bone" for bone-001. */
  idPrefix: string;
  variables: readonly MeasurementVariable[];
  /** Append-only offline record source. Bone keeps its original P22.1 values. */
  sourceId: string;
  sourceVersion: string;
  eventPrefix: string;
  sessionKey: string;
  catalogStatusNote: string;
  csvExample: string;
  unitSuggestions(variableId: string): string[];
  /** P33: exact catalog-defined unit when the source catalog binds one (cardiovascular).
   * Null/undefined means the catalog defines no approved unit; reported units are
   * then preserved as-is and never converted. */
  catalogUnit?(variableId: string): string | null;
}

const cardiovascularUnits = new Map(
  cardiovascularSource.metrics.map((m) => [m.id, typeof m.unit === "string" ? m.unit.trim() : ""]),
);

export const BONE_MEASUREMENT_PROFILE: MeasurementProfile = {
  domainId: "bone",
  title: "Bone Health",
  idPrefix: "bone",
  variables: BONE_HEALTH_VARIABLES,
  sourceId: "p22.1-bone-health-manual",
  sourceVersion: "22.1",
  eventPrefix: "bone-health",
  sessionKey: "mitochondria.bone-import.synthetic.v1",
  catalogStatusNote: "Bone handbook mapping; clinical validation and thresholds are not established.",
  csvExample:
    "variable,value,unit,observed_at,source,specimen,assay_method,notes\nbone-001,0.42,ng/mL,2026-10-01T09:00:00Z,Demo Lab,serum,,synthetic example\nbone-009,48,ug/L,2026-10-01T09:00:00Z,Demo Lab,serum,,synthetic example",
  unitSuggestions: boneUnitSuggestions,
};

const draft = (domain: "immune" | "behavioral") =>
  proposedCatalog.entries.filter((e) => e.domain === domain).map((e) => ({ id: e.id, name: e.name }));

export const IMMUNE_MEASUREMENT_PROFILE: MeasurementProfile = {
  domainId: "immune",
  title: "Immune Health",
  idPrefix: "IMM",
  variables: draft("immune"),
  sourceId: "p26-immune-health-manual",
  sourceVersion: "26.1",
  eventPrefix: "immune-health",
  sessionKey: "mitochondria.immune-import.synthetic.v1",
  catalogStatusNote:
    "The owner reports Nikolas completed verbal scientific review. Formal signed per-entry reconciliation is not recorded. Recording a measurement is not clinical validation or approval.",
  csvExample:
    "variable,value,unit,observed_at,source,specimen,assay_method,notes\nIMM-001,6.1,10^9/L,2026-10-01T09:00:00Z,Demo Lab,whole blood,,synthetic example",
  unitSuggestions: () => [],
};

export const CARDIOVASCULAR_MEASUREMENT_PROFILE: MeasurementProfile = {
  domainId: "cardiovascular",
  title: "Cardiovascular Health",
  idPrefix: "cv",
  variables: cardiovascularSource.metrics.map((m) => ({ id: m.id, name: m.name })),
  sourceId: "p26-cardiovascular-health-manual",
  sourceVersion: "26.1",
  eventPrefix: "cardiovascular-health",
  sessionKey: "mitochondria.cardiovascular-import.synthetic.v1",
  catalogStatusNote:
    "The owner reports Nikolas completed verbal scientific review. Formal signed per-entry reconciliation is not recorded; no clinical validation or activation.",
  csvExample:
    "variable,value,unit,observed_at,source,specimen,assay_method,notes\ncv-001,62,bpm,2026-10-01T09:00:00Z,Demo Device,,,synthetic example",
  unitSuggestions: (id) => {
    const unit = cardiovascularUnits.get(id);
    return unit ? [unit] : [];
  },
  catalogUnit: (id) => cardiovascularUnits.get(id) || null,
};

export const BEHAVIORAL_MEASUREMENT_PROFILE: MeasurementProfile = {
  domainId: "behavioral",
  title: "Behavioral Health",
  idPrefix: "BSC",
  variables: draft("behavioral"),
  sourceId: "p26-behavioral-health-manual",
  sourceVersion: "26.1",
  eventPrefix: "behavioral-health",
  sessionKey: "mitochondria.behavioral-import.synthetic.v1",
  catalogStatusNote:
    "The owner reports Nikolas completed verbal scientific review. Formal signed per-entry reconciliation is not recorded. Recording a measurement is not clinical validation or approval.",
  csvExample:
    "variable,value,unit,observed_at,source,specimen,assay_method,notes\nBSC-001,6.5,h,2026-10-01T09:00:00Z,Demo Sleep Log,,,synthetic example",
  unitSuggestions: () => [],
};

export const MEASUREMENT_PROFILES: Record<MeasurementDomainId, MeasurementProfile> = {
  bone: BONE_MEASUREMENT_PROFILE,
  immune: IMMUNE_MEASUREMENT_PROFILE,
  cardiovascular: CARDIOVASCULAR_MEASUREMENT_PROFILE,
  behavioral: BEHAVIORAL_MEASUREMENT_PROFILE,
};

export const ALL_MEASUREMENT_SESSION_KEYS = Object.values(MEASUREMENT_PROFILES).map((p) => p.sessionKey);

export function catalogIdPattern(profile: MeasurementProfile, flags = "i"): RegExp {
  return new RegExp(`^(${profile.idPrefix}-\\d{3})\\s+(.+)$`, flags);
}
