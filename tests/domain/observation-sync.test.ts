import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryOfflineMissionStore } from "../../src/infrastructure/offline/store";
import { InMemoryReviewLedgerStore } from "../../src/infrastructure/offline/review-ledger-store";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import {
  collapseUnifiedObservationVersions,
  domainReadableObservations,
  importUnifiedObservationEvent,
  listUnifiedObservationEvents,
  listUnifiedObservations,
} from "../../src/domain/health-intelligence/observation-store";
import {
  checkObservationSyncEvent,
  decideRemoteImport,
  reconcileReviewEvents,
  type ObservationSyncEvent,
  type SyncScope,
} from "../../src/domain/health-intelligence/observation-sync";
import { runObservationSync, type ObservationSyncRunDeps } from "../../src/domain/health-intelligence/observation-sync-runner";
import { runReviewSync, type ReviewSyncRunDeps } from "../../src/domain/health-intelligence/review-sync-runner";
import {
  appendAttestationEvents,
  appendObservationSyncReceipts,
  listAttestationEvents,
  listObservationSyncReceipts,
} from "../../src/domain/health-intelligence/review-ledger";
import { planAttestation, recordFingerprint } from "../../src/domain/health-intelligence/evidence-attestation";
import { buildStoredObservationReview } from "../../src/domain/health-intelligence/stored-observation-review";
import {
  deriveScopeKeys,
  openEvent,
  pullObservationEventsCore,
  pushObservationEventsCore,
  readMasterKeys,
  sealEvent,
  syncGate,
  type SyncDeps,
} from "../../src/lib/observation-sync.server";
import { GM_USER, obs, V9_SCOPE } from "./fixtures-v9-observations";

const here = dirname(fileURLToPath(import.meta.url));
const CREW_USER = "00000000-0000-4000-8000-0000000000b1";
const RESEARCHER = "00000000-0000-4000-8000-0000000000a3";
const OPERATOR = "00000000-0000-4000-8000-0000000000a1";
const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 255)).toString("base64");
const ENV: Record<string, string> = { MITO_OBSERVATION_SYNC_ENABLED: "true", MITO_OBSERVATION_SYNC_KEY_V1: KEY };
const SCOPE: SyncScope = { ...V9_SCOPE };
const REASON = "Reviewed against the synthetic source document";

const entry = (o: UnifiedObservation): ObservationSyncEvent => ({ eventId: `${o.id}:${o.status === "erroneous" ? "status" : "entry"}`, eventKind: o.status === "erroneous" ? "status" : "entry", observation: o });

