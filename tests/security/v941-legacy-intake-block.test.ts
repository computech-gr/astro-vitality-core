import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { OfflineEventRecord } from "../../src/domain/offline-mission";
import * as realClientModule from "../../src/integrations/supabase/client";
import { InMemoryOfflineMissionStore } from "../../src/infrastructure/offline/store";
import { enqueueOfflineRecord, flushOfflineSyncQueue } from "../../src/infrastructure/offline/sync";
import { persistOfflineMissionEvent } from "../../src/infrastructure/offline/runtime";

const realClientExports = { ...realClientModule };

const mission = { missionId: "mission-synthetic-a", crewMemberId: "crew-synthetic-a" };

function record(id: string, sourceId: string): OfflineEventRecord {
  return {
    id,
    kind: "observation",
    mission,
    eventTimestamp: "2026-10-14T07:35:00.000Z",
    createdAt: "2026-10-14T07:40:00.000Z",
    sourceId,
    sourceVersion: "1.0",
    sourcePriority: 50,
    classification: "medical_sensitive",
    payload: { schemaVersion: "1.0", synthetic: true },
  };
}

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
const fakeClient = {
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    const event = args?.["p_event"] as OfflineEventRecord;
    return { data: { status: "accepted", record_id: event.id }, error: null };
  },
};
const hadWindow = "window" in globalThis;
let SupabaseMissionSyncTransport: typeof import("../../src/infrastructure/ground-research/supabase-transport").SupabaseMissionSyncTransport;

beforeAll(async () => {
  // Bun module mocks are process-wide: spread the real exports and restore them afterwards.
  mock.module("@/integrations/supabase/client", () => ({ ...realClientExports, supabase: fakeClient }));
  ({ SupabaseMissionSyncTransport } = await import("../../src/infrastructure/ground-research/supabase-transport"));
  if (!hadWindow) (globalThis as Record<string, unknown>)["window"] = {};
});

afterAll(() => {
  mock.module("@/integrations/supabase/client", () => realClientExports);
  if (!hadWindow) delete (globalThis as Record<string, unknown>)["window"];
});

describe("v9.4.1 legacy plaintext Unified Intake upload block", () => {
  test("new Unified Intake events stay in the encrypted local store but are never queued", async () => {
    const store = new InMemoryOfflineMissionStore();
    await persistOfflineMissionEvent({ ...record("unified-observation:a:entry", "unified-intake"), store });
    await persistOfflineMissionEvent({ ...record("pvt:b:entry", "p11-pvt"), store });
    expect((await store.get("unified-observation:a:entry"))?.sourceId).toBe("unified-intake");
    const queued = (await store.listQueueItems()).map((item) => item.recordId);
    expect(queued).toEqual(["pvt:b:entry"]);
  });

  test("a previously queued Unified Intake event never reaches the RPC and is held as blocked, while other events still sync", async () => {
    rpcCalls.length = 0;
    const store = new InMemoryOfflineMissionStore();
    const legacy = record("unified-observation:legacy:entry", "unified-intake");
    const other = record("pvt:c:entry", "p11-pvt");
    for (const r of [legacy, other]) {
      await store.append(r);
      await enqueueOfflineRecord(store, r, "2026-10-14T08:00:00.000Z");
    }
    const transport = new SupabaseMissionSyncTransport();
    const first = await flushOfflineSyncQueue(store, transport, "2026-10-14T08:01:00.000Z");
    expect(first.synced).toBe(1);
    expect(first.failed).toBe(1);
    expect(rpcCalls.map((c) => (c.args?.["p_event"] as OfflineEventRecord).id)).toEqual(["pvt:c:entry"]);
    const legacyItem = await store.getQueueItem("sync:unified-observation:legacy:entry");
    expect(legacyItem?.state).toBe("needs_review");
    expect(legacyItem?.lastError).toContain("legacy upload blocked");

    const second = await flushOfflineSyncQueue(store, transport, "2026-10-14T08:02:00.000Z");
    expect(second.attempted).toBe(0);
    expect(rpcCalls).toHaveLength(1);
  });

  test("transport rejects Unified Intake without calling the RPC", async () => {
    rpcCalls.length = 0;
    const [result] = await new SupabaseMissionSyncTransport().push([record("unified-observation:d:status", "unified-intake")]);
    expect(result?.status).toBe("rejected");
    expect(rpcCalls).toHaveLength(0);
  });
});
