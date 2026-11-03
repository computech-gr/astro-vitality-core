import { describe, expect, test } from "bun:test";
import { canonicalJson } from "@/domain/health-intelligence/observation-envelope";
import {
  AUTHORIZATION_GENESIS,
  authorizationContext,
  buildAuthorizationPayload,
  buildAuthorizationView,
  eventHashInput,
  evaluateTermAuthorization,
  sha256Hex,
  validateAuthorizationPayload,
  verifyAuthorizationLedger,
  type AuthorizationLedgerRow,
  type AuthorizationPayload,
  type SubmissionInput,
} from "@/domain/health-intelligence/p36-scientific-authorization";
import { buildDecisionDossier, verifyDecisionDossier } from "@/domain/health-intelligence/p36-decision-dossier";
import { GOVERNED_CATALOG_EXTENSIONS, type CatalogExtensionRegistry } from "@/domain/health-intelligence/unknown-biomarker-review";

const GM = "00000000-0000-0000-0000-0000000000a2";
const RES = "00000000-0000-0000-0000-0000000000a3";
const RES2 = "00000000-0000-0000-0000-0000000000a9";
const ctx = await authorizationContext();
const term = (label: string) => ctx.dossiers.find((d) => d.sourceLabel === label)!;
const UCA = term("Urinary Calcium 24h");
let n = 0;
const now = () => new Date(Date.UTC(2026, 10, 4, 10, n++)).toISOString();

const input = (d = UCA, over: Partial<SubmissionInput> = {}): SubmissionInput => ({
  termId: d.termId,
  kind: "recommendation",
  action: "RECOMMEND",
  authorityMissionId: "m1",
  submissionId: crypto.randomUUID(),
  canonicalCatalogId: d.candidateCatalogIds[0]!,
  domain: "bone_health",
  specimenOrAcquisitionContext: "24-hour urine collection",
  methodOrInstrument: "Colorimetric assay on automated analyzer",
  protocol: "Synthetic protocol A",
  protocolVersion: "v1.0",
  validatedUnit: d.sourceUnit,
  sourceRefs: [`handoff:${d.termId}`],
  validationEvidenceRefs: [],
  rationale: "Synthetic recommendation with exact source unit text.",
  reviewerName: "Synthetic Recommender",
  reviewerQualification: "Synthetic qualification",
  conflictOfInterestDeclaration: "",
  independenceConfirmed: false,
  recommendationEventId: null,
  supersedesEventId: null,
  ...over,
});
const decisionInput = (action: "APPROVE" | "REJECT" | "REQUEST_MORE_EVIDENCE", over: Partial<SubmissionInput> = {}, d = UCA) =>
  input(d, {
    kind: "decision",
    action,
    rationale: "Independent synthetic decision with cited evidence.",
    reviewerName: "Synthetic Researcher",
    reviewerQualification: "Synthetic PhD for tests",
    conflictOfInterestDeclaration: "No conflict of interest (synthetic).",
    independenceConfirmed: true,
    validationEvidenceRefs: action === "APPROVE" ? ["doi:10.0000/synthetic"] : [],
    ...over,
  });

/** Builds server rows exactly as the staged SQL would (same digest and hash formula). */
class Ledger {
  rows: AuthorizationLedgerRow[] = [];
  async add(p: AuthorizationPayload): Promise<AuthorizationLedgerRow> {
    const c = canonicalJson(p);
    const sha = await sha256Hex(c);
    const prev = [...this.rows].reverse().find((r) => r.term_id === p.termId && r.authority_mission_id === p.authorityMissionId)?.event_hash ?? AUTHORIZATION_GENESIS;
    const row: AuthorizationLedgerRow = {
      authority_mission_id: p.authorityMissionId,
      event_id: sha,
      term_id: p.termId,
      kind: p.kind,
      action: p.action,
      submission_id: p.submissionId,
      payload_canonical: c,
      payload_sha256: sha,
      references_recommendation_id: p.recommendationEventId,
      supersedes_event_id: p.supersedesEventId,
      prev_event_hash: prev,
      event_hash: await sha256Hex(eventHashInput(prev, sha, p.actorUserId, p.actorRole, p.authorityMissionId, p.termId)),
      actor_user_id: p.actorUserId,
      actor_role: p.actorRole,
      received_at: p.decidedAt,
      received_seq: this.rows.length + 1,
    };
    this.rows.push(row);
    return row;
  }
}
const payload = (i: SubmissionInput, userId: string, role: "ground_medical" | "researcher") => buildAuthorizationPayload(i, { userId, role, now: now() }, ctx);