/** In-memory stand-in with the same semantics as the pending SQL (append-only, scoped access, duplicate/conflict, cursor). */
class FakeCloud {
  obsRows: Record<string, unknown>[] = [];
  att: Record<string, string | number | null>[] = [];
  corr: Record<string, string | number | null>[] = [];
  seq = 0;
  memberships: Record<string, { mission: string; role: string; crew: string | null }[]> = {
    [GM_USER]: [{ mission: SCOPE.missionId, role: "ground_medical", crew: null }],
    [CREW_USER]: [{ mission: SCOPE.missionId, role: "crew_self", crew: SCOPE.crewMemberId }],
    [RESEARCHER]: [{ mission: SCOPE.missionId, role: "researcher", crew: null }],
    [OPERATOR]: [{ mission: SCOPE.missionId, role: "mission_operator", crew: null }],
  };
  failList = false;
  private canAccess(uid: string | null, mission: string, crew: string) {
    return (this.memberships[uid ?? ""] ?? []).some((m) => m.mission === mission && ((m.role === "crew_self" && m.crew === crew) || (m.role === "ground_medical" && (m.crew === null || m.crew === crew))));
  }
  deps(uid: string | null, env: Record<string, string> = ENV, membershipsOverride?: SyncDeps["memberships"]): SyncDeps {
    return {
      env: (n) => env[n],
      memberships: membershipsOverride ?? (async (mission) => (uid ? (this.memberships[uid] ?? []).filter((m) => m.mission === mission).map((m) => ({ role: m.role, crew_member_id: m.crew, active: true })) : null)),
      rpc: async (fn, a) => {
        if (!this.canAccess(uid, a["p_mission_id"] as string, a["p_crew_member_id"] as string)) return { data: null, error: { code: "42501" } };
        if (fn === "observation_sync_append_v1") {
          if (a["p_provenance"] === "real" && a["p_real_data_confirmed"] !== true) return { data: null, error: { code: "42501" } };
          const out: Record<string, unknown>[] = [];
          for (const e of a["p_events"] as Record<string, unknown>[]) {
            const existing = this.obsRows.find((r) => r["mission_id"] === a["p_mission_id"] && r["crew_member_id"] === a["p_crew_member_id"] && r["provenance"] === a["p_provenance"] && r["event_id"] === e["eventId"]);
            if (existing) {
              out.push({ id: e["eventId"], status: existing["fingerprint"] === e["fingerprint"] ? "duplicate" : "conflict", fingerprint: existing["fingerprint"], received_at: existing["received_at"], detail: null });
              continue;
            }
            const row = { mission_id: a["p_mission_id"], crew_member_id: a["p_crew_member_id"], provenance: a["p_provenance"], event_id: e["eventId"], observation_id: e["observationId"], event_kind: e["eventKind"], cipher_alg: e["cipherAlg"], key_version: e["keyVersion"], iv: e["iv"], ciphertext: e["ciphertext"], fingerprint: e["fingerprint"], uploaded_by: uid, received_at: "2026-11-01T12:00:00.000Z", received_seq: ++this.seq };
            this.obsRows.push(row);
            out.push({ id: e["eventId"], status: "inserted", fingerprint: e["fingerprint"], received_at: row.received_at, detail: null });
          }
          return { data: out, error: null };
        }
        if (fn === "observation_sync_list_v1") {
          if (this.failList) return { data: null, error: { code: "PGRST202" } };
          const rows = this.obsRows
            .filter((r) => r["mission_id"] === a["p_mission_id"] && r["crew_member_id"] === a["p_crew_member_id"] && r["provenance"] === a["p_provenance"] && (r["received_seq"] as number) > (a["p_after_seq"] as number))
            .slice(0, a["p_limit"] as number);
          return { data: rows.map((r) => ({ ...r })), error: null };
        }
        return { data: null, error: { code: "PGRST202" } };
      },
    };
  }
  reviewDeps(): ReviewSyncRunDeps {
    return {
      now: () => "2026-11-01T12:00:00.000Z",
      push: async ({ scope, attestations, corrections }) => {
        const results = [
          ...attestations.map((p) => {
            const ex = this.att.find((r) => r["event_id"] === p.eventId);
            if (ex) return { kind: "attestation" as const, id: p.eventId, status: (ex["reason"] === p.reason ? "duplicate" : "conflict") as "duplicate" | "conflict", receivedAt: null, detail: null };
            this.att.push({ mission_id: scope.missionId, crew_member_id: scope.crewMemberId, provenance: scope.provenance, event_id: p.eventId, action: p.action, record_id: p.recordId, record_fingerprint: p.recordFingerprint, metric_id: p.metricId, badge: p.badge, reason: p.reason, decided_at: p.decidedAt, batch_id: p.batchId, supersedes_event_id: p.supersedesEventId, actor_user_id: p.actorUserId, received_at: "2026-11-01T12:00:00.000Z", received_seq: ++this.seq });
            return { kind: "attestation" as const, id: p.eventId, status: "inserted" as const, receivedAt: null, detail: null };
          }),
          ...corrections.map((c) => ({ kind: "correction" as const, id: c.intentId, status: "inserted" as const, receivedAt: null, detail: null })),
        ];
        return { ok: true as const, results };
      },
      pull: async ({ kind, afterSeq, limit }) => {
        const rows = (kind === "attestation" ? this.att : this.corr).filter((r) => (r["received_seq"] as number) > afterSeq).slice(0, limit);
        return { ok: true as const, rows, lastSeq: rows.reduce((m, r) => Math.max(m, r["received_seq"] as number), afterSeq), hasMore: rows.length >= limit };
      },
    };
  }
}

