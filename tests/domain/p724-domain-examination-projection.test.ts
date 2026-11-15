import { describe, expect, test } from "bun:test";
import { projectDomainExaminations } from "@/domain/health-domains/examination-projection";
import { SYNTHETIC_DEMO_BASIS_CLASSIFICATION, type UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import type { BoneHealthEntry } from "@/domain/bone-health/history";
import { V9_SCOPE, obs } from "./fixtures-v9-observations";

const base = { missionId: V9_SCOPE.missionId, crewMemberId: V9_SCOPE.crewMemberId, provenance: "synthetic" as const };
const demo = (over: Partial<UnifiedObservation> = {}): UnifiedObservation =>
  obs({
    metricId: "demo:ubt-0000abcd",
    domain: "immune",
    originalUnit: "ng/mL",
    value: "12.4",
    catalogBasis: { kind: "synthetic_demo", demoId: "demo:ubt-0000abcd", termId: "ubt-0000abcd", displayName: "Galectin-3", demoCatalogVersion: 1, classification: SYNTHETIC_DEMO_BASIS_CLASSIFICATION },
    ...over,
  });
const native = (over: Partial<BoneHealthEntry> = {}): BoneHealthEntry => ({
  id: "native-1", missionId: base.missionId, crewMemberId: base.crewMemberId, variableId: "cv-001", value: 62, unit: "bpm",
  observedAt: "2026-09-01T07:00:00.000Z", sourceLabel: "Manual", specimen: "", assayMethod: "", notes: "", dataOrigin: "synthetic", ...over,
});

describe("P72.4 read-only domain projection of Examination observations", () => {
  test("uses the stored domain, never the metric name or ID prefix", () => {
    const misfiled = obs({ metricId: "cv-001", domain: "bone" });
    const cv = projectDomainExaminations({ ...base, domainId: "cardiovascular", domainEntries: [], unifiedObservations: [misfiled] });
    const bone = projectDomainExaminations({ ...base, domainId: "bone", domainEntries: [], unifiedObservations: [misfiled] });
    expect(cv.counts.examination).toBe(0);
    expect(bone.counts.examination).toBe(1);
  });

  test("demo-catalog observations are labelled NOT SCIENTIFICALLY VALIDATED; handbook ones stay pending review", () => {
    const p = projectDomainExaminations({ ...base, domainId: "immune", domainEntries: [], unifiedObservations: [demo(), obs({ metricId: "imm-001", domain: "immune", originalUnit: "10^9/L", value: "6" })] });
    expect(p.counts.examination).toBe(2);
    expect(p.counts.notScientificallyValidated).toBe(1);
    expect(p.rows.find((r) => r.metricId === "demo:ubt-0000abcd")?.validation).toBe("synthetic_demo_not_scientifically_validated");
    expect(p.rows.find((r) => r.metricId === "imm-001")?.validation).toBe("handbook_catalog_pending_independent_review");
  });

  test("an identical Examination and domain-native record is counted once", () => {
    const e = obs({ metricId: "cv-001", value: "62", originalUnit: "bpm", observedAt: "2026-09-01T07:00:00.000Z" });
    const p = projectDomainExaminations({ ...base, domainId: "cardiovascular", domainEntries: [native()], unifiedObservations: [e] });
    expect(p.rows).toHaveLength(1);
    expect(p.counts.domainNative + p.counts.examination).toBe(1);
    expect(p.counts.duplicateProjections).toBe(1);
  });

  test("distinguishes origins and counts series by exact ID + unit", () => {
    const p = projectDomainExaminations({
      ...base, domainId: "cardiovascular",
      domainEntries: [native({ id: "native-2", value: 70, observedAt: "2026-09-03T07:00:00.000Z" })],
      unifiedObservations: [obs({ metricId: "cv-001", originalUnit: "bpm" }), obs({ metricId: "cv-001", originalUnit: "/min" })],
    });
    expect(p.counts.domainNative).toBe(1);
    expect(p.counts.examination).toBe(2);
    expect(p.counts.series).toBe(2);
  });

  test("never shows pending, rejected, erroneous, real-origin or other-mission/crew records", () => {
    const p = projectDomainExaminations({
      ...base, domainId: "cardiovascular", domainEntries: [],
      unifiedObservations: [
        obs({ reviewState: "pending_review", quality: { reviewerConfirmed: false } }),
        obs({ reviewState: "rejected" }),
        obs({ status: "erroneous" }),
        obs({ provenance: "real" }),
        obs({ missionId: "mission-other" }),
        obs({ crewMemberId: "crew-other" }),
      ],
    });
    expect(p.rows).toHaveLength(0);
    expect(p.counts.pendingReview).toBe(1);
  });

  test("an observation outside the four domains is counted as unclassified, not placed", () => {
    const stray = obs({ domain: "wearable" as unknown as UnifiedObservation["domain"] });
    for (const domainId of ["bone", "immune", "cardiovascular", "behavioral"] as const) {
      const p = projectDomainExaminations({ ...base, domainId, domainEntries: [], unifiedObservations: [stray] });
      expect(p.rows).toHaveLength(0);
      expect(p.counts.unclassified).toBe(1);
    }
  });

  test("values, units and dates are passed through unchanged", () => {
    const e = obs({ metricId: "cv-001", value: "62,5", originalUnit: "bpm", observedAt: "2026-11-07", datePrecision: "date", schema: "mitochondria.unified-observation.v2" });
    const [row] = projectDomainExaminations({ ...base, domainId: "cardiovascular", domainEntries: [], unifiedObservations: [e] }).rows;
    expect(row).toMatchObject({ value: "62,5", unit: "bpm", observedAt: "2026-11-07", datePrecision: "date", origin: "examination", provenance: "synthetic" });
  });
});
