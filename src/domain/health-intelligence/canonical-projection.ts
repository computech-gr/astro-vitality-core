/**
 * P49 — Read-only canonical observation projection.
 *
 * Projects already-stored, append-only mission records into chartable
 * ScientificObservation rows WITHOUT modifying the stored records. Supported
 * payload formats:
 *  - "scalar-envelope": live/device ObservationEnvelope rows (metric.code /
 *    metric.unit / value.number / quality.level). Behaviour is unchanged from
 *    the pre-P49 adapter.
 *  - "unified-observation": mitochondria.unified-observation.v1 envelopes
 *    from Unified Data Intake. Only reviewer-accepted, active rows are charted
 *    (isDomainReadable rule).
 *  - "domain-entry": handbook / manual-entry / document-import records saved by
 *    the four Health modules (Bone P22.1 and P26 Immune, Cardiovascular,
 *    Behavioral), stored as `{ entry, metricCode, schemaVersion, domain? }`.
 *
 * Original metric codes, units, timestamps, source IDs and provenance are
 * preserved exactly. No unit conversion, value invention, quality promotion,
 * thresholds or interpretation. Data quality is never inferred: handbook
 * formats carry no quality level, so they are reported as "unknown".
 * Every in-scope record that cannot be charted is returned with a reason.
 */
import type { HealthDomainId } from "@/domain/health-domains/registry";
import { MEASUREMENT_PROFILES, type MeasurementDomainId } from "@/domain/health-measurements/profiles";
import { UNIFIED_OBSERVATION_SCHEMA } from "./observation-envelope";
import type { ScientificObservation } from "./live-evidence";

export type ProjectionFormat = "scalar-envelope" | "unified-observation" | "domain-entry";

export interface ProjectableRecord {
  id: string;
  missionId: string;
  crewMemberId: string;
  kind: string;
  eventTimestamp: string;
  sourceId: string;
  classification: string;
  location: "local" | "cloud";
  payload?: unknown;
  /** Pre-P49 legacy summary fields (scalar envelopes). */
  metricCode?: string | undefined;
  value?: string | undefined;
  unit?: string | undefined;
  quality?: string | undefined;
}

export interface NonChartableRecord {
  recordId: string;
  format: ProjectionFormat | "unrecognized";
  healthDomain?: HealthDomainId;
  metricCode?: string;
  reason: string;
}

export interface CanonicalProjection {
  observations: ScientificObservation[];
  nonChartable: NonChartableRecord[];
  /** Records outside the requested mission/crew; never listed, only counted. */
  outOfScope: number;
}

const QUALITY_LEVELS = ["good", "degraded", "poor", "unknown"] as const;
const SAFE_DECIMAL = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
const DOMAIN_IDS: readonly MeasurementDomainId[] = ["bone", "immune", "cardiovascular", "behavioral"];

