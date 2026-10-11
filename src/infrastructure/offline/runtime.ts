import type {
  OfflineEventKind,
  OfflineEventRecord,
  OfflineMissionStatus,
} from "@/domain/offline-mission";
import { createProtocolCacheEntries } from "@/domain/offline-mission";
import { PROTOCOL_LIBRARY_V1_1 } from "@/domain/action-guidance";
import type { MissionContextRef } from "@/domain/contracts";
import { enqueueOfflineRecord, flushOfflineSyncQueue, type OfflineSyncTransport } from "./sync";
import { IndexedDbOfflineMissionStore, type OfflineMissionStore } from "./store";

const DEFAULT_MISSION: MissionContextRef = {
  missionId: "mission-local-p14",
  crewMemberId: "crew-local-p14",
};

let singletonStore: OfflineMissionStore | undefined;
let runtimeLastError: string | undefined;
const initializationByStore = new WeakMap<object, Promise<void>>();

function protocolCacheRecordId(): string {
  return `protocol-cache:${PROTOCOL_LIBRARY_V1_1.map((item) => `${item.id}@${item.version}`).join("|")}`;
}

function protocolCacheDigest(payload: unknown): string | undefined {
  if (!Array.isArray(payload)) return undefined;
  const digests = payload.map((entry) => {
    if (!entry || typeof entry !== "object" || !("digestSha256" in entry)) return undefined;
    const digest = (entry as { digestSha256?: unknown }).digestSha256;
    return typeof digest === "string" && digest.length === 64 ? digest : undefined;
  });
  return digests.every((digest): digest is string => Boolean(digest)) ? digests.join(":") : undefined;
}

async function initializeStore(store: OfflineMissionStore): Promise<void> {
  await store.initialize();
  const cached = await store.getMeta("protocol_cache_digest");
  if (cached) return;

  const recordId = protocolCacheRecordId();
  const existing = await store.get(recordId);
  if (existing) {
    const recoveredDigest = protocolCacheDigest(existing.payload);
    if (!recoveredDigest) {
      throw new Error("Existing protocol cache snapshot has invalid integrity metadata");
    }
    await store.setMeta("protocol_cache_digest", recoveredDigest);
    await store.setMeta("protocol_cache_at", existing.eventTimestamp);
    return;
  }

  const cachedAt = new Date().toISOString();
  const entries = await createProtocolCacheEntries(PROTOCOL_LIBRARY_V1_1, cachedAt);
  const digest = entries.map((entry) => entry.digestSha256).join(":");
  const event: OfflineEventRecord = {
    id: recordId,
    kind: "protocol_snapshot",
    mission: DEFAULT_MISSION,
    eventTimestamp: cachedAt,
    createdAt: cachedAt,
    sourceId: "protocol-library-v1.1",
    sourceVersion: "1.1",
    sourcePriority: 100,
    classification: "medical_sensitive",
    payload: entries,
  };
  await store.append(event);
  await store.setMeta("protocol_cache_digest", digest);
  await store.setMeta("protocol_cache_at", cachedAt);
}

export function getOfflineMissionStore(): OfflineMissionStore {
  singletonStore ??= new IndexedDbOfflineMissionStore();
  return singletonStore;
}

export async function initializeOfflineMissionRuntime(
  store: OfflineMissionStore = getOfflineMissionStore(),
): Promise<void> {
  if (typeof window === "undefined") return;

  const storeKey = store as object;
  const inFlight = initializationByStore.get(storeKey);
  if (inFlight) return inFlight;

  const initialization = initializeStore(store)
    .then(() => {
      runtimeLastError = undefined;
    })
    .catch((error) => {
      initializationByStore.delete(storeKey);
      runtimeLastError = error instanceof Error ? error.message : "Offline runtime initialization failed";
      throw error;
    });

  initializationByStore.set(storeKey, initialization);
  return initialization;
}

export async function persistOfflineMissionEvent(input: {
  kind: OfflineEventKind;
  id: string;
  mission: MissionContextRef;
  eventTimestamp: string;
  sourceId: string;
  sourceVersion: string;
  sourcePriority?: number;
  classification: OfflineEventRecord["classification"];
  payload: unknown;
  store?: OfflineMissionStore;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const store = input.store ?? getOfflineMissionStore();
  const now = new Date().toISOString();
  const record: OfflineEventRecord = {
    id: input.id,
    kind: input.kind,
    mission: input.mission,
    eventTimestamp: input.eventTimestamp,
    createdAt: now,
    sourceId: input.sourceId,
    sourceVersion: input.sourceVersion,
    sourcePriority: input.sourcePriority ?? 50,
    classification: input.classification,
    payload: input.payload,
  };
  try {
    await store.append(record);
    await enqueueOfflineRecord(store, record, now);
    runtimeLastError = undefined;
  } catch (error) {
    runtimeLastError = error instanceof Error ? error.message : "Offline persistence failed";
    throw error;
  }
}

export async function synchronizeOfflineMissionQueue(
  transport: OfflineSyncTransport,
  store: OfflineMissionStore = getOfflineMissionStore(),
) {
  const now = new Date().toISOString();
  const result = await flushOfflineSyncQueue(store, transport, now);
  runtimeLastError = result.failed > 0 ? "One or more records failed to synchronize" : undefined;
  return result;
}

export async function getOfflineMissionStatus(
  store: OfflineMissionStore = getOfflineMissionStore(),
): Promise<OfflineMissionStatus> {
  if (typeof window === "undefined") {
    return {
      supported: false,
      encryptedStoreReady: false,
      protocolCacheReady: false,
      serviceWorkerState: "unsupported",
      connectivity: "unknown",
      pendingSyncItems: 0,
      conflictItems: 0,
      storedRecords: 0,
    };
  }

  try {
    await store.initialize();
    const queue = await store.listQueueItems();
    const lastSyncAt = await store.getMeta("last_sync_at");
    const protocolCache = await store.getMeta("protocol_cache_digest");
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    const serviceWorkerState: OfflineMissionStatus["serviceWorkerState"] = !("serviceWorker" in navigator)
      ? "unsupported"
      : registration?.active
        ? "ready"
        : registration
          ? "installing"
          : "not_registered";
    return {
      supported: true,
      encryptedStoreReady: true,
      protocolCacheReady: Boolean(protocolCache),
      serviceWorkerState,
      connectivity: navigator.onLine ? "online" : "offline",
      pendingSyncItems: queue.filter((item) => item.state === "pending" || item.state === "failed" || item.state === "needs_review").length,
      conflictItems: queue.filter((item) => item.state === "conflict").length,
      storedRecords: await store.countRecords(),
      ...(lastSyncAt ? { lastSyncAt } : {}),
      ...(runtimeLastError ? { lastError: runtimeLastError } : {}),
    };
  } catch (error) {
    return {
      supported: true,
      encryptedStoreReady: false,
      protocolCacheReady: false,
      serviceWorkerState: "error",
      connectivity: navigator.onLine ? "online" : "offline",
      pendingSyncItems: 0,
      conflictItems: 0,
      storedRecords: 0,
      lastError: error instanceof Error ? error.message : "Offline runtime status unavailable",
    };
  }
}
