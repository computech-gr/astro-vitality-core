/**
 * P37 automatic SYNTHETIC DEMO integration: after a Ground Medical demo
 * activation, a NEW synthetic examination of the same mission goes through the
 * normal intake path (parse → classify → eligibility → save → history →
 * domain projection → report → sync check) with no further approval, online
 * and offline, while revocation stops new recognition and keeps history.
 * Synthetic fixtures and per-run test keys only; nothing here is scientific evidence.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  SYNTHETIC_DEMO_CLASSIFICATION,
  evaluateSyntheticDemoSnapshot,
  signSyntheticDemoSnapshot,
  type SyntheticDemoEntry,
  type SyntheticDemoSnapshot,
} from "../../src/domain/health-intelligence/synthetic-demo-catalog";
import {
  SYNTHETIC_DEMO_STORAGE_KEY,
  getSyntheticDemoCatalogs,
  installOfferedDemoCatalog,
  loadInstalledDemoCatalogs,
  resetSyntheticDemoCatalogsForTests,
} from "../../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { refreshSyntheticDemoCatalogs } from "../../src/domain/health-intelligence/synthetic-demo-catalog-sync";
import {
  generateTestSigningKey,
  type TrustedKey,
} from "../../src/domain/health-intelligence/catalog-snapshot-signing";
import type { SnapshotStorage } from "../../src/domain/health-intelligence/active-catalog-runtime";
import {
  buildUnknownBiomarkerTerms,
  classifyWithGovernedExtensions,
} from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { classifyIntakeObservation } from "../../src/domain/health-domains/unified-intake-classification";
import { extractCsvCandidates } from "../../src/domain/health-intelligence/universal-intake-parser";
import { intakeRowExclusionReason } from "../../src/domain/health-intelligence/intake-review-selection";
import {
  DATED_OBSERVATION_SCHEMA,
  SYNTHETIC_DEMO_BASIS_CLASSIFICATION,
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
import { checkObservationSyncEvent } from "../../src/domain/health-intelligence/observation-sync";
import { planObservationCorrection } from "../../src/domain/health-intelligence/stored-observation-review";
import { serverDemoCatalogs } from "../../src/lib/observation-sync.server";

const MISSION = "MITO_DEMO_2026";
const CREW = "crew-demo-1";
const LABEL = "25(OH) Vitamin D";
const UNIT = "ng/mL";
const DEMO_ID = "demo:ubt-7b25ce69";
const SCOPE = { missionId: MISSION, crewMemberId: CREW, provenance: "synthetic" as const };

function entry(over: Partial<SyntheticDemoEntry> = {}): SyntheticDemoEntry {
  return {
    demoId: DEMO_ID,
    displayName: "25-Hydroxyvitamin D",
    aliases: [LABEL],
    unit: UNIT,
    domain: "bone",
    provenance: "synthetic",
    missionId: MISSION,
    submissionId: "79291202-436a-4568-af8a-5458640913eb",
    termId: "ubt-7b25ce69",
    classification: SYNTHETIC_DEMO_CLASSIFICATION,
    sourceDocumentSha256: ["a".repeat(64)],
    status: "ACTIVE",
    decision: {
      decisionEventId: "d1",
      decidedAt: "2026-11-07T12:16:19Z",
      entrySha256: "b".repeat(64),
    },
    activation: {
      activationEventId: "a1",
      activatedAt: "2026-11-07T12:19:13Z",
      demoCatalogVersion: 2,
    },
    revocation: null,
    ...over,
  };
}
const revokedEntry = () =>
  entry({
    status: "REVOKED",
    revocation: {
      revocationEventId: "r1",
      revokedAt: "2026-11-07T14:00:00Z",
      reason: "synthetic test end",
      demoCatalogVersion: 3,
    },
  });
const snapshot = (
  entries: SyntheticDemoEntry[],
  v = 2,
  missionId = MISSION,
): SyntheticDemoSnapshot => ({
  schema: "mitochondria.synthetic-demo-catalog-snapshot.v1",
  environment: "synthetic_demo",
  missionId,
  demoCatalogVersion: v,
  issuedAt: "2026-11-07T12:20:00Z",
  entries,
});
const catalogsOf = (s: SyntheticDemoSnapshot) =>
  new Map([[s.missionId, evaluateSyntheticDemoSnapshot(s)]]);
const ACTIVE = catalogsOf(snapshot([entry()]));
const REVOKED = catalogsOf(snapshot([revokedEntry()], 3));

async function demoKey() {
  const k = await generateTestSigningKey("test-synthetic-demo-int");
  const trusted: TrustedKey = { ...k.trusted, environment: "synthetic_demo" };
  return { privateKey: k.privateKey, trusted };
}
function memoryStorage(): SnapshotStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

/** The same steps the intake screen runs for one parsed row (classify → eligibility → envelope). */
function intakeRecord(
  candidate: {
    label: string;
    value: string;
    unit: string;
    observedAt: string;
    datePrecision?: "date" | "instant";
  },
  catalogs: ReadonlyMap<string, ReturnType<typeof evaluateSyntheticDemoSnapshot>>,
  provenance: "synthetic" | "real" = "synthetic",
  missionId = MISSION,
) {
  const input = { label: candidate.label, unit: candidate.unit, provenance, missionId };
  const r = classifyWithGovernedExtensions(input, undefined, undefined, catalogs);
  const row = {
    ...candidate,
    ...input,
    key: "k",
    classification: r.classification,
    selected: true,
  };
  return { r, row };
}
function envelope(
  c: { value: string; observedAt: string },
  basis: NonNullable<ReturnType<typeof classifyWithGovernedExtensions>["syntheticDemo"]>,
  id = "obs-demo-000001",
): UnifiedObservation {
  return {
    schema: DATED_OBSERVATION_SCHEMA,
    id,
    missionId: MISSION,
    crewMemberId: CREW,
    metricId: basis.demoId,
    domain: "bone",
    value: c.value,
    originalUnit: UNIT,
    observedAt: c.observedAt,
    datePrecision: "date",
    source: {
      kind: "csv",
      label: "CSV import",
      documentName: "synthetic-exam-2.csv",
      documentSha256: "c".repeat(64),
      excerpt: `${LABEL},${c.value},${UNIT}`,
    },
    provenance: "synthetic",
    quality: { reviewerConfirmed: true },
    reviewState: "accepted",
    status: "active",
    catalogBasis: basis,
    recordedAt: "2026-11-07T15:00:00.000Z",
  };
}