function device(cloud: FakeCloud, uid: string, env = ENV) {
  const store = new InMemoryOfflineMissionStore();
  const ledger = new InMemoryReviewLedgerStore();
  const deps: ObservationSyncRunDeps = {
    listLocal: async () => (await listUnifiedObservationEvents(SCOPE.missionId, SCOPE.crewMemberId, store)).map(({ eventId, eventKind, observation }) => ({ eventId, eventKind, observation })),
    listReceipts: () => listObservationSyncReceipts(SCOPE, ledger),
    appendReceipts: async (r) => {
      await appendObservationSyncReceipts(r, SCOPE, uid, ledger);
    },
    importEvent: (e) => importUnifiedObservationEvent(e, store),
    push: (a) => pushObservationEventsCore(a, cloud.deps(uid, env)),
    pull: (a) => pullObservationEventsCore(a, cloud.deps(uid, env)),
    now: () => "2026-11-01T12:00:00.000Z",
  };
  const save = (o: UnifiedObservation) => importUnifiedObservationEvent(entry(o), store);
  const history = () => listUnifiedObservations(SCOPE.missionId, SCOPE.crewMemberId, store);
  const syncObs = (canUpload = true, realDataConfirmed = false) => runObservationSync({ scope: SCOPE, canUpload, realDataConfirmed }, deps);
  const syncReviews = async (canPush: boolean) => runReviewSync({ scope: SCOPE, actorUserId: uid, canPush, history: await history() }, { ...cloud.reviewDeps(), store: ledger });
  return { store, ledger, deps, save, history, syncObs, syncReviews };
}

describe("v9.4 encryption and key handling", () => {
  test("round-trips with AES-GCM; the stored row holds no plaintext", async () => {
    const keys = await deriveScopeKeys(readMasterKeys((n) => ENV[n]).get(1)!, 1, SCOPE);
    const o = obs({ value: "71", source: { kind: "csv", label: "CSV: secret-label.csv" } });
    const sealed = await sealEvent(keys, SCOPE, entry(o));
    expect(JSON.stringify(sealed)).not.toContain("secret-label");
    expect(JSON.stringify(sealed)).not.toContain("bpm");
    const row = { event_id: sealed.eventId, iv: sealed.iv, ciphertext: sealed.ciphertext, fingerprint: sealed.fingerprint, event_kind: sealed.eventKind, observation_id: sealed.observationId };
    expect((await openEvent(keys, SCOPE, row)).observation).toEqual(o);
  });
  test("tampered ciphertext, swapped event ID, altered fingerprint and another scope all fail", async () => {
    const master = readMasterKeys((n) => ENV[n]).get(1)!;
    const keys = await deriveScopeKeys(master, 1, SCOPE);
    const s = await sealEvent(keys, SCOPE, entry(obs()));
    const row = { event_id: s.eventId, iv: s.iv, ciphertext: s.ciphertext, fingerprint: s.fingerprint, event_kind: s.eventKind, observation_id: s.observationId };
    const flipped = (s.ciphertext[0] === "A" ? "B" : "A") + s.ciphertext.slice(1);
    await expect(openEvent(keys, SCOPE, { ...row, ciphertext: flipped })).rejects.toThrow();
    await expect(openEvent(keys, SCOPE, { ...row, event_id: "obs-999999:entry" })).rejects.toThrow();
    await expect(openEvent(keys, SCOPE, { ...row, fingerprint: `ofp-${"0".repeat(64)}` })).rejects.toThrow();
    const other = { ...SCOPE, crewMemberId: "crew-b" };
    await expect(openEvent(await deriveScopeKeys(master, 1, other), other, row)).rejects.toThrow();
  });
  test("sync is default-off; malformed keys are ignored; REAL needs its own flag", () => {
    expect(syncGate(() => undefined, "synthetic").ok).toBe(false);
    expect(syncGate((n) => ({ MITO_OBSERVATION_SYNC_ENABLED: "true" })[n], "synthetic").ok).toBe(false);
    expect(syncGate((n) => ({ MITO_OBSERVATION_SYNC_ENABLED: "true", MITO_OBSERVATION_SYNC_KEY_V1: "c2hvcnQ=" })[n], "synthetic").ok).toBe(false);
    expect(syncGate((n) => ENV[n], "synthetic").ok).toBe(true);
    expect(syncGate((n) => ENV[n], "real").ok).toBe(false);
    expect(syncGate((n) => ({ ...ENV, MITO_OBSERVATION_SYNC_REAL_ENABLED: "true" })[n], "real").ok).toBe(true);
  });
});

