import { describe, expect, test } from "bun:test";
import {
  buildStoredObservationReview,
  completeCorrection,
  CORRECTION_REASON_MIN,
  executeCorrection,
  observationLifecycle,
  planObservationCorrection,
  pruneSelection,
  selectionCounts,
  toggleSelectAll,
} from "../../src/domain/health-intelligence/stored-observation-review";
import { planAttestation, planRevocation, type AttestationEvent } from "../../src/domain/health-intelligence/evidence-attestation";
import { appendAttestationEvents, listAttestationEvents } from "../../src/domain/health-intelligence/review-ledger";
import { InMemoryReviewLedgerStore } from "../../src/infrastructure/offline/review-ledger-store";
import { domainReadableObservations, collapseUnifiedObservationVersions } from "../../src/domain/health-intelligence/observation-store";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildHealthHistoryReport } from "../../src/domain/health-intelligence/health-history-report";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { GM_USER, V9_SCOPE, gmCtx, obs } from "./fixtures-v9-observations";

const reason = "Checked against the source lab sheet";
const draftFor = (o: UnifiedObservation, over: Partial<{ metricId: string; value: string; unit: string; observedAt: string; reason: string; confirmed: boolean }> = {}) => ({
  metricId: o.metricId,
  value: "70",
  unit: o.originalUnit,
  observedAt: o.observedAt,
  reason: "Transcription error in the source CSV",
  confirmed: true,
  ...over,
});

/** Append-only in-memory store mimicking the encrypted store's collapse semantics. */
function memoryStore(failOn?: (o: UnifiedObservation) => boolean) {
  const events: { observation: UnifiedObservation; storedAt: string; key: string }[] = [];
  let t = 0;
  return {
    events,
    async save(o: UnifiedObservation) {
      if (failOn?.(o)) throw new Error("disk full");
      const key = `${o.id}:${o.status === "erroneous" ? "status" : "entry"}`;
      const prior = events.find((e) => e.key === key);
      if (prior) {
        if (JSON.stringify(prior.observation) !== JSON.stringify(o)) throw new Error("Append-only record already exists with different content");
        return;
      }
      events.push({ observation: o, storedAt: new Date(Date.UTC(2026, 10, 1) + t++).toISOString(), key });
    },
    history: () => collapseUnifiedObservationVersions(events),
  };
}