beforeEach(() => resetSyntheticDemoCatalogsForTests());
afterAll(() => resetSyntheticDemoCatalogsForTests());

describe("matching rules", () => {
  test("handbook bone-019 near-miss does not suppress the activated mission demo entry", () => {
    expect(classifyIntakeObservation({ label: LABEL, unit: UNIT }).status).toBe(
      "unit_review_required",
    );
    const r = classifyWithGovernedExtensions(
      { label: LABEL, unit: UNIT, provenance: "synthetic", missionId: MISSION },
      undefined,
      undefined,
      ACTIVE,
    );
    expect(r.classification).toMatchObject({
      status: "matched",
      metricId: DEMO_ID,
      domain: "bone",
    });
    expect(r.syntheticDemo).toMatchObject({
      kind: "synthetic_demo",
      termId: "ubt-7b25ce69",
      demoCatalogVersion: 2,
      classification: SYNTHETIC_DEMO_CLASSIFICATION,
    });
  });

  test("never for real data, another mission, another unit or a source-unvalidated row", () => {
    const base = { label: LABEL, unit: UNIT, provenance: "synthetic" as const, missionId: MISSION };
    const status = (over: object) =>
      classifyWithGovernedExtensions({ ...base, ...over }, undefined, undefined, ACTIVE)
        .classification.status;
    expect(status({ provenance: "real" })).toBe("unit_review_required");
    expect(status({ provenance: undefined })).toBe("unit_review_required");
    expect(status({ missionId: "MISSION_TEST" })).toBe("unit_review_required");
    expect(status({ missionId: undefined })).toBe("unit_review_required");
    expect(status({ unit: "nmol/L" })).not.toBe("matched");
    expect(status({ sourceValidation: "unvalidated" })).toBe("unclassified");
  });

  test("an exact handbook match is never replaced by a demo entry", () => {
    const clash = catalogsOf(snapshot([entry({ aliases: ["cv-001"], unit: "bpm" })]));
    const r = classifyWithGovernedExtensions(
      { label: "cv-001", unit: "bpm", provenance: "synthetic", missionId: MISSION },
      undefined,
      undefined,
      clash,
    );
    expect(r.classification).toMatchObject({ status: "matched", metricId: "cv-001" });
    expect(r.syntheticDemo ?? null).toBeNull();
  });
});

