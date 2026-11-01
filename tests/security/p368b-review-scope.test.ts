import { describe, expect, test } from "bun:test";
import {
  createGroundMedicalReviewScope, groundMedicalMemberships, resolveMissionSelection,
  EMPTY_STATUS, LOAD_FAILED_STATUS, SELECT_MISSION_STATUS, SIGNED_OUT_STATUS, type ReviewScopeDeps,
} from "../../src/components/p368b-ground-medical-review-scope";
import type { MissionIdentitySnapshot, MissionMembershipContext } from "../../src/infrastructure/mission-identity";
import type { GroundMedicalPendingBatch, GroundMedicalReviewItem } from "../../src/infrastructure/p368b-ground-medical-review";

const BATCH_A = "11111111-1111-4111-8111-111111111111";
const BATCH_B = "22222222-2222-4222-8222-222222222222";
const gm = (missionId: string): MissionMembershipContext => ({ missionId, missionCode: missionId, role: "ground_medical" });
const identity = (userId: string, memberships: MissionMembershipContext[]): MissionIdentitySnapshot =>
  ({ configured: true, signedIn: true, userId, memberships });
const batch = (batch_id: string): GroundMedicalPendingBatch =>
  ({ batch_id, crew_member_id: "crew", observed_on: "2026-10-14", submitted_at: "2026-10-14T08:00:00Z", item_count: 8, review_status: "pending_review" });
const item = (batch_id: string, metric_id = "il6"): GroundMedicalReviewItem =>
  ({ batch_id, crew_member_id: "crew", observed_on: "2026-10-14", submitted_at: "2026-10-14T08:00:00Z", review_status: "pending_review", metric_id, measured_value: 1, unit: "pg/mL", source_excerpt: null });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness(opts: {
  identity: () => Promise<MissionIdentitySnapshot>;
  pending?: Record<string, GroundMedicalPendingBatch[]> | ((m: string) => Promise<GroundMedicalPendingBatch[]>);
  details?: (m: string, b: string) => Promise<GroundMedicalReviewItem[]>;
}) {
  const listCalls: string[] = [];
  const batchCalls: Array<[string, string]> = [];
  const decideCalls: Array<{ missionId: string; batchId: string }> = [];
  let identityListener: () => void = () => undefined;
  const deps: ReviewScopeDeps = {
    loadIdentity: opts.identity,
    subscribeIdentity: l => { identityListener = l; return () => { identityListener = () => undefined; }; },
    listPending: async m => {
      listCalls.push(m);
      if (typeof opts.pending === "function") return opts.pending(m);
      return opts.pending?.[m] ?? [];
    },
    getBatch: async (m, b) => { batchCalls.push([m, b]); return opts.details ? opts.details(m, b) : [item(b)]; },
    decide: async input => {
      decideCalls.push({ missionId: input.missionId, batchId: input.batchId });
      return { batch_id: input.batchId, decision: input.decision, decision_request_id: "req-1", decided_at: "2026-11-01T00:00:00Z", replay: false };
    },
  };
  const scope = createGroundMedicalReviewScope(deps);
  return { scope, listCalls, batchCalls, decideCalls, fireIdentity: () => identityListener() };
}

describe("Ground Medical review scope · authorization", () => {
  test("only signed-in, error-free ground_medical memberships are reviewable", () => {
    const memberships = [gm("M1"), { missionId: "M2", role: "crew_self" } as MissionMembershipContext];
    expect(groundMedicalMemberships(identity("u", memberships)).map(m => m.missionId)).toEqual(["M1"]);
    expect(groundMedicalMemberships({ ...identity("u", memberships), error: "x" })).toEqual([]);
    expect(groundMedicalMemberships({ ...identity("u", memberships), signedIn: false })).toEqual([]);
  });
  test("selection keeps an authorized mission, auto-selects a single one, never picks among several", () => {
    expect(resolveMissionSelection([gm("M1")], "")).toBe("M1");
    expect(resolveMissionSelection([gm("M1"), gm("M2")], "")).toBe("");
    expect(resolveMissionSelection([gm("M1"), gm("M2")], "M2")).toBe("M2");
    expect(resolveMissionSelection([gm("M1")], "M9")).toBe("M1");
    expect(resolveMissionSelection([], "M1")).toBe("");
  });
  test("a non-reviewer never triggers a review request", async () => {
    const h = harness({ identity: async () => identity("u", [{ missionId: "M1", role: "crew_self" } as MissionMembershipContext]) });
    h.scope.start(); await flush();
    h.scope.selectMission("M1"); await h.scope.refresh(); await flush();
    expect(h.listCalls).toEqual([]);
    expect(h.scope.getSnapshot().status).toBe(SIGNED_OUT_STATUS);
    expect(h.scope.getSnapshot().missionId).toBe("");
  });
  test("an unauthorized mission ID cannot be selected manually", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1"), gm("M2")]) });
    h.scope.start(); await flush();
    h.scope.selectMission("FOREIGN"); await flush();
    expect(h.scope.getSnapshot().missionId).toBe("");
    expect(h.listCalls).toEqual([]);
  });
});

