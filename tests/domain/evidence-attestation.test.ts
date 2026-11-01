import { describe, expect, test } from "bun:test";
import {
  attestationPlainText,
  attestationStateFor,
  eligibleForAttestation,
  planAttestation,
  planRevocation,
  recordFingerprint,
  summarizeAttestations,
  type AttestationEvent,
} from "../../src/domain/health-intelligence/evidence-attestation";
import { appendAttestationEvents, listAttestationEvents } from "../../src/domain/health-intelligence/review-ledger";
import { InMemoryReviewLedgerStore } from "../../src/infrastructure/offline/review-ledger-store";
import {
  classifyWithGovernedExtensions,
  evaluateCatalogExtensionRegistry,
  GOVERNED_CATALOG_EXTENSIONS,
} from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { V7_SCOPE, v7Report, v7Row } from "./fixtures-v7-report";

const report = v7Report();
const gm = (over: Partial<{ actorUserId: string; rolesForScope: string[]; scope: typeof V7_SCOPE; decidedAt: string }> = {}) => ({
  actorUserId: "user-gm", rolesForScope: ["ground_medical"], scope: { ...V7_SCOPE }, decidedAt: "2026-11-01T10:00:00.000Z", ...over,
});
const input = { reason: "Checked source CSV rows against lab sheet", confirmed: true };
const all = report.rows.map((r) => r.recordId);