describe("NEW synthetic examination through the normal intake path", () => {
  const csv = `label,value,unit,collection_date\n${LABEL},31.4,${UNIT},2026-11-07\n${LABEL},78,nmol/L,2026-11-07`;

  test("recognized automatically, eligible for saving, no unknown-biomarker request", async () => {
    // The device catalog (what the intake screen's eligibility check reads) holds the verified snapshot.
    const k = await demoKey();
    await installOfferedDemoCatalog(
      await signSyntheticDemoSnapshot(snapshot([entry()]), k.trusted.keyId, k.privateKey),
      MISSION,
      { storage: memoryStorage(), trustedKeys: [k.trusted] },
    );
    const parsed = extractCsvCandidates(csv).rows;
    expect(parsed).toHaveLength(2);
    const [vitD, otherUnit] = parsed.map((c) => intakeRecord(c, ACTIVE));
    expect(vitD!.r.classification).toMatchObject({
      status: "matched",
      metricId: DEMO_ID,
      domain: "bone",
    });
    expect(
      intakeRowExclusionReason({ ...vitD!.row, classification: vitD!.r.classification }),
    ).toBeNull();
    expect(otherUnit!.r.classification.status).not.toBe("matched");
    const reviewOnly = [vitD!, otherUnit!].filter((x) => x.r.classification.status !== "matched");
    const terms = buildUnknownBiomarkerTerms(
      reviewOnly.map((x) => ({
        ...x.row,
        sourceKind: "csv",
        sourceLabel: "CSV import",
        classification: x.r.classification,
      })),
    );
    expect(terms).toHaveLength(1);
    expect(terms[0]!.originalUnit).toBe("nmol/L");
  });

  test("saved as a labelled synthetic record, listed in history, charted under Bone and reported", async () => {
    const [c] = extractCsvCandidates(csv).rows;
    const { r } = intakeRecord(c!, ACTIVE);
    const o = envelope(c!, r.syntheticDemo!);
    expect(validateUnifiedObservation(o)).toBeNull();
    const store = new InMemoryOfflineMissionStore();
    expect(
      await importUnifiedObservationEvent(
        { eventId: `${o.id}:entry`, eventKind: "entry", observation: o },
        store,
      ),
    ).toBe("inserted");
    const history = await listUnifiedObservations(MISSION, CREW, store);
    expect(history).toHaveLength(1);
    expect(history[0]!.catalogBasis?.classification).toBe(SYNTHETIC_DEMO_BASIS_CLASSIFICATION);
    expect(history[0]!.source.documentSha256).toBe("c".repeat(64));
    expect(await listUnifiedObservations("MISSION_TEST", CREW, store)).toHaveLength(0);

    const projected = projectCanonicalObservations(
      [
        {
          id: o.id,
          missionId: MISSION,
          crewMemberId: CREW,
          kind: "observation",
          eventTimestamp: o.recordedAt,
          sourceId: "unified-intake",
          classification: "medical_sensitive",
          location: "local",
          payload: { observation: o },
        },
      ],
      SCOPE,
    );
    expect(projected.nonChartable).toHaveLength(0);
    expect(projected.observations[0]).toMatchObject({
      healthDomain: "bone",
      metricCode: DEMO_ID,
      value: 31.4,
      unit: UNIT,
      provenance: "synthetic",
    });
    expect(projected.observations[0]!.metricLabel).toContain("SYNTHETIC DEMO");

    const report = buildUnifiedHealthReport(
      { domainEntries: {}, unifiedObservations: history, deviceRecords: [] },
      SCOPE,
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      metricId: DEMO_ID,
      unit: UNIT,
      provenance: "synthetic",
    });
    expect(report.rows[0]!.metricLabel).toContain("SYNTHETIC DEMO (not scientifically validated)");
  });

  test("demo records can never be real, unlabelled or carry a tampered basis", () => {
    const [c] = extractCsvCandidates(csv).rows;
    const basis = intakeRecord(c!, ACTIVE).r.syntheticDemo!;
    const o = envelope(c!, basis);
    expect(validateUnifiedObservation({ ...o, provenance: "real" })).not.toBeNull();
    const { catalogBasis: _b, ...unlabelled } = o;
    void _b;
    expect(validateUnifiedObservation(unlabelled as UnifiedObservation)).not.toBeNull();
    expect(
      validateUnifiedObservation({ ...o, catalogBasis: { ...basis, termId: "ubt-00000000" } }),
    ).not.toBeNull();
    expect(
      validateUnifiedObservation({
        ...o,
        catalogBasis: {
          ...basis,
          classification: "VALIDATED" as typeof SYNTHETIC_DEMO_BASIS_CLASSIFICATION,
        },
      }),
    ).not.toBeNull();
    expect(
      validateUnifiedObservation({ ...o, metricId: "bone-019", catalogBasis: basis }),
    ).not.toBeNull();
  });
});

