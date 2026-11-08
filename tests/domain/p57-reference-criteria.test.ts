/**
 * P57 regression tests — reference-criteria registry, Researcher decisions,
 * server attestation and fail-closed application. Uses a throwaway signing
 * secret trusted only by these tests; production devices never accept it.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approvalBlocker,
  bundledCriteriaRegistry,
  classifyWithCriteria,
  criterionFingerprint,
  validateCriteriaRegistry,
} from "../../src/domain/health-intelligence/p57-reference-criteria";
import {
  CRITERIA_APPROVAL_ACKNOWLEDGEMENT,
  planCriteriaAttestations,
  planCriteriaDecisions,
  resolveCriteriaReview,
  type CriteriaEvent,
} from "../../src/domain/health-intelligence/p57-criteria-review";
import { CRITERIA_ATTESTATION_KEY_ID, deriveCriteriaAttestationKey } from "../../src/domain/health-intelligence/p57-criteria-attestation";
import { attestCriteriaDecisionsCore } from "../../src/lib/reference-criteria.server";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEST_SECRET = "test-only-p57-criteria-attestation-secret-not-deployed-0123456789";
const derived = await deriveCriteriaAttestationKey(TEST_SECRET);
const TEST_KEYS = [{ keyId: CRITERIA_ATTESTATION_KEY_ID, publicKeySpkiBase64: derived.publicKeySpkiBase64, environment: "criteria_attestation" }];
const registry = bundledCriteriaRegistry();
const MISSION = "mission-test";
const now = "2026-11-08T10:00:00.000Z";

async function approveAndAttest(ids: string[], conditions: string[], researcherMissions = [MISSION]) {
  let events: CriteriaEvent[] = [];
  const res0 = await resolveCriteriaReview(registry, events, TEST_KEYS);
  const plan = await planCriteriaDecisions(registry, events, res0, { userId: "researcher-1", researcherMissions, now }, {
    action: "APPROVE",
    criterionIds: ids,
    missions: [{ missionId: MISSION, conditions }],
    acknowledgement: CRITERIA_APPROVAL_ACKNOWLEDGEMENT,
    note: "Compared with the ADA Standards table.",
    batchId: "b1",
  });
  if (!plan.ok) throw new Error(plan.reason);
  events = [...events, ...plan.events];
  const signed = await attestCriteriaDecisionsCore(plan.events, { env: (n) => (n === "P37_CATALOG_SIGNING_KEY" ? TEST_SECRET : undefined), now: () => new Date(now), userId: "researcher-1", researcherMissions });
  if (!signed.ok) throw new Error(signed.message);
  const att = await planCriteriaAttestations(events, signed.attestations, { userId: "researcher-1", now }, TEST_KEYS);
  events = [...events, ...att.events];
  return { events, plan, signed };
}

describe("P57 registry", () => {
  it("bundled registry validates with every candidate pending and exact identities", () => {
    expect(registry.excluded).toEqual([]);
    expect(registry.criteria.length).toBe(9);
    for (const c of registry.criteria) expect(c.identity.unit).not.toMatch(/\s(or|ή)\s/);
  });
  it("criteria without an exact catalog identity can never be approved", () => {
    const acr = registry.criteria.find((c) => c.id === "p57-kdigo2024-albuminuria-confirm")!;
    expect(approvalBlocker(acr)).not.toBeNull();
  });
  it("an ambiguous unit or a demo identity is rejected by validation", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, "data/scientific/p57-reference-criteria.v1.json"), "utf8"));
    raw.criteria[0].identity.unit = "% or mmol/mol";
    raw.criteria[1].identity.catalogId = "demo:ubt-7f47ee7c";
    const v = validateCriteriaRegistry(raw);
    expect(v.excluded.map((x) => x.id)).toEqual(expect.arrayContaining([raw.criteria[0].id, raw.criteria[1].id]));
  });
  it("without approval a candidate classifies nothing", () => {
    const r = classifyWithCriteria({ metricId: "cv-085", unit: "%", domain: "cardiovascular", value: "9.1", provenance: "synthetic", missionId: MISSION, holds: [] }, []);
    expect(r.outcome).toBe("pending_approval");
    expect(r.severity).toBe("neutral");
  });
});

describe("P57 Researcher decisions and server attestation", () => {
  it("approval needs an active Researcher, the exact acknowledgement and every mission-level condition", async () => {
    const res = await resolveCriteriaReview(registry, [], TEST_KEYS);
    const base = { action: "APPROVE" as const, criterionIds: ["p57-ada2026-hba1c-categories"], missions: [{ missionId: MISSION, conditions: ["nonpregnant", "ngsp_method"] }], acknowledgement: CRITERIA_APPROVAL_ACKNOWLEDGEMENT, note: "Compared with source.", batchId: "b" };
    expect((await planCriteriaDecisions(registry, [], res, { userId: "u", researcherMissions: [], now }, base)).ok).toBe(false);
    expect((await planCriteriaDecisions(registry, [], res, { userId: "u", researcherMissions: [MISSION], now }, { ...base, acknowledgement: "ok" })).ok).toBe(false);
    const partial = await planCriteriaDecisions(registry, [], res, { userId: "u", researcherMissions: [MISSION], now }, { ...base, missions: [{ missionId: MISSION, conditions: ["nonpregnant"] }] });
    expect(partial.ok && partial.events.length === 0 && partial.skipped.length === 1).toBe(true);
  });

  it("an attested approval applies to its mission only and classifies the exact unit", async () => {
    const { events } = await approveAndAttest(["p57-ada2026-hba1c-categories"], ["nonpregnant", "ngsp_method"]);
    const res = await resolveCriteriaReview(registry, events, TEST_KEYS);
    expect(res.approved.map((a) => a.criterion.id)).toEqual(["p57-ada2026-hba1c-categories"]);
    const ctx = { metricId: "cv-085", unit: "%", domain: "cardiovascular" as const, value: "9.1", provenance: "synthetic" as const, holds: [] };
    expect(classifyWithCriteria({ ...ctx, missionId: MISSION }, res.approved).severity).toBe("red");
    expect(classifyWithCriteria({ ...ctx, missionId: "other" }, res.approved).severity).toBe("neutral");
    expect(classifyWithCriteria({ ...ctx, missionId: MISSION, unit: "mmol/mol" }, res.approved).outcome).toBe("no_candidate");
    expect(classifyWithCriteria({ ...ctx, missionId: MISSION, holds: ["measurement-consistency check required"] }, res.approved).outcome).toBe("held");
  });

  it("an approval without a trusted server attestation is never applied", async () => {
    const { events } = await approveAndAttest(["p57-ada2026-hba1c-categories"], ["nonpregnant", "ngsp_method"]);
    const bundled = await resolveCriteriaReview(registry, events); // production keys do not trust the test key
    expect(bundled.approved).toEqual([]);
    const unattested = await resolveCriteriaReview(registry, events.filter((e) => e.action !== "ATTEST"), TEST_KEYS);
    expect(unattested.approved).toEqual([]);
    expect(unattested.states.find((s) => s.criterionId === "p57-ada2026-hba1c-categories")!.status).toBe("APPROVED_AWAITING_ATTESTATION");
  });

  it("a tampered chain applies nothing", async () => {
    const { events } = await approveAndAttest(["p57-ada2026-hba1c-categories"], ["nonpregnant", "ngsp_method"]);
    const tampered = events.map((e, i) => (i === 0 ? { ...e, note: "changed later" } : e));
    const res = await resolveCriteriaReview(registry, tampered, TEST_KEYS);
    expect(res.chainOk).toBe(false);
    expect(res.approved).toEqual([]);
  });

  it("the server refuses decisions for missions where the caller is not a Researcher", async () => {
    const res = await resolveCriteriaReview(registry, [], TEST_KEYS);
    const plan = await planCriteriaDecisions(registry, [], res, { userId: "researcher-1", researcherMissions: [MISSION], now }, {
      action: "APPROVE", criterionIds: ["p57-ada2026-hba1c-categories"], missions: [{ missionId: MISSION, conditions: ["nonpregnant", "ngsp_method"] }], acknowledgement: CRITERIA_APPROVAL_ACKNOWLEDGEMENT, note: "Compared with source.", batchId: "b",
    });
    if (!plan.ok) throw new Error(plan.reason);
    const signed = await attestCriteriaDecisionsCore(plan.events, { env: () => TEST_SECRET, now: () => new Date(now), userId: "researcher-1", researcherMissions: ["another-mission"] });
    expect(signed.ok && signed.attestations.length === 0 && signed.failures.length === 1).toBe(true);
  });

  it("changing a criterion's content invalidates its fingerprint", async () => {
    const c = registry.criteria[0]!;
    expect(await criterionFingerprint({ ...c, bands: c.bands.map((b, i) => (i === 0 ? { ...b, lower: 5.6 } : b)) })).not.toBe(await criterionFingerprint(c));
    expect(await criterionFingerprint({ ...c, audit: [] })).toBe(await criterionFingerprint(c));
  });
});