describe("v7 Ground Medical evidence attestation", () => {
  test("pre-existing accepted rows stay accepted, never 'unreviewed'", () => {
    expect(report.rows.map((r) => attestationStateFor(r, []).status)).toEqual(["accepted_not_attested", "accepted_not_attested", "accepted_not_attested"]);
    expect(summarizeAttestations(report, []).notAttested).toBe(3);
  });

  test("only ground_medical for the exact scope may attest; crew and researcher are refused", () => {
    expect(planAttestation(report, all, [], gm({ rolesForScope: ["crew_self"] }), input).ok).toBe(false);
    expect(planAttestation(report, all, [], gm({ rolesForScope: ["researcher"] }), input).ok).toBe(false);
    expect(planAttestation(report, all, [], gm({ actorUserId: "" }), input).ok).toBe(false);
    expect(planAttestation(report, all, [], gm(), input).ok).toBe(true);
  });

  test("cross-mission, cross-crew and cross-provenance attestation is denied", () => {
    expect(planAttestation(report, all, [], gm({ scope: { ...V7_SCOPE, missionId: "mission-b" } }), input)).toMatchObject({ ok: false });
    expect(planAttestation(report, all, [], gm({ scope: { ...V7_SCOPE, crewMemberId: "crew-b" } }), input)).toMatchObject({ ok: false });
    expect(planAttestation(report, all, [], gm({ scope: { ...V7_SCOPE, provenance: "real" } as never }), input)).toMatchObject({ ok: false });
  });

  test("explicit reason and confirmation are required", () => {
    expect(planAttestation(report, all, [], gm(), { reason: "short", confirmed: true }).ok).toBe(false);
    expect(planAttestation(report, all, [], gm(), { ...input, confirmed: false }).ok).toBe(false);
  });

  test("Select All covers every eligible row, and repeating it is idempotent", async () => {
    const plan = planAttestation(report, eligibleForAttestation(report, []).map((r) => r.recordId), [], gm(), input);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.events).toHaveLength(3);
    const store = new InMemoryReviewLedgerStore();
    expect(await appendAttestationEvents(plan.events, V7_SCOPE, gm(), store)).toEqual({ inserted: 3, duplicates: 0 });
    // Replaying the identical batch never duplicates.
    expect(await appendAttestationEvents(plan.events, V7_SCOPE, gm(), store)).toEqual({ inserted: 0, duplicates: 3 });
    const stored = await listAttestationEvents(V7_SCOPE, store);
    expect(stored).toHaveLength(3);
    expect(eligibleForAttestation(report, stored)).toHaveLength(0);
    const again = planAttestation(report, all, stored, gm({ decidedAt: "2026-11-01T11:00:00.000Z" }), input);
    expect(again).toEqual({ ok: false, reason: "Already attested for this record version." });
  });

  test("records outside the included report rows (e.g. review-only candidates) cannot be attested", () => {
    const plan = planAttestation(report, ["unknown-row"], [], gm(), input);
    expect(plan).toEqual({ ok: false, reason: "Not an included, catalog-validated record in this report scope." });
  });

  test("bulk attestation never overrides catalog scientific approval gates", () => {
    const before = evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS);
    const plan = planAttestation(report, all, [], gm(), input);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.events.every((e) => e.catalogApprovalOverride === false && e.scientificCatalogStatus === "unchanged")).toBe(true);
    expect(evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS)).toEqual(before);
    expect(classifyWithGovernedExtensions({ label: "Salivary cortisol", unit: "nmol/L" }).classification.status).not.toBe("matched");
  });

  test("revocation appends a superseding event and keeps the original attestation", () => {
    const plan = planAttestation(report, ["obs-1"], [], gm(), input);
    if (!plan.ok) throw new Error(plan.reason);
    const revoke = planRevocation(report, "obs-1", plan.events, gm({ decidedAt: "2026-11-01T12:00:00.000Z" }), { reason: "Source sheet was the wrong crew page", confirmed: true });
    if (!revoke.ok) throw new Error(revoke.reason);
    const history = [...plan.events, ...revoke.events];
    expect(revoke.events[0]!.supersedesEventId).toBe(plan.events[0]!.eventId);
    const state = attestationStateFor(report.rows[0]!, history);
    expect(state.status).toBe("revoked");
    expect(state.history).toHaveLength(2);
    // Re-attestation after revocation is allowed and supersedes the revocation.
    const re = planAttestation(report, ["obs-1"], history, gm({ decidedAt: "2026-11-01T13:00:00.000Z" }), input);
    if (!re.ok) throw new Error(re.reason);
    expect(re.events[0]!.supersedesEventId).toBe(revoke.events[0]!.eventId);
  });

  test("an attestation applies only to the exact record version it attested", () => {
    const plan = planAttestation(report, ["obs-1"], [], gm(), input);
    if (!plan.ok) throw new Error(plan.reason);
    const changed = { ...report.rows[0]!, value: "63" };
    expect(recordFingerprint(changed)).not.toBe(plan.events[0]!.recordFingerprint);
    expect(attestationStateFor(changed, plan.events).status).toBe("stale_record_changed");
  });

  test("ledger reads ignore foreign-scope or tampered events", async () => {
    const plan = planAttestation(report, ["obs-1"], [], gm(), input);
    if (!plan.ok) throw new Error(plan.reason);
    const store = new InMemoryReviewLedgerStore();
    await appendAttestationEvents(plan.events, V7_SCOPE, gm(), store);
    const tampered: AttestationEvent = { ...plan.events[0]!, eventId: "att-x", catalogApprovalOverride: true as never };
    await store.append({ id: "evidence-attestation:att-x", ledger: "evidence-attestation", ...V7_SCOPE, actorUserId: "user-gm", createdAt: tampered.decidedAt, payload: tampered });
    expect(await listAttestationEvents(V7_SCOPE, store)).toHaveLength(1);
    expect(await listAttestationEvents({ ...V7_SCOPE, crewMemberId: "crew-b" }, store)).toHaveLength(0);
    await expect(appendAttestationEvents(plan.events, V7_SCOPE, gm({ rolesForScope: ["crew_self"] }), store)).rejects.toThrow();
    await expect(appendAttestationEvents(plan.events, { ...V7_SCOPE, missionId: "mission-b" }, gm(), store)).rejects.toThrow();
  });

  test("TXT audit text lists every record status and every event", () => {
    const plan = planAttestation(report, ["obs-2"], [], gm(), input);
    if (!plan.ok) throw new Error(plan.reason);
    const text = attestationPlainText(report, plan.events);
    for (const r of report.rows) expect(text).toContain(`- ${r.recordId}:`);
    expect(text).toContain(plan.events[0]!.eventId);
    expect(text).toContain("Attested 1 · accepted without attestation 2");
  });

  test("rows of other provenance are never eligible", () => {
    const mixed = v7Report([v7Row("obs-9", "cardiovascular", "cv-001", "60", "bpm", "2026-10-01T07:30:00.000Z")]);
    mixed.rows[0] = { ...mixed.rows[0]!, provenance: "real" };
    expect(eligibleForAttestation(mixed, [])).toHaveLength(0);
  });
});
