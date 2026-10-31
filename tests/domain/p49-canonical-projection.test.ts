import { describe, expect, test } from "bun:test";
import {
  projectCanonicalObservations,
  type ProjectableRecord,
} from "@/domain/health-intelligence/canonical-projection";
import { buildScientificEvidenceReport } from "@/domain/health-intelligence/live-evidence";
import { filterTrendObservations } from "@/domain/companion/daily-companion";

// Controlled synthetic fixtures only. No backend records are created by these tests.
const M = "mission-p49-synthetic";
const A = "crew-p49-a";
const B = "crew-p49-b";
const scope = { missionId: M, crewMemberId: A };

function rec(id: string, payload: unknown, over: Partial<ProjectableRecord> = {}): ProjectableRecord {
  return {
    id,
    missionId: M,
    crewMemberId: A,
    kind: "observation",
    eventTimestamp: "2026-10-01T00:00:00.000Z",
    sourceId: "fixture-source",
    classification: "medical_sensitive",
    location: "cloud",
    payload,
    ...over,
  };
}
const unified = (inner: string, o: Record<string, unknown> = {}) => ({
  schemaVersion: "1.0",
  observation: {
    schema: "mitochondria.unified-observation.v1",
    id: inner,
    missionId: M,
    crewMemberId: A,
    metricId: "cv-001",
    domain: "cardiovascular",
    value: "64",
    originalUnit: "bpm",
    observedAt: "2026-10-21T08:00:00.000Z",
    source: { kind: "manual", label: "Manual entry" },
    provenance: "synthetic",
    quality: { reviewerConfirmed: true },
    reviewState: "accepted",
    status: "active",
    recordedAt: "2026-10-24T19:54:29.026Z",
    ...o,
  },
});
const entry = (inner: string, e: Record<string, unknown> = {}, env: Record<string, unknown> = {}) => ({
  schemaVersion: "26.1",
  domain: "immune",
  metricCode: (e["variableId"] as string | undefined) ?? "IMM-001",
  ...env,
  entry: {
    id: inner,
    missionId: M,
    crewMemberId: A,
    variableId: "IMM-001",
    value: 6.7,
    unit: "x10^9/L",
    observedAt: "2026-10-14T07:35:00Z",
    sourceLabel: "MITOCHONDRIA_Synthetic_External_Lab_Challenge_02.pdf",
    specimen: "",
    assayMethod: "",
    notes: "",
    dataOrigin: "synthetic",
    ...e,
  },
});

describe("P49 canonical projection — supported formats", () => {
  test("unified-observation: preserves metric ID, reported unit, time and provenance", () => {
    const p = projectCanonicalObservations([rec("unified-observation:u1:entry", unified("u1"), { sourceId: "unified-intake" })], scope);
    expect(p.nonChartable).toEqual([]);
    const o = p.observations[0]!;
    expect(o.metricCode).toBe("cv-001");
    expect(o.value).toBe(64);
    expect(o.unit).toBe("bpm");
    expect(o.observedAt).toBe("2026-10-21T08:00:00.000Z");
    expect(o.healthDomain).toBe("cardiovascular");
    expect(o.provenance).toBe("synthetic");
    expect(o.sourceId).toBe("unified-intake");
    expect(o.format).toBe("unified-observation");
  });

  test("handbook/manual domain entry (P26): catalog-validated, unit unchanged", () => {
    const p = projectCanonicalObservations([rec("immune-health:e1:entry", entry("e1"))], scope);
    const o = p.observations[0]!;
    expect([o.metricCode, o.value, o.unit, o.observedAt, o.healthDomain]).toEqual([
      "IMM-001", 6.7, "x10^9/L", "2026-10-14T07:35:00Z", "immune",
    ]);
    expect(o.sourceLabel).toBe("MITOCHONDRIA_Synthetic_External_Lab_Challenge_02.pdf");
  });

  test("Bone P22.1 entry without a domain field resolves from its event prefix", () => {
    const payload = { schemaVersion: "22.1", metricCode: "bone-002", entry: { ...entry("b1").entry, variableId: "bone-002", value: 14, unit: "nmol" } };
    const p = projectCanonicalObservations([rec("bone-health:b1:entry", payload)], scope);
    expect(p.observations[0]!.healthDomain).toBe("bone");
    expect(p.observations[0]!.unit).toBe("nmol");
  });

  test("legacy scalar envelope keeps its stored quality level", () => {
    const p = projectCanonicalObservations(
      [rec("hr-1", {}, { metricCode: "phys.heart_rate", unit: "{beats}/min", value: "62", quality: "degraded" })],
      scope,
    );
    expect(p.observations[0]!.quality).toBe("degraded");
    expect(p.observations[0]!.healthDomain).toBeUndefined();
  });

  test("handbook formats never invent a quality level", () => {
    const p = projectCanonicalObservations([rec("immune-health:e1:entry", entry("e1"))], scope);
    expect(p.observations[0]!.quality).toBe("unknown");
  });
});

