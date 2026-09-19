import type {
  EncryptedOfflineRecord,
  OfflineEventRecord,
  OfflineSyncQueueItem,
} from "@/domain/offline-mission";
import { decryptOfflineRecord, encryptOfflineRecord, generateDeviceLocalKey } from "./crypto";

const DB_NAME = "mitochondria-offline-v1";
const DB_VERSION = 1;
const RECORDS_STORE = "records";
const QUEUE_STORE = "sync_queue";
const KEYS_STORE = "keys";
const META_STORE = "meta";
const DEVICE_KEY_ID = "device-local-aes-gcm-v1";

export interface OfflineMissionStore {
  initialize(): Promise<void>;
  append(record: OfflineEventRecord): Promise<{ inserted: boolean; encrypted: EncryptedOfflineRecord }>;
  get(recordId: string): Promise<OfflineEventRecord | undefined>;
  list(limit?: number): Promise<OfflineEventRecord[]>;
  countRecords(): Promise<number>;
  putQueueItem(item: OfflineSyncQueueItem): Promise<void>;
  getQueueItem(itemId: string): Promise<OfflineSyncQueueItem | undefined>;
  listQueueItems(): Promise<OfflineSyncQueueItem[]>;
  setMeta(key: string, value: string): Promise<void>;
  getMeta(key: string): Promise<string | undefined>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class IndexedDbOfflineMissionStore implements OfflineMissionStore {
  private database?: IDBDatabase;
  private key?: CryptoKey;

  async initialize(): Promise<void> {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable in this runtime");
    if (this.database && this.key) return;

    const openRequest = indexedDB.open(DB_NAME, DB_VERSION);
    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;
      if (!database.objectStoreNames.contains(RECORDS_STORE)) {
        database.createObjectStore(RECORDS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        database.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(KEYS_STORE)) {
        database.createObjectStore(KEYS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    this.database = await requestResult(openRequest);
    this.key = await this.getOrCreateKey();
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) throw new Error("Offline store has not been initialized");
    return this.database;
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new Error("Offline encryption key is unavailable");
    return this.key;
  }

  private async getOrCreateKey(): Promise<CryptoKey> {
    const database = this.requireDatabase();
    const readTx = database.transaction(KEYS_STORE, "readonly");
    const existing = await requestResult(
      readTx.objectStore(KEYS_STORE).get(DEVICE_KEY_ID) as IDBRequest<{ id: string; key: CryptoKey } | undefined>,
    );
    await transactionDone(readTx);
    if (existing?.key) return existing.key;

    const key = await generateDeviceLocalKey();
    const writeTx = database.transaction(KEYS_STORE, "readwrite");
    writeTx.objectStore(KEYS_STORE).put({ id: DEVICE_KEY_ID, key });
    await transactionDone(writeTx);
    return key;
  }

  async append(record: OfflineEventRecord): Promise<{ inserted: boolean; encrypted: EncryptedOfflineRecord }> {
    await this.initialize();
    const database = this.requireDatabase();
    const key = this.requireKey();
    const encrypted = await encryptOfflineRecord(record, key);
    const tx = database.transaction(RECORDS_STORE, "readwrite");
    const store = tx.objectStore(RECORDS_STORE);
    const existing = await requestResult(store.get(record.id) as IDBRequest<EncryptedOfflineRecord | undefined>);
    if (existing) {
      await transactionDone(tx);
      if (existing.payloadHash !== encrypted.payloadHash) {
        throw new Error(`Append-only record ${record.id} already exists with different content`);
      }
      return { inserted: false, encrypted: existing };
    }
    store.add(encrypted);
    await transactionDone(tx);
    return { inserted: true, encrypted };
  }

  async get(recordId: string): Promise<OfflineEventRecord | undefined> {
    await this.initialize();
    const tx = this.requireDatabase().transaction(RECORDS_STORE, "readonly");
    const encrypted = await requestResult(
      tx.objectStore(RECORDS_STORE).get(recordId) as IDBRequest<EncryptedOfflineRecord | undefined>,
    );
    await transactionDone(tx);
    return encrypted ? decryptOfflineRecord(encrypted, this.requireKey()) : undefined;
  }

  async list(limit = 200): Promise<OfflineEventRecord[]> {
    await this.initialize();
    const tx = this.requireDatabase().transaction(RECORDS_STORE, "readonly");
    const encrypted = await requestResult(
      tx.objectStore(RECORDS_STORE).getAll() as IDBRequest<EncryptedOfflineRecord[]>,
    );
    await transactionDone(tx);
    const selected = encrypted
      .sort((left, right) => Date.parse(right.eventTimestamp) - Date.parse(left.eventTimestamp))
      .slice(0, limit);
    return Promise.all(selected.map((record) => decryptOfflineRecord(record, this.requireKey())));
  }

  async countRecords(): Promise<number> {
    await this.initialize();
    const tx = this.requireDatabase().transaction(RECORDS_STORE, "readonly");
    const count = await requestResult(tx.objectStore(RECORDS_STORE).count());
    await transactionDone(tx);
    return count;
  }

  async putQueueItem(item: OfflineSyncQueueItem): Promise<void> {
    await this.initialize();
    const tx = this.requireDatabase().transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(item);
    await transactionDone(tx);
  }

  async getQueueItem(itemId: string): Promise<OfflineSyncQueueItem | undefined> {
    await this.initialize();
    const tx = this.requireDatabase().transaction(QUEUE_STORE, "readonly");
    const item = await requestResult(
      tx.objectStore(QUEUE_STORE).get(itemId) as IDBRequest<OfflineSyncQueueItem | undefined>,
    );
    await transactionDone(tx);
    return item;
  }

  async listQueueItems(): Promise<OfflineSyncQueueItem[]> {
    await this.initialize();
    const tx = this.requireDatabase().transaction(QUEUE_STORE, "readonly");
    const items = await requestResult(
      tx.objectStore(QUEUE_STORE).getAll() as IDBRequest<OfflineSyncQueueItem[]>,
    );
    await transactionDone(tx);
    return items.sort((left, right) => Date.parse(left.enqueuedAt) - Date.parse(right.enqueuedAt));
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.initialize();
    const tx = this.requireDatabase().transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({ key, value });
    await transactionDone(tx);
  }

  async getMeta(key: string): Promise<string | undefined> {
    await this.initialize();
    const tx = this.requireDatabase().transaction(META_STORE, "readonly");
    const item = await requestResult(
      tx.objectStore(META_STORE).get(key) as IDBRequest<{ key: string; value: string } | undefined>,
    );
    await transactionDone(tx);
    return item?.value;
  }
}

export class InMemoryOfflineMissionStore implements OfflineMissionStore {
  private readonly records = new Map<string, EncryptedOfflineRecord>();
  private readonly queue = new Map<string, OfflineSyncQueueItem>();
  private readonly meta = new Map<string, string>();
  private key?: CryptoKey;

  async initialize(): Promise<void> {
    this.key ??= await generateDeviceLocalKey();
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new Error("Offline encryption key is unavailable");
    return this.key;
  }

  async append(record: OfflineEventRecord): Promise<{ inserted: boolean; encrypted: EncryptedOfflineRecord }> {
    await this.initialize();
    const encrypted = await encryptOfflineRecord(record, this.requireKey());
    const existing = this.records.get(record.id);
    if (existing) {
      if (existing.payloadHash !== encrypted.payloadHash) {
        throw new Error(`Append-only record ${record.id} already exists with different content`);
      }
      return { inserted: false, encrypted: existing };
    }
    this.records.set(record.id, encrypted);
    return { inserted: true, encrypted };
  }

  async get(recordId: string): Promise<OfflineEventRecord | undefined> {
    await this.initialize();
    const record = this.records.get(recordId);
    return record ? decryptOfflineRecord(record, this.requireKey()) : undefined;
  }

  async list(limit = 200): Promise<OfflineEventRecord[]> {
    await this.initialize();
    const encrypted = [...this.records.values()]
      .sort((left, right) => Date.parse(right.eventTimestamp) - Date.parse(left.eventTimestamp))
      .slice(0, limit);
    return Promise.all(encrypted.map((record) => decryptOfflineRecord(record, this.requireKey())));
  }

  async countRecords(): Promise<number> {
    return this.records.size;
  }

  async putQueueItem(item: OfflineSyncQueueItem): Promise<void> {
    this.queue.set(item.id, item);
  }

  async getQueueItem(itemId: string): Promise<OfflineSyncQueueItem | undefined> {
    return this.queue.get(itemId);
  }

  async listQueueItems(): Promise<OfflineSyncQueueItem[]> {
    return [...this.queue.values()].sort(
      (left, right) => Date.parse(left.enqueuedAt) - Date.parse(right.enqueuedAt),
    );
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  async getMeta(key: string): Promise<string | undefined> {
    return this.meta.get(key);
  }

  encryptedSnapshot(): EncryptedOfflineRecord[] {
    return [...this.records.values()];
  }
}
