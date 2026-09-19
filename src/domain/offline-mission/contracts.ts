import type { DataClassification, MissionContextRef } from "../contracts";

export const OFFLINE_EVENT_KINDS = [
  "observation",
  "self_check",
  "readiness_assessment",
  "health_finding",
  "action_guidance",
  "acknowledgement",
  "protocol_snapshot",
  "operational_event",
] as const;
export type OfflineEventKind = (typeof OFFLINE_EVENT_KINDS)[number];

export interface OfflineEventRecord<T = unknown> {
  id: string;
  kind: OfflineEventKind;
  mission: MissionContextRef;
  eventTimestamp: string;
  createdAt: string;
  sourceId: string;
  sourceVersion: string;
  sourcePriority: number;
  classification: DataClassification;
  payload: T;
}

export interface EncryptedOfflineRecord {
  id: string;
  kind: OfflineEventKind;
  eventTimestamp: string;
  createdAt: string;
  version: number;
  payloadHash: string;
  iv: string;
  ciphertext: string;
  cryptoAlgorithm: "AES-GCM";
  keyVersion: string;
}

export const SYNC_ITEM_STATES = [
  "pending",
  "in_flight",
  "synced",
  "failed",
  "conflict",
] as const;
export type SyncItemState = (typeof SYNC_ITEM_STATES)[number];

export interface OfflineSyncQueueItem {
  id: string;
  recordId: string;
  idempotencyKey: string;
  state: SyncItemState;
  attempts: number;
  enqueuedAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface SyncComparableRecord {
  id: string;
  sourceId: string;
  sourceVersion: string;
  sourcePriority: number;
  eventTimestamp: string;
  payloadHash: string;
}

export type SyncConflictDecision = "local" | "remote" | "duplicate" | "manual_review";

export interface SyncConflictResolution {
  decision: SyncConflictDecision;
  reason: string;
}

export interface ProtocolCacheEntry<T = unknown> {
  protocolId: string;
  version: string;
  authority: string;
  cachedAt: string;
  digestSha256: string;
  payload: T;
}

export interface OfflineMissionStatus {
  supported: boolean;
  encryptedStoreReady: boolean;
  protocolCacheReady: boolean;
  serviceWorkerState: "unsupported" | "not_registered" | "installing" | "ready" | "error";
  connectivity: "online" | "offline" | "unknown";
  pendingSyncItems: number;
  conflictItems: number;
  storedRecords: number;
  lastSyncAt?: string;
  lastError?: string;
}
