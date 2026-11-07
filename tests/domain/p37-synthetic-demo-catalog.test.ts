/**
 * P37 SYNTHETIC DEMO catalog: isolation from the production catalog, mission and
 * provenance scoping, exact-unit recognition, offline recognition from stored
 * signed bytes and no duplicate unknown-biomarker request. Synthetic fixtures
 * and per-run test keys only; nothing here is scientific evidence.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  SYNTHETIC_DEMO_CLASSIFICATION,
  deriveSyntheticDemoSigningKey,
  evaluateSyntheticDemoSnapshot,
  recognizeSyntheticDemo,
  signSyntheticDemoSnapshot,
  verifySyntheticDemoSnapshot,
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
import {
  BUNDLED_TRUSTED_KEYS,
  deriveSigningKeyFromSecret,
  generateTestSigningKey,
  verifySignedCatalogSnapshot,
  type TrustedKey,
} from "../../src/domain/health-intelligence/catalog-snapshot-signing";
import {
  installOfferedCatalog,
  resetActiveCatalogForTests,
  type SnapshotStorage,
} from "../../src/domain/health-intelligence/active-catalog-runtime";
import {
  buildUnknownBiomarkerTerms,
  classifyWithGovernedExtensions,
  syntheticDemoCoverage,
} from "../../src/domain/health-intelligence/unknown-biomarker-review";

const MISSION = "mission-9d8ce8f3e5554509a0885461f9ad2e1c";
const LABEL = "25(OH) Vitamin D";
const UNIT = "ng/mL";

function entry(over: Partial<SyntheticDemoEntry> = {}): SyntheticDemoEntry {
  return {
    demoId: "demo:ubt-7b25ce69",
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
      decidedAt: "2026-11-07T12:00:00Z",
      entrySha256: "b".repeat(64),
    },
    activation: {
      activationEventId: "a1",
      activatedAt: "2026-11-07T12:05:00Z",
      demoCatalogVersion: 2,
    },
    revocation: null,
    ...over,
  };
}
const snapshot = (
  entries: SyntheticDemoEntry[],
  v = 2,
  missionId = MISSION,
): SyntheticDemoSnapshot => ({
  schema: "mitochondria.synthetic-demo-catalog-snapshot.v1",
  environment: "synthetic_demo",
  missionId,
  demoCatalogVersion: v,
  issuedAt: "2026-11-07T12:06:00Z",
  entries,
});

async function demoKey() {
  const k = await generateTestSigningKey("test-synthetic-demo");
  const trusted: TrustedKey = { ...k.trusted, environment: "synthetic_demo" };
  return { privateKey: k.privateKey, trusted };
}
function memoryStorage(): SnapshotStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

beforeEach(() => {
  resetSyntheticDemoCatalogsForTests();
  resetActiveCatalogForTests();
});
afterAll(() => {
  resetSyntheticDemoCatalogsForTests();
  resetActiveCatalogForTests();
});

describe("isolation from the production catalog", () => {
  test("bundled demo key is synthetic_demo-only and distinct from the production key", () => {
    const demo = BUNDLED_TRUSTED_KEYS.find((k) => k.keyId === "p37-synthetic-demo-2026-11-07");
    const prod = BUNDLED_TRUSTED_KEYS.find((k) => k.environment === "production");
    expect(demo?.environment).toBe("synthetic_demo");
    expect(demo?.publicKeySpkiBase64).not.toBe(prod?.publicKeySpkiBase64);
  });

  test("demo key derivation is domain-separated from the production key", async () => {
    const secret = "x".repeat(48);
    const prod = await deriveSigningKeyFromSecret(secret);
    const demo = await deriveSyntheticDemoSigningKey(secret);
    expect(demo.publicKeySpkiBase64).not.toBe(prod.publicKeySpkiBase64);
  });

  test("production loader refuses a signed demo snapshot", async () => {
    const k = await demoKey();
    const signed = await signSyntheticDemoSnapshot(
      snapshot([entry()]),
      k.trusted.keyId,
      k.privateKey,
    );
    expect((await verifySignedCatalogSnapshot(signed, [k.trusted], ["production"])).ok).toBe(false);
    const r = await installOfferedCatalog(signed, {
      storage: memoryStorage(),
      trustedKeys: [k.trusted],
    });
    expect(r.installed).toBe(false);
  });

  test("demo verifier refuses a key registered for production or test", async () => {
    const k = await demoKey();
    const signed = await signSyntheticDemoSnapshot(
      snapshot([entry()]),
      k.trusted.keyId,
      k.privateKey,
    );
    expect(
      (await verifySyntheticDemoSnapshot(signed, [{ ...k.trusted, environment: "production" }])).ok,
    ).toBe(false);
    expect(
      (await verifySyntheticDemoSnapshot(signed, [{ ...k.trusted, environment: "test" }])).ok,
    ).toBe(false);
    expect((await verifySyntheticDemoSnapshot(signed, [k.trusted])).ok).toBe(true);
  });

  test("tampered demo snapshot fails verification", async () => {
    const k = await demoKey();
    const signed = await signSyntheticDemoSnapshot(
      snapshot([entry()]),
      k.trusted.keyId,
      k.privateKey,
    );
    signed.snapshot.entries[0]!.unit = "nmol/L";
    expect((await verifySyntheticDemoSnapshot(signed, [k.trusted])).ok).toBe(false);
  });
});

describe("recognition rules", () => {
  const catalogs = new Map([[MISSION, evaluateSyntheticDemoSnapshot(snapshot([entry()]))]]);
  const exam = { label: LABEL, unit: UNIT, provenance: "synthetic" as const, missionId: MISSION };

  test("same label and exact unit in the same mission is recognized", () => {
    const r = recognizeSyntheticDemo(exam, catalogs);
    expect(r.status).toBe("SYNTHETIC_DEMO_RECOGNIZED");
    if (r.status === "SYNTHETIC_DEMO_RECOGNIZED") expect(r.demoId).toBe("demo:ubt-7b25ce69");
  });
  test("case and spacing of the label are normalized", () => {
    expect(
      recognizeSyntheticDemo({ ...exam, label: "  25(oh)   vitamin d " }, catalogs).status,
    ).toBe("SYNTHETIC_DEMO_RECOGNIZED");
  });
  test("nmol/L is not recognized (no unit conversion)", () => {
    expect(recognizeSyntheticDemo({ ...exam, unit: "nmol/L" }, catalogs).status).toBe("UNKNOWN");
  });
  test("real provenance never uses the demo catalog", () => {
    expect(recognizeSyntheticDemo({ ...exam, provenance: "real" }, catalogs).status).toBe(
      "UNKNOWN",
    );
  });
  test("another mission is not recognized", () => {
    expect(recognizeSyntheticDemo({ ...exam, missionId: "mission-other" }, catalogs).status).toBe(
      "UNKNOWN",
    );
  });
  test("source-unvalidated rows are not recognized", () => {
    expect(
      recognizeSyntheticDemo({ ...exam, sourceValidation: "unvalidated" }, catalogs).status,
    ).toBe("UNKNOWN");
  });
  test("revoked, real-provenance, other-mission and unlabelled entries never match", () => {
    for (const bad of [
      entry({ status: "REVOKED" }),
      entry({ provenance: "real" as "synthetic" }),
      entry({ missionId: "mission-other" }),
      entry({ classification: "VALIDATED" as typeof SYNTHETIC_DEMO_CLASSIFICATION }),
      entry({ demoId: "ext:25-hydroxyvitamin-d" }),
    ]) {
      const c = new Map([[MISSION, evaluateSyntheticDemoSnapshot(snapshot([bad]))]]);
      expect(recognizeSyntheticDemo(exam, c).status).toBe("UNKNOWN");
    }
  });
  test("two active entries with the same label and unit are both excluded", () => {
    const c = evaluateSyntheticDemoSnapshot(
      snapshot([entry(), entry({ demoId: "demo:ubt-00000001", termId: "ubt-00000001" })]),
    );
    expect(c.active).toHaveLength(0);
  });
});

describe("intake coverage and no duplicate request", () => {
  const catalogs = new Map([[MISSION, evaluateSyntheticDemoSnapshot(snapshot([entry()]))]]);
  const input = { label: LABEL, unit: UNIT, provenance: "synthetic" as const, missionId: MISSION };

  test("catalog classification is unchanged (still review-only)", () => {
    expect(classifyWithGovernedExtensions(input).classification.status).toBe(
      "unit_review_required",
    );
    expect(syntheticDemoCoverage(input, catalogs)?.demoId).toBe("demo:ubt-7b25ce69");
  });

  test("a demo-covered row generates no unknown-biomarker request; an uncovered row still does", () => {
    const classification = classifyWithGovernedExtensions(input).classification;
    const row = {
      label: LABEL,
      unit: UNIT,
      value: "31",
      observedAt: "2026-11-07",
      classification,
      sourceKind: "manual",
      sourceLabel: "Synthetic",
    };
    expect(
      buildUnknownBiomarkerTerms([{ ...row, syntheticDemo: { demoId: "demo:ubt-7b25ce69" } }]),
    ).toHaveLength(0);
    expect(buildUnknownBiomarkerTerms([row])).toHaveLength(1);
    expect(buildUnknownBiomarkerTerms([{ ...row, unit: "nmol/L" }])).toHaveLength(1);
  });

  test("source-unvalidated rows are still requested even with a demo marker", () => {
    const classification = classifyWithGovernedExtensions(input).classification;
    const row = {
      label: LABEL,
      unit: UNIT,
      value: "31",
      observedAt: "",
      classification,
      sourceKind: "pdf",
      sourceLabel: "Synthetic",
      sourceValidation: "unvalidated" as const,
    };
    expect(
      buildUnknownBiomarkerTerms([{ ...row, syntheticDemo: { demoId: "demo:ubt-7b25ce69" } }]),
    ).toHaveLength(1);
  });
});

describe("device runtime", () => {
  test("installs a verified snapshot, then recognizes offline after reload from storage", async () => {
    const k = await demoKey();
    const storage = memoryStorage();
    const signed = await signSyntheticDemoSnapshot(
      snapshot([entry()]),
      k.trusted.keyId,
      k.privateKey,
    );
    expect(
      (await installOfferedDemoCatalog(signed, MISSION, { storage, trustedKeys: [k.trusted] }))
        .installed,
    ).toBe(true);
    expect(storage.map.has(SYNTHETIC_DEMO_STORAGE_KEY)).toBe(true);
    resetSyntheticDemoCatalogsForTests();
    expect(getSyntheticDemoCatalogs().size).toBe(0);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch;
    try {
      expect((await loadInstalledDemoCatalogs({ storage, trustedKeys: [k.trusted] })).loaded).toBe(
        1,
      );
      expect(
        syntheticDemoCoverage({
          label: LABEL,
          unit: UNIT,
          provenance: "synthetic",
          missionId: MISSION,
        })?.demoId,
      ).toBe("demo:ubt-7b25ce69");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("refuses other-mission, older and same-version-different snapshots", async () => {
    const k = await demoKey();
    const storage = memoryStorage();
    const o = { storage, trustedKeys: [k.trusted] };
    const sign = (s: SyntheticDemoSnapshot) =>
      signSyntheticDemoSnapshot(s, k.trusted.keyId, k.privateKey);
    expect(
      (
        await installOfferedDemoCatalog(
          await sign(snapshot([entry()], 2, "mission-other")),
          MISSION,
          o,
        )
      ).installed,
    ).toBe(false);
    expect(
      (await installOfferedDemoCatalog(await sign(snapshot([entry()], 3)), MISSION, o)).installed,
    ).toBe(true);
    expect(
      (await installOfferedDemoCatalog(await sign(snapshot([], 2)), MISSION, o)).installed,
    ).toBe(false);
    expect(
      (await installOfferedDemoCatalog(await sign(snapshot([], 3)), MISSION, o)).installed,
    ).toBe(false);
    const revoked = entry({
      status: "REVOKED",
      revocation: {
        revocationEventId: "r1",
        revokedAt: "2026-11-07T13:00:00Z",
        reason: "synthetic test end",
        demoCatalogVersion: 4,
      },
    });
    expect(
      (await installOfferedDemoCatalog(await sign(snapshot([revoked], 4)), MISSION, o)).installed,
    ).toBe(true);
    expect(
      syntheticDemoCoverage({
        label: LABEL,
        unit: UNIT,
        provenance: "synthetic",
        missionId: MISSION,
      }),
    ).toBeNull();
  });

  test("stored data that fails verification is ignored", async () => {
    const k = await demoKey();
    const storage = memoryStorage();
    storage.set(SYNTHETIC_DEMO_STORAGE_KEY, JSON.stringify({ [MISSION]: { schema: "x" } }));
    expect(await loadInstalledDemoCatalogs({ storage, trustedKeys: [k.trusted] })).toEqual({
      loaded: 0,
      rejected: 1,
    });
  });
});
