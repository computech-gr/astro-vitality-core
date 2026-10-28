import { afterAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const memoryRecords: Array<Record<string, unknown>> = [];
mock.module("@/infrastructure/offline", () => ({
  getOfflineMissionStore: () => ({
    list: async () => memoryRecords.map((r) => structuredClone(r)),
  }),
  persistOfflineMissionEvent: async (input: Record<string, unknown>) => {
    memoryRecords.push({ ...input, createdAt: new Date(Date.now() + memoryRecords.length).toISOString() });
    return { inserted: true };
  },
}));

const { saveBoneEntry, markBoneEntryErroneous } = await import("../../src/domain/bone-health/history");
const { parseBoneImport } = await import("../../src/domain/bone-health/import");
const { MEASUREMENT_PROFILES } = await import("../../src/domain/health-measurements/profiles");
const { loadUnifiedReportInputs } = await import("../../src/domain/health-intelligence/unified-health-report-loader");
const { UNIFIED_OBSERVATION_SCHEMA } = await import("../../src/domain/health-intelligence/observation-envelope");
const R = await import("../../src/domain/health-intelligence/unified-health-report");
import type { BoneHealthEntry } from "../../src/domain/bone-health/history";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import type { RawOfflineRecord } from "../../src/domain/health-intelligence/unified-health-report";

const realFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls++;
  throw new Error("network forbidden in report tests");
}) as unknown as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const scope = { missionId: "m-1", crewMemberId: "c-1", provenance: "synthetic" as const };
const entry = (over: Partial<BoneHealthEntry> = {}): BoneHealthEntry => ({
  id: "bone-entry-1",
  missionId: "m-1",
  crewMemberId: "c-1",
  variableId: "bone-001",
  value: 0.42,
  unit: "ng/mL",
  observedAt: "2026-10-01T09:00:00Z",
  sourceLabel: "Demo Lab",
  specimen: "serum",
  assayMethod: "",
  notes: "",
  dataOrigin: "synthetic",
  ...over,
});
const unifiedObs = (over: Partial<UnifiedObservation> = {}): UnifiedObservation => ({
  schema: UNIFIED_OBSERVATION_SCHEMA,
  id: "obs-00000001",
  missionId: "m-1",
  crewMemberId: "c-1",
  metricId: "cv-001",
  domain: "cardiovascular",
  value: "62",
  originalUnit: "bpm",
  observedAt: "2026-10-02T08:00:00.000Z",
  source: { kind: "manual", label: "Manual entry" },
  provenance: "synthetic",
  quality: { reviewerConfirmed: true },
  reviewState: "accepted",
  status: "active",
  recordedAt: "2026-10-02T08:05:00.000Z",
  ...over,
});
const device = (over: { id?: string; tags?: string[]; mission?: { missionId: string; crewMemberId: string }; obs?: Record<string, unknown>; payload?: unknown; kind?: string } = {}): RawOfflineRecord => {
  const mission = over.mission ?? { missionId: "m-1", crewMemberId: "c-1" };
  return {
    id: over.id ?? "dev-rec-1",
    kind: over.kind ?? "observation",
    mission,
    eventTimestamp: "2026-10-04T10:00:00Z",
    createdAt: "2026-10-04T10:00:01Z",
    sourceId: "hr-strap-1",
    payload: over.payload ?? {
      observation: {
        id: over.id ?? "dev-obs-1",
        mission,
        source: { sourceId: "hr-strap-1", sourceType: "device", adapterId: "org.mitochondria.web-bluetooth-heart-rate", manufacturer: "Demo", model: "Strap" },
        metric: { code: "phys.heart_rate", displayName: "Heart rate", domain: "physiological", valueKind: "number", unit: "bpm" },
        value: { number: 64 },
        observedAt: "2026-10-04T10:00:00Z",
        status: "final",
        quality: { level: "good", artifactFlags: [] },
        tags: over.tags ?? ["synthetic:true"],
        ...over.obs,
      },
      context: { tags: [] },
      reviewStatus: "raw",
    },
  };
};
const build = (inputs: Partial<Parameters<typeof R.buildUnifiedHealthReport>[0]>, s = scope, f = {}) =>
  R.buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: [], deviceRecords: [], ...inputs }, s, f, "2026-10-28T12:00:00.000Z");

