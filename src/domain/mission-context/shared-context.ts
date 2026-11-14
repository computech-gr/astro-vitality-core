/**
 * P68 shared mission context: four environmental/physiological parameters shown
 * once, read-only, across all four health domains.
 *
 * - Reuses the existing telemetry/catalog codes (radiation.dose_rate,
 *   environment.co2, environment.temperature, phys.core_temperature); it adds no
 *   new biomarker definition. Non-core body temperature has no catalog code and
 *   stays a context-only reading.
 * - Exact closed unit lists only; no numeric conversion. A dose RATE is never
 *   a cumulative dose, and body temperature always carries its measurement site
 *   (core is never inferred from skin/oral/tympanic readings).
 * - Missing or unavailable parameters are reported as such; nothing is invented.
 * - Context never changes a domain's scientific review state and is never an
 *   interpretation, diagnosis or clinical conclusion.
 */
import type { HealthDomainId } from "@/domain/health-domains/registry";

export type SharedContextParameterId =
  | "radiation_dose_rate"
  | "cabin_co2"
  | "cabin_air_temperature"
  | "body_temperature";

export type ContextQualityLevel = "good" | "degraded" | "poor" | "unknown";

export const CORE_TEMPERATURE_SITES = ["core_ingestible", "rectal", "esophageal"] as const;
export const NON_CORE_TEMPERATURE_SITES = [
  "oral",
  "tympanic",
  "axillary",
  "temporal_artery",
  "skin",
] as const;
export type BodyTemperatureSite =
  | (typeof CORE_TEMPERATURE_SITES)[number]
  | (typeof NON_CORE_TEMPERATURE_SITES)[number];

export const BODY_TEMPERATURE_SITE_LABELS: Readonly<Record<BodyTemperatureSite, string>> = {
  core_ingestible: "Core (ingestible sensor)",
  rectal: "Core (rectal)",
  esophageal: "Core (esophageal)",
  oral: "Oral",
  tympanic: "Tympanic (ear)",
  axillary: "Axillary",
  temporal_artery: "Temporal artery",
  skin: "Skin surface",
};

export interface SharedContextParameter {
  id: SharedContextParameterId;
  label: string;
  /** Existing telemetry/catalog code; body temperature resolves per site. */
  metricCode: string | null;
  displayUnit: string;
  /** Exact accepted source spellings of the same unit (notation only). */
  acceptedUnits: readonly string[];
  note: string;
}

export const SHARED_CONTEXT_PARAMETERS: readonly SharedContextParameter[] = [
  {
    id: "radiation_dose_rate",
    label: "Ambient radiation dose rate",
    metricCode: "radiation.dose_rate",
    displayUnit: "µSv/h",
    acceptedUnits: ["µSv/h", "μSv/h", "uSv/h"],
    note: "Dose rate, not cumulative dose. Converting to mSv needs time integration and provenance.",
  },
  {
    id: "cabin_co2",
    label: "Cabin CO₂",
    metricCode: "environment.co2",
    displayUnit: "ppm",
    acceptedUnits: ["ppm"],
    note: "Cabin environment reading.",
  },
  {
    id: "cabin_air_temperature",
    label: "Cabin air temperature",
    metricCode: "environment.temperature",
    displayUnit: "°C",
    acceptedUnits: ["°C", "Cel", "degC"],
    note: "Cabin air, not body temperature.",
  },
  {
    id: "body_temperature",
    label: "Astronaut body temperature",
    metricCode: null,
    displayUnit: "°C",
    acceptedUnits: ["°C", "Cel", "degC"],
    note: "Always shown with its measurement site; core temperature is never inferred from other sites.",
  },
] as const;

const CUMULATIVE_DOSE_UNITS = ["mSv", "µSv", "μSv", "uSv", "Sv", "mGy", "µGy", "uGy", "Gy"];

export interface SharedContextReadingInput {
  id: string;
  parameterId: string;
  value: number | null;
  unit: string;
  observedAt: string;
  sourceId: string;
  sourceLabel?: string;
  quality: ContextQualityLevel;
  simulated: boolean;
  availability?: "available" | "unavailable";
  measurementSite?: string | null;
  measurementMethod?: string | null;
}

