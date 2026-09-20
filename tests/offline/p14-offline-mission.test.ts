import { describe, expect, test } from "bun:test";

import type { OfflineEventRecord, SyncComparableRecord } from "@/domain/offline-mission";
import { createProtocolCacheEntries, resolveSyncConflict } from "@/domain/offline-mission";
import { PROTOCOL_LIBRARY_V1_1 } from "@/domain/action-guidance";
import {
  InMemoryOfflineMissionStore,
  ReferenceMemorySyncTransport,
  enqueueOfflineRecord,
  flushOfflineSyncQueue,
  initializeOfflineMissionRuntime,
} from "@/infrastructure/offline";

const mission = { missionId: "mission-p14-test", crewMemberId: "crew-p14-test" };

function event(overrides: Partial<OfflineEventRecord> = {}): OfflineEventRecord {
  return {
    id: "event-1",
    kind: "observation",
    mission,
    eventTimestamp: "2026-09-19T12:00:00.000Z",
    createdAt: "2026-09-19T12:00:01.000Z",
    sourceId: "sensor-a",
    sourceVersion: "1.0.0",
    sourcePriority: 70,
    classification: "medical_sensitive",
    payload: { metricCode: "phys.heart_rate", value: 72 },
    ...overrides,
  };
}

describe("P14 Offline Mission Mode", () => {
  test("local records are encrypted at rest and decrypt losslessly", async () => {
    const store = new InMemoryOfflineMissionStore();
    const record = event();
    await store.append(record);
    const encrypted = store.encryptedSnapshot()[0];
    expect(encrypted).toBeDefined();
    // Inspect the decoded ciphertext bytes: a base64 string can coincidentally
    // contain short plaintext fragments, which would make this check flaky.
    const rawCiphertext = new TextDecoder().decode(
      Uint8Array.from(atob(encrypted!.ciphertext), (character) => character.charCodeAt(0)),
    );
    expect(rawCiphertext).not.toContain("phys.heart_rate");
    expect(rawCiphertext).not.toContain('"value":72');
    expect(await store.get(record.id)).toEqual(record);
  });

  test("append-only storage rejects conflicting reuse of the same event id", async () => {
    const store = new InMemoryOfflineMissionStore();
    await store.append(event());
    await expect(
      store.append(event({ payload: { metricCode: "phys.heart_rate", value: 99 } })),
    ).rejects.toThrow("Append-only record");
  });

  test("queue survives disconnect semantics and flushes idempotently on reconnect", async () => {
    const store = new InMemoryOfflineMissionStore();
    const transport = new ReferenceMemorySyncTransport();
    const record = event();
    await store.append(record);
    await enqueueOfflineRecord(store, record, "2026-09-19T12:00:02.000Z");

    const failedTransport = {
      id: "offline",
      push: async () => {
        throw new Error("network unavailable");
      },
    };
    const offlineResult = await flushOfflineSyncQueue(
      store,
      failedTransport,
      "2026-09-19T12:00:03.000Z",
    );
    expect(offlineResult.failed).toBe(1);
    expect((await store.listQueueItems())[0]?.state).toBe("failed");

    const reconnectResult = await flushOfflineSyncQueue(
      store,
      transport,
      "2026-09-19T12:05:00.000Z",
    );
    expect(reconnectResult.synced).toBe(1);
    expect((await store.listQueueItems())[0]?.state).toBe("synced");
  });

  test("conflict resolution follows version, timestamp and source priority then fails closed", () => {
    const base: SyncComparableRecord = {
      id: "same",
      sourceId: "sensor-a",
      sourceVersion: "1.0.0",
      sourcePriority: 50,
      eventTimestamp: "2026-09-19T12:00:00.000Z",
      payloadHash: "local",
    };
    expect(
      resolveSyncConflict({ ...base, sourceVersion: "2.0.0" }, { ...base, payloadHash: "remote" })
        .decision,
    ).toBe("local");
    expect(
      resolveSyncConflict(
        { ...base, eventTimestamp: "2026-09-19T12:01:00.000Z" },
        { ...base, payloadHash: "remote" },
      ).decision,
    ).toBe("local");
    expect(
      resolveSyncConflict(
        { ...base, sourcePriority: 90 },
        { ...base, payloadHash: "remote", sourcePriority: 10 },
      ).decision,
    ).toBe("local");
    expect(resolveSyncConflict(base, { ...base, payloadHash: "remote" }).decision).toBe(
      "manual_review",
    );
  });


  test("protocol cache initialization is single-flight on a clean store", async () => {
    const store = new InMemoryOfflineMissionStore();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    try {
      await Promise.all([
        initializeOfflineMissionRuntime(store),
        initializeOfflineMissionRuntime(store),
        initializeOfflineMissionRuntime(store),
      ]);
      const records = await store.list();
      expect(records.filter((record) => record.kind === "protocol_snapshot")).toHaveLength(1);
      expect(await store.getMeta("protocol_cache_digest")).toBeTruthy();
    } finally {
      if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
    }
  });

  test("protocol cache initialization recovers metadata after an interrupted first commit", async () => {
    const store = new InMemoryOfflineMissionStore();
    const cachedAt = "2026-09-20T20:30:00.000Z";
    const entries = await createProtocolCacheEntries(PROTOCOL_LIBRARY_V1_1, cachedAt);
    const id = `protocol-cache:${PROTOCOL_LIBRARY_V1_1.map((item) => `${item.id}@${item.version}`).join("|")}`;
    await store.append({
      id,
      kind: "protocol_snapshot",
      mission: { missionId: "mission-local-p14", crewMemberId: "crew-local-p14" },
      eventTimestamp: cachedAt,
      createdAt: cachedAt,
      sourceId: "protocol-library-v1.1",
      sourceVersion: "1.1",
      sourcePriority: 100,
      classification: "medical_sensitive",
      payload: entries,
    });

    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    try {
      await initializeOfflineMissionRuntime(store);
      expect(await store.getMeta("protocol_cache_digest")).toBe(
        entries.map((entry) => entry.digestSha256).join(":"),
      );
      expect(await store.getMeta("protocol_cache_at")).toBe(cachedAt);
      expect(await store.countRecords()).toBe(1);
    } finally {
      if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
    }
  });

  test("protocol cache preserves authority, version and integrity digest", async () => {
    const cached = await createProtocolCacheEntries(
      PROTOCOL_LIBRARY_V1_1,
      "2026-09-19T12:00:00.000Z",
    );
    expect(cached.length).toBe(PROTOCOL_LIBRARY_V1_1.length);
    expect(
      cached.every((entry) => entry.version && entry.authority && entry.digestSha256.length === 64),
    ).toBe(true);
  });
});
