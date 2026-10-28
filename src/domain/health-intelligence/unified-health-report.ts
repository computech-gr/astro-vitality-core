/**
 * P28 — Unified health & device report read model.
 *
 * Pure, deterministic and read-only. Combines, for exactly one authorized
 * mission + crew + provenance scope:
 *   - the four health-module histories (Bone, Immune, Cardiovascular, Behavioral),
 *   - reviewer-accepted unified intake observations,
 *   - persisted scalar wearable/device observations from the offline store.
 *
 * Never invents metrics, values, units, timestamps, provenance or conclusions.
 * Records that cannot be safely normalized are listed with a truthful reason.
 * No diagnosis, thresholds, readiness score or risk classification is produced.
 */
import type { BoneHealthEntry } from "@/domain/bone-health/history";
import {
  MEASUREMENT_PROFILES,
  type MeasurementDomainId,
} from "@/domain/health-measurements/profiles";
import type { UnifiedObservation } from "./observation-envelope";
import { UNIFIED_OBSERVATION_SCHEMA } from "./observation-envelope";
import { getCanonicalMetric } from "@/domain/metric-registry";

export type ReportSourceBadge =
  | "bone"
  | "immune"
  | "cardiovascular"
  | "behavioral"
  | "wearable"
  | "device";
export const REPORT_SOURCE_BADGES: readonly ReportSourceBadge[] = [
  "bone",
  "immune",
  "cardiovascular",
  "behavioral",
  "wearable",
  "device",
];
export const REPORT_SOURCE_LABELS: Record<ReportSourceBadge, string> = {
  bone: "Bone",
  immune: "Immune",
  cardiovascular: "Cardiovascular",
  behavioral: "Behavioral",
  wearable: "Wearable",
  device: "Device",
};

export type Provenance = "synthetic" | "real";

export interface ReportScope {
  missionId: string;
  crewMemberId: string;
  provenance: Provenance;
}
export interface ReportFilters {
  /** Inclusive ISO instant or YYYY-MM-DD date (UTC). */
  from?: string;
  /** Inclusive ISO instant or YYYY-MM-DD date (UTC, whole day). */
  to?: string;
  sources?: readonly ReportSourceBadge[];
}

/** Minimal raw offline store record (decrypted, in-memory only). */
export interface RawOfflineRecord {
  id: string;
  kind: string;
  mission: { missionId: string; crewMemberId: string };
  eventTimestamp: string;
  createdAt: string;
  sourceId: string;
  payload: unknown;
}

export interface ReportRow {
  /** Original immutable record ID (entry / observation / device observation). */
  recordId: string;
  badge: ReportSourceBadge;
  metricId: string;
  metricLabel: string;
  /** Exactly as stored; no conversion. */
  value: string;
  unit: string;
  observedAt: string;
  provenance: Provenance;
  status: "included";
  sourceLabel: string;
  /** Store-level trace: store source ID and record origin. */
  evidence: string;
  qualityNote?: string;
}

export interface ReportExclusion {
  recordId: string;
  badge: ReportSourceBadge | "unclassified";
  category: "excluded" | "pending_review";
  reason: string;
}

export interface BadgeSummary {
  badge: ReportSourceBadge;
  included: number;
  pending: number;
  excluded: number;
  metrics: number;
  firstAt: string | null;
  lastAt: string | null;
  /** True when no included row exists — absence is never a negative finding. */
  missing: boolean;
}

export interface UnifiedHealthReport {
  scope: ReportScope;
  generatedAt: string;
  filters: { from: string | null; to: string | null; sources: ReportSourceBadge[] };
  rows: ReportRow[];
  exclusions: ReportExclusion[];
  summaries: BadgeSummary[];
  coverage: {
    included: number;
    pendingReview: number;
    excluded: number;
    duplicateProjections: number;
    outOfFilter: number;
    otherScopeIgnored: number;
    otherProvenanceIgnored: number;
    nonObservationMetadata: number;
  };
  limitations: string[];
}

export const UNIFIED_REPORT_LIMITATIONS: readonly string[] = [
  "Research-use-only. Not clinically validated. Not a medical diagnosis, risk classification, readiness score or treatment recommendation.",
  "Values and units are shown exactly as recorded; no unit conversion, reference range, threshold or trend inference is applied.",
  "A missing domain, metric or date is not a negative clinical finding. Records are not a complete medical history.",
  "Device and wearable rows appear only when a persisted scalar observation declares a canonical metric, value, unit, time, source, quality and explicit synthetic/real provenance.",
  "Human verification of a row is a data-entry confirmation, not scientific or clinical approval. Catalog review states are unchanged.",
  "Report contents stay in this browser; nothing is uploaded or synchronized by generating, printing or exporting the report.",
];

