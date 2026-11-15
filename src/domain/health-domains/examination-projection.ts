/**
 * P72.4 — read-only Health Domain projection of existing Examination observations.
 *
 * Reuses the unchanged Full Health Report read model (buildUnifiedHealthReport) for exactly
 * one authorized mission + crew + provenance and one domain, so inclusion rules, append-only
 * correction handling and cross-store de-duplication are identical to the report and nothing
 * is counted twice. Domain classification is the `domain` stored on each observation at intake
 * (catalog-bound), never inferred from a name. Pure: no writes, no new scientific status.
 */
import type { BoneHealthEntry } from "@/domain/bone-health/history";
import { MEASUREMENT_PROFILES, type MeasurementDomainId } from "@/domain/health-measurements/profiles";
import type { UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import { buildUnifiedHealthReport, type ReportRow } from "@/domain/health-intelligence/unified-health-report";

export const EXAMINATION_EVIDENCE_PREFIX = "unified-intake";

export type DomainRowOrigin = "examination" | "domain_native";
export type DomainRowValidation = "synthetic_demo_not_scientifically_validated" | "handbook_catalog_pending_independent_review";

export interface DomainProjectionRow {
  recordId: string;
  origin: DomainRowOrigin;
  validation: DomainRowValidation;
  metricId: string;
  label: string;
  value: string;
  unit: string;
  observedAt: string;
  datePrecision?: NonNullable<ReportRow["datePrecision"]>;
  provenance: ReportRow["provenance"];
  sourceLabel: string;
  evidence: string;
}

export interface DomainProjection {
  rows: DomainProjectionRow[];
  counts: {
    examination: number;
    domainNative: number;
    series: number;
    notScientificallyValidated: number;
    pendingReview: number;
    excluded: number;
    duplicateProjections: number;
    /** Examination observations in this scope whose stored domain is none of the four modules (all domains). */
    unclassified: number;
  };
}

/** Fixed timestamp: the projection never depends on the clock. */
const GENERATED_AT = "1970-01-01T00:00:00.000Z";

export function projectDomainExaminations(input: {
  domainId: MeasurementDomainId;
  missionId: string;
  crewMemberId: string;
  provenance: "synthetic" | "real";
  domainEntries: readonly BoneHealthEntry[];
  unifiedObservations: readonly UnifiedObservation[];
}): DomainProjection {
  const { domainId } = input;
  const report = buildUnifiedHealthReport(
    { domainEntries: { [domainId]: input.domainEntries }, unifiedObservations: input.unifiedObservations, deviceRecords: [] },
    { missionId: input.missionId, crewMemberId: input.crewMemberId, provenance: input.provenance },
    { sources: [domainId] },
    GENERATED_AT,
  );
  const demoIds = new Set(
    input.unifiedObservations.filter((o) => o.catalogBasis?.kind === "synthetic_demo").map((o) => o.id),
  );
  const names = new Map(MEASUREMENT_PROFILES[domainId].variables.map((v) => [v.id, v.name]));
  const rows: DomainProjectionRow[] = report.rows
    .filter((r) => r.badge === domainId)
    .map((r) => {
      const origin: DomainRowOrigin = r.evidence.startsWith(EXAMINATION_EVIDENCE_PREFIX) ? "examination" : "domain_native";
      const demo = origin === "examination" && demoIds.has(r.recordId);
      return {
        recordId: r.recordId,
        origin,
        validation: demo ? "synthetic_demo_not_scientifically_validated" : "handbook_catalog_pending_independent_review",
        metricId: r.metricId,
        label: demo ? r.metricLabel : names.get(r.metricId) ? `${names.get(r.metricId)} (${r.metricId})` : r.metricId,
        value: r.value,
        unit: r.unit,
        observedAt: r.observedAt,
        ...(r.datePrecision ? { datePrecision: r.datePrecision } : {}),
        provenance: r.provenance,
        sourceLabel: r.sourceLabel,
        evidence: r.evidence,
      };
    });
  const domainExclusions = report.exclusions.filter((e) => e.badge === domainId);
  return {
    rows,
    counts: {
      examination: rows.filter((r) => r.origin === "examination").length,
      domainNative: rows.filter((r) => r.origin === "domain_native").length,
      series: new Set(rows.map((r) => `${r.metricId}|${r.unit}`)).size,
      notScientificallyValidated: rows.filter((r) => r.validation === "synthetic_demo_not_scientifically_validated").length,
      pendingReview: domainExclusions.filter((e) => e.category === "pending_review").length,
      excluded: domainExclusions.filter((e) => e.category === "excluded" && !e.reason.startsWith("Duplicate projection")).length,
      duplicateProjections: domainExclusions.filter((e) => e.reason.startsWith("Duplicate projection")).length,
      unclassified: report.exclusions.filter((e) => e.badge === "unclassified").length,
    },
  };
}