describe("v9.4 event validation", () => {
  test("wrong mission, crew or provenance is rejected", () => {
    expect(checkObservationSyncEvent(entry(obs({ missionId: "mission-x" })), SCOPE)).toContain("another mission");
    expect(checkObservationSyncEvent(entry(obs({ crewMemberId: "crew-x" })), SCOPE)).toContain("another mission");
    expect(checkObservationSyncEvent(entry(obs({ provenance: "real" })), SCOPE)).toContain("provenance");
  });
  test("no silent unit conversion: a non-catalog unit is rejected, never rewritten", () => {
    const o = obs({ originalUnit: "beats/min" });
    expect(checkObservationSyncEvent(entry(o), SCOPE)).toContain("Units are never converted");
    expect(o.originalUnit).toBe("beats/min");
  });
  test("unexpected fields (for example AI text) and kind/status mismatches are rejected", () => {
    expect(checkObservationSyncEvent(entry({ ...obs(), aiDraft: "x" } as unknown as UnifiedObservation), SCOPE)).toContain("Unexpected field");
    const o = obs();
    expect(checkObservationSyncEvent({ eventId: `${o.id}:status`, eventKind: "status", observation: o }, SCOPE)).toContain("status");
  });
  test("a cloud version that differs from the local one is a conflict, never an overwrite", () => {
    const o = obs();
    const local = new Map([[`${o.id}:entry`, o]]);
    expect(decideRemoteImport(entry(o), local, SCOPE).action).toBe("duplicate");
    expect(decideRemoteImport(entry({ ...o, value: "99" }), local, SCOPE).action).toBe("conflict");
  });
});

describe("v9.4 server authorization (pre-check before any decryption)", () => {
  test("anonymous, researcher, operator and other-crew callers are refused", async () => {
    const cloud = new FakeCloud();
    const ev = [entry(obs())];
    for (const uid of [null, RESEARCHER, OPERATOR]) {
      const r = await pushObservationEventsCore({ scope: SCOPE, events: ev, realDataConfirmed: false }, cloud.deps(uid));
      expect(r.ok ? "ok" : r.code).toBe("forbidden");
      const p = await pullObservationEventsCore({ scope: SCOPE, afterSeq: 0, limit: 10 }, cloud.deps(uid));
      expect(p.ok ? "ok" : p.code).toBe("forbidden");
    }
    const other = await pullObservationEventsCore({ scope: { ...SCOPE, crewMemberId: "crew-b" }, afterSeq: 0, limit: 10 }, cloud.deps(CREW_USER));
    expect(other.ok ? "ok" : other.code).toBe("forbidden");
    expect(cloud.obsRows.length).toBe(0);
  });
  test("REAL provenance requires explicit confirmation even when enabled", async () => {
    const cloud = new FakeCloud();
    const env = { ...ENV, MITO_OBSERVATION_SYNC_REAL_ENABLED: "true" };
    const real = { ...SCOPE, provenance: "real" as const };
    const ev = [entry(obs({ provenance: "real" }))];
    const r = await pushObservationEventsCore({ scope: real, events: ev, realDataConfirmed: false }, cloud.deps(GM_USER, env));
    expect(r.ok).toBe(false);
    expect(cloud.obsRows.length).toBe(0);
  });
  test("tampered cloud rows are reported, never imported", async () => {
    const cloud = new FakeCloud();
    await pushObservationEventsCore({ scope: SCOPE, events: [entry(obs())], realDataConfirmed: false }, cloud.deps(GM_USER));
    const row = cloud.obsRows[0]!;
    row["ciphertext"] = ((row["ciphertext"] as string)[0] === "A" ? "B" : "A") + (row["ciphertext"] as string).slice(1);
    const p = await pullObservationEventsCore({ scope: SCOPE, afterSeq: 0, limit: 10 }, cloud.deps(GM_USER));
    if (!p.ok) throw new Error("pull failed");
    expect(p.events.length).toBe(0);
    expect(p.problems[0]?.problem).toBe("undecryptable_or_tampered");
  });
});