export interface SharedContextReading {
  id: string;
  parameterId: SharedContextParameterId;
  metricCode: string | null;
  value: number | null;
  unit: string;
  observedAt: string;
  sourceId: string;
  sourceLabel: string;
  quality: ContextQualityLevel;
  simulated: boolean;
  availability: "available" | "unavailable";
  measurementSite: BodyTemperatureSite | null;
  measurementMethod: string | null;
}

export type ValidationResult =
  | { ok: true; reading: SharedContextReading }
  | { ok: false; issues: string[] };

const QUALITY: readonly ContextQualityLevel[] = ["good", "degraded", "poor", "unknown"];
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

export function getSharedContextParameter(id: string): SharedContextParameter | undefined {
  return SHARED_CONTEXT_PARAMETERS.find((parameter) => parameter.id === id);
}

export function isCoreTemperatureSite(site: string): boolean {
  return (CORE_TEMPERATURE_SITES as readonly string[]).includes(site);
}

function isBodySite(site: string): site is BodyTemperatureSite {
  return (
    isCoreTemperatureSite(site) || (NON_CORE_TEMPERATURE_SITES as readonly string[]).includes(site)
  );
}

/** Validates one reading. Exact units only; never converts or infers. */
export function validateSharedContextReading(input: SharedContextReadingInput): ValidationResult {
  const issues: string[] = [];
  const parameter = getSharedContextParameter(input.parameterId);
  if (!parameter) return { ok: false, issues: [`Unknown shared context parameter ${input.parameterId}`] };
  const availability = input.availability ?? "available";
  const unit = input.unit.trim();
  if (!input.id.trim()) issues.push("Reading id is required");
  if (!input.sourceId.trim()) issues.push("Source is required");
  if (!ISO_INSTANT.test(input.observedAt) || Number.isNaN(Date.parse(input.observedAt)))
    issues.push("observedAt must be an ISO-8601 instant with a time zone");
  if (!QUALITY.includes(input.quality)) issues.push("Quality must be good, degraded, poor or unknown");
  if (typeof input.simulated !== "boolean") issues.push("Simulated flag is required");
  if (availability === "available") {
    if (input.value === null || !Number.isFinite(input.value)) issues.push("Available readings need a finite value");
  } else if (input.value !== null) {
    issues.push("Unavailable readings must not carry a value");
  }
  if (!parameter.acceptedUnits.includes(unit)) {
    if (parameter.id === "radiation_dose_rate" && CUMULATIVE_DOSE_UNITS.includes(unit))
      issues.push(`${unit} is a cumulative dose, not a dose rate; it is not converted`);
    else
      issues.push(
        `Unit ${input.unit} is not accepted for ${parameter.label}; expected ${parameter.displayUnit} (no conversion is applied)`,
      );
  }
  let site: BodyTemperatureSite | null = null;
  let metricCode = parameter.metricCode;
  if (parameter.id === "body_temperature") {
    const raw = (input.measurementSite ?? "").trim();
    if (!raw) issues.push("Body temperature requires a measurement site");
    else if (!isBodySite(raw)) issues.push(`Unknown body temperature site ${raw}`);
    else {
      site = raw;
      metricCode = isCoreTemperatureSite(raw) ? "phys.core_temperature" : null;
    }
  } else if (input.measurementSite) {
    issues.push("Measurement site applies only to body temperature");
  }
  const method = input.measurementMethod?.trim() || null;
  if (method && method.length > 120) issues.push("Measurement method must be 120 characters or fewer");
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    reading: {
      id: input.id.trim(),
      parameterId: parameter.id,
      metricCode,
      value: availability === "available" ? input.value : null,
      unit: parameter.displayUnit,
      observedAt: input.observedAt,
      sourceId: input.sourceId.trim(),
      sourceLabel: input.sourceLabel?.trim() || input.sourceId.trim(),
      quality: input.quality,
      simulated: input.simulated,
      availability,
      measurementSite: site,
      measurementMethod: method,
    },
  };
}