describe("v9 stored observations: status columns and selection", () => {
  const a = obs();
  const b = obs();
  const wrong = obs({ status: "erroneous", statusReason: "Typo in source" });
  const real = obs({ provenance: "real" });
  const foreign = obs({ crewMemberId: "crew-b" });
  const history = [a, b, wrong, real, foreign];
  const review = buildStoredObservationReview(history, V9_SCOPE, []);

  test("lifecycle and Ground Medical status are separate columns; intake acceptance is never 'attested'", () => {
    const byId = new Map(review.views.map((v) => [v.observation.id, v]));
    expect(byId.get(a.id)?.lifecycle).toBe("active");
    expect(byId.get(a.id)?.groundMedical).toBe("not_attested");
    expect(byId.get(wrong.id)?.lifecycle).toBe("erroneous");
    expect(byId.get(real.id)?.groundMedical).toBe("not_applicable");
    expect(byId.has(foreign.id)).toBe(false);
  });

  test("select all picks only eligible rows in the exact mission + crew + provenance", () => {
    const sel = toggleSelectAll(review.views, new Set());
    expect([...sel].sort()).toEqual([a.id, b.id].sort());
    expect(selectionCounts(review.views, sel)).toEqual({ eligible: 2, selected: 2 });
    expect(toggleSelectAll(review.views, sel).size).toBe(0);
    expect([...pruneSelection(review.views, new Set([a.id, wrong.id, real.id]))]).toEqual([a.id]);
  });

  test("bulk Save selected approvals uses the attestation ledger and never duplicates", async () => {
    const store = new InMemoryReviewLedgerStore();
    const ids = [...toggleSelectAll(review.views, new Set())];
    const plan = planAttestation(review.report, ids, review.events, gmCtx(), { reason, confirmed: true });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(await appendAttestationEvents(plan.events, V9_SCOPE, gmCtx(), store)).toEqual({ inserted: 2, duplicates: 0, failed: [] });
    const events = await listAttestationEvents(V9_SCOPE, store);
    const after = buildStoredObservationReview(history, V9_SCOPE, events);
    expect(after.views.filter((v) => v.groundMedical === "attested").map((v) => v.observation.id).sort()).toEqual(ids.sort());
    expect(selectionCounts(after.views, new Set()).eligible).toBe(0);
    // Replaying the same selection is refused and appends nothing.
    expect(planAttestation(after.report, ids, after.events, gmCtx(), { reason, confirmed: true }).ok).toBe(false);
    expect(store.size).toBe(2);
    // Observations themselves are untouched.
    expect(history.map((o) => o.status)).toEqual(["active", "active", "erroneous", "active", "active"]);
  });

  test("per-row attestation requires a 10+ character reason and confirmation", () => {
    expect(planAttestation(review.report, [a.id], [], gmCtx(), { reason: "too short", confirmed: true }).ok).toBe(false);
    expect(planAttestation(review.report, [a.id], [], gmCtx(), { reason, confirmed: false }).ok).toBe(false);
  });

  test("crew, researcher and cross-scope reviewers cannot attest", () => {
    for (const roles of [["crew_self"], ["researcher"], ["mission_operator"]])
      expect(planAttestation(review.report, [a.id], [], gmCtx({ rolesForScope: roles }), { reason, confirmed: true }).ok).toBe(false);
    expect(planAttestation(review.report, [a.id], [], gmCtx({ scope: { ...V9_SCOPE, missionId: "mission-b" } }), { reason, confirmed: true }).ok).toBe(false);
    expect(planAttestation(review.report, [a.id], [], gmCtx({ scope: { ...V9_SCOPE, provenance: "real" } }), { reason, confirmed: true }).ok).toBe(false);
  });

  test("partial ledger failures are reported per record, not hidden", async () => {
    const store = new InMemoryReviewLedgerStore();
    let calls = 0;
    const flaky = { append: async (e: Parameters<typeof store.append>[0]) => (++calls === 2 ? Promise.reject(new Error("quota exceeded")) : store.append(e)), list: store.list.bind(store) };
    const plan = planAttestation(review.report, [a.id, b.id], [], gmCtx(), { reason, confirmed: true });
    if (!plan.ok) throw new Error(plan.reason);
    const result = await appendAttestationEvents(plan.events, V9_SCOPE, gmCtx(), flaky);
    expect(result.inserted).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.message).toContain("quota");
  });

  test("revoke appends a superseding event; status becomes Revoked and the row is eligible again", async () => {
    const store = new InMemoryReviewLedgerStore();
    const p1 = planAttestation(review.report, [a.id], [], gmCtx(), { reason, confirmed: true });
    if (!p1.ok) throw new Error(p1.reason);
    await appendAttestationEvents(p1.events, V9_SCOPE, gmCtx(), store);
    const r1 = buildStoredObservationReview(history, V9_SCOPE, await listAttestationEvents(V9_SCOPE, store));
    const p2 = planRevocation(r1.report, a.id, r1.events, gmCtx({ decidedAt: "2026-11-02T10:00:00.000Z" }), { reason: "Source document mismatch found", confirmed: true });
    if (!p2.ok) throw new Error(p2.reason);
    await appendAttestationEvents(p2.events, V9_SCOPE, gmCtx(), store);
    const r2 = buildStoredObservationReview(history, V9_SCOPE, await listAttestationEvents(V9_SCOPE, store));
    const v = r2.views.find((x) => x.observation.id === a.id)!;
    expect(v.groundMedical).toBe("revoked");
    expect(v.selectable).toBe(true);
    expect(v.attestationHistory.map((e) => e.action)).toEqual(["attest", "revoke"]);
  });
});