async function approvedLedger() {
  const l = new Ledger();
  const rec = await l.add(payload(input(), GM, "ground_medical"));
  const ap = await l.add(payload(decisionInput("APPROVE", { recommendationEventId: rec.event_id }), RES, "researcher"));
  return { l, rec, ap };
}

describe("P36 scientific authorization — authority rules", () => {
  test("no ledger: every term is pending and activation-blocked", async () => {
    const v = await buildAuthorizationView(null, null);
    expect(v.terms).toHaveLength(12);
    expect(v.counts.PENDING_NIKOLAS_REVIEW).toBe(12);
    expect(v.counts.ACTIVATION_BLOCKED).toBe(12);
    expect(v.counts.ACTIVE).toBe(0);
    expect(v.terms.every((t) => t.blockers.length > 0)).toBe(true);
  });

  test("Ground Medical cannot record a final decision", () => {
    const p = payload(decisionInput("REJECT"), GM, "ground_medical");
    const r = validateAuthorizationPayload(p, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Only an authorized Researcher/);
  });

  test("an independent Researcher approval is scientifically approved but activation stays blocked", async () => {
    const { l } = await approvedLedger();
    const v = await buildAuthorizationView(l.rows, "m1");
    const t = v.terms.find((x) => x.termId === UCA.termId)!;
    expect(t.integrity).toBe("VERIFIED");
    expect(t.scientificStatus).toBe("SCIENTIFICALLY_APPROVED");
    expect(t.activationStatus).toBe("ACTIVATION_BLOCKED");
    expect(t.gates.find((g) => g.gate === "INDEPENDENT_APPROVAL_VERIFIED")!.passed).toBe(true);
    expect(t.gates.find((g) => g.gate === "CATALOG_UNIT_VALIDATED")!.passed).toBe(false);
    expect(t.gates.find((g) => g.gate === "GOVERNED_REGISTRY_APPROVAL")!.passed).toBe(false);
    expect(v.counts.SCIENTIFICALLY_APPROVED).toBe(1);
    expect(v.counts.PENDING_NIKOLAS_REVIEW).toBe(11);
  });

  test("self-approval is rejected", async () => {
    const l = new Ledger();
    const rec = await l.add(payload(input(), RES, "researcher"));
    const ledgers = await verifyAuthorizationLedger(l.rows, "m1", ctx);
    const recommendation = ledgers.get(UCA.termId)!.events[0];
    const r = validateAuthorizationPayload(payload(decisionInput("APPROVE", { recommendationEventId: rec.event_id }), RES, "researcher"), ctx, { recommendation });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Self-approval/);
  });

  test("a forged self-approval row makes the term's ledger fail closed", async () => {
    const l = new Ledger();
    const rec = await l.add(payload(input(), RES, "researcher"));
    await l.add(payload(decisionInput("APPROVE", { recommendationEventId: rec.event_id }), RES, "researcher"));
    const t = (await buildAuthorizationView(l.rows, "m1")).terms.find((x) => x.termId === UCA.termId)!;
    expect(t.integrity).toBe("FAILED");
    expect(t.scientificStatus).toBe("PENDING_NIKOLAS_REVIEW");
  });

  test.each([
    ["missing protocol version", { protocolVersion: null }, /protocol version/],
    ["placeholder specimen", { specimenOrAcquisitionContext: "N/A" }, /specimen/],
    ["unit mismatch", { validatedUnit: "mg/day" }, /exact source unit/],
    ["unit whitespace variant", { validatedUnit: " mg/24h" }, /exact source unit/],
    ["missing validation evidence", { validationEvidenceRefs: [] }, /Validation evidence/],
    ["unknown evidence reference", { sourceRefs: ["made-up-ref"] }, /neither a listed dossier reference/],
    ["missing independence", { independenceConfirmed: false }, /independent/],
    ["missing conflict declaration", { conflictOfInterestDeclaration: "" }, /conflict-of-interest/],
    ["clinical threshold wording", { rationale: "Approve because the normal range is well established." }, /thresholds/],
  ] as const)("approval rejected: %s", async (_name, over, re) => {
    const l = new Ledger();
    const rec = await l.add(payload(input(), GM, "ground_medical"));
    const recommendation = (await verifyAuthorizationLedger(l.rows, "m1", ctx)).get(UCA.termId)!.events[0];
    const r = validateAuthorizationPayload(payload(decisionInput("APPROVE", { recommendationEventId: rec.event_id, ...over }), RES, "researcher"), ctx, { recommendation });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(re);
  });

  test("conflicting identity/domain (vitamin D) is rejected", () => {
    const vitd = term("25(OH) Vitamin D");
    const r = validateAuthorizationPayload(payload(input(vitd, { canonicalCatalogId: "bone-019", domain: "immune" }), RES, "researcher"), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/contradicts the catalog domain/);
    const notCandidate = validateAuthorizationPayload(payload(input(vitd, { canonicalCatalogId: "bone-015", domain: "bone_health" }), RES, "researcher"), ctx);
    expect(notCandidate.ok).toBe(false);
  });

  test("hsCRP is not accepted as an alias of C-reactive protein", () => {
    const crp = term("IMM-007");
    const r = validateAuthorizationPayload(payload(input(crp, { domain: "immune", methodOrInstrument: "high-sensitivity immunoassay" }), RES, "researcher"), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/High-sensitivity CRP/);
  });

  test("unvalidated scale (BSC-008) and PVT protocol need primary validation evidence", async () => {
    for (const label of ["BSC-008", "PVT_MEDIAN_RT"]) {
      const d = term(label);
      const l = new Ledger();
      const rec = await l.add(payload(input(d, { domain: "behavioral" }), GM, "ground_medical"));
      const recommendation = (await verifyAuthorizationLedger(l.rows, "m1", ctx)).get(d.termId)!.events[0];
      const bad = validateAuthorizationPayload(
        payload(decisionInput("APPROVE", { domain: "behavioral", recommendationEventId: rec.event_id, validationEvidenceRefs: ["doc:internal note"] }, d), RES, "researcher"),
        ctx,
        { recommendation },
      );
      expect(bad.ok).toBe(false);
      const good = validateAuthorizationPayload(
        payload(decisionInput("APPROVE", { domain: "behavioral", recommendationEventId: rec.event_id, validationEvidenceRefs: ["pmid:12345678"] }, d), RES, "researcher"),
        ctx,
        { recommendation },
      );
      expect(good.ok).toBe(true);
    }
  });

  test("a second decision must supersede the current one (stale otherwise); latest decision wins", async () => {
    const { l, ap } = await approvedLedger();
    const ledgers = await verifyAuthorizationLedger(l.rows, "m1", ctx);
    const latestDecision = ledgers.get(UCA.termId)!.events.at(-1);
    const stale = validateAuthorizationPayload(payload(decisionInput("REJECT"), RES2, "researcher"), ctx, { latestDecision });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toMatch(/Stale decision/);
    await l.add(payload(decisionInput("REJECT", { supersedesEventId: ap.event_id }), RES2, "researcher"));
    const t = (await buildAuthorizationView(l.rows, "m1")).terms.find((x) => x.termId === UCA.termId)!;
    expect(t.scientificStatus).toBe("SCIENTIFICALLY_REJECTED");
    expect(t.history).toHaveLength(3);
  });

  test("tampered payload, broken chain or another mission's rows fail closed", async () => {
    const { l, ap } = await approvedLedger();
    const tampered = l.rows.map((r) => (r.event_id === ap.event_id ? { ...r, payload_canonical: r.payload_canonical.replace("Synthetic Researcher", "Forged") } : r));
    expect((await buildAuthorizationView(tampered, "m1")).terms.find((x) => x.termId === UCA.termId)!.integrity).toBe("FAILED");
    const broken = l.rows.map((r) => (r.event_id === ap.event_id ? { ...r, prev_event_hash: AUTHORIZATION_GENESIS } : r));
    expect((await buildAuthorizationView(broken, "m1")).terms.find((x) => x.termId === UCA.termId)!.scientificStatus).toBe("PENDING_NIKOLAS_REVIEW");
    const other = await buildAuthorizationView(l.rows, "m3");
    expect(other.terms.find((x) => x.termId === UCA.termId)!.integrity).toBe("FAILED");
    expect(other.counts.SCIENTIFICALLY_APPROVED).toBe(0);
  });

  test("stale catalog/source fingerprints revert the approval to pending", async () => {
    const { l } = await approvedLedger();
    const changed = { ...ctx, sourceFingerprint: "f".repeat(64) };
    const ledgers = await verifyAuthorizationLedger(l.rows, "m1", changed);
    const t = evaluateTermAuthorization(UCA, ledgers.get(UCA.termId), changed);
    expect(t.stale).toBe(true);
    expect(t.scientificStatus).toBe("PENDING_NIKOLAS_REVIEW");
    expect(t.gates.find((g) => g.gate === "FINGERPRINTS_CURRENT")!.passed).toBe(false);
  });

  test("even a registry entry citing the decision cannot activate a term whose catalog unit is unvalidated", async () => {
    const { l, ap } = await approvedLedger();
    const registry: CatalogExtensionRegistry = {
      ...GOVERNED_CATALOG_EXTENSIONS,
      extensions: [{ extensionId: "ext-uca", version: 1, kind: "alias_to_existing_metric", sourceLabel: UCA.sourceLabel, sourceUnit: UCA.sourceUnit, targetMetricId: "bone-015", status: "APPROVED", evidenceRefs: [] }],
      approvalHistory: [{ extensionId: "ext-uca", version: 1, decision: "APPROVED", reviewer: "Synthetic", decidedAt: "2026-11-04T12:00:00Z", handbookEvidenceRefs: [`p36-auth:${ap.event_id}`], note: `verifiers-passed:${"a".repeat(40)}` }],
    };
    const ledgers = await verifyAuthorizationLedger(l.rows, "m1", ctx);
    const t = evaluateTermAuthorization(UCA, ledgers.get(UCA.termId), ctx, registry);
    expect(t.scientificStatus).toBe("SCIENTIFICALLY_APPROVED");
    expect(t.activationStatus).toBe("ACTIVATION_BLOCKED");
    expect(t.gates.find((g) => g.gate === "CATALOG_UNIT_VALIDATED")!.passed).toBe(false);
  });
});