describe("P28 unified health & device report", () => {
  test("includes all four health domains with source badges and original IDs/units", () => {
    const r = build({
      domainEntries: {
        bone: [entry()],
        immune: [entry({ id: "imm-e1", variableId: "IMM-001", value: 6.1, unit: "10^9/L" })],
        cardiovascular: [entry({ id: "cv-e1", variableId: "cv-005", value: 118, unit: "mmHg" })],
        behavioral: [entry({ id: "bsc-e1", variableId: "BSC-001", value: 6.5, unit: "h" })],
      },
    });
    expect(r.rows.map((x) => x.badge).sort()).toEqual(["behavioral", "bone", "cardiovascular", "immune"]);
    expect(r.rows.find((x) => x.badge === "immune")).toMatchObject({ recordId: "imm-e1", value: "6.1", unit: "10^9/L", provenance: "synthetic" });
    expect(r.summaries.find((s) => s.badge === "wearable")?.missing).toBe(true);
  });

  test("includes a real persisted scalar device observation with quality note", () => {
    const r = build({ deviceRecords: [device()] });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ badge: "wearable", metricId: "phys.heart_rate", value: "64", unit: "bpm", recordId: "dev-obs-1" });
    expect(r.rows[0]!.qualityNote).toContain("Quality: good");
    expect(r.rows[0]!.evidence).toContain("dev-rec-1");
  });

  test("excludes unbound, undeclared-provenance, unknown-metric, series, unitless and environment device records", () => {
    const r = build({
      deviceRecords: [
        device({ id: "a1", obs: { mission: { missionId: "m-2", crewMemberId: "c-1" } } }),
        device({ id: "a2", tags: [] }),
        device({ id: "a3", obs: { metric: { code: "made.up", valueKind: "number", unit: "x" } } }),
        device({ id: "a4", payload: { samples: [1, 2, 3] } }),
        device({ id: "a5", obs: { metric: { code: "phys.heart_rate", valueKind: "number", unit: "" } } }),
        device({ id: "a6", obs: { metric: { code: "environment.co2", domain: "environmental", valueKind: "number", unit: "ppm" } } }),
        device({ id: "a7", obs: { quality: undefined } }),
        device({ id: "a8", kind: "self_check" }),
      ],
    });
    expect(r.rows).toHaveLength(0);
    const reasons = Object.fromEntries(r.exclusions.map((e) => [e.recordId, e.reason]));
    expect(reasons.a1).toContain("not bound");
    expect(reasons.a2).toContain("provenance is not declared");
    expect(reasons.a3).toContain("not in the canonical registry");
    expect(reasons.a4).toContain("Raw/series");
    expect(reasons.a5).toContain("Unit is missing");
    expect(reasons.a6).toContain("environment");
    expect(reasons.a7).toContain("quality");
    expect(r.coverage.nonObservationMetadata).toBe(1);
  });

  test("provenance isolation: synthetic never shown as real and vice versa", () => {
    const inputs = {
      domainEntries: { bone: [entry(), entry({ id: "real-1", dataOrigin: "real" as const, observedAt: "2026-10-05T00:00:00Z" })] },
      unifiedObservations: [unifiedObs({ id: "obs-real-0001", provenance: "real" })],
      deviceRecords: [device({ tags: ["provenance:real"] })],
    };
    const synthetic = build(inputs);
    expect(synthetic.rows.map((x) => x.recordId)).toEqual(["bone-entry-1"]);
    const real = build(inputs, { ...scope, provenance: "real" });
    expect(real.rows.every((x) => x.provenance === "real")).toBe(true);
    expect(real.rows).toHaveLength(3);
    expect(R.declaredDeviceProvenance(["synthetic:true", "provenance:real"])).toBeNull();
  });

  test("crew/mission isolation ignores other-scope records", () => {
    const r = build({
      domainEntries: { bone: [entry({ crewMemberId: "c-2" }), entry({ id: "x", missionId: "m-9" })] },
      unifiedObservations: [unifiedObs({ crewMemberId: "c-2" })],
      deviceRecords: [device({ mission: { missionId: "m-1", crewMemberId: "c-2" } })],
    });
    expect(r.rows).toHaveLength(0);
    expect(r.coverage.otherScopeIgnored).toBe(4);
  });

  test("append-only corrections: erroneous and superseded excluded, correction included", () => {
    const r = build({
      domainEntries: {
        bone: [entry({ status: "erroneous", statusReason: "typo" }), entry({ id: "bone-entry-2", value: 0.44, supersedesId: "bone-entry-1" })],
      },
      unifiedObservations: [
        unifiedObs(),
        unifiedObs({ id: "obs-00000002", value: "63", supersedesId: "obs-00000001" }),
        unifiedObs({ id: "obs-00000003", reviewState: "pending_review", quality: { reviewerConfirmed: false } }),
      ],
    });
    expect(r.rows.map((x) => x.recordId).sort()).toEqual(["bone-entry-2", "obs-00000002"]);
    expect(r.exclusions.find((e) => e.recordId === "bone-entry-1")?.reason).toContain("erroneous");
    expect(r.exclusions.find((e) => e.recordId === "obs-00000001")?.reason).toContain("Superseded");
    expect(r.exclusions.find((e) => e.recordId === "obs-00000003")?.category).toBe("pending_review");
  });

  test("deduplicates by stable ID and identical cross-store projection", () => {
    const r = build({
      domainEntries: { cardiovascular: [entry({ id: "cv-e1", variableId: "cv-001", value: 62, unit: "bpm", observedAt: "2026-10-02T08:00:00Z" })] },
      unifiedObservations: [unifiedObs(), unifiedObs()],
      deviceRecords: [device(), device()],
    });
    expect(r.rows.map((x) => x.recordId)).toEqual(["cv-e1", "dev-obs-1"]);
    expect(r.coverage.duplicateProjections).toBe(3);
  });

  test("missing units/dates are excluded, never filled", () => {
    const r = build({
      domainEntries: { bone: [entry({ unit: " " }), entry({ id: "b2", observedAt: "not-a-date" })] },
      unifiedObservations: [unifiedObs({ originalUnit: "" })],
    });
    expect(r.rows).toHaveLength(0);
    expect(r.exclusions).toHaveLength(3);
  });

  test("date and source filters plus chronological order", () => {
    const inputs = {
      domainEntries: {
        bone: [entry({ observedAt: "2026-10-03T00:00:00Z" }), entry({ id: "b0", observedAt: "2026-09-01T00:00:00Z" })],
      },
      deviceRecords: [device()],
    };
    const all = build(inputs);
    expect(all.rows.map((x) => x.recordId)).toEqual(["b0", "bone-entry-1", "dev-obs-1"]);
    const filtered = build(inputs, scope, { from: "2026-10-01", to: "2026-10-03", sources: ["bone"] });
    expect(filtered.rows.map((x) => x.recordId)).toEqual(["bone-entry-1"]);
    expect(filtered.coverage.outOfFilter).toBe(2);
  });

  test("no inference: no diagnosis, threshold, risk or readiness language in output", () => {
    const text = R.unifiedReportPlainText(build({ domainEntries: { bone: [entry()] }, deviceRecords: [device()] }));
    expect(text).not.toMatch(/\b(normal|abnormal|elevated|deficien|high risk|low risk|ready|healthy|diagnosed)\b/i);
    expect(text).toContain("not a negative finding");
    expect(text).toContain("Research-use-only");
  });

  test("synthetic fixtures use catalog IDs, parse through domain import and appear in report", () => {
    const files = { immune: "immune-synthetic.csv", cardiovascular: "cardiovascular-synthetic.csv", behavioral: "behavioral-synthetic.csv" } as const;
    const entries: Record<string, BoneHealthEntry[]> = {};
    for (const [domain, file] of Object.entries(files) as Array<[keyof typeof files, string]>) {
      const text = readFileSync(join(import.meta.dir, "../../fixtures/synthetic/p28", file), "utf8");
      expect(text).toContain("SYNTHETIC");
      const profile = MEASUREMENT_PROFILES[domain];
      const parsed = parseBoneImport(text, profile);
      expect(parsed.rejected).toEqual([]);
      expect(parsed.candidates.length).toBeGreaterThanOrEqual(4);
      const ids = new Set(profile.variables.map((v) => v.id));
      expect(parsed.candidates.every((c) => ids.has(c.variableId))).toBe(true);
      if (domain === "cardiovascular")
        for (const c of parsed.candidates) expect(profile.unitSuggestions(c.variableId)).toContain(c.unit);
      entries[domain] = parsed.candidates.map((c, i) => ({ ...c, id: `${domain}-fx-${i}`, missionId: "m-1", crewMemberId: "c-1", dataOrigin: "synthetic" }));
    }
    const r = build({ domainEntries: entries });
    for (const d of ["immune", "cardiovascular", "behavioral"]) expect(r.summaries.find((s) => s.badge === d)!.included).toBeGreaterThan(3);
  });

  test("fixtures are not served or auto-imported by the app", () => {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const hits = execSync("rg -l 'fixtures/synthetic/p28' src public || true", { cwd: join(import.meta.dir, "../.."), encoding: "utf8" });
    expect(hits.trim()).toBe("");
  });

  test("offline loader reads encrypted local store for scope only, with no network", async () => {
    memoryRecords.length = 0;
    await saveBoneEntry(entry());
    await saveBoneEntry(entry({ id: "imm-e1", variableId: "IMM-001", value: 6.1, unit: "10^9/L" }), MEASUREMENT_PROFILES.immune);
    await saveBoneEntry(entry({ id: "other", crewMemberId: "c-2" }));
    await markBoneEntryErroneous(entry(), "typo");
    memoryRecords.push({ ...device(), createdAt: "2026-10-04T10:00:01Z" });
    const inputs = await loadUnifiedReportInputs("m-1", "c-1");
    const r = R.buildUnifiedHealthReport(inputs, scope);
    expect(r.rows.map((x) => x.recordId).sort()).toEqual(["dev-obs-1", "imm-e1"]);
    expect(r.exclusions.find((e) => e.recordId === "bone-entry-1")?.reason).toContain("erroneous");
    expect(inputs.deviceRecords.every((d) => d.mission.crewMemberId === "c-1")).toBe(true);
    expect(fetchCalls).toBe(0);
  });
});

describe("P28 report page safety (source)", () => {
  const src = readFileSync(join(import.meta.dir, "../../src/components/astronaut-health-report.tsx"), "utf8");
  test("no browser storage of report data and clears on account/scope change", () => {
    expect(src).not.toMatch(/localStorage|sessionStorage/);
    expect(src).toContain("visibilitychange");
    expect(src).toContain("v.userId !== userRef.current");
    expect(src).toContain("no longer authorized");
  });
  test("print layout: A4, hidden controls, repeated headers and unbroken rows", () => {
    const css = readFileSync(join(import.meta.dir, "../../src/styles.css"), "utf8");
    expect(css).toContain("size: A4");
    expect(css).toMatch(/\.report-table tr,[\s\S]*break-inside: avoid/);
    expect(css).toContain("display: table-header-group");
    expect(src).toContain("print:hidden");
  });
});