const WEARABLE_ADAPTERS = new Set([
  "org.mitochondria.web-bluetooth-heart-rate",
  "org.mitochondria.health-connect",
  "org.mitochondria.healthkit",
]);
const UNIFIED_SOURCE = "unified-intake";
const PROFILE_SOURCE_IDS = new Set(Object.values(MEASUREMENT_PROFILES).map((p) => p.sourceId));
const NON_HEALTH_DEVICE_DOMAINS = new Set(["environmental", "radiation"]);

const isInstant = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

function normalizeBound(value: string | undefined, end: boolean): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const t = Date.parse(`${trimmed}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(trimmed);
  return Number.isFinite(t) ? t : null;
}

/** Wearable vs device badge from declared adapter identity/tags only. */
export function deviceBadge(source: { adapterId?: string }, tags: readonly string[]): ReportSourceBadge {
  if (source.adapterId && WEARABLE_ADAPTERS.has(source.adapterId)) return "wearable";
  if (tags.includes("wearable") || tags.includes("source:wearable")) return "wearable";
  return "device";
}

/** Explicit declared provenance only. Unknown → null (never guessed). */
export function declaredDeviceProvenance(tags: readonly string[]): Provenance | null {
  const synthetic = tags.includes("synthetic:true") || tags.includes("provenance:synthetic");
  const real = tags.includes("provenance:real") || tags.includes("real:true");
  if (synthetic && real) return null;
  if (synthetic) return "synthetic";
  if (real) return "real";
  return null;
}

interface Candidate {
  row: ReportRow;
  dedupeKey: string;
}

function rowKey(r: ReportRow): string {
  const family = r.badge === "wearable" || r.badge === "device" ? "device" : r.badge;
  return [family, r.metricId, Date.parse(r.observedAt), r.value.trim().replace(",", "."), r.unit.trim(), r.provenance].join("|");
}

/** Domain module entries → rows / exclusions. Corrections collapse append-only. */
function fromDomainEntries(
  domain: MeasurementDomainId,
  entries: readonly BoneHealthEntry[],
  scope: ReportScope,
  out: { candidates: Candidate[]; exclusions: ReportExclusion[]; otherScope: number; otherProvenance: number },
) {
  const profile = MEASUREMENT_PROFILES[domain];
  const names = new Map(profile.variables.map((v) => [v.id, v.name]));
  const superseded = new Map<string, string>();
  for (const e of entries)
    if (e.supersedesId && e.status !== "erroneous") superseded.set(e.supersedesId, e.id);
  for (const e of entries) {
    if (e.missionId !== scope.missionId || e.crewMemberId !== scope.crewMemberId) {
      out.otherScope++;
      continue;
    }
    if (e.dataOrigin !== scope.provenance) {
      out.otherProvenance++;
      continue;
    }
    if (e.status === "erroneous") {
      out.exclusions.push({ recordId: e.id, badge: domain, category: "excluded", reason: `Marked erroneous${e.statusReason ? `: ${e.statusReason}` : ""}` });
      continue;
    }
    const by = superseded.get(e.id);
    if (by) {
      out.exclusions.push({ recordId: e.id, badge: domain, category: "excluded", reason: `Superseded by correction ${by}` });
      continue;
    }
    if (!names.has(e.variableId)) {
      out.exclusions.push({ recordId: e.id, badge: domain, category: "excluded", reason: "Variable is not in the domain catalog" });
      continue;
    }
    if (!Number.isFinite(e.value) || !e.unit.trim() || !isInstant(e.observedAt)) {
      out.exclusions.push({ recordId: e.id, badge: domain, category: "excluded", reason: "Missing value, unit or observation time" });
      continue;
    }
    const row: ReportRow = {
      recordId: e.id,
      badge: domain,
      metricId: e.variableId,
      metricLabel: names.get(e.variableId)!,
      value: String(e.value),
      unit: e.unit,
      observedAt: new Date(e.observedAt).toISOString(),
      provenance: e.dataOrigin,
      status: "included",
      sourceLabel: e.sourceLabel,
      evidence: `${profile.sourceId} · entry ${e.id}${e.supersedesId ? ` · corrects ${e.supersedesId}` : ""}`,
      ...(e.specimen || e.assayMethod
        ? { qualityNote: [e.specimen && `Specimen: ${e.specimen}`, e.assayMethod && `Method: ${e.assayMethod}`].filter(Boolean).join(" · ") }
        : {}),
    };
    out.candidates.push({ row, dedupeKey: rowKey(row) });
  }
}

const UNIFIED_BADGE: Record<string, ReportSourceBadge> = {
  bone: "bone",
  immune: "immune",
  cardiovascular: "cardiovascular",
  behavioral: "behavioral",
};

function fromUnified(
  observations: readonly UnifiedObservation[],
  scope: ReportScope,
  out: { candidates: Candidate[]; exclusions: ReportExclusion[]; otherScope: number; otherProvenance: number },
) {
  const superseded = new Map<string, string>();
  for (const o of observations)
    if (o.supersedesId && o.status !== "erroneous") superseded.set(o.supersedesId, o.id);
  for (const o of observations) {
    if (o.schema !== UNIFIED_OBSERVATION_SCHEMA) continue;
    if (o.missionId !== scope.missionId || o.crewMemberId !== scope.crewMemberId) {
      out.otherScope++;
      continue;
    }
    if (o.provenance !== scope.provenance) {
      out.otherProvenance++;
      continue;
    }
    const badge = UNIFIED_BADGE[o.domain];
    if (!badge) {
      out.exclusions.push({ recordId: o.id, badge: "unclassified", category: "excluded", reason: "Observation domain is not one of the four health modules" });
      continue;
    }
    if (o.status === "erroneous") {
      out.exclusions.push({ recordId: o.id, badge, category: "excluded", reason: `Marked erroneous${o.statusReason ? `: ${o.statusReason}` : ""}` });
      continue;
    }
    if (o.reviewState === "pending_review") {
      out.exclusions.push({ recordId: o.id, badge, category: "pending_review", reason: "Awaiting human review in Medical Intake" });
      continue;
    }
    if (o.reviewState !== "accepted" || !o.quality.reviewerConfirmed) {
      out.exclusions.push({ recordId: o.id, badge, category: "excluded", reason: "Rejected during human review" });
      continue;
    }
    const by = superseded.get(o.id);
    if (by) {
      out.exclusions.push({ recordId: o.id, badge, category: "excluded", reason: `Superseded by correction ${by}` });
      continue;
    }
    if (!o.originalUnit.trim() || !isInstant(o.observedAt)) {
      out.exclusions.push({ recordId: o.id, badge, category: "excluded", reason: "Missing unit or observation time" });
      continue;
    }
    const row: ReportRow = {
      recordId: o.id,
      badge,
      metricId: o.metricId,
      metricLabel: o.metricId,
      value: o.value.trim(),
      unit: o.originalUnit,
      observedAt: new Date(o.observedAt).toISOString(),
      provenance: o.provenance,
      status: "included",
      sourceLabel: o.source.label,
      evidence: `${UNIFIED_SOURCE} · ${o.source.kind}${o.source.documentSha256 ? ` · sha256 ${o.source.documentSha256.slice(0, 16)}…` : ""}${o.supersedesId ? ` · corrects ${o.supersedesId}` : ""}`,
    };
    out.candidates.push({ row, dedupeKey: rowKey(row) });
  }
}

interface DeviceEnvelopeLike {
  observation?: {
    id?: unknown;
    mission?: { missionId?: unknown; crewMemberId?: unknown };
    source?: { sourceId?: unknown; sourceType?: unknown; adapterId?: unknown; manufacturer?: unknown; model?: unknown };
    metric?: { code?: unknown; displayName?: unknown; domain?: unknown; valueKind?: unknown; unit?: unknown };
    value?: { number?: unknown };
    observedAt?: unknown;
    status?: unknown;
    quality?: { level?: unknown; artifactFlags?: unknown; notes?: unknown };
    tags?: unknown;
  };
  context?: { tags?: unknown };
  reviewStatus?: unknown;
  samples?: unknown;
}

const strTags = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : []);

/** Read-only adapter over persisted device/wearable records. */
function fromDeviceRecords(
  records: readonly RawOfflineRecord[],
  scope: ReportScope,
  out: { candidates: Candidate[]; exclusions: ReportExclusion[]; otherScope: number; otherProvenance: number; metadata: number },
) {
  for (const record of records) {
    if (record.sourceId === UNIFIED_SOURCE || PROFILE_SOURCE_IDS.has(record.sourceId)) continue;
    if (record.mission.missionId !== scope.missionId || record.mission.crewMemberId !== scope.crewMemberId) {
      out.otherScope++;
      continue;
    }
    if (record.kind !== "observation") {
      out.metadata++;
      continue;
    }
    const payload = (record.payload ?? {}) as DeviceEnvelopeLike;
    if (Array.isArray(payload.samples)) {
      out.exclusions.push({ recordId: record.id, badge: "unclassified", category: "excluded", reason: "Raw/series signal data is not a scalar observation" });
      continue;
    }
    const o = payload.observation;
    if (!o || typeof o !== "object") {
      out.exclusions.push({ recordId: record.id, badge: "unclassified", category: "excluded", reason: "Unrecognized device record format" });
      continue;
    }
    const tags = [...strTags(o.tags), ...strTags(payload.context?.tags)];
    const source = o.source ?? {};
    const badge = deviceBadge({ adapterId: typeof source.adapterId === "string" ? source.adapterId : undefined }, tags);
    const recordId = typeof o.id === "string" && o.id ? o.id : record.id;
    const exclude = (reason: string, b: ReportExclusion["badge"] = badge) =>
      out.exclusions.push({ recordId, badge: b, category: "excluded", reason });
    if (o.mission?.missionId !== scope.missionId || o.mission?.crewMemberId !== scope.crewMemberId) {
      exclude("Device observation is not bound to the selected mission and crew", "unclassified");
      continue;
    }
    const provenance = declaredDeviceProvenance(tags);
    if (!provenance) {
      exclude("Synthetic/real provenance is not declared on the record");
      continue;
    }
    if (provenance !== scope.provenance) {
      out.otherProvenance++;
      continue;
    }
    const code = typeof o.metric?.code === "string" ? o.metric.code : "";
    const definition = code ? getCanonicalMetric(code) : undefined;
    if (!definition) {
      exclude(code ? `Metric code ${code} is not in the canonical registry` : "Metric code is missing");
      continue;
    }
    if (NON_HEALTH_DEVICE_DOMAINS.has(String(o.metric?.domain))) {
      exclude(`${code} is environment/radiation telemetry, not a crew health observation`);
      continue;
    }
    if (o.metric?.valueKind !== "number" || typeof o.value?.number !== "number" || !Number.isFinite(o.value.number)) {
      exclude("Value is not a finite scalar number");
      continue;
    }
    const unit = typeof o.metric?.unit === "string" ? o.metric.unit.trim() : "";
    if (!unit) {
      exclude("Unit is missing");
      continue;
    }
    if (!isInstant(o.observedAt)) {
      exclude("Observation time is missing or invalid");
      continue;
    }
    if (typeof source.sourceId !== "string" || !source.sourceId) {
      exclude("Device/source identity is missing");
      continue;
    }
    if (o.status === "invalid") {
      exclude("Device marked the observation invalid");
      continue;
    }
    const level = o.quality?.level;
    if (level !== "good" && level !== "degraded" && level !== "poor" && level !== "unknown") {
      exclude("Data quality is not declared");
      continue;
    }
    const flags = strTags(o.quality?.artifactFlags);
    const deviceName = [source.manufacturer, source.model].filter((v): v is string => typeof v === "string" && Boolean(v)).join(" ");
    const row: ReportRow = {
      recordId,
      badge,
      metricId: code,
      metricLabel: typeof o.metric?.displayName === "string" ? o.metric.displayName : code,
      value: String(o.value.number),
      unit,
      observedAt: new Date(o.observedAt).toISOString(),
      provenance,
      status: "included",
      sourceLabel: deviceName ? `${deviceName} (${source.sourceId})` : source.sourceId,
      evidence: `offline record ${record.id}${typeof source.adapterId === "string" ? ` · adapter ${source.adapterId}` : ""}`,
      qualityNote: `Quality: ${level}${flags.length ? ` · flags: ${flags.join(", ")}` : ""}${typeof payload.reviewStatus === "string" ? ` · ${payload.reviewStatus}` : ""}`,
    };
    out.candidates.push({ row, dedupeKey: rowKey(row) });
  }
}

export interface UnifiedReportInputs {
  domainEntries: Partial<Record<MeasurementDomainId, readonly BoneHealthEntry[]>>;
  unifiedObservations: readonly UnifiedObservation[];
  deviceRecords: readonly RawOfflineRecord[];
}

export function buildUnifiedHealthReport(
  inputs: UnifiedReportInputs,
  scope: ReportScope,
  filters: ReportFilters = {},
  generatedAt = new Date().toISOString(),
): UnifiedHealthReport {
  const acc = { candidates: [] as Candidate[], exclusions: [] as ReportExclusion[], otherScope: 0, otherProvenance: 0, metadata: 0 };
  for (const domain of ["bone", "immune", "cardiovascular", "behavioral"] as const)
    fromDomainEntries(domain, inputs.domainEntries[domain] ?? [], scope, acc);
  fromUnified(inputs.unifiedObservations, scope, acc);
  fromDeviceRecords(inputs.deviceRecords, scope, acc);

  // Deduplicate: stable record ID first, then identical projections across stores.
  const seenIds = new Map<string, string>();
  const seenKeys = new Map<string, string>();
  let duplicates = 0;
  const unique: ReportRow[] = [];
  for (const { row, dedupeKey } of acc.candidates) {
    const idKey = `${row.badge === "wearable" ? "device" : row.badge}|${row.recordId}`;
    const prior = seenIds.get(idKey) ?? seenKeys.get(dedupeKey);
    if (prior) {
      duplicates++;
      acc.exclusions.push({ recordId: row.recordId, badge: row.badge, category: "excluded", reason: `Duplicate projection of ${prior}; counted once` });
      continue;
    }
    seenIds.set(idKey, row.recordId);
    seenKeys.set(dedupeKey, row.recordId);
    unique.push(row);
  }

  const from = normalizeBound(filters.from, false);
  const to = normalizeBound(filters.to, true);
  const sources = filters.sources?.length ? [...filters.sources] : [...REPORT_SOURCE_BADGES];
  const sourceSet = new Set(sources);
  let outOfFilter = 0;
  const rows = unique
    .filter((r) => {
      const t = Date.parse(r.observedAt);
      const ok = sourceSet.has(r.badge) && (from === null || t >= from) && (to === null || t <= to);
      if (!ok) outOfFilter++;
      return ok;
    })
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.recordId.localeCompare(b.recordId));
  const exclusions = acc.exclusions
    .filter((e) => e.badge === "unclassified" || sourceSet.has(e.badge))
    .sort((a, b) => a.recordId.localeCompare(b.recordId));

  const summaries: BadgeSummary[] = sources.map((badge) => {
    const included = rows.filter((r) => r.badge === badge);
    return {
      badge,
      included: included.length,
      pending: exclusions.filter((e) => e.badge === badge && e.category === "pending_review").length,
      excluded: exclusions.filter((e) => e.badge === badge && e.category === "excluded").length,
      metrics: new Set(included.map((r) => r.metricId)).size,
      firstAt: included[0]?.observedAt ?? null,
      lastAt: included.at(-1)?.observedAt ?? null,
      missing: included.length === 0,
    };
  });

  return {
    scope: { ...scope },
    generatedAt,
    filters: {
      from: from === null ? null : new Date(from).toISOString(),
      to: to === null ? null : new Date(to).toISOString(),
      sources,
    },
    rows,
    exclusions,
    summaries,
    coverage: {
      included: rows.length,
      pendingReview: exclusions.filter((e) => e.category === "pending_review").length,
      excluded: exclusions.filter((e) => e.category === "excluded").length,
      duplicateProjections: duplicates,
      outOfFilter,
      otherScopeIgnored: acc.otherScope,
      otherProvenanceIgnored: acc.otherProvenance,
      nonObservationMetadata: acc.metadata,
    },
    limitations: [...UNIFIED_REPORT_LIMITATIONS],
  };
}

export function unifiedReportPlainText(report: UnifiedHealthReport): string {
  const lines = [
    "MITOCHONDRIA — Unified Health & Device Report (research use only)",
    `Mission: ${report.scope.missionId}`,
    `Crew member: ${report.scope.crewMemberId}`,
    `Provenance: ${report.scope.provenance.toUpperCase()}`,
    `Generated (UTC): ${report.generatedAt}`,
    `Filters: ${report.filters.from ?? "start"} to ${report.filters.to ?? "end"} · ${report.filters.sources.map((s) => REPORT_SOURCE_LABELS[s]).join(", ")}`,
    "",
    "COVERAGE",
    ...report.summaries.map(
      (s) => `${REPORT_SOURCE_LABELS[s.badge]}: ${s.included} included, ${s.pending} pending review, ${s.excluded} excluded${s.missing ? " (no included data — not a negative finding)" : ""}`,
    ),
    "",
    "CHRONOLOGICAL HISTORY",
    ...report.rows.map(
      (r) => `${r.observedAt} | ${REPORT_SOURCE_LABELS[r.badge]} | ${r.metricId} ${r.metricLabel} | ${r.value} ${r.unit} | ${r.provenance} | ${r.sourceLabel} | ${r.recordId} | ${r.evidence}${r.qualityNote ? ` | ${r.qualityNote}` : ""}`,
    ),
    "",
    "EXCLUDED AND PENDING",
    ...report.exclusions.map((e) => `${e.category.toUpperCase()} | ${e.badge} | ${e.recordId} | ${e.reason}`),
    "",
    "LIMITATIONS",
    ...report.limitations,
  ];
  return lines.join("\n");
}