describe("sync, corrections and revocation", () => {
  const c = { value: "31.4", observedAt: "2026-11-07" };
  const basis = classifyWithGovernedExtensions(
    { label: LABEL, unit: UNIT, provenance: "synthetic", missionId: MISSION },
    undefined,
    undefined,
    ACTIVE,
  ).syntheticDemo!;
  const o = envelope(c, basis);
  const event = { eventId: `${o.id}:entry`, eventKind: "entry" as const, observation: o };

  test("sync accepts it only against the same mission's demo catalog (revoked kept for history)", () => {
    expect(checkObservationSyncEvent(event, SCOPE, ACTIVE)).toBeNull();
    expect(checkObservationSyncEvent(event, SCOPE, REVOKED)).toBeNull();
    expect(checkObservationSyncEvent(event, SCOPE, new Map())).not.toBeNull();
    expect(
      checkObservationSyncEvent(
        event,
        SCOPE,
        catalogsOf(snapshot([entry({ missionId: "OTHER" })], 2, "OTHER")),
      ),
    ).not.toBeNull();
  });

  test("server reads the caller-scoped demo catalog; real scopes and failures fail closed", async () => {
    const calls: string[] = [];
    const rpc = async (fn: string) => {
      calls.push(fn);
      return {
        data: { mission_id: MISSION, demo_catalog_version: 2, entries: [entry()] },
        error: null,
      };
    };
    const server = await serverDemoCatalogs({ rpc }, SCOPE);
    expect(checkObservationSyncEvent(event, SCOPE, server)).toBeNull();
    expect(calls).toEqual(["p37_demo_catalog_snapshot_v1"]);
    expect((await serverDemoCatalogs({ rpc }, { ...SCOPE, provenance: "real" })).size).toBe(0);
    expect(calls).toHaveLength(1);
    const failing = async () => ({ data: null, error: { code: "42501" } });
    expect((await serverDemoCatalogs({ rpc: failing }, SCOPE)).size).toBe(0);
    const wrongMission = async () => ({
      data: { mission_id: "OTHER", demo_catalog_version: 2, entries: [entry()] },
      error: null,
    });
    expect((await serverDemoCatalogs({ rpc: wrongMission }, SCOPE)).size).toBe(0);
  });

  test("revocation stops new recognition but history stays valid and charted", () => {
    const r = classifyWithGovernedExtensions(
      { label: LABEL, unit: UNIT, provenance: "synthetic", missionId: MISSION },
      undefined,
      undefined,
      REVOKED,
    );
    expect(r.classification.status).toBe("unit_review_required");
    expect(r.syntheticDemo ?? null).toBeNull();
    expect(validateUnifiedObservation(o)).toBeNull();
    const projected = projectCanonicalObservations(
      [
        {
          id: o.id,
          missionId: MISSION,
          crewMemberId: CREW,
          kind: "observation",
          eventTimestamp: o.recordedAt,
          sourceId: "unified-intake",
          classification: "medical_sensitive",
          location: "local",
          payload: { observation: o },
        },
      ],
      SCOPE,
    );
    expect(projected.observations).toHaveLength(1);
  });

  test("Ground Medical correction keeps the demo basis while active and is refused after revocation", async () => {
    const ctx = {
      actorUserId: "00000000-0000-4000-8000-0000000000a2",
      rolesForScope: ["ground_medical"],
      scope: SCOPE,
      decidedAt: "2026-11-07T16:00:00.000Z",
    };
    const draft = {
      metricId: DEMO_ID,
      value: "32.0",
      unit: UNIT,
      observedAt: "2026-11-07",
      datePrecision: "date" as const,
      reason: "Synthetic transcription correction",
      confirmed: true,
    };
    const store =
      await import("../../src/domain/health-intelligence/synthetic-demo-catalog-runtime");
    const k = await demoKey();
    const storage = memoryStorage();
    const opts = { storage, trustedKeys: [k.trusted] };
    await store.installOfferedDemoCatalog(
      await signSyntheticDemoSnapshot(snapshot([entry()]), k.trusted.keyId, k.privateKey),
      MISSION,
      opts,
    );
    const plan = planObservationCorrection(o, [o], draft, ctx);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.corrected.catalogBasis?.demoId).toBe(DEMO_ID);
    await store.installOfferedDemoCatalog(
      await signSyntheticDemoSnapshot(snapshot([revokedEntry()], 3), k.trusted.keyId, k.privateKey),
      MISSION,
      opts,
    );
    expect(planObservationCorrection(o, [o], draft, ctx).ok).toBe(false);
  });
});

