/**
 * P38 bulk SYNTHETIC DEMO: preflight of the actual MITO_DEMO_2026 submitted-term
 * metadata (read-only fixture copy), owner scope SQL reproducibility, bounded
 * batches with failure/retry, Ground Medical activation preview, deterministic
 * retry keys, and automatic recognition of many activated entries in a NEW
 * multi-biomarker synthetic examination through the normal intake path (save,
 * history, domain projection, Medical Report), offline and after revocation.
 * Domain choices for unreferenced terms are test choices, not scientific ones.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  ambiguousUnitReason,
  buildBulkDemoPreflight,
  needsDomainChoice,
  preflightCounts,
  type PreflightRow,
} from "../../src/domain/health-intelligence/p38-bulk-demo-preflight";
import {
  activationPreview,
  chunk,
  runBulkBatches,
  summarizeBulk,
  type BatchResponse,
  type PendingDemoProposal,
} from "../../src/domain/health-intelligence/p38-bulk-demo-batches";
import { deterministicUuid } from "../../src/lib/p38-bulk-demo.server";
import {
  LIVE_STATE,
  authorizable,
  fixture,
  fixtureTerms,
  livePreflight,
  scopeAuthorizationSql,
} from "../../scripts/p38-bulk-demo-scope";
import {
  SYNTHETIC_DEMO_CLASSIFICATION,
  evaluateSyntheticDemoSnapshot,
  signSyntheticDemoSnapshot,
  type SyntheticDemoEntry,
  type SyntheticDemoSnapshot,
} from "../../src/domain/health-intelligence/synthetic-demo-catalog";
import {
  installOfferedDemoCatalog,
  loadInstalledDemoCatalogs,
  resetSyntheticDemoCatalogsForTests,
} from "../../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { generateTestSigningKey } from "../../src/domain/health-intelligence/catalog-snapshot-signing";
import type { SnapshotStorage } from "../../src/domain/health-intelligence/active-catalog-runtime";
import {
  buildUnknownBiomarkerTerms,
  classifyWithGovernedExtensions,
} from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { extractCsvCandidates } from "../../src/domain/health-intelligence/universal-intake-parser";
import { intakeRowExclusionReason } from "../../src/domain/health-intelligence/intake-review-selection";
import {
  DATED_OBSERVATION_SCHEMA,
  validateUnifiedObservation,
  type UnifiedObservation,
} from "../../src/domain/health-intelligence/observation-envelope";
import {
  importUnifiedObservationEvent,
  listUnifiedObservations,
} from "../../src/domain/health-intelligence/observation-store";
import { InMemoryOfflineMissionStore } from "../../src/infrastructure/offline/store";
import { projectCanonicalObservations } from "../../src/domain/health-intelligence/canonical-projection";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import type { HealthDomainId } from "../../src/domain/health-domains/registry";

const here = dirname(fileURLToPath(import.meta.url));
const M = fixture.missionId;
const CREW = fixture.crewMemberId;

beforeEach(() => resetSyntheticDemoCatalogsForTests());
afterAll(() => resetSyntheticDemoCatalogsForTests());

describe("preflight of the actual 209 submitted terms", () => {
  const rows = livePreflight();
  const by = (termId: string) => rows.find((r) => r.termId === termId)!;

  test("exact counts before any write", () => {
    const c = preflightCounts(rows);
    expect(c).toMatchObject({
      total: 209,
      already_active: 1,
      already_decided: 0,
      eligible: 66,
      duplicate: 0,
      existing_catalog_match: 6,
      ambiguous_unit: 17,
      conflicting_identity: 2,
      blocked: 117,
    });
    expect(rows.filter(needsDomainChoice)).toHaveLength(117);
    expect(rows.filter(authorizable)).toHaveLength(185);
  });

  test("the activated term is skipped; the combined-unit term is ambiguous", () => {
    expect(by("ubt-7b25ce69").category).toBe("already_active");
    expect(by("ubt-7c10c994").category).toBe("ambiguous_unit");
    expect(by("ubt-7c10c994").unit).toBe("ng/mL ή nmol/L");
  });

  test("existing handbook matches and conflicting references are blocked", () => {
    const hb = rows.find((r) => r.labels[0] === "Hemoglobin")!;
    expect(hb.category).toBe("existing_catalog_match");
    expect(hb.reasons[0]).toContain("cv-075");
    const p1np = rows.find((r) => r.labels[0] === "P1NP" && r.unit === "ng/mL")!;
    expect(p1np.category).toBe("conflicting_identity");
    expect(new Set(p1np.references.map((x) => x.domain))).toEqual(new Set(["bone", "immune"]));
  });

  test("names and domains are proposed only from existing references", () => {
    const wbc = by("ubt-813d9e97");
    expect(wbc.labels).toEqual(["IMM-001"]);
    expect(wbc).toMatchObject({
      category: "eligible",
      proposedDisplayName: "White blood cell count (total leukocytes)",
      proposedDomain: "immune",
      aliases: ["IMM-001"],
    });
    const k = by("ubt-0312222c");
    expect(k).toMatchObject({ displayName: "Urinary Potassium", domain: "bone" });
    const unref = rows.find((r) => r.labels[0] === "Resting heart rate")!;
    expect(unref.references).toHaveLength(0);
    expect(unref.proposedDomain).toBeNull();
    expect(needsDomainChoice(unref)).toBe(true);
    for (const r of rows) {
      expect(Object.keys(r)).not.toContain("specimen");
      expect(Object.keys(r)).not.toContain("method");
    }
  });

  test("an explicit domain choice makes a term eligible; a short name blocks it", () => {
    const unref = rows.find((r) => r.labels[0] === "Resting heart rate")!;
    const again = buildBulkDemoPreflight(fixtureTerms(), {
      ...LIVE_STATE,
      existingMatch: () => null,
      overrides: new Map([
        [unref.key, { domain: "cardiovascular" as HealthDomainId }],
        [rows.find((r) => r.termId === "ubt-0312222c")!.key, { displayName: "K" }],
      ]),
    });
    expect(again.find((r) => r.key === unref.key)!.category).toBe("eligible");
    expect(again.find((r) => r.termId === "ubt-0312222c")!.category).toBe("blocked");
  });

  test("duplicates by term or by label + exact unit are never merged", () => {
    const base = fixtureTerms();
    const copy = { ...base.find((t) => t.termId === "ubt-0312222c")!, submissionId: "00000000-0000-4000-8000-000000000999", receivedSeq: 3 };
    const sameLabel = { ...copy, termId: "ubt-00000001", originalLabels: ["urinary  potassium"] };
    const out = buildBulkDemoPreflight([...base, copy, sameLabel], {
      ...LIVE_STATE,
      existingMatch: () => null,
    });
    const dup = out.filter((r) => r.category === "duplicate");
    expect(dup.map((r) => r.duplicateOf)).toEqual(["ubt-0312222c", "ubt-0312222c"]);
  });

  test("unit text is literal: alternatives and unspecified units are ambiguous", () => {
    expect(ambiguousUnitReason("")).toContain("No exact unit");
    expect(ambiguousUnitReason("mg/dL ή mmol/L")).toContain("Alternative");
    expect(ambiguousUnitReason("assay-specific")).toContain("not specified");
    expect(ambiguousUnitReason("hours/days")).toContain("Alternative");
    expect(ambiguousUnitReason("fractional absorption / model")).toContain("Alternative");
    for (const u of ["ng/mL", "hours/day", "mL/min/1.73m²", "10^9/L", "% sessions", "0-10"])
      expect(ambiguousUnitReason(u)).toBeNull();
  });
});

describe("owner scope authorization SQL", () => {
  const file = readFileSync(
    resolve(here, "../../supabase/pending/20261108030001_p38_bulk_demo_scope.authorize.sql"),
    "utf8",
  );
  test("is byte-identical to the preflight-generated statement", () => {
    expect(file).toBe(scopeAuthorizationSql());
  });
  test("authorizes exactly the 185 decidable terms and nothing blocked", () => {
    const rows = livePreflight();
    expect((file.match(/::uuid, 'ubt-/g) ?? []).length).toBe(185);
    for (const r of rows.filter((x) => !authorizable(x))) expect(file).not.toContain(`'${r.termId}'`);
    expect(file).toContain("where (select count(*) from public.p37_demo_scope) = 1");
  });
});

describe("bounded batches", () => {
  const items = Array.from({ length: 185 }, (_, i) => `t${i}`);
  const ok = (b: string[]): BatchResponse => ({
    ok: true,
    results: b.map((ref) => ({ ref, termId: ref, status: "recorded", detail: null, eventId: "e" })),
  });

  test("185 terms → 4 transactional batches of at most 50", () => {
    expect(chunk(items).map((b) => b.length)).toEqual([50, 50, 50, 35]);
    expect(() => chunk(items, 51)).toThrow();
  });

  test("a failed batch stops the run and is returned for retry with everything after it", async () => {
    let calls = 0;
    const progress: number[] = [];
    const first = await runBulkBatches(
      items,
      async (b) => (++calls === 3 ? { ok: false, message: "network" } : ok(b)),
      (p) => progress.push(p.batchesDone),
    );
    expect(first.failure).toBe("network");
    expect(first.results).toHaveLength(100);
    expect(first.remaining).toEqual(items.slice(100));
    expect(progress).toEqual([0, 1, 2]);
    const retry = await runBulkBatches(first.remaining, async (b) => ok(b));
    expect(retry.failure).toBeNull();
    expect(summarizeBulk([...first.results, ...retry.results]).recorded).toBe(185);
  });

  test("a response that does not cover the whole batch is not trusted", async () => {
    const r = await runBulkBatches(items.slice(0, 3), async (b) => ok(b.slice(1)));
    expect(r.failure).toContain("validation");
    expect(r.remaining).toHaveLength(3);
  });

  test("retry keys are deterministic per caller and exact request", async () => {
    const a = await deterministicUuid("p38-demo-decide", "u1", M, "s", "ubt-1", "Name", "bone");
    expect(a).toBe(await deterministicUuid("p38-demo-decide", "u1", M, "s", "ubt-1", "Name", "bone"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(await deterministicUuid("p38-demo-decide", "u2", M, "s", "ubt-1", "Name", "bone"));
    expect(a).not.toBe(await deterministicUuid("p38-demo-decide", "u1", M, "s", "ubt-1", "Name", "immune"));
  });
});

describe("Ground Medical activation preview", () => {
  const p = (id: string, over: Partial<PendingDemoProposal> = {}): PendingDemoProposal => ({
    decisionEventId: id,
    submissionId: "s",
    termId: `ubt-${id.padStart(8, "0")}`,
    demoId: `demo:ubt-${id.padStart(8, "0")}`,
    entrySha256: "a".repeat(64),
    entry: { displayName: `Marker ${id}`, aliases: [`M${id}`], unit: "mg/L", domain: "immune" },
    decidedByCaller: false,
    activationEventId: null,
    revocationEventId: null,
    ...over,
  });
  test("skips active, revoked, own, out-of-scope and conflicting proposals", () => {
    const rows = activationPreview(
      [
        p("1", { activationEventId: "a" }),
        p("2", { activationEventId: "a", revocationEventId: "r" }),
        p("3", { decidedByCaller: true }),
        p("4"),
        p("5", { entry: { displayName: "Marker 1", aliases: ["x"], unit: "mg/L", domain: "immune" } }),
        p("6", { entry: { displayName: "Marker 4", aliases: ["y"], unit: "mg/L", domain: "bone" } }),
        p("7", { entry: { displayName: "Marker 4", aliases: ["y"], unit: "g/L", domain: "bone" } }),
        p("8"),
      ],
      (x) => x.decisionEventId !== "8",
    );
    expect(rows.map((r) => r.category)).toEqual([
      "already_active",
      "revoked",
      "decided_by_caller",
      "eligible",
      "conflict",
      "conflict",
      "eligible",
      "not_authorized",
    ]);
  });
});

describe("NEW multi-biomarker synthetic examination after bulk activation", () => {
  // Test-only domain choices for terms no reference classifies.
  const rows = buildBulkDemoPreflight(fixtureTerms(), {
    ...LIVE_STATE,
    existingMatch: () => null,
    overrides: new Map(
      livePreflight()
        .filter((r) => needsDomainChoice(r) || r.category === "conflicting_identity")
        .map((r) => [r.key, { domain: "cardiovascular" as HealthDomainId }]),
    ),
  }).filter((r) => r.category === "eligible" && authorizable(r));
  const entryOf = (r: PreflightRow, i: number, revoked = false): SyntheticDemoEntry => ({
    demoId: `demo:${r.termId}`,
    displayName: r.displayName,
    aliases: r.aliases,
    unit: r.unit,
    domain: r.domain!,
    provenance: "synthetic",
    missionId: M,
    submissionId: r.submissionId,
    termId: r.termId,
    classification: SYNTHETIC_DEMO_CLASSIFICATION,
    sourceDocumentSha256: ["5".repeat(64)],
    status: revoked ? "REVOKED" : "ACTIVE",
    decision: { decisionEventId: `d${i}`, decidedAt: "2026-11-08T10:00:00Z", entrySha256: "b".repeat(64) },
    activation: { activationEventId: `a${i}`, activatedAt: "2026-11-08T11:00:00Z", demoCatalogVersion: 3 + i },
    revocation: revoked
      ? { revocationEventId: `r${i}`, revokedAt: "2026-11-08T12:00:00Z", reason: "synthetic test", demoCatalogVersion: 500 }
      : null,
  });
  const snap = (revokeTerm?: string): SyntheticDemoSnapshot => ({
    schema: "mitochondria.synthetic-demo-catalog-snapshot.v1",
    environment: "synthetic_demo",
    missionId: M,
    demoCatalogVersion: revokeTerm ? 500 : 400,
    issuedAt: "2026-11-08T11:30:00Z",
    entries: rows.map((r, i) => entryOf(r, i, r.termId === revokeTerm)),
  });
  const csv = [
    "label,value,unit,collection_date",
    "IMM-001,6.1,10^9/L,2026-11-08",
    "Urinary Potassium,61,mmol/day,2026-11-08",
    "BSC-001,7.2,h,2026-11-08",
    "Resting heart rate,58,bpm,2026-11-08",
    "Urinary Potassium,61,mmol/L,2026-11-08",
    "Hemoglobin,14.1,g/dL,2026-11-08",
  ].join("\n");
  const storage = (): SnapshotStorage => {
    const m = new Map<string, string>();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
  };

  test("185 entries verify; compatible rows are recognized, saved, charted and reported", async () => {
    expect(rows).toHaveLength(185);
    const k = await generateTestSigningKey("test-p38-bulk");
    const trusted = { ...k.trusted, environment: "synthetic_demo" as const };
    const device = { storage: storage(), trustedKeys: [trusted] };
    const signed = await signSyntheticDemoSnapshot(snap(), trusted.keyId, k.privateKey);
    expect((await installOfferedDemoCatalog(signed, M, device)).installed).toBe(true);
    const catalogs = new Map([[M, evaluateSyntheticDemoSnapshot(snap())]]);
    expect(catalogs.get(M)!.active).toHaveLength(185);
    expect(catalogs.get(M)!.excluded).toHaveLength(0);

    const parsed = extractCsvCandidates(csv).rows;
    const classified = parsed.map((c) => ({
      c,
      r: classifyWithGovernedExtensions({ label: c.label, unit: c.unit, provenance: "synthetic", missionId: M }, undefined, undefined, catalogs),
    }));
    const demo = classified.filter((x) => x.r.syntheticDemo);
    expect(demo.map((x) => [x.c.label, x.r.classification.status === "matched" && x.r.classification.domain])).toEqual([
      ["IMM-001", "immune"],
      ["Urinary Potassium", "bone"],
      ["BSC-001", "behavioral"],
      ["Resting heart rate", "cardiovascular"],
    ]);
    const hb = classified.find((x) => x.c.label === "Hemoglobin")!.r;
    expect(hb.classification).toMatchObject({ status: "matched", metricId: "cv-075" });
    expect(hb.syntheticDemo ?? null).toBeNull();
    for (const x of demo)
      expect(
        intakeRowExclusionReason({ ...x.c, key: x.c.label, provenance: "synthetic", missionId: M, classification: x.r.classification, selected: true }),
      ).toBeNull();
    const reviewOnly = classified.filter((x) => x.r.classification.status !== "matched");
    const requests = buildUnknownBiomarkerTerms(
      reviewOnly.map((x) => ({ ...x.c, sourceKind: "csv", sourceLabel: "CSV import", classification: x.r.classification })),
    );
    expect(requests.map((t) => `${t.originalLabels[0]}|${t.originalUnit}`)).toEqual(["Urinary Potassium|mmol/L"]);

    const store = new InMemoryOfflineMissionStore();
    const saved: UnifiedObservation[] = demo.map((x, i) => {
      const b = x.r.syntheticDemo!;
      const cls = x.r.classification as { domain: HealthDomainId };
      return {
        schema: DATED_OBSERVATION_SCHEMA,
        id: `obs-p38-${String(i).padStart(6, "0")}`,
        missionId: M,
        crewMemberId: CREW,
        metricId: b.demoId,
        domain: cls.domain,
        value: x.c.value,
        originalUnit: x.c.unit,
        observedAt: "2026-11-08",
        datePrecision: "date",
        source: { kind: "csv", label: "CSV import", documentName: "synthetic-multi.csv", documentSha256: "c".repeat(64), excerpt: `${x.c.label},${x.c.value},${x.c.unit}` },
        provenance: "synthetic",
        quality: { reviewerConfirmed: true },
        reviewState: "accepted",
        status: "active",
        catalogBasis: b,
        recordedAt: "2026-11-08T12:00:00.000Z",
      };
    });
    for (const o of saved) {
      expect(validateUnifiedObservation(o)).toBeNull();
      expect(await importUnifiedObservationEvent({ eventId: `${o.id}:entry`, eventKind: "entry", observation: o }, store)).toBe("inserted");
    }
    const history = await listUnifiedObservations(M, CREW, store);
    expect(history).toHaveLength(4);
    const scope = { missionId: M, crewMemberId: CREW, provenance: "synthetic" as const };
    const projected = projectCanonicalObservations(
      history.map((o) => ({ id: o.id, missionId: M, crewMemberId: CREW, kind: "observation", eventTimestamp: o.recordedAt, sourceId: "unified-intake", classification: "medical_sensitive", location: "local", payload: { observation: o } })),
      scope,
    );
    expect(projected.nonChartable).toHaveLength(0);
    expect(projected.observations.map((o) => o.healthDomain).sort()).toEqual(["behavioral", "bone", "cardiovascular", "immune"]);
    const report = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: history, deviceRecords: [] }, scope);
    expect(report.rows).toHaveLength(4);
    for (const r of report.rows) expect(r.metricLabel).toContain("SYNTHETIC DEMO (not scientifically validated)");

    // Offline: a fresh load uses only the stored signed snapshot.
    resetSyntheticDemoCatalogsForTests();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    try {
      expect((await loadInstalledDemoCatalogs(device)).loaded).toBe(1);
      const r = classifyWithGovernedExtensions({ label: "IMM-001", unit: "10^9/L", provenance: "synthetic", missionId: M });
      expect(r.classification).toMatchObject({ status: "matched", metricId: "demo:ubt-813d9e97" });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("never recognized for real data or another mission; revocation keeps history", () => {
    const catalogs = new Map([[M, evaluateSyntheticDemoSnapshot(snap())]]);
    const st = (over: object) =>
      classifyWithGovernedExtensions({ label: "Urinary Potassium", unit: "mmol/day", provenance: "synthetic", missionId: M, ...over }, undefined, undefined, catalogs).classification.status;
    expect(st({})).toBe("matched");
    expect(st({ provenance: "real" })).not.toBe("matched");
    expect(st({ missionId: "MISSION_TEST" })).not.toBe("matched");
    const revoked = new Map([[M, evaluateSyntheticDemoSnapshot(snap("ubt-0312222c"))]]);
    expect(
      classifyWithGovernedExtensions({ label: "Urinary Potassium", unit: "mmol/day", provenance: "synthetic", missionId: M }, undefined, undefined, revoked).classification.status,
    ).not.toBe("matched");
    const hist = classifyWithGovernedExtensions(
      { label: "demo:ubt-0312222c", unit: "mmol/day", provenance: "synthetic", missionId: M, identity: "canonical", includeRevoked: true },
      undefined,
      undefined,
      revoked,
    );
    expect(hist.classification).toMatchObject({ status: "matched", domain: "bone" });
    expect(
      classifyWithGovernedExtensions({ label: "IMM-001", unit: "10^9/L", provenance: "synthetic", missionId: M }, undefined, undefined, revoked).classification.status,
    ).toBe("matched");
  });
});