describe("P49 canonical projection — exclusions reported separately", () => {
  test("non-numeric unified value is not charted", () => {
    const p = projectCanonicalObservations([rec("unified-observation:u2:entry", unified("u2", { value: "positive" }))], scope);
    expect(p.observations).toHaveLength(0);
    expect(p.nonChartable[0]!.reason).toBe("Value is not a plain numeric measurement");
  });
  test("non-numeric domain entry value is not charted", () => {
    const p = projectCanonicalObservations([rec("immune-health:e2:entry", entry("e2", { value: "6.7" }))], scope);
    expect(p.nonChartable[0]!.reason).toBe("Value is not a numeric measurement");
  });
  test("pending-review unified observation is not charted", () => {
    const p = projectCanonicalObservations([rec("unified-observation:u3:entry", unified("u3", { reviewState: "pending_review" }))], scope);
    expect(p.nonChartable[0]!.reason).toBe("Awaiting human review in Medical Intake");
  });
  test("metric ID outside the domain catalog is not charted", () => {
    const p = projectCanonicalObservations([rec("immune-health:e3:entry", entry("e3", { variableId: "IMM-999" }))], scope);
    expect(p.nonChartable[0]!.reason).toBe("Metric ID is not in the domain catalog");
  });
  test("missing unit is not charted", () => {
    const p = projectCanonicalObservations([rec("immune-health:e4:entry", entry("e4", { unit: " " }))], scope);
    expect(p.nonChartable[0]!.reason).toBe("Missing reported unit");
  });
  test("operational events are listed as not a measurement", () => {
    const p = projectCanonicalObservations([rec("op-1", { state: "started" }, { kind: "operational_event" })], scope);
    expect(p.nonChartable[0]!.reason).toBe("Not a measurement (operational event)");
  });
  test("erroneous entry and its superseded target are excluded; the correction is charted", () => {
    const p = projectCanonicalObservations(
      [
        rec("immune-health:old:entry", entry("old", { value: 9.9 })),
        rec("immune-health:fix:entry", entry("fix", { value: 6.7, supersedesId: "old" })),
      ],
      scope,
    );
    expect(p.observations.map((o) => o.value)).toEqual([6.7]);
    expect(p.nonChartable[0]!.reason).toBe("Superseded by correction immune-health:fix:entry");
  });
});

describe("P49 canonical projection — isolation and duplicates", () => {
  test("another crew member's records are never projected", () => {
    const p = projectCanonicalObservations(
      [rec("immune-health:x:entry", entry("x"), { crewMemberId: B }), rec("immune-health:e1:entry", entry("e1"))],
      scope,
    );
    expect(p.observations.map((o) => o.crewMemberId)).toEqual([A]);
    expect(p.outOfScope).toBe(1);
  });
  test("a record whose embedded crew ID differs from its row scope is rejected", () => {
    const bad = entry("e5");
    bad.entry.crewMemberId = B;
    const p = projectCanonicalObservations([rec("immune-health:e5:entry", bad)], scope);
    expect(p.observations).toHaveLength(0);
    expect(p.nonChartable[0]!.reason).toBe("Embedded mission/crew identity does not match the record scope");
  });
  test("the same record from local and cloud stores is counted once", () => {
    const p = projectCanonicalObservations(
      [rec("immune-health:e1:entry", entry("e1"), { location: "local" }), rec("immune-health:e1:entry", entry("e1"))],
      scope,
    );
    expect(p.observations).toHaveLength(1);
    expect(p.observations[0]!.location).toBe("cloud");
    expect(p.nonChartable).toHaveLength(0);
  });
  test("identical reading saved twice under different IDs is charted once", () => {
    const p = projectCanonicalObservations(
      [rec("immune-health:d1:entry", entry("d1")), rec("immune-health:d2:entry", entry("d2"))],
      scope,
    );
    expect(p.observations).toHaveLength(1);
    expect(p.nonChartable[0]!.reason).toContain("Duplicate of record immune-health:d1:entry");
  });
  test("same metric at the same time with a different value is not a duplicate", () => {
    const p = projectCanonicalObservations(
      [rec("immune-health:d1:entry", entry("d1")), rec("immune-health:d3:entry", entry("d3", { value: 6.8 }))],
      scope,
    );
    expect(p.observations).toHaveLength(2);
  });
});

describe("P49 trend filters over a controlled multi-date, multi-source synthetic fixture", () => {
  // 10 days apart over 120 days, alternating two sources; latest = 2026-10-30.
  const days = Array.from({ length: 13 }, (_, i) => i * 10);
  const records = days.map((d, i) =>
    rec(
      `unified-observation:f${i}:entry`,
      unified(`f${i}`, {
        observedAt: new Date(Date.parse("2026-10-30T08:00:00.000Z") - d * 86400000).toISOString(),
        value: String(60 + i),
      }),
      { sourceId: i % 2 === 0 ? "fixture-source-a" : "fixture-source-b" },
    ),
  );
  const report = buildScientificEvidenceReport({
    mission: scope,
    observations: projectCanonicalObservations(records, scope).observations,
    generatedAt: "2026-10-31T00:00:00.000Z",
  });
  const series = report.observations;

  test("all 13 fixture observations are projected", () => expect(series).toHaveLength(13));
  test("7-day window keeps 1 observation", () => expect(filterTrendObservations(series, "7", "all")).toHaveLength(1));
  test("30-day window keeps 4 observations", () => expect(filterTrendObservations(series, "30", "all")).toHaveLength(4));
  test("90-day window keeps 10 observations", () => expect(filterTrendObservations(series, "90", "all")).toHaveLength(10));
  test("source filter keeps only source A (7 of 13)", () => {
    const a = filterTrendObservations(series, "all", "fixture-source-a");
    expect(a).toHaveLength(7);
    expect(new Set(a.map((o) => o.sourceId))).toEqual(new Set(["fixture-source-a"]));
  });
  test("30-day window combined with source B keeps 2", () =>
    expect(filterTrendObservations(series, "30", "fixture-source-b")).toHaveLength(2));
});