describe("Ground Medical review scope · single-mission auto-selection", () => {
  test("auto-selection loads pending batches exactly like a manual selection", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1")]), pending: { M1: [batch(BATCH_A)] } });
    h.scope.start(); await flush();
    const s = h.scope.getSnapshot();
    expect(s.missionId).toBe("M1");
    expect(h.listCalls).toEqual(["M1"]);
    expect(s.queueLoad).toBe("loaded");
    expect(s.queue.map(b => b.batch_id)).toEqual([BATCH_A]);
    expect(s.status).toBe("1 pending synthetic batch(es).");
  });
  test("Refresh immediately after auto-selection uses the auto-selected mission and shows its batches", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1")]), pending: { M1: [batch(BATCH_A), batch(BATCH_B)] } });
    h.scope.start(); await flush();
    await h.scope.refresh(); await flush();
    expect(h.listCalls).toEqual(["M1", "M1"]);
    expect(h.scope.getSnapshot().queue).toHaveLength(2);
    expect(h.scope.getSnapshot().status).toBe("2 pending synthetic batch(es).");
  });
  test("pending batch details open for the auto-selected mission", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1")]), pending: { M1: [batch(BATCH_A)] } });
    h.scope.start(); await flush();
    const rows = await h.scope.viewBatch(BATCH_A);
    expect(rows).toHaveLength(1);
    expect(h.batchCalls).toEqual([["M1", BATCH_A]]);
    expect(h.scope.getSnapshot().selectedBatch).toBe(BATCH_A);
  });
});

describe("Ground Medical review scope · explicit states", () => {
  test("an empty queue is reported explicitly", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1")]), pending: { M1: [] } });
    h.scope.start(); await flush();
    expect(h.scope.getSnapshot().queueLoad).toBe("loaded");
    expect(h.scope.getSnapshot().status).toBe(EMPTY_STATUS);
  });
  test("a failed load shows an error, never a silent empty list", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1")]), pending: async () => { throw new Error("permission denied"); } });
    h.scope.start(); await flush();
    const s = h.scope.getSnapshot();
    expect(s.queueLoad).toBe("error");
    expect(s.error).toBe("permission denied");
    expect(s.status).toBe(LOAD_FAILED_STATUS);
  });
  test("loading is visible while the request is in flight", async () => {
    const d = deferred<GroundMedicalPendingBatch[]>();
    const h = harness({ identity: async () => identity("u", [gm("M1")]), pending: () => d.promise });
    h.scope.start(); await flush();
    expect(h.scope.getSnapshot().queueLoad).toBe("loading");
    d.resolve([batch(BATCH_A)]); await flush();
    expect(h.scope.getSnapshot().queueLoad).toBe("loaded");
  });
});

describe("Ground Medical review scope · multi-mission switching", () => {
  test("several missions require an explicit choice, then each choice loads only its own batches", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1"), gm("M2")]), pending: { M1: [batch(BATCH_A)], M2: [batch(BATCH_B)] } });
    h.scope.start(); await flush();
    expect(h.scope.getSnapshot().missionId).toBe("");
    expect(h.scope.getSnapshot().status).toBe(SELECT_MISSION_STATUS);
    expect(h.listCalls).toEqual([]);
    h.scope.selectMission("M1"); await flush();
    expect(h.scope.getSnapshot().queue.map(b => b.batch_id)).toEqual([BATCH_A]);
    h.scope.selectMission("M2"); await flush();
    expect(h.scope.getSnapshot().queue.map(b => b.batch_id)).toEqual([BATCH_B]);
    await h.scope.refresh(); await flush();
    expect(h.listCalls).toEqual(["M1", "M2", "M2"]);
  });
  test("a late response for the previous mission is discarded after switching", async () => {
    const slow = deferred<GroundMedicalPendingBatch[]>();
    const h = harness({
      identity: async () => identity("u", [gm("M1"), gm("M2")]),
      pending: m => (m === "M1" ? slow.promise : Promise.resolve([batch(BATCH_B)])),
    });
    h.scope.start(); await flush();
    h.scope.selectMission("M1"); await flush();
    h.scope.selectMission("M2"); await flush();
    slow.resolve([batch(BATCH_A)]); await flush();
    const s = h.scope.getSnapshot();
    expect(s.missionId).toBe("M2");
    expect(s.queue.map(b => b.batch_id)).toEqual([BATCH_B]);
  });
  test("deselecting clears private rows", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1"), gm("M2")]), pending: { M1: [batch(BATCH_A)] } });
    h.scope.start(); await flush();
    h.scope.selectMission("M1"); await flush();
    await h.scope.viewBatch(BATCH_A);
    h.scope.selectMission(""); await flush();
    const s = h.scope.getSnapshot();
    expect(s.queue).toEqual([]); expect(s.details).toEqual([]); expect(s.selectedBatch).toBe("");
  });
});

