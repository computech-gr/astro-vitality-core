/**
 * Encrypted, append-only, local-only review ledger.
 *
 * Holds Ground Medical evidence attestations and Unknown Biomarker review
 * requests/decisions. It is a SEPARATE IndexedDB database from the mission
 * record store so that review events can never displace observations from the
 * mission store's bounded reads, and it is never queued for cloud sync.
 * Entries are encrypted with a non-extractable device AES-GCM key using the
 * same envelope as the mission store. Nothing is updated or deleted.
 */
import type { OfflineEventRecord } from "@/domain/offline-mission";
import { decryptOfflineRecord, encryptOfflineRecord, generateDeviceLocalKey } from "./crypto";

export type ReviewLedgerKind = "evidence-attestation" | "unknown-biomarker-request" | "unknown-biomarker-decision";

export interface ReviewLedgerEntry {
  id: string;
  ledger: ReviewLedgerKind;
  missionId: string;
  crewMemberId: string;
  provenance: "synthetic" | "real";
  actorUserId: string;
  createdAt: string;
  payload: unknown;
}

export interface ReviewLedgerStore {
  /** Append-only: an existing ID is never overwritten ("duplicate" is idempotent success). */
  append(entry: ReviewLedgerEntry): Promise<"inserted" | "duplicate">;
  list(filter: { ledger: ReviewLedgerKind; missionId: string; crewMemberId: string; provenance: "synthetic" | "real" }): Promise<ReviewLedgerEntry[]>;
}

const matches = (e: ReviewLedgerEntry, f: Parameters<ReviewLedgerStore["list"]>[0]) =>
  e.ledger === f.ledger && e.missionId === f.missionId && e.crewMemberId === f.crewMemberId && e.provenance === f.provenance;

/** Test/reference implementation with identical append-only semantics. */
export class InMemoryReviewLedgerStore implements ReviewLedgerStore {
  private readonly entries = new Map<string, string>();
  async append(entry: ReviewLedgerEntry) {
    if (this.entries.has(entry.id)) return "duplicate" as const;
    this.entries.set(entry.id, JSON.stringify(entry));
    return "inserted" as const;
  }
  async list(filter: Parameters<ReviewLedgerStore["list"]>[0]) {
    return [...this.entries.values()].map((v) => JSON.parse(v) as ReviewLedgerEntry).filter((e) => matches(e, filter));
  }
  get size() {
    return this.entries.size;
  }
}

const DB_NAME = "mitochondria-review-ledger-v1";
const EVENTS = "events";
const KEYS = "keys";
const KEY_ID = "review-ledger-aes-gcm-v1";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class IndexedDbReviewLedgerStore implements ReviewLedgerStore {
  private db?: IDBDatabase;
  private key?: CryptoKey;

  private async init() {
    if (this.db && this.key) return { db: this.db, key: this.key };
    if (typeof indexedDB === "undefined") throw new Error("Encrypted local storage is unavailable in this browser.");
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS, { keyPath: "id" });
    };
    const db = await req(open);
    const readTx = db.transaction(KEYS, "readonly");
    const existing = await req(readTx.objectStore(KEYS).get(KEY_ID) as IDBRequest<{ id: string; key: CryptoKey } | undefined>);
    await done(readTx);
    let key = existing?.key;
    if (!key) {
      key = await generateDeviceLocalKey();
      const writeTx = db.transaction(KEYS, "readwrite");
      writeTx.objectStore(KEYS).add({ id: KEY_ID, key });
      await done(writeTx);
    }
    this.db = db;
    this.key = key;
    return { db, key };
  }

  private toRecord(entry: ReviewLedgerEntry): OfflineEventRecord {
    return {
      id: entry.id,
      kind: entry.ledger === "evidence-attestation" ? "acknowledgement" : "operational_event",
      mission: { missionId: entry.missionId, crewMemberId: entry.crewMemberId },
      eventTimestamp: entry.createdAt,
      createdAt: entry.createdAt,
      sourceId: `review-ledger:${entry.ledger}`,
      sourceVersion: "1",
      sourcePriority: 50,
      classification: "medical_sensitive",
      payload: entry,
    };
  }

  async append(entry: ReviewLedgerEntry) {
    const { db, key } = await this.init();
    const encrypted = await encryptOfflineRecord(this.toRecord(entry), key);
    const tx = db.transaction(EVENTS, "readwrite");
    const store = tx.objectStore(EVENTS);
    const existing = await req(store.get(entry.id));
    if (existing) {
      await done(tx);
      return "duplicate" as const;
    }
    store.add(encrypted);
    await done(tx);
    return "inserted" as const;
  }

  async list(filter: Parameters<ReviewLedgerStore["list"]>[0]) {
    const { db, key } = await this.init();
    const tx = db.transaction(EVENTS, "readonly");
    const all = await req(tx.objectStore(EVENTS).getAll());
    await done(tx);
    const out: ReviewLedgerEntry[] = [];
    for (const encrypted of all) {
      try {
        const record = await decryptOfflineRecord(encrypted, key);
        const entry = record.payload as ReviewLedgerEntry;
        if (entry && entry.id === record.id && matches(entry, filter)) out.push(entry);
      } catch {
        // Undecryptable or tampered entries are ignored, never repaired.
      }
    }
    return out;
  }
}

let singleton: ReviewLedgerStore | undefined;
export function getReviewLedgerStore(): ReviewLedgerStore {
  singleton ??= new IndexedDbReviewLedgerStore();
  return singleton;
}
