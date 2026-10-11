import { expect, mock, test } from "bun:test";
(globalThis as any).window ??= globalThis;
let online = false; const calls: Record<string, number> = {};
const perm: Record<string,string> = { kind:"unsupported event kind", prov:"invalid source provenance", ids:"event identifiers too long", idem:"invalid idempotency key", denied:"mission access denied", auth:"authentication required", payload:"structured payload required", big:"payload too large" };
mock.module("@/integrations/supabase/client", () => ({ supabase: { rpc: async (_f: string, a: any) => {
  const id = a.p_event.id; calls[id] = (calls[id] ?? 0) + 1;
  if (perm[id]) return { data: null, error: { message: perm[id] } };
  if (!online) {
    if (id === "net") throw new TypeError("Failed to fetch");
    if (id === "timeout") return { data: null, error: { message: "canceling statement due to statement timeout" } };
    if (id === "rate") return { data: null, error: { message: "rate limit exceeded" } };
    if (id === "unknown") return { data: null, error: { message: "something odd happened" } };
  }
  return { data: { status: "accepted", record_id: id }, error: null };
} } }));
const { InMemoryOfflineMissionStore, enqueueOfflineRecord, flushOfflineSyncQueue, getOfflineMissionStatus } = await import("@/infrastructure/offline");
const { SupabaseMissionSyncTransport, classifyMissionSyncError } = await import("@/infrastructure/ground-research/supabase-transport");
test("P23E", async () => {
  for (const m of Object.values(perm)) expect(classifyMissionSyncError(m)).toBe("rejected");
  const store = new InMemoryOfflineMissionStore(); await store.initialize();
  const ids = ["ok", ...Object.keys(perm), "net", "timeout", "rate", "unknown"];
  for (const id of ids) { const r: any = { id, kind: "observation", mission: { missionId: "m", crewMemberId: "c" }, eventTimestamp: "2026-10-11T19:00:00Z", createdAt: "2026-10-11T19:00:01Z", sourceId: "synthetic", sourceVersion: "1", sourcePriority: 50, classification: "synthetic", payload: { synthetic: true } }; await store.append(r); await enqueueOfflineRecord(store, r, r.createdAt); }
  const t = new SupabaseMissionSyncTransport();
  const st = (q: any[]) => Object.fromEntries(q.map(x => [x.recordId, x.state]));
  await flushOfflineSyncQueue(store, t, "2026-10-11T19:01:00Z");
  const s1 = st(await store.listQueueItems());
  const status1 = await getOfflineMissionStatus(store as any);
  const r2 = await flushOfflineSyncQueue(store, t, "2026-10-11T19:02:00Z");
  online = true;
  const r3 = await flushOfflineSyncQueue(store, t, "2026-10-11T19:03:00Z");
  const r4 = await flushOfflineSyncQueue(store, t, "2026-10-11T19:04:00Z");
  const s4 = st(await store.listQueueItems());
  const status4 = await getOfflineMissionStatus(store as any);
  console.log(JSON.stringify({ s1, p1: status1.pendingSyncItems, rv1: status1.reviewSyncItems, r2: r2.attempted, r3: r3.attempted, r4: r4.attempted, s4, p4: status4.pendingSyncItems, rv4: status4.reviewSyncItems, calls, stored: (await store.list(50)).length }));
  for (const k of Object.keys(perm)) { expect(s1[k]).toBe("needs_review"); expect(calls[k]).toBe(1); expect(s4[k]).toBe("needs_review"); }
  for (const k of ["net","timeout","rate","unknown"]) { expect(s1[k]).toBe("failed"); expect(s4[k]).toBe("synced"); }
  expect(s1.ok).toBe("synced"); expect(calls.ok).toBe(1);
  expect(status1.pendingSyncItems).toBe(4); expect(status1.reviewSyncItems).toBe(8);
  expect(r2.attempted).toBe(4); expect(r3.attempted).toBe(4); expect(r4.attempted).toBe(0);
  expect(status4.pendingSyncItems).toBe(0); expect(status4.reviewSyncItems).toBe(8);
  expect((await store.list(50)).length).toBe(13);
  expect(store.encryptedSnapshot().length).toBe(13);
});