describe("Ground Medical review scope · identity changes", () => {
  test("same user tab return keeps the loaded batch without refetching", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1")]), pending: { M1: [batch(BATCH_A)] } });
    h.scope.start(); await flush();
    await h.scope.viewBatch(BATCH_A);
    h.fireIdentity();
    expect(h.scope.getSnapshot().revalidating).toBe(true);
    await flush();
    const s = h.scope.getSnapshot();
    expect(s.revalidating).toBe(false);
    expect(s.details).toHaveLength(1);
    expect(h.listCalls).toEqual(["M1"]);
  });
  test("sign-out discards a late list response and clears everything", async () => {
    let current = identity("u", [gm("M1")]);
    const slow = deferred<GroundMedicalPendingBatch[]>();
    const h = harness({ identity: async () => current, pending: () => slow.promise });
    h.scope.start(); await flush();
    current = { configured: true, signedIn: false, memberships: [] };
    h.fireIdentity(); await flush();
    slow.resolve([batch(BATCH_A)]); await flush();
    const s = h.scope.getSnapshot();
    expect(s.queue).toEqual([]); expect(s.missionId).toBe(""); expect(s.status).toBe(SIGNED_OUT_STATUS);
  });
  test("a different account clears rows and auto-loads only its own single mission", async () => {
    let current = identity("u1", [gm("M1")]);
    const h = harness({ identity: async () => current, pending: { M1: [batch(BATCH_A)], M2: [batch(BATCH_B)] } });
    h.scope.start(); await flush();
    current = identity("u2", [gm("M2")]);
    h.fireIdentity(); await flush();
    const s = h.scope.getSnapshot();
    expect(s.missionId).toBe("M2");
    expect(s.queue.map(b => b.batch_id)).toEqual([BATCH_B]);
  });
  test("revoked membership clears the mission and its rows", async () => {
    let current = identity("u", [gm("M1")]);
    const h = harness({ identity: async () => current, pending: { M1: [batch(BATCH_A)] } });
    h.scope.start(); await flush();
    current = identity("u", []);
    h.fireIdentity(); await flush();
    const s = h.scope.getSnapshot();
    expect(s.missionId).toBe(""); expect(s.queue).toEqual([]); expect(s.status).toBe(SIGNED_OUT_STATUS);
  });
  test("an identity read failure fails closed", async () => {
    const h = harness({ identity: async () => { throw new Error("offline"); } });
    h.scope.start(); await flush();
    expect(h.scope.getSnapshot().status).toBe(SIGNED_OUT_STATUS);
    expect(h.listCalls).toEqual([]);
  });
});

describe("Ground Medical review scope · research decisions", () => {
  test("a decision goes to the current mission/batch and reloads that mission's queue", async () => {
    const h = harness({ identity: async () => identity("u", [gm("M1")]), pending: { M1: [batch(BATCH_A)] } });
    h.scope.start(); await flush();
    await h.scope.viewBatch(BATCH_A);
    const receipt = await h.scope.decide({ decision: "accepted_for_research", note: "", idempotencyKey: "p368c_0123456789abcdef" });
    expect(receipt?.decision).toBe("accepted_for_research");
    expect(h.decideCalls).toEqual([{ missionId: "M1", batchId: BATCH_A }]);
    expect(h.listCalls).toEqual(["M1", "M1"]);
    expect(h.scope.getSnapshot().status).toBe("Decision recorded: Accept for research.");
  });
  test("no decision is sent without a pending loaded batch", async () => {
    const h = harness({
      identity: async () => identity("u", [gm("M1")]), pending: { M1: [batch(BATCH_A)] },
      details: async (_m, b) => [{ ...item(b), review_status: "accepted_for_research" }],
    });
    h.scope.start(); await flush();
    expect(await h.scope.decide({ decision: "accepted_for_research", note: "", idempotencyKey: "p368c_0123456789abcdef" })).toBeNull();
    await h.scope.viewBatch(BATCH_A);
    expect(await h.scope.decide({ decision: "rejected_for_research", note: "", idempotencyKey: "p368c_0123456789abcdef" })).toBeNull();
    expect(h.decideCalls).toEqual([]);
  });
});
