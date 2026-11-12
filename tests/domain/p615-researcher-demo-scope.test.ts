/**
 * P61.5 Researcher SYNTHETIC DEMO scope authorization and alias mappings: pure
 * eligibility rules, possible-duplicate surfacing (the three owner-flagged Bone
 * examples), identity gate before an independent decision, alias recognition
 * from a verified signed snapshot (exact unit only, fail closed), unchanged
 * behaviour of snapshots without aliases, and the server cores against a mock
 * RPC. The database rules themselves are exercised by
 * scripts/verify-p615-researcher-scope-pg.ts on a disposable PostgreSQL.
 * Synthetic fixtures and per-run test keys only.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aliasDecisionFit,
  identityReviewBlock,
  possibleExistingMatches,
  scopeAuthorizationFit,
  type DemoIdentity,
} from "../../src/domain/health-intelligence/p615-scope-authorization";
import {
  SYNTHETIC_DEMO_ALIAS_ACKNOWLEDGEMENT,
  SYNTHETIC_DEMO_ALIAS_CLASSIFICATION,
  SYNTHETIC_DEMO_CLASSIFICATION,
  demoSnapshotFromRpc,
  evaluateSyntheticDemoSnapshot,
  recognizeSyntheticDemo,
  signSyntheticDemoSnapshot,
  verifySyntheticDemoSnapshot,
  type SyntheticDemoAliasMapping,
  type SyntheticDemoEntry,
  type SyntheticDemoSnapshot,
} from "../../src/domain/health-intelligence/synthetic-demo-catalog";
import { generateTestSigningKey } from "../../src/domain/health-intelligence/catalog-snapshot-signing";
import {
  P615_MIGRATION_MESSAGE,
  aliasActivateCore,
  aliasDecideCore,
  authorizeScopeCore,
  governanceCore,
} from "../../src/lib/p615-demo-scope.server";
import { signedDemoSnapshotCore } from "../../src/lib/p37-synthetic-demo.server";
import type { Rpc } from "../../src/lib/p36-scientific-authorization.server";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MISSION = "mission-9d8ce8f3e5554509a0885461f9ad2e1c";
const SUB = "cb1ce04f-c6f8-46de-872a-3dd7d0d36423";

const ACTIVE: DemoIdentity[] = [
  { demoId: "demo:ubt-7b25ce69", termId: "ubt-7b25ce69", displayName: "25-Hydroxyvitamin D", aliases: ["25(OH) Vitamin D"], unit: "ng/mL" },
  { demoId: "demo:ubt-37f541f8", termId: "ubt-37f541f8", displayName: "P1NP / PINP", aliases: ["P1NP / PINP"], unit: "μg/L" },
  { demoId: "demo:ubt-6c8bad01", termId: "ubt-6c8bad01", displayName: "P1NP", aliases: ["P1NP"], unit: "ng/mL" },
  { demoId: "demo:ubt-d9870fc7", termId: "ubt-d9870fc7", displayName: "CTX", aliases: ["CTX"], unit: "ng/mL" },
  { demoId: "demo:ubt-9416d34e", termId: "ubt-9416d34e", displayName: "Dietary Vitamin D Intake", aliases: ["Dietary Vitamin D Intake"], unit: "IU/day" },
];
const row = (over: Partial<{ inScope: boolean; triageAction: string | null; unit: string; category: never }> = {}) => ({
  inScope: false,
  triageAction: "ACCEPT_FOR_REVIEW" as string | null,
  unit: "g/dL",
  category: "eligible" as const,
  ...over,
});
const ctx = { canAuthorize: true, submittedByCaller: false, installed: true };

describe("P61.5 scope authorization eligibility (mirrors the server)", () => {
  test("an accepted synthetic term with an exact unit is authorizable by the Researcher", () => {
    expect(scopeAuthorizationFit(row(), ctx).kind).toBe("actionable");
  });
  test("non-Researcher accounts are blocked", () => {
    expect(scopeAuthorizationFit(row(), { ...ctx, canAuthorize: false }).kind).toBe("blocked");
  });
  test("already-scoped terms (e.g. the 11 Bone terms) are never authorized again", () => {
    expect(scopeAuthorizationFit(row({ inScope: true }), ctx).kind).toBe("already");
  });
  test("terms not accepted for review are blocked", () => {
    expect(scopeAuthorizationFit(row({ triageAction: null }), ctx).kind).toBe("blocked");
    expect(scopeAuthorizationFit(row({ triageAction: "REQUEST_MORE_EVIDENCE" }), ctx).kind).toBe("blocked");
  });
  test("ambiguous or missing units are blocked and never chosen", () => {
    for (const unit of ["pmol/L ή ng/mL", "assay-specific", "hours/days", "", "mg/dL, mmol/L"])
      expect(scopeAuthorizationFit(row({ unit }), ctx).kind).toBe("blocked");
  });
  test("real (non-synthetic) submissions are blocked", () => {
    expect(scopeAuthorizationFit({ ...row(), sourceProvenance: "real" }, ctx).kind).toBe("blocked");
  });
  test("the submitter cannot authorize their own term", () => {
    expect(scopeAuthorizationFit(row(), { ...ctx, submittedByCaller: true }).kind).toBe("blocked");
  });
  test("fails closed while the pending database change is not installed", () => {
    expect(scopeAuthorizationFit(row(), { ...ctx, installed: false }).kind).toBe("blocked");
  });
});

describe("P61.5 possible existing biomarkers are surfaced, never merged", () => {
  const t = (termId: string, label: string, unit: string) => possibleExistingMatches({ termId, labels: [label], unit }, ACTIVE);
  test("25-hydroxyvitamin D [25(OH)D] ↔ 25-Hydroxyvitamin D (same exact unit)", () => {
    const m = t("ubt-029b5e6a", "25-hydroxyvitamin D [25(OH)D]", "ng/mL");
    expect(m.map((x) => [x.demoId, x.sameUnit])).toEqual([["demo:ubt-7b25ce69", true]]);
  });
  test("Serum P1NP ↔ P1NP / PINP (same unit) and P1NP ng/mL (different unit, no alias)", () => {
    const m = t("ubt-3123fa82", "Serum P1NP", "μg/L");
    expect(m.map((x) => [x.demoId, x.sameUnit])).toEqual([
      ["demo:ubt-37f541f8", true],
      ["demo:ubt-6c8bad01", false],
    ]);
  });
  test("Serum CTX (β-CTX) ↔ CTX (same exact unit)", () => {
    expect(t("ubt-7d69892a", "Serum CTX (β-CTX)", "ng/mL").map((x) => x.demoId)).toEqual(["demo:ubt-d9870fc7"]);
  });
  test("different analytes are not suggested (dietary intake vs serum 25(OH)D; albumin)", () => {
    expect(t("ubt-029b5e6a", "25-hydroxyvitamin D [25(OH)D]", "ng/mL").some((x) => x.demoId === "demo:ubt-9416d34e")).toBe(false);
    expect(t("ubt-7419a93b", "Serum albumin", "g/dL")).toEqual([]);
  });
  test("a same-unit possible match blocks an independent decision until reviewed", () => {
    const matches = t("ubt-3123fa82", "Serum P1NP", "μg/L");
    expect(identityReviewBlock({ matches, aliasDecided: false, confirmedDistinct: false })).toContain("P1NP / PINP");
    expect(identityReviewBlock({ matches, aliasDecided: false, confirmedDistinct: true })).toBeNull();
    expect(identityReviewBlock({ matches, aliasDecided: true, confirmedDistinct: true })).toContain("alias decision");
    expect(identityReviewBlock({ matches: matches.filter((m) => !m.sameUnit), aliasDecided: false, confirmedDistinct: false })).toBeNull();
  });
  test("an alias is only possible to a target with the identical exact unit", () => {
    const [same, other] = t("ubt-3123fa82", "Serum P1NP", "μg/L");
    const base = { canAuthorize: true, submittedByCaller: false, aliasDecided: false, installed: true };
    const r = { inScope: true, triageAction: "ACCEPT_FOR_REVIEW", unit: "μg/L", category: "eligible" as const };
    expect(aliasDecisionFit(r, { ...base, target: same! }).kind).toBe("actionable");
    expect(aliasDecisionFit(r, { ...base, target: other! }).kind).toBe("blocked");
    expect(aliasDecisionFit({ ...r, inScope: false }, { ...base, target: same! }).kind).toBe("blocked");
    expect(aliasDecisionFit(r, { ...base, target: same!, canAuthorize: false }).kind).toBe("blocked");
  });
});

// --- Recognition with aliases ---------------------------------------------------------------
function entry(over: Partial<SyntheticDemoEntry> = {}): SyntheticDemoEntry {
  return {
    demoId: "demo:ubt-37f541f8",
    displayName: "P1NP / PINP",
    aliases: ["P1NP / PINP"],
    unit: "μg/L",
    domain: "bone",
    provenance: "synthetic",
    missionId: MISSION,
    submissionId: "4fc8aee1-deb3-4f4c-9173-46c2a3401fa7",
    termId: "ubt-37f541f8",
    classification: SYNTHETIC_DEMO_CLASSIFICATION,
    sourceDocumentSha256: [],
    status: "ACTIVE",
    decision: { decisionEventId: "d1", decidedAt: "2026-11-08T12:00:00Z", entrySha256: "b".repeat(64) },
    activation: { activationEventId: "a1", activatedAt: "2026-11-08T12:05:00Z", demoCatalogVersion: 10 },
    revocation: null,
    ...over,
  };
}
function alias(over: Partial<SyntheticDemoAliasMapping> = {}): SyntheticDemoAliasMapping {
  return {
    aliasId: "alias:ubt-3123fa82",
    targetDemoId: "demo:ubt-37f541f8",
    targetDisplayName: "P1NP / PINP",
    labels: ["Serum P1NP"],
    unit: "μg/L",
    domain: "bone",
    provenance: "synthetic",
    missionId: MISSION,
    submissionId: SUB,
    termId: "ubt-3123fa82",
    classification: SYNTHETIC_DEMO_ALIAS_CLASSIFICATION,
    status: "ACTIVE",
    decision: { decisionEventId: "ad1", decidedAt: "2026-11-12T12:00:00Z", entrySha256: "c".repeat(64) },
    activation: { activationEventId: "aa1", activatedAt: "2026-11-12T12:05:00Z", demoCatalogVersion: 400 },
    revocation: null,
    ...over,
  };
}
const snap = (entries: SyntheticDemoEntry[], aliasMappings?: SyntheticDemoAliasMapping[], v = 400): SyntheticDemoSnapshot => ({
  schema: "mitochondria.synthetic-demo-catalog-snapshot.v1",
  environment: "synthetic_demo",
  missionId: MISSION,
  demoCatalogVersion: v,
  issuedAt: "2026-11-12T13:00:00Z",
  entries,
  ...(aliasMappings ? { aliasMappings } : {}),
});
const recognize = (s: SyntheticDemoSnapshot, label: string, unit: string, provenance: "synthetic" | "real" = "synthetic") =>
  recognizeSyntheticDemo({ label, unit, provenance, missionId: MISSION }, new Map([[MISSION, evaluateSyntheticDemoSnapshot(s)]]));

describe("P61.5 approved aliases in the signed synthetic demo catalog", () => {
  test("an active alias recognizes the submitted label as the existing entry (exact unit)", () => {
    const r = recognize(snap([entry()], [alias()]), "Serum P1NP", "μg/L");
    expect(r.status).toBe("SYNTHETIC_DEMO_RECOGNIZED");
    if (r.status === "SYNTHETIC_DEMO_RECOGNIZED") {
      expect(r.demoId).toBe("demo:ubt-37f541f8");
      expect(r.approvedAlias?.aliasId).toBe("alias:ubt-3123fa82");
    }
  });
  test("known entries are still recognized by their own name", () => {
    expect(recognize(snap([entry()], [alias()]), "P1NP / PINP", "μg/L").status).toBe("SYNTHETIC_DEMO_RECOGNIZED");
  });
  test("units are never converted and unknown labels stay held", () => {
    expect(recognize(snap([entry()], [alias()]), "Serum P1NP", "ng/mL").status).toBe("UNKNOWN");
    expect(recognize(snap([entry()], [alias()]), "Serum osteocalcin", "ng/mL").status).toBe("UNKNOWN");
    expect(recognize(snap([entry()], [alias()]), "Serum P1NP", "μg/L", "real").status).toBe("UNKNOWN");
  });
  test("without an alias the possible match stays held (never text-equated)", () => {
    expect(recognize(snap([entry()]), "Serum P1NP", "μg/L").status).toBe("UNKNOWN");
  });
  test("revoked, malformed, mismatched or colliding aliases fail closed", () => {
    const cases: SyntheticDemoAliasMapping[] = [
      alias({ status: "REVOKED" }),
      alias({ provenance: "real" as "synthetic" }),
      alias({ classification: "OTHER" as typeof SYNTHETIC_DEMO_ALIAS_CLASSIFICATION }),
      alias({ missionId: "M2" }),
      alias({ unit: "ng/mL" }),
      alias({ targetDemoId: "demo:ubt-00000000" }),
      alias({ targetDisplayName: "Renamed" }),
      alias({ labels: ["P1NP / PINP"] }),
    ];
    for (const a of cases) expect(recognize(snap([entry()], [a]), "Serum P1NP", "μg/L").status).toBe("UNKNOWN");
    const twice = [alias(), alias({ aliasId: "alias:ubt-11111111", termId: "ubt-11111111" })];
    expect(recognize(snap([entry()], twice), "Serum P1NP", "μg/L").status).toBe("UNKNOWN");
    expect(recognize(snap([entry({ status: "REVOKED" })], [alias()]), "Serum P1NP", "μg/L").status).toBe("UNKNOWN");
  });
  test("snapshots without aliases are byte-identical to before (no aliasMappings key, same version)", () => {
    const rpc = { mission_id: MISSION, demo_catalog_version: 372, entries: [entry()] };
    const a = demoSnapshotFromRpc(rpc, "2026-11-12T13:00:00Z");
    const b = demoSnapshotFromRpc(rpc, "2026-11-12T13:00:00Z", { mission_id: MISSION, alias_catalog_version: 0, aliases: [] });
    expect("aliasMappings" in a).toBe(false);
    expect(b).toEqual(a);
    expect(a.demoCatalogVersion).toBe(372);
  });
  test("an alias change raises the combined catalog version", () => {
    const s = demoSnapshotFromRpc(
      { mission_id: MISSION, demo_catalog_version: 372, entries: [entry()] },
      "2026-11-12T13:00:00Z",
      { mission_id: MISSION, alias_catalog_version: 401, aliases: [alias()] },
    );
    expect(s.demoCatalogVersion).toBe(401);
    expect(s.aliasMappings?.length).toBe(1);
  });
  test("aliases are covered by the snapshot signature (tampering fails verification)", async () => {
    const k = await generateTestSigningKey("p615-unit");
    const trusted = [{ ...k.trusted, environment: "synthetic_demo" as const }];
    const signed = await signSyntheticDemoSnapshot(snap([entry()], [alias()]), "p615-unit", k.privateKey);
    expect((await verifySyntheticDemoSnapshot(signed, trusted)).ok).toBe(true);
    const tampered = structuredClone(signed);
    tampered.snapshot.aliasMappings![0]!.labels = ["Serum CTX (β-CTX)"];
    expect((await verifySyntheticDemoSnapshot(tampered, trusted)).ok).toBe(false);
  });
});

// --- Server cores against a mock RPC -------------------------------------------------------------
const UUID = "11111111-1111-4111-8111-111111111111";
function mock(responses: Record<string, { data: unknown; error: { code?: string } | null }>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    return responses[fn] ?? { data: null, error: { code: "PGRST202" } };
  };
  return { rpc, calls };
}

describe("P61.5 server cores", () => {
  test("authorization sends exact units with deterministic idempotency keys", async () => {
    const results = [{ submission_id: SUB, term_id: "ubt-7419a93b", status: "recorded", event_id: UUID }];
    const m = mock({ p615_demo_scope_authorize_v1: { data: { mission_id: MISSION, results }, error: null } });
    const d = { missionId: MISSION, items: [{ submissionId: SUB, termId: "ubt-7419a93b", exactUnit: "g/dL" }] };
    const r1 = await authorizeScopeCore(m.rpc, "user-1", d);
    await authorizeScopeCore(m.rpc, "user-1", d);
    expect(r1.ok).toBe(true);
    const [a, b] = m.calls.map((c) => (c.args["p_items"] as Record<string, string>[])[0]!);
    expect(a!["exact_unit"]).toBe("g/dL");
    expect(a!["idempotency_key"]).toBe(b!["idempotency_key"]!);
    const other = mock({ p615_demo_scope_authorize_v1: { data: { mission_id: MISSION, results }, error: null } });
    await authorizeScopeCore(other.rpc, "user-2", d);
    expect((other.calls[0]!.args["p_items"] as Record<string, string>[])[0]!["idempotency_key"]).not.toBe(a!["idempotency_key"]);
  });
  test("fails closed until installed, and maps refusals", async () => {
    const d = { missionId: MISSION, items: [{ submissionId: SUB, termId: "ubt-7419a93b", exactUnit: "g/dL" }] };
    const missing = await authorizeScopeCore(mock({}).rpc, "u", d);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toBe(P615_MIGRATION_MESSAGE);
    const denied = await authorizeScopeCore(mock({ p615_demo_scope_authorize_v1: { data: null, error: { code: "42501" } } }).rpc, "u", d);
    expect(!denied.ok && denied.code).toBe("forbidden");
    const wrongMission = await authorizeScopeCore(
      mock({ p615_demo_scope_authorize_v1: { data: { mission_id: "M2", results: [] }, error: null } }).rpc,
      "u",
      d,
    );
    expect(!wrongMission.ok && wrongMission.code).toBe("integrity");
  });
  test("alias decision requires the alias acknowledgement before any call", async () => {
    const m = mock({});
    const r = await aliasDecideCore(m.rpc, "u", {
      missionId: MISSION, submissionId: SUB, termId: "ubt-3123fa82", targetDemoId: "demo:ubt-37f541f8",
      rationale: "Same analyte, identical exact unit.", acknowledgement: "SYNTHETIC DEMO - NOT A SCIENTIFIC APPROVAL",
    });
    expect(r.ok).toBe(false);
    expect(m.calls.length).toBe(0);
    const ok = mock({ p615_demo_alias_decide_v1: { data: { status: "recorded", event_id: UUID }, error: null } });
    const r2 = await aliasDecideCore(ok.rpc, "u", {
      missionId: MISSION, submissionId: SUB, termId: "ubt-3123fa82", targetDemoId: "demo:ubt-37f541f8",
      rationale: "  Same analyte, identical exact unit.  ", acknowledgement: SYNTHETIC_DEMO_ALIAS_ACKNOWLEDGEMENT,
    });
    expect(r2.ok).toBe(true);
    expect(ok.calls[0]!.args["p_rationale"]).toBe("Same analyte, identical exact unit.");
  });
  test("a Researcher (no Ground Medical membership) activation refusal is reported, not assumed", async () => {
    const r = await aliasActivateCore(mock({ p615_demo_alias_activate_v1: { data: null, error: { code: "42501" } } }).rpc, "u", {
      decisionEventId: UUID, expectedEntrySha256: "c".repeat(64),
    });
    expect(!r.ok && r.code).toBe("forbidden");
  });
  test("governance response is validated", async () => {
    const good = await governanceCore(
      mock({ p615_demo_governance_v1: { data: { mission_id: MISSION, can_authorize: true, can_activate: false, grants: [], aliases: [] }, error: null } }).rpc,
      MISSION,
    );
    expect(good.ok && good.canAuthorize && !good.canActivate).toBe(true);
    const bad = await governanceCore(mock({ p615_demo_governance_v1: { data: { mission_id: MISSION }, error: null } }).rpc, MISSION);
    expect(bad.ok).toBe(false);
  });
  test("signed demo snapshots keep working before the alias change is installed", async () => {
    const m = mock({ p37_demo_catalog_snapshot_v1: { data: { mission_id: MISSION, demo_catalog_version: 372, entries: [entry()] }, error: null } });
    const r = await signedDemoSnapshotCore(m.rpc, "x".repeat(40), MISSION, () => "2026-11-12T13:00:00Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect("aliasMappings" in r.signed.snapshot).toBe(false);
    const denied = mock({
      p37_demo_catalog_snapshot_v1: { data: { mission_id: MISSION, demo_catalog_version: 372, entries: [entry()] }, error: null },
      p615_demo_alias_snapshot_v1: { data: null, error: { code: "42501" } },
    });
    expect((await signedDemoSnapshotCore(denied.rpc, "x".repeat(40), MISSION, () => "t")).ok).toBe(false);
  });
});

describe("P61.5 Researcher UI reachability on /mission/scientific-review", () => {
  test("the existing bulk Researcher section offers Authorize for Synthetic Demo and identity review", () => {
    const c = src("src/components/p38-bulk-demo-researcher.tsx");
    expect(c).toContain('"authorize_scope"');
    expect(c).toContain("Authorize for Synthetic Demo");
    expect(c).toContain("Review identity");
    expect(c).toContain("authorizeDemoScopeFn");
    expect(src("src/components/p37-catalog-panel.tsx")).toContain("<P38BulkDemoResearcher");
  });
  test("alias activation is mounted only for the Ground Medical role on the Ground console", () => {
    const g = src("src/components/ground-research-console.tsx");
    expect(g).toMatch(/selected\?\.role === "ground_medical" && \(\s*<P615AliasActivationPanel/);
  });
  test("the database change is staged as pending, never as an applied migration", () => {
    expect(src("supabase/pending/20261112000000_p615_researcher_demo_scope.sql")).toContain("p615_demo_scope_authorize_v1");
    expect(() => src("supabase/migrations/20261112000000_p615_researcher_demo_scope.sql")).toThrow();
  });
});