describe("P36 decision dossier — final authorization section", () => {
  test("without the cloud ledger the dossier reports not loaded and zero approvals", async () => {
    const d = await buildDecisionDossier([]);
    expect(d.finalAuthorization.source).toBe("NOT_LOADED");
    expect(d.finalAuthorization.notAnAuthorizationToken).toBe(true);
    expect(d.scientificApprovals).toBe(0);
    expect((await verifyDecisionDossier(JSON.parse(JSON.stringify(d)))).ok).toBe(true);
  });

  test("a verified approval is exported with its evidence, blockers and digest; forgeries are detected", async () => {
    const { l } = await approvedLedger();
    const view = await buildAuthorizationView(l.rows, "m1");
    const d = await buildDecisionDossier([], { generatedAt: "2026-11-04T12:00:00Z", authorization: view });
    expect(d.scientificApprovals).toBe(1);
    expect(d.activationAllowed).toBe(false);
    const t = d.finalAuthorization.terms.find((x) => x.termId === UCA.termId)!;
    expect(t.latestDecision?.validationEvidenceRefs).toEqual(["doi:10.0000/synthetic"]);
    expect(t.activationStatus).toBe("ACTIVATION_BLOCKED");
    expect(t.blockers.length).toBeGreaterThan(0);
    const json = JSON.parse(JSON.stringify(d));
    expect((await verifyDecisionDossier(json)).ok).toBe(true);
    const forged = JSON.parse(JSON.stringify(d));
    forged.finalAuthorization.terms[0].activationStatus = "ACTIVE";
    forged.finalAuthorization.terms[0].gates = [];
    const v = await verifyDecisionDossier(forged);
    expect(v.ok).toBe(false);
    const inflated = JSON.parse(JSON.stringify(d));
    inflated.scientificApprovals = 5;
    expect((await verifyDecisionDossier(inflated)).ok).toBe(false);
  });

  test("the PDF document carries the final authorization summary", async () => {
    const { l } = await approvedLedger();
    const d = await buildDecisionDossier([], { generatedAt: null, authorization: await buildAuthorizationView(l.rows, "m1") });
    const { buildDecisionDossierDocument } = await import("@/domain/health-intelligence/p36-decision-dossier-pdf");
    const text = JSON.stringify(buildDecisionDossierDocument(d).blocks);
    expect(text).toContain("Final scientific authorization");
    expect(text).toContain("Not an authorization token");
    expect(text).toContain("Scientifically approved");
  });
});

describe("P36 authorization server core — fail closed before the migration", () => {
  test("a missing RPC is reported as migration required and nothing is recorded", async () => {
    const { listAuthorizationCore, submitAuthorizationCore, classifyAuthorizationError } = await import("@/lib/p36-scientific-authorization.server");
    expect(classifyAuthorizationError("PGRST202")).toBe("migration_required");
    expect(classifyAuthorizationError("42501")).toBe("forbidden");
    const calls: string[] = [];
    const rpc = async (fn: string) => (calls.push(fn), { data: null, error: { code: "PGRST202" } });
    const listed = await listAuthorizationCore({ rpc }, "m1");
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.code).toBe("migration_required");
    const submitted = await submitAuthorizationCore({ rpc, userId: RES, now }, { ...decisionInput("REJECT"), actorRole: "researcher" });
    expect(submitted.ok).toBe(false);
    expect(calls).not.toContain("p36_sci_auth_append_v1");
  });
});