describe("v9 append-only Edit / Save correction", () => {
  test("validates first, then appends a new active record superseding the original", async () => {
    const original = obs({ value: "62" });
    const store = memoryStore();
    await store.save(original);
    const plan = planObservationCorrection(original, store.history(), draftFor(original), gmCtx());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.corrected.id).not.toBe(original.id);
    expect(plan.corrected.supersedesId).toBe(original.id);
    expect(plan.corrected.source).toEqual(original.source);
    expect(plan.corrected.provenance).toBe("synthetic");
    expect(plan.corrected.correction).toMatchObject({ originalRecordId: original.id, actorUserId: GM_USER, actorRole: "ground_medical" });
    expect(await executeCorrection(plan, store)).toEqual({ status: "completed", correctedId: plan.corrected.id });
    const h = store.history();
    expect(h).toHaveLength(2);
    const old = h.find((o) => o.id === original.id)!;
    expect(old.status).toBe("erroneous");
    expect(old.value).toBe("62"); // never overwritten
    expect(old.statusReason).toContain(plan.corrected.id);
    // Exactly one active version in domain projections, report and history narrative.
    expect(domainReadableObservations(h).map((o) => o.id)).toEqual([plan.corrected.id]);
    const report = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: h, deviceRecords: [] }, V9_SCOPE);
    expect(report.rows.map((r) => [r.recordId, r.value])).toEqual([[plan.corrected.id, "70"]]);
    expect(report.exclusions.find((e) => e.recordId === original.id)?.reason).toContain("erroneous");
    expect(buildHealthHistoryReport(h, V9_SCOPE.missionId, V9_SCOPE.crewMemberId, "synthetic").observations.map((o) => o.value)).toEqual(["70"]);
    // Both records remain in history with distinct lifecycle states.
    expect(buildStoredObservationReview(h, V9_SCOPE, []).views.map((v) => v.lifecycle).sort()).toEqual(["active", "erroneous"]);
  });

  test("reason, confirmation, numeric value, explicit UTC time and exact catalog unit are required; no unit conversion", () => {
    const o = obs();
    const h = [o];
    expect(planObservationCorrection(o, h, draftFor(o, { reason: "x".repeat(CORRECTION_REASON_MIN - 1) }), gmCtx()).ok).toBe(false);
    expect(planObservationCorrection(o, h, draftFor(o, { confirmed: false }), gmCtx()).ok).toBe(false);
    expect(planObservationCorrection(o, h, draftFor(o, { value: "seventy" }), gmCtx()).ok).toBe(false);
    expect(planObservationCorrection(o, h, draftFor(o, { observedAt: "2026-10-03 07:30" }), gmCtx()).ok).toBe(false);
    expect(planObservationCorrection(o, h, draftFor(o, { observedAt: "2099-01-01T00:00:00Z" }), gmCtx()).ok).toBe(false);
    const unit = planObservationCorrection(o, h, draftFor(o, { unit: "beats/min" }), gmCtx());
    expect(unit.ok).toBe(false);
    if (!unit.ok) expect(unit.reason).toContain("never converted");
    expect(planObservationCorrection(o, h, draftFor(o, { metricId: "invented-metric" }), gmCtx()).ok).toBe(false);
    expect(planObservationCorrection(o, h, draftFor(o, { value: o.value }), gmCtx()).ok).toBe(false);
    // A valid different catalog pair is accepted exactly as entered.
    const hrv = planObservationCorrection(o, h, draftFor(o, { metricId: "cv-027", unit: "ms", value: "48" }), gmCtx());
    expect(hrv.ok && [hrv.corrected.metricId, hrv.corrected.originalUnit, hrv.corrected.value]).toEqual(["cv-027", "ms", "48"]);
  });

  test("only Ground Medical for the exact mission, crew and provenance may correct", () => {
    const o = obs();
    for (const roles of [["crew_self"], ["researcher"], []]) expect(planObservationCorrection(o, [o], draftFor(o), gmCtx({ rolesForScope: roles })).ok).toBe(false);
    expect(planObservationCorrection(o, [o], draftFor(o), gmCtx({ scope: { ...V9_SCOPE, crewMemberId: "crew-b" } })).ok).toBe(false);
    expect(planObservationCorrection(o, [o], draftFor(o), gmCtx({ scope: { ...V9_SCOPE, missionId: "mission-b" } })).ok).toBe(false);
    expect(planObservationCorrection(o, [o], draftFor(o), gmCtx({ scope: { ...V9_SCOPE, provenance: "real" } })).ok).toBe(false);
    expect(planObservationCorrection(o, [o], draftFor(o), gmCtx({ actorUserId: null })).ok).toBe(false);
  });

  test("erroneous and already-superseded records cannot be edited", () => {
    const bad = obs({ status: "erroneous", statusReason: "wrong", value: "55" });
    expect(planObservationCorrection(bad, [bad], draftFor(bad), gmCtx()).ok).toBe(false);
    const o = obs({ value: "55" });
    const plan = planObservationCorrection(o, [o], draftFor(o), gmCtx());
    if (!plan.ok) throw new Error(plan.reason);
    expect(observationLifecycle(o, [o, plan.corrected])).toBe("superseded");
    expect(planObservationCorrection(o, [o, plan.corrected], draftFor(o, { value: "71" }), gmCtx()).ok).toBe(false);
  });

  test("failure on the first write changes nothing", async () => {
    const o = obs();
    const store = memoryStore(() => true);
    const plan = planObservationCorrection(o, [o], draftFor(o), gmCtx());
    if (!plan.ok) throw new Error(plan.reason);
    const outcome = await executeCorrection(plan, store);
    expect(outcome.status).toBe("failed");
    expect(store.events).toHaveLength(0);
  });

  test("failure on the second write is recoverable: original already superseded, retry is idempotent", async () => {
    const o = obs();
    const store = memoryStore((x) => x.status === "erroneous");
    await store.save(o).catch(() => {});
    const plan = planObservationCorrection(o, [o], draftFor(o), gmCtx());
    if (!plan.ok) throw new Error(plan.reason);
    const outcome = await executeCorrection(plan, store);
    expect(outcome.status).toBe("partial");
    const h = store.history();
    // Never two active versions, never an unexplained original.
    expect(domainReadableObservations(h).map((x) => x.id)).toEqual([plan.corrected.id]);
    const view = buildStoredObservationReview(h, V9_SCOPE, []).views.find((v) => v.observation.id === plan.corrected.id)!;
    expect(view.correctionIncomplete).toBe(true);
    expect(buildStoredObservationReview(h, V9_SCOPE, []).views.find((v) => v.observation.id === o.id)!.lifecycle).toBe("superseded");
    // Retry with a healthy store, twice: identical deterministic event, no duplicate.
    const healthy = memoryStore();
    for (const e of store.events) await healthy.save(e.observation);
    const hist = healthy.history();
    expect((await completeCorrection(plan.corrected, hist, gmCtx(), healthy)).status).toBe("completed");
    expect((await completeCorrection(plan.corrected, hist, gmCtx(), healthy)).status).toBe("completed");
    expect(healthy.events.filter((e) => e.observation.id === o.id && e.observation.status === "erroneous")).toHaveLength(1);
    expect(buildStoredObservationReview(healthy.history(), V9_SCOPE, []).views.find((v) => v.observation.id === plan.corrected.id)!.correctionIncomplete).toBe(false);
    // Completion is Ground Medical only.
    expect((await completeCorrection(plan.corrected, hist, gmCtx({ rolesForScope: ["crew_self"] }), healthy)).status).toBe("failed");
  });

  test("same correction replays to the same IDs (deterministic idempotency)", () => {
    const o = obs();
    const p1 = planObservationCorrection(o, [o], draftFor(o), gmCtx());
    const p2 = planObservationCorrection(o, [o], draftFor(o), gmCtx({ decidedAt: "2026-11-01T11:00:00.000Z" }));
    expect(p1.ok && p2.ok && p1.corrected.id === p2.corrected.id && p1.intentId === p2.intentId).toBe(true);
  });

  test("attestation on a corrected original shows as stale history; the new version needs its own attestation", async () => {
    const o = obs();
    const store = new InMemoryReviewLedgerStore();
    const r0 = buildStoredObservationReview([o], V9_SCOPE, []);
    const p = planAttestation(r0.report, [o.id], [], gmCtx(), { reason, confirmed: true });
    if (!p.ok) throw new Error(p.reason);
    await appendAttestationEvents(p.events, V9_SCOPE, gmCtx(), store);
    const c = planObservationCorrection(o, [o], draftFor(o), gmCtx());
    if (!c.ok) throw new Error(c.reason);
    const events: AttestationEvent[] = await listAttestationEvents(V9_SCOPE, store);
    const r1 = buildStoredObservationReview([c.erroneousMark, c.corrected], V9_SCOPE, events);
    expect(r1.views.find((v) => v.observation.id === o.id)!.groundMedical).toBe("stale");
    expect(r1.views.find((v) => v.observation.id === c.corrected.id)!.groundMedical).toBe("not_attested");
  });
});