function obj(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
function instant(value: unknown): string | undefined {
  const s = text(value);
  return s && Number.isFinite(Date.parse(s)) ? s : undefined;
}
/** Plain decimal only; a single comma decimal separator is read as a point. */
export function parseReportedDecimal(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!SAFE_DECIMAL.test(s)) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function domainFromWord(word: unknown): MeasurementDomainId | undefined {
  const w = text(word)?.toLowerCase().replace(/-health$/, "");
  return DOMAIN_IDS.find((d) => d === w);
}
function domainFromEventPrefix(id: string): MeasurementDomainId | undefined {
  const prefix = id.split(":")[0];
  return DOMAIN_IDS.find((d) => MEASUREMENT_PROFILES[d].eventPrefix === prefix);
}
function catalogName(domain: MeasurementDomainId, metricId: string): string | undefined {
  return MEASUREMENT_PROFILES[domain].variables.find((v) => v.id === metricId)?.name;
}

interface Candidate {
  observation: ScientificObservation;
  innerId?: string;
  supersedesId?: string;
}

type Outcome = { candidate: Candidate } | { skip: NonChartableRecord } | { outOfScope: true };

function projectUnified(row: ProjectableRecord, o: Record<string, unknown>): Outcome {
  const base = { recordId: row.id, format: "unified-observation" as const };
  const metricId = text(o["metricId"]);
  const domain = domainFromWord(o["domain"]);
  const tag = {
    ...base,
    ...(domain ? { healthDomain: domain } : {}),
    ...(metricId ? { metricCode: metricId } : {}),
  };
  if (text(o["missionId"]) !== row.missionId || text(o["crewMemberId"]) !== row.crewMemberId)
    return { skip: { ...tag, reason: "Embedded mission/crew identity does not match the record scope" } };
  if (!domain) return { skip: { ...tag, reason: "Observation domain is not one of the four health modules" } };
  if (!metricId) return { skip: { ...tag, reason: "Missing catalog metric ID" } };
  const label = catalogName(domain, metricId);
  if (!label) return { skip: { ...tag, reason: "Metric ID is not in the domain catalog" } };
  if (o["status"] === "erroneous") return { skip: { ...tag, reason: "Marked erroneous" } };
  const quality = obj(o["quality"]);
  if (o["reviewState"] === "pending_review")
    return { skip: { ...tag, reason: "Awaiting human review in Medical Intake" } };
  if (o["reviewState"] !== "accepted" || quality?.["reviewerConfirmed"] !== true)
    return { skip: { ...tag, reason: "Not reviewer-accepted" } };
  const value = parseReportedDecimal(o["value"]);
  if (value === undefined) return { skip: { ...tag, reason: "Value is not a plain numeric measurement" } };
  const unit = text(o["originalUnit"]);
  if (!unit) return { skip: { ...tag, reason: "Missing reported unit" } };
  const observedAt = instant(o["observedAt"]);
  if (!observedAt) return { skip: { ...tag, reason: "Missing or invalid observation time" } };
  const provenance = o["provenance"] === "synthetic" || o["provenance"] === "real" ? o["provenance"] : undefined;
  if (!provenance) return { skip: { ...tag, reason: "Provenance is not declared synthetic or real" } };
  const source = obj(o["source"]);
  const sourceLabel = text(source?.["documentName"]) ?? text(source?.["label"]);
  const innerId = text(o["id"]);
  const supersedesId = text(o["supersedesId"]);
  return {
    candidate: {
      ...(innerId ? { innerId } : {}),
      ...(supersedesId ? { supersedesId } : {}),
      observation: {
        id: row.id,
        missionId: row.missionId,
        crewMemberId: row.crewMemberId,
        metricCode: metricId,
        value,
        unit,
        observedAt,
        quality: "unknown",
        sourceId: row.sourceId,
        location: row.location,
        classification: row.classification,
        healthDomain: domain,
        metricLabel: label,
        provenance,
        format: "unified-observation",
        ...(sourceLabel ? { sourceLabel } : {}),
      },
    },
  };
}

function projectEntry(row: ProjectableRecord, envelope: Record<string, unknown>, e: Record<string, unknown>): Outcome {
  const metricId = text(e["variableId"]) ?? text(envelope["metricCode"]);
  const base = { recordId: row.id, format: "domain-entry" as const, ...(metricId ? { metricCode: metricId } : {}) };
  if (text(e["missionId"]) !== row.missionId || text(e["crewMemberId"]) !== row.crewMemberId)
    return { skip: { ...base, reason: "Embedded mission/crew identity does not match the record scope" } };
  const fromPrefix = domainFromEventPrefix(row.id);
  const fromPayload = domainFromWord(envelope["domain"]);
  if (fromPrefix && fromPayload && fromPrefix !== fromPayload)
    return { skip: { ...base, reason: "Conflicting health domain markers" } };
  let domain = fromPrefix ?? fromPayload;
  if (!domain && metricId) {
    const matches = DOMAIN_IDS.filter((d) => catalogName(d, metricId));
    if (matches.length === 1) domain = matches[0];
  }
  if (!domain) return { skip: { ...base, reason: "Health domain cannot be determined" } };
  const tag = { ...base, healthDomain: domain };
  if (!metricId) return { skip: { ...tag, reason: "Missing catalog metric ID" } };
  if (text(envelope["metricCode"]) && text(envelope["metricCode"]) !== metricId)
    return { skip: { ...tag, reason: "Conflicting metric codes in record" } };
  const label = catalogName(domain, metricId);
  if (!label) return { skip: { ...tag, reason: "Metric ID is not in the domain catalog" } };
  if (e["status"] === "erroneous") return { skip: { ...tag, reason: "Marked erroneous" } };
  const value = typeof e["value"] === "number" && Number.isFinite(e["value"]) ? e["value"] : undefined;
  if (value === undefined) return { skip: { ...tag, reason: "Value is not a numeric measurement" } };
  const unit = text(e["unit"]);
  if (!unit) return { skip: { ...tag, reason: "Missing reported unit" } };
  const observedAt = instant(e["observedAt"]);
  if (!observedAt) return { skip: { ...tag, reason: "Missing or invalid observation time" } };
  const provenance = e["dataOrigin"] === "synthetic" || e["dataOrigin"] === "real" ? e["dataOrigin"] : undefined;
  if (!provenance) return { skip: { ...tag, reason: "Provenance is not declared synthetic or real" } };
  const sourceLabel = text(e["sourceLabel"]);
  const innerId = text(e["id"]);
  const supersedesId = text(e["supersedesId"]);
  return {
    candidate: {
      ...(innerId ? { innerId } : {}),
      ...(supersedesId ? { supersedesId } : {}),
      observation: {
        id: row.id,
        missionId: row.missionId,
        crewMemberId: row.crewMemberId,
        metricCode: metricId,
        value,
        unit,
        observedAt,
        quality: "unknown",
        sourceId: row.sourceId,
        location: row.location,
        classification: row.classification,
        healthDomain: domain,
        metricLabel: label,
        provenance,
        format: "domain-entry",
        ...(sourceLabel ? { sourceLabel } : {}),
      },
    },
  };
}

function projectLegacy(row: ProjectableRecord): Outcome {
  const base = { recordId: row.id, format: "scalar-envelope" as const, ...(row.metricCode ? { metricCode: row.metricCode } : {}) };
  if (row.kind !== "observation" && !row.metricCode)
    return { skip: { recordId: row.id, format: "unrecognized", reason: `Not a measurement (${row.kind.replaceAll("_", " ")})` } };
  if (!row.metricCode || !row.unit || !row.value)
    return { skip: { ...(row.metricCode ? base : { recordId: row.id, format: "unrecognized" as const }), reason: "No recognized metric, unit and value" } };
  const value = Number(row.value);
  if (!Number.isFinite(value)) return { skip: { ...base, reason: "Value is not numeric" } };
  const quality = row.quality ?? "unknown";
  if (!(QUALITY_LEVELS as readonly string[]).includes(quality))
    return { skip: { ...base, reason: "Unrecognized data quality level" } };
  if (!Number.isFinite(Date.parse(row.eventTimestamp)))
    return { skip: { ...base, reason: "Missing or invalid observation time" } };
  return {
    candidate: {
      observation: {
        id: row.id,
        missionId: row.missionId,
        crewMemberId: row.crewMemberId,
        metricCode: row.metricCode,
        value,
        unit: row.unit,
        observedAt: row.eventTimestamp,
        quality: quality as ScientificObservation["quality"],
        sourceId: row.sourceId,
        location: row.location,
        classification: row.classification,
        format: "scalar-envelope",
      },
    },
  };
}

function projectOne(row: ProjectableRecord): Outcome {
  const envelope = obj(row.payload);
  const unified = obj(envelope?.["observation"]);
  if (unified && unified["schema"] === UNIFIED_OBSERVATION_SCHEMA) return projectUnified(row, unified);
  const entry = obj(envelope?.["entry"]);
  if (envelope && entry && (text(entry["variableId"]) || text(envelope["metricCode"])))
    return projectEntry(row, envelope, entry);
  return projectLegacy(row);
}

function duplicateKey(o: ScientificObservation): string {
  const family = o.healthDomain ? `handbook:${o.healthDomain}` : `device:${o.sourceId}`;
  return [family, o.metricCode, o.unit.trim(), Date.parse(o.observedAt), o.value, o.provenance ?? o.classification].join("|");
}

/** Pure, deterministic and side-effect free. */
export function projectCanonicalObservations(
  records: readonly ProjectableRecord[],
  scope: { missionId: string; crewMemberId: string },
): CanonicalProjection {
  // Same stored record may appear in both local and cloud stores: prefer cloud.
  const byId = new Map<string, ProjectableRecord>();
  let outOfScope = 0;
  for (const r of records) {
    if (r.missionId !== scope.missionId || r.crewMemberId !== scope.crewMemberId) {
      outOfScope++;
      continue;
    }
    const prior = byId.get(r.id);
    if (!prior || (prior.location === "local" && r.location === "cloud")) byId.set(r.id, r);
  }
  const ordered = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const candidates: Candidate[] = [];
  const nonChartable: NonChartableRecord[] = [];
  for (const row of ordered) {
    const out = projectOne(row);
    if ("candidate" in out) candidates.push(out.candidate);
    else if ("skip" in out) nonChartable.push(out.skip);
  }
  // Append-only corrections: a non-erroneous correction supersedes its target.
  const superseded = new Map<string, string>();
  for (const c of candidates) if (c.supersedesId) superseded.set(c.supersedesId, c.observation.id);
  const seen = new Map<string, string>();
  const observations: ScientificObservation[] = [];
  for (const c of candidates) {
    const o = c.observation;
    const tag = {
      recordId: o.id,
      format: o.format ?? ("scalar-envelope" as const),
      metricCode: o.metricCode,
      ...(o.healthDomain ? { healthDomain: o.healthDomain } : {}),
    };
    const by = c.innerId ? superseded.get(c.innerId) : undefined;
    if (by) {
      nonChartable.push({ ...tag, reason: `Superseded by correction ${by}` });
      continue;
    }
    const key = duplicateKey(o);
    const first = seen.get(key);
    if (first) {
      nonChartable.push({ ...tag, reason: `Duplicate of record ${first} (same metric, unit, time, value and provenance)` });
      continue;
    }
    seen.set(key, o.id);
    observations.push(o);
  }
  return { observations, nonChartable, outOfScope };
}

export interface NonChartableGroup {
  metricCode?: string;
  healthDomain?: HealthDomainId;
  reason: string;
  count: number;
}
/** Presentation helper: identical (metric, module, reason) entries collapse to one line with a count. */
export function groupNonChartable(records: readonly NonChartableRecord[]): NonChartableGroup[] {
  const groups = new Map<string, NonChartableGroup>();
  for (const r of records) {
    const key = [r.metricCode ?? "", r.healthDomain ?? "", r.reason].join("\u0000");
    const g = groups.get(key);
    if (g) g.count++;
    else
      groups.set(key, {
        ...(r.metricCode ? { metricCode: r.metricCode } : {}),
        ...(r.healthDomain ? { healthDomain: r.healthDomain } : {}),
        reason: r.reason,
        count: 1,
      });
  }
  return [...groups.values()];
}
