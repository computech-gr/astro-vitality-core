/**
 * Encrypted, append-only, local-only review ledger.
 *
 * Holds Ground Medical evidence attestations and Unknown Biomarker review
 * requests/decisions. It is a SEPARATE IndexedDB database from the mission
 * record store so that review events can never displace observations from the
 * mission store's bounded reads, and it is never queued for cloud sync.
 * Entries are encrypted with a non-extractable device AES-GCM key using the
 * same envelope as the mission store. Nothing is updated or deleted.
 * v9: cloud review sync is an explicit user action (review-sync.ts); this
 * store itself never uploads anything.
 */
import type { OfflineEventRecord } from "@/domain/offline-mission";
import { decryptOfflineRecord, encryptOfflineRecord, generateDeviceLocalKey } from "./crypto";

export type ReviewLedgerKind =
  | "evidence-attestation"
  | "unknown-biomarker-request"
  | "unknown-biomarker-decision"
  /** Explicit metadata-only P36 handoff receipts; original evidence stays untouched. */
  | "p36-handoff-receipt"
  /** v9: local receipt that an event was accepted by (or conflicted with) the cloud review ledger. */
  | "review-sync-receipt"
  /** v9: correction audit intents received from the cloud (metadata only, no values). */
  | "remote-correction-intent"
  /** v9.4: local receipt that an observation event was confirmed by (or conflicted with) the encrypted cloud store. */
  | "observation-sync-receipt"
  /** v9.4: append-only log of explicit "Sync observations & reviews" runs (counts and outcomes only). */
  | "sync-run"
  /** P36: documentary, hash-chained scientific review worksheet entries (catalog-level, never synced). */
  | "catalog-scientific-review"
  /** P40: hash-chained biomarker interpretation review events (catalog-level, never synced). */
  | "biomarker-interpretation"
  /** P41: append-only literature evidence bundles and backlog attempts (catalog concepts only, never synced). */
  | "interpretation-evidence"
  /** P57: hash-chained reference-criteria decisions and server attestations (catalog level, never synced). */
  | "reference-criteria-review";

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
  private ready: Promise<{ db: IDBDatabase; key: CryptoKey }> | undefined;

  /** Single in-flight initialization: concurrent first reads must not race to create two keys. */
  private init() {
    this.ready ??= this.open().catch((error) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  private async open(): Promise<{ db: IDBDatabase; key: CryptoKey }> {
    if (typeof indexedDB === "undefined") throw new Error("Encrypted local storage is unavailable in this browser.");
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS, { keyPath: "id" });
    };
    const db = await req(request);
    const readKey = async () => {
      const tx = db.transaction(KEYS, "readonly");
      const row = await req(tx.objectStore(KEYS).get(KEY_ID) as IDBRequest<{ id: string; key: CryptoKey } | undefined>);
      await done(tx);
      return row?.key;
    };
    let key = await readKey();
    if (!key) {
      const generated = await generateDeviceLocalKey();
      try {
        const tx = db.transaction(KEYS, "readwrite");
        tx.objectStore(KEYS).add({ id: KEY_ID, key: generated });
        await done(tx);
        key = generated;
      } catch {
        // Another tab created the key first: use the stored one, never overwrite it.
        key = await readKey();
      }
    }
    if (!key) throw new Error("The local review-ledger encryption key is unavailable.");
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