describe("offline use and automatic refresh", () => {
  test("offline: recognized from the stored signed snapshot after reload, no network", async () => {
    const k = await demoKey();
    const storage = memoryStorage();
    const opts = { storage, trustedKeys: [k.trusted] };
    await installOfferedDemoCatalog(
      await signSyntheticDemoSnapshot(snapshot([entry()]), k.trusted.keyId, k.privateKey),
      MISSION,
      opts,
    );
    resetSyntheticDemoCatalogsForTests();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch;
    try {
      expect((await loadInstalledDemoCatalogs(opts)).loaded).toBe(1);
      // Default (device) catalogs: exactly what the intake screen uses.
      expect(
        classifyWithGovernedExtensions({
          label: LABEL,
          unit: UNIT,
          provenance: "synthetic",
          missionId: MISSION,
        }).classification,
      ).toMatchObject({ status: "matched", metricId: DEMO_ID });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("refresh installs activation then revocation; offline/failed/unverified keep the last verified one", async () => {
    const k = await demoKey();
    const storage = memoryStorage();
    const opts = { storage, trustedKeys: [k.trusted] };
    const signed = (s: SyntheticDemoSnapshot) =>
      signSyntheticDemoSnapshot(s, k.trusted.keyId, k.privateKey);
    let fetched = 0;
    const offline = await refreshSyntheticDemoCatalogs([MISSION], async () => (fetched++, null), {
      ...opts,
      isOnline: () => false,
    });
    expect(offline[0]!.outcome).toBe("offline");
    expect(fetched).toBe(0);

    const empty = await refreshSyntheticDemoCatalogs(
      ["MISSION_TEST"],
      async () => ({ ok: true, signed: await signed(snapshot([], 0, "MISSION_TEST")) }),
      opts,
    );
    expect(empty[0]!.outcome).toBe("current");
    expect(storage.map.has(SYNTHETIC_DEMO_STORAGE_KEY)).toBe(false);

    const first = await refreshSyntheticDemoCatalogs(
      [MISSION],
      async () => ({ ok: true, signed: await signed(snapshot([entry()])) }),
      opts,
    );
    expect(first[0]!.outcome).toBe("installed");
    expect(getSyntheticDemoCatalogs().get(MISSION)?.active).toHaveLength(1);

    const again = await refreshSyntheticDemoCatalogs(
      [MISSION],
      async () => ({ ok: true, signed: await signed(snapshot([entry()])) }),
      opts,
    );
    expect(again[0]!.outcome).toBe("current");

    const forged = await refreshSyntheticDemoCatalogs(
      [MISSION],
      async () => ({
        ok: true,
        signed: { ...(await signed(snapshot([revokedEntry()], 3))), signature: "AAAA" },
      }),
      opts,
    );
    expect(forged[0]!.outcome).toBe("refused");
    const failed = await refreshSyntheticDemoCatalogs(
      [MISSION],
      async () => ({ ok: false, message: "unavailable" }),
      opts,
    );
    expect(failed[0]!.outcome).toBe("unavailable");
    expect(getSyntheticDemoCatalogs().get(MISSION)?.active).toHaveLength(1);

    const revoked = await refreshSyntheticDemoCatalogs(
      [MISSION],
      async () => ({ ok: true, signed: await signed(snapshot([revokedEntry()], 3)) }),
      opts,
    );
    expect(revoked[0]!.outcome).toBe("installed");
    expect(
      classifyWithGovernedExtensions({
        label: LABEL,
        unit: UNIT,
        provenance: "synthetic",
        missionId: MISSION,
      }).classification.status,
    ).toBe("unit_review_required");
  });
});