describe("v9.4 two-device scenario", () => {
  test("v2 date-only observations and exact Ground Medical attestations reconcile on two devices", async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, GM_USER);
    const o = obs({ schema: "mitochondria.unified-observation.v2", datePrecision: "date", observedAt: "2026-10-30", collectionDate: "2026-10-30", value: "62" });
    await a.save(o);
    const review = buildStoredObservationReview(await a.history(), SCOPE, []);
    const plan = planAttestation(review.report, [o.id], [], { actorUserId: GM_USER, rolesForScope: ["ground_medical"], scope: SCOPE, decidedAt: "2026-11-01T10:00:00Z" }, { reason: REASON, confirmed: true });
    if (!plan.ok) throw new Error(plan.reason);
    await appendAttestationEvents(plan.events, SCOPE, { actorUserId: GM_USER, rolesForScope: ["ground_medical"] }, a.ledger);
    expect((await a.syncObs()).uploaded.inserted).toBe(1);
    expect((await a.syncReviews(true)).status).toBe("ok");
    expect(JSON.stringify(cloud.obsRows)).not.toContain("2026-10-30");
    expect(JSON.stringify(cloud.obsRows)).not.toContain("bpm");
    const b = device(cloud, GM_USER);
    expect((await b.syncObs()).downloaded.imported).toBe(1);
    await b.syncReviews(false);
    expect(await b.history()).toEqual([o]);
    expect(buildStoredObservationReview(await b.history(), SCOPE, await listAttestationEvents(SCOPE, b.ledger)).views[0]?.groundMedical).toBe("attested");
    expect((await b.syncObs()).uploaded.inserted).toBe(0);
    expect(cloud.obsRows.length).toBe(1);
  });

  test("fresh device receives the same 2 observations and reconciles the 2 attestations to Attested; replays add nothing", async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, GM_USER);
    const o1 = obs({ value: "62" });
    const o2 = obs({ metricId: "cv-027", originalUnit: "ms", value: "48" });
    await a.save(o1);
    await a.save(o2);
    const histA = await a.history();
    const review = buildStoredObservationReview(histA, SCOPE, []);
    const plan = planAttestation(review.report, [o1.id, o2.id], [], { actorUserId: GM_USER, rolesForScope: ["ground_medical"], scope: SCOPE, decidedAt: "2026-11-01T10:00:00.000Z" }, { reason: REASON, confirmed: true });
    if (!plan.ok) throw new Error(plan.reason);
    await appendAttestationEvents(plan.events, SCOPE, { actorUserId: GM_USER, rolesForScope: ["ground_medical"] }, a.ledger);

    const upA = await a.syncObs();
    expect(upA.status).toBe("ok");
    expect(upA.uploaded.inserted).toBe(2);
    expect((await a.syncReviews(true)).status).toBe("ok");
    expect(cloud.obsRows.length).toBe(2);
    expect(cloud.att.length).toBe(2);
    expect(JSON.stringify(cloud.obsRows)).not.toContain("synthetic-kit.csv");

    const b = device(cloud, GM_USER);
    expect((await b.history()).length).toBe(0);
    const downB = await b.syncObs();
    expect(downB.downloaded.imported).toBe(2);
    await b.syncReviews(true);
    const histB = await b.history();
    expect(histB.map((o) => o.id).sort()).toEqual(histA.map((o) => o.id).sort());
    expect(histB.find((o) => o.id === o1.id)).toEqual(o1);
    const viewB = buildStoredObservationReview(histB, SCOPE, await listAttestationEvents(SCOPE, b.ledger));
    expect(viewB.views.map((v) => v.groundMedical)).toEqual(["attested", "attested"]);
    for (const v of viewB.views) expect(v.attestationHistory[0]?.recordFingerprint).toBe(recordFingerprint(v.row!));
    const eventsA = (await listAttestationEvents(SCOPE, a.ledger)).map((e) => e.eventId).sort();
    expect((await listAttestationEvents(SCOPE, b.ledger)).map((e) => e.eventId).sort()).toEqual(eventsA);

    // Replays: zero new cloud rows and zero new local records.
    const again = await b.syncObs();
    expect(again.uploaded.inserted).toBe(0);
    expect(again.downloaded.imported).toBe(0);
    expect((await a.syncObs()).uploaded.inserted).toBe(0);
    expect(cloud.obsRows.length).toBe(2);
    expect(await b.store.countRecords()).toBe(2);
    // Source device intact.
    expect(await a.history()).toEqual(histA);
  });

  test("cloud-only reviews without observations are never shown as Attested", async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, GM_USER);
    const o = obs();
    await a.save(o);
    const r = buildStoredObservationReview(await a.history(), SCOPE, []);
    const plan = planAttestation(r.report, [o.id], [], { actorUserId: GM_USER, rolesForScope: ["ground_medical"], scope: SCOPE, decidedAt: "2026-11-01T10:00:00.000Z" }, { reason: REASON, confirmed: true });
    if (!plan.ok) throw new Error(plan.reason);
    await appendAttestationEvents(plan.events, SCOPE, { actorUserId: GM_USER, rolesForScope: ["ground_medical"] }, a.ledger);
    await a.syncReviews(true);
    const c = device(cloud, GM_USER, {}); // observation sync disabled on this server
    const res = await c.syncObs();
    expect(res.status).toBe("failed");
    expect(res.code).toBe("disabled");
    await c.syncReviews(true);
    const events = await listAttestationEvents(SCOPE, c.ledger);
    expect(events.length).toBe(1);
    const view = buildStoredObservationReview(await c.history(), SCOPE, events);
    expect(view.views.length).toBe(0);
    expect(reconcileReviewEvents(await c.history(), events).absentRecordIds).toEqual([o.id]);
  });

  test("a mismatched record version shows Stale, not Attested", async () => {
    const o = obs();
    const review = buildStoredObservationReview([o], SCOPE, []);
    const plan = planAttestation(review.report, [o.id], [], { actorUserId: GM_USER, rolesForScope: ["ground_medical"], scope: SCOPE, decidedAt: "2026-11-01T10:00:00.000Z" }, { reason: REASON, confirmed: true });
    if (!plan.ok) throw new Error(plan.reason);
    const changed = buildStoredObservationReview([{ ...o, value: "99" }], SCOPE, plan.events);
    expect(changed.views[0]?.groundMedical).toBe("stale");
  });

  test("duplicate and conflicting events: replay is idempotent, a different local version is kept and reported", async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, GM_USER);
    const o = obs();
    await a.save(o);
    await a.syncObs();
    const b = device(cloud, CREW_USER);
    await b.save({ ...o, value: "120" }); // same ID, different content
    const r = await b.syncObs();
    expect(r.uploaded.conflict).toBe(1);
    expect(r.downloaded.conflict).toBe(1);
    expect(r.status).toBe("partial");
    expect((await b.history())[0]?.value).toBe("120");
    expect(cloud.obsRows.length).toBe(1);
  });

  test("pagination: 130 events upload in batches and download across pages", async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, GM_USER);
    for (let i = 0; i < 130; i++) await a.save(obs());
    const up = await a.syncObs();
    expect(up.uploaded.inserted).toBe(130);
    const b = device(cloud, CREW_USER);
    const down = await b.syncObs();
    expect(down.downloaded.imported).toBe(130);
    expect((await b.history()).length).toBe(130);
  });

  test("corrections and supersession chains are preserved across devices", async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, GM_USER);
    const original = obs({ value: "70" });
    const corrected = obs({ value: "77", supersedesId: original.id, correction: { intentId: "corr-0000000000000001", originalRecordId: original.id, actorUserId: GM_USER, actorRole: "ground_medical", reason: REASON, decidedAt: "2026-11-01T10:00:00.000Z" } });
    await a.save(original);
    await a.save(corrected);
    await importUnifiedObservationEvent({ eventId: `${original.id}:status`, eventKind: "status", observation: { ...original, status: "erroneous", statusReason: REASON } }, a.store);
    await a.syncObs();
    const b = device(cloud, CREW_USER);
    await b.syncObs();
    const hist = await b.history();
    expect(hist.find((o) => o.id === original.id)?.status).toBe("erroneous");
    expect(domainReadableObservations(hist).map((o) => o.value)).toEqual(["77"]);
    expect((await listUnifiedObservationEvents(SCOPE.missionId, SCOPE.crewMemberId, b.store)).length).toBe(3);
  });

  test("an erroneous status stays terminal even if imported before its entry", () => {
    const o = obs();
    const out = collapseUnifiedObservationVersions([
      { observation: { ...o, status: "erroneous" }, storedAt: "2026-11-01T10:00:00.000Z" },
      { observation: o, storedAt: "2026-11-01T11:00:00.000Z" },
    ]);
    expect(out[0]?.status).toBe("erroneous");
  });

  test("partial failure: upload succeeds, download fails — reported separately, no false success", async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, GM_USER);
    await a.save(obs());
    cloud.failList = true;
    const r = await a.syncObs();
    expect(r.status).toBe("partial");
    expect(r.code).toBe("migration_required");
    expect(r.uploaded.inserted).toBe(1);
    expect(r.message).toContain("download failed");
  });

  test("offline: a network failure records no receipts and nothing is marked synced", async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, GM_USER);
    await a.save(obs());
    a.deps.push = async () => {
      throw new Error("fetch failed");
    };
    await expect(a.syncObs()).rejects.toThrow("fetch failed");
    expect((await listObservationSyncReceipts(SCOPE, a.ledger)).length).toBe(0);
    expect(cloud.obsRows.length).toBe(0);
  });
});

