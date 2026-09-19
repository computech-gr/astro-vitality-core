import type {
  OfflineEventRecord,
  OfflineSyncQueueItem,
  SyncComparableRecord,
  SyncConflictResolution,
} from "@/domain/offline-mission";
import { resolveSyncConflict, sha256Hex } from "@/domain/offline-mission";
import type { OfflineMissionStore } from "./store";

export interface SyncTransportResult {
  recordId: string;
  status: "accepted" | "duplicate" | "conflict" | "rejected";
  remote?: SyncComparableRecord;
  message?: string;
}

export interface OfflineSyncTransport {
  id: string;
  push(records: readonly OfflineEventRecord[]): Promise<SyncTransportResult[]>;
}

export interface SyncFlushResult {
  attempted: number;
  synced: number;
  duplicates: number;
  conflicts: number;
  failed: number;
  resolutions: Array<{ recordId: string; resolution: SyncConflictResolution }>;
}

export async function enqueueOfflineRecord(
  store: OfflineMissionStore,
  record: OfflineEventRecord,
  now: string,
): Promise<OfflineSyncQueueItem> {
  const payloadHash = await sha256Hex(record.payload);
  const item: OfflineSyncQueueItem = {
    id: `sync:${record.id}`,
    recordId: record.id,
    idempotencyKey: `${record.id}:${record.sourceVersion}:${payloadHash}`,
    state: "pending",
    attempts: 0,
    enqueuedAt: now,
    updatedAt: now,
  };
  const existing = await store.getQueueItem(item.id);
  if (existing?.state === "synced") return existing;
  await store.putQueueItem(existing ?? item);
  return existing ?? item;
}

function comparableFromLocal(record: OfflineEventRecord, payloadHash: string): SyncComparableRecord {
  return {
    id: record.id,
    sourceId: record.sourceId,
    sourceVersion: record.sourceVersion,
    sourcePriority: record.sourcePriority,
    eventTimestamp: record.eventTimestamp,
    payloadHash,
  };
}

export async function flushOfflineSyncQueue(
  store: OfflineMissionStore,
  transport: OfflineSyncTransport,
  now: string,
): Promise<SyncFlushResult> {
  const pending = (await store.listQueueItems()).filter(
    (item) => item.state === "pending" || item.state === "failed" || item.state === "conflict",
  );
  const records: OfflineEventRecord[] = [];
  const queueByRecord = new Map<string, OfflineSyncQueueItem>();
  for (const item of pending) {
    const record = await store.get(item.recordId);
    if (!record) {
      await store.putQueueItem({
        ...item,
        state: "failed",
        attempts: item.attempts + 1,
        updatedAt: now,
        lastError: "Encrypted local record is missing",
      });
      continue;
    }
    records.push(record);
    queueByRecord.set(record.id, item);
    await store.putQueueItem({ ...item, state: "in_flight", updatedAt: now });
  }

  if (!records.length) {
    return { attempted: 0, synced: 0, duplicates: 0, conflicts: 0, failed: 0, resolutions: [] };
  }

  let results: SyncTransportResult[];
  try {
    results = await transport.push(records);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync transport failed";
    for (const record of records) {
      const item = queueByRecord.get(record.id)!;
      await store.putQueueItem({
        ...item,
        state: "failed",
        attempts: item.attempts + 1,
        updatedAt: now,
        lastError: message,
      });
    }
    return {
      attempted: records.length,
      synced: 0,
      duplicates: 0,
      conflicts: 0,
      failed: records.length,
      resolutions: [],
    };
  }

  let synced = 0;
  let duplicates = 0;
  let conflicts = 0;
  let failed = 0;
  const resolutions: SyncFlushResult["resolutions"] = [];

  for (const record of records) {
    const item = queueByRecord.get(record.id)!;
    const result = results.find((candidate) => candidate.recordId === record.id);
    if (!result) {
      failed += 1;
      await store.putQueueItem({
        ...item,
        state: "failed",
        attempts: item.attempts + 1,
        updatedAt: now,
        lastError: "Sync transport returned no result for record",
      });
      continue;
    }

    if (result.status === "accepted" || result.status === "duplicate") {
      if (result.status === "accepted") synced += 1;
      else duplicates += 1;
      await store.putQueueItem({
        ...item,
        state: "synced",
        attempts: item.attempts + 1,
        updatedAt: now,
      });
      continue;
    }

    if (result.status === "conflict" && result.remote) {
      const resolution = resolveSyncConflict(
        comparableFromLocal(record, await sha256Hex(record.payload)),
        result.remote,
      );
      resolutions.push({ recordId: record.id, resolution });
      if (resolution.decision === "duplicate" || resolution.decision === "remote") {
        await store.putQueueItem({
          ...item,
          state: "synced",
          attempts: item.attempts + 1,
          updatedAt: now,
        });
        duplicates += resolution.decision === "duplicate" ? 1 : 0;
      } else if (resolution.decision === "local") {
        await store.putQueueItem({
          ...item,
          state: "pending",
          attempts: item.attempts + 1,
          updatedAt: now,
          lastError: "Remote transport must accept the newer local record on retry",
        });
        conflicts += 1;
      } else {
        await store.putQueueItem({
          ...item,
          state: "conflict",
          attempts: item.attempts + 1,
          updatedAt: now,
          lastError: resolution.reason,
        });
        conflicts += 1;
      }
      continue;
    }

    failed += 1;
    await store.putQueueItem({
      ...item,
      state: "failed",
      attempts: item.attempts + 1,
      updatedAt: now,
      lastError: result.message ?? "Remote sync rejected the record",
    });
  }

  if (synced + duplicates > 0) await store.setMeta("last_sync_at", now);
  return { attempted: records.length, synced, duplicates, conflicts, failed, resolutions };
}

export class ReferenceMemorySyncTransport implements OfflineSyncTransport {
  readonly id = "reference-memory-sync";
  private readonly remote = new Map<string, SyncComparableRecord>();

  async push(records: readonly OfflineEventRecord[]): Promise<SyncTransportResult[]> {
    const results: SyncTransportResult[] = [];
    for (const record of records) {
      const comparable = comparableFromLocal(record, await sha256Hex(record.payload));
      const existing = this.remote.get(record.id);
      if (!existing) {
        this.remote.set(record.id, comparable);
        results.push({ recordId: record.id, status: "accepted" });
      } else if (existing.payloadHash === comparable.payloadHash) {
        results.push({ recordId: record.id, status: "duplicate", remote: existing });
      } else {
        results.push({ recordId: record.id, status: "conflict", remote: existing });
      }
    }
    return results;
  }
}