export type SharedContextStatus = "available" | "stale" | "unavailable" | "missing";

export interface SharedContextEntry {
  parameter: SharedContextParameter;
  status: SharedContextStatus;
  reading: SharedContextReading | null;
  notes: string[];
}

export interface SharedMissionContext {
  entries: readonly SharedContextEntry[];
  rejected: readonly { id: string; issues: string[] }[];
  /** Same mission/crew/time/source stored once. */
  duplicatesCollapsed: number;
}

export interface BuildOptions {
  /** ISO instant; when given with freshnessMs, older readings are marked stale. */
  now?: string;
  freshnessMs?: Partial<Record<SharedContextParameterId, number>>;
}

function entryNotes(parameter: SharedContextParameter, reading: SharedContextReading | null): string[] {
  const notes = [parameter.note];
  if (reading?.simulated) notes.push("Simulated reading — not live telemetry.");
  if (reading?.measurementSite === "skin")
    notes.push("Skin temperature is not core temperature.");
  else if (reading?.measurementSite && !isCoreTemperatureSite(reading.measurementSite))
    notes.push("Non-core site; not a core temperature.");
  if (reading && reading.quality !== "good") notes.push(`Source quality: ${reading.quality}.`);
  return notes;
}

/** One entry per parameter: latest valid reading, or an explicit missing state. */
export function buildSharedMissionContext(
  inputs: readonly SharedContextReadingInput[],
  options: BuildOptions = {},
): SharedMissionContext {
  const rejected: { id: string; issues: string[] }[] = [];
  const byKey = new Map<string, SharedContextReading>();
  const conflicted = new Set<string>();
  let duplicatesCollapsed = 0;
  for (const input of inputs) {
    const result = validateSharedContextReading(input);
    if (!result.ok) {
      rejected.push({ id: input.id, issues: result.issues });
      continue;
    }
    const r = result.reading;
    const key = `${r.parameterId}|${Date.parse(r.observedAt)}|${r.sourceId}`;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, r);
    else if (existing.value === r.value && existing.availability === r.availability && existing.measurementSite === r.measurementSite) duplicatesCollapsed += 1;
    else conflicted.add(key);
  }
  for (const key of conflicted) {
    const reading = byKey.get(key);
    byKey.delete(key);
    if (reading)
      rejected.push({ id: reading.id, issues: ["Conflicting readings for the same parameter, time and source"] });
  }
  const nowMs = options.now ? Date.parse(options.now) : Number.NaN;
  const entries = SHARED_CONTEXT_PARAMETERS.map((parameter): SharedContextEntry => {
    const candidates = [...byKey.values()]
      .filter((r) => r.parameterId === parameter.id)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.id.localeCompare(b.id));
    const reading = candidates[0] ?? null;
    let status: SharedContextStatus = "missing";
    if (reading) {
      status = reading.availability === "unavailable" ? "unavailable" : "available";
      const window = options.freshnessMs?.[parameter.id];
      if (status === "available" && window !== undefined && Number.isFinite(nowMs) && nowMs - Date.parse(reading.observedAt) > window)
        status = "stale";
    }
    return Object.freeze({ parameter, status, reading, notes: entryNotes(parameter, reading) });
  });
  return Object.freeze({ entries: Object.freeze(entries), rejected, duplicatesCollapsed });
}

export interface DomainContextProjection {
  domainId: HealthDomainId;
  entries: readonly SharedContextEntry[];
  interpretation: "context_only_no_interpretation";
  statement: string;
}

/** Read-only projection: the same entries in every domain, never interpreted. */
export function projectSharedContextIntoDomain(
  context: SharedMissionContext,
  domainId: HealthDomainId,
): DomainContextProjection {
  return Object.freeze({
    domainId,
    entries: context.entries,
    interpretation: "context_only_no_interpretation",
    statement:
      "Shared mission context, shown identically in all four health domains. It is not interpreted for this domain and does not change any scientific review status.",
  });
}

export function formatContextValue(entry: SharedContextEntry): string {
  if (!entry.reading || entry.reading.value === null) return "—";
  return `${entry.reading.value} ${entry.parameter.displayUnit}`;
}