describe("v9.4 research-only boundaries", () => {
  test("sync modules call no AI provider and produce no diagnosis or interpretation", () => {
    for (const f of ["src/domain/health-intelligence/observation-sync.ts", "src/domain/health-intelligence/observation-sync-runner.ts", "src/lib/observation-sync.server.ts", "src/lib/observation-sync.functions.ts"]) {
      const src = readFileSync(join(here, "../..", f), "utf8");
      expect(src).not.toMatch(/openai|ai\.gateway|LOVABLE_API_KEY|fetch\(/i);
      expect(src).not.toMatch(/diagnos(is|e)\s*[:=]/i);
    }
  });
});

describe("v9.4.1 payload ceiling matches the staged database ciphertext limit", () => {
  const bytes = (o: UnifiedObservation) => new TextEncoder().encode(JSON.stringify(o)).length;
  const withGreekExcerpt = (targetBytes: number) => {
    const base = obs();
    const pad = targetBytes - bytes(base);
    return obs({ id: base.id, source: { ...base.source, excerpt: "μ".repeat(Math.max(0, Math.floor(pad / 2))) } });
  };

  test("the largest accepted Greek observation still fits the 24,000-character ciphertext column", async () => {
    let o = withGreekExcerpt(11_990);
    expect(checkObservationSyncEvent(entry(o), SCOPE)).toBeNull();
    const keys = await deriveScopeKeys(readMasterKeys((n) => ENV[n]).get(1)!, 1, SCOPE);
    const sealed = await sealEvent(keys, SCOPE, entry(o));
    expect(sealed.ciphertext.length).toBeLessThanOrEqual(24_000);
    o = withGreekExcerpt(12_100);
    expect(checkObservationSyncEvent(entry(o), SCOPE)).toBe("Observation payload is too large to sync.");
  });
});

describe("v9.4.2 master-secret formats (fail closed)", () => {
  // Test-only material; never a deployed value.
  const ALNUM = Array.from({ length: 64 }, (_, i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[(i * 17 + 5) % 62]).join("");
  const read = (value: string) => readMasterKeys((n) => (n === "MITO_OBSERVATION_SYNC_KEY_V1" ? value : undefined));

  test("accepts padded 32-byte base64 and a 64+ character random alphanumeric secret", () => {
    expect(read(KEY).get(1)?.length).toBe(32);
    expect(read(ALNUM).has(1)).toBe(true);
  });

  test("rejects short, low-variety, unpadded or wrong-length values", () => {
    expect(read(ALNUM.slice(0, 63)).has(1)).toBe(false);
    expect(read("a".repeat(64)).has(1)).toBe(false);
    expect(read(KEY.replace(/=$/, "")).has(1)).toBe(false);
    expect(read(Buffer.alloc(31, 7).toString("base64")).has(1)).toBe(false);
    expect(read("not a key").has(1)).toBe(false);
  });

  test("an alphanumeric secret round-trips and different secrets cannot decrypt each other", async () => {
    const a = await deriveScopeKeys(read(ALNUM).get(1)!, 1, SCOPE);
    const b = await deriveScopeKeys(read(ALNUM.split("").reverse().join("")).get(1)!, 1, SCOPE);
    const e = entry(obs());
    const sealed = await sealEvent(a, SCOPE, e);
    const row = { event_id: sealed.eventId, iv: sealed.iv, ciphertext: sealed.ciphertext, fingerprint: sealed.fingerprint, event_kind: sealed.eventKind, observation_id: sealed.observationId };
    expect((await openEvent(a, SCOPE, row)).observation.id).toBe(e.observation.id);
    await expect(openEvent(b, SCOPE, row)).rejects.toThrow();
  });
});
