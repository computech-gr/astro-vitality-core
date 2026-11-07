/**
 * v9.4 server-only observation sync core: application-level authenticated
 * encryption, authorization pre-check and RPC orchestration.
 *
 * Key handling (documented in docs/V9_4_OBSERVATION_SYNC_OPERATOR.md):
 *  - Master secrets MITO_OBSERVATION_SYNC_KEY_V<n> (padded base64 of 32 bytes, or a 64-512
 *    character platform-generated random alphanumeric secret; see readMasterKeys)
 *    live only in the server runtime. They are never sent to the browser,
 *    never stored in the database and never logged.
 *  - Per-scope keys are derived with HKDF-SHA256 (fixed salt, info bound to
 *    key version + mission + crew + provenance): one AES-256-GCM key and one
 *    HMAC-SHA256 fingerprint key. A ciphertext copied to another scope, event
 *    or fingerprint fails authentication (AAD binding).
 *  - New writes use the highest configured key version; reads use the row's
 *    stored version, so rotation never re-encrypts or rewrites stored rows.
 *  - The fingerprint is a keyed HMAC (not a plain hash) so database readers
 *    cannot dictionary-test small value spaces.
 * Limitation: this is server-side envelope encryption, not end-to-end; the
 * server runtime that holds the master key can decrypt for authorized callers.
 */
import { canonicalJson, type UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import {
  checkObservationSyncEvent,
  classifyObservationSyncError,
  OBSERVATION_SYNC_BATCH_MAX,
  OBSERVATION_SYNC_PAGE_MAX,
  type ObservationSyncErrorCode,
  type ObservationSyncEvent,
  type SyncScope,
} from "@/domain/health-intelligence/observation-sync";
import {
  demoSnapshotFromRpc,
  evaluateSyntheticDemoSnapshot,
  type DemoSnapshotRpc,
  type EvaluatedDemoCatalog,
} from "@/domain/health-intelligence/synthetic-demo-catalog";

export const CIPHER_ALG = "A256GCM-HKDF-SHA256-v1";
const SALT = new TextEncoder().encode("mitochondria.observation-sync.v1");
const enc = new TextEncoder();

export interface ScopeKeys {
  version: number;
  aes: CryptoKey;
  mac: CryptoKey;
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Accepted master-secret formats (both are HKDF input keying material):
 *  - padded base64 decoding to exactly 32 random bytes (44 characters ending in "="), or
 *  - a platform-generated random alphanumeric secret of 64-512 characters (>= ~381 bits of
 *    entropy), whose UTF-8 bytes are condensed by HKDF-SHA256 into the 256-bit scope keys.
 * Anything else (short, low-alphabet, unpadded or wrong-length values) is ignored.
 */
const BASE64_32 = /^[A-Za-z0-9+/]{43}=$/;
const RANDOM_ALNUM = /^[A-Za-z0-9]{64,512}$/;
const MIN_DISTINCT_CHARS = 20;

/** Parses configured master keys; malformed values are ignored (fail closed), never partially used. */
export function readMasterKeys(env: (name: string) => string | undefined): Map<number, Uint8Array<ArrayBuffer>> {
  const keys = new Map<number, Uint8Array<ArrayBuffer>>();
  for (let v = 1; v <= 32; v++) {
    const raw = env(`MITO_OBSERVATION_SYNC_KEY_V${v}`)?.trim();
    if (!raw) continue;
    try {
      if (BASE64_32.test(raw)) {
        const bytes = unb64(raw);
        if (bytes.length === 32) keys.set(v, bytes);
      } else if (RANDOM_ALNUM.test(raw) && new Set(raw).size >= MIN_DISTINCT_CHARS) {
        keys.set(v, Uint8Array.from(enc.encode(raw)));
      }
    } catch {
      // Malformed key material is never used.
    }
  }
  return keys;
}

export async function deriveScopeKeys(master: Uint8Array<ArrayBuffer>, version: number, scope: SyncScope): Promise<ScopeKeys> {
  const base = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveKey"]);
  const info = (purpose: string) => enc.encode(JSON.stringify(["mitochondria/observation-sync", purpose, version, scope.missionId, scope.crewMemberId, scope.provenance]));
  const aes = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: SALT, info: info("aes-gcm") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const mac = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: SALT, info: info("hmac") }, base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);
  return { version, aes, mac };
}

const canonicalEvent = (e: ObservationSyncEvent) => canonicalJson({ eventId: e.eventId, eventKind: e.eventKind, observation: e.observation });
const aad = (keys: ScopeKeys, scope: SyncScope, eventId: string, fingerprint: string) =>
  enc.encode(JSON.stringify([CIPHER_ALG, keys.version, scope.missionId, scope.crewMemberId, scope.provenance, eventId, fingerprint]));

export async function fingerprintEvent(keys: ScopeKeys, e: ObservationSyncEvent): Promise<string> {
  return `ofp-${hex(await crypto.subtle.sign("HMAC", keys.mac, enc.encode(canonicalEvent(e))))}`;
}

export interface SealedEvent {
  eventId: string;
  observationId: string;
  eventKind: "entry" | "status";
  cipherAlg: string;
  keyVersion: number;
  iv: string;
  ciphertext: string;
  fingerprint: string;
}

export async function sealEvent(keys: ScopeKeys, scope: SyncScope, e: ObservationSyncEvent): Promise<SealedEvent> {
  const fingerprint = await fingerprintEvent(keys, e);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(keys, scope, e.eventId, fingerprint) }, keys.aes, enc.encode(canonicalEvent(e)));
  return { eventId: e.eventId, observationId: e.observation.id, eventKind: e.eventKind, cipherAlg: CIPHER_ALG, keyVersion: keys.version, iv: b64(iv), ciphertext: b64(new Uint8Array(ct)), fingerprint };
}

/** Authenticated decryption + fingerprint re-verification. Any mismatch throws (tamper / wrong scope). */
export async function openEvent(keys: ScopeKeys, scope: SyncScope, row: { event_id: string; iv: string; ciphertext: string; fingerprint: string; event_kind: string; observation_id: string }): Promise<ObservationSyncEvent> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(row.iv), additionalData: aad(keys, scope, row.event_id, row.fingerprint) },
    keys.aes,
    unb64(row.ciphertext),
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as ObservationSyncEvent;
  if (parsed.eventId !== row.event_id || parsed.eventKind !== row.event_kind || parsed.observation?.id !== row.observation_id) throw new Error("envelope mismatch");
  if ((await fingerprintEvent(keys, parsed)) !== row.fingerprint) throw new Error("fingerprint mismatch");
  return parsed;
}

// ---------------- Orchestration (dependency-injected for tests) ----------------

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;

export interface SyncDeps {
  env: (name: string) => string | undefined;
  rpc: Rpc;
  /** Caller's own active memberships for the mission (read as the caller; RLS applies). */
  memberships: (missionId: string) => Promise<{ role: string; crew_member_id: string | null; active: boolean }[] | null>;
}

export type SyncFailure = { ok: false; code: ObservationSyncErrorCode; message: string };

/**
 * Server-side SYNTHETIC DEMO catalog for one synthetic scope, read as the caller
 * through the caller-scoped p37_demo_catalog_snapshot_v1 RPC (never the device's
 * copy). Real scopes and any read failure yield an empty catalog, so demo records
 * fail closed while every other record is validated exactly as before.
 */
export async function serverDemoCatalogs(
  deps: Pick<SyncDeps, "rpc">,
  scope: SyncScope,
): Promise<ReadonlyMap<string, EvaluatedDemoCatalog>> {
  if (scope.provenance !== "synthetic") return new Map();
  try {
    const { data, error } = await deps.rpc("p37_demo_catalog_snapshot_v1", { p_mission_id: scope.missionId });
    const o = data as DemoSnapshotRpc | null;
    if (error || !o || o.mission_id !== scope.missionId || !Array.isArray(o.entries)) return new Map();
    const snap = demoSnapshotFromRpc(o, new Date(0).toISOString());
    return new Map([[scope.missionId, evaluateSyntheticDemoSnapshot(snap)]]);
  } catch {
    return new Map();
  }
}

export const OBSERVATION_SYNC_MESSAGES: Record<ObservationSyncErrorCode, string> = {
  migration_required: "Cloud observation sync unavailable: migration required",
  forbidden: "The server refused: an active Crew Self membership for this crew member, or a scoped Ground Medical membership, is required.",
  invalid: "The server rejected the observation data as invalid. Nothing was synced.",
  unavailable: "Cloud observation sync is temporarily unavailable. Observations stay on this device; try again.",
  disabled: "Cloud observation sync is turned off on the server (encryption key or enable setting not configured). Observations stay on this device; nothing was uploaded.",
};
const fail = (code: ObservationSyncErrorCode): SyncFailure => ({ ok: false, code, message: OBSERVATION_SYNC_MESSAGES[code] });

/** Gate: enable flag + key material, and for REAL provenance a separate flag. All default-off. */
export function syncGate(env: SyncDeps["env"], provenance: SyncScope["provenance"]): { ok: true; keys: Map<number, Uint8Array<ArrayBuffer>> } | SyncFailure {
  if (env("MITO_OBSERVATION_SYNC_ENABLED") !== "true") return fail("disabled");
  if (provenance === "real" && env("MITO_OBSERVATION_SYNC_REAL_ENABLED") !== "true") return fail("disabled");
  const keys = readMasterKeys(env);
  if (!keys.size) return fail("disabled");
  return { ok: true, keys };
}

/** Server-side re-check of the exact scope (the database checks again, including crew assignment). */
export async function callerMayAccess(deps: SyncDeps, scope: SyncScope): Promise<boolean> {
  const rows = await deps.memberships(scope.missionId);
  if (!rows) return false;
  return rows.some(
    (m) =>
      m.active &&
      ((m.role === "crew_self" && m.crew_member_id === scope.crewMemberId) ||
        (m.role === "ground_medical" && (m.crew_member_id === null || m.crew_member_id === scope.crewMemberId))),
  );
}

export interface PushItem {
  id: string;
  status: "inserted" | "duplicate" | "conflict" | "rejected";
  fingerprint: string | null;
  receivedAt: string | null;
  detail: string | null;
}

export async function pushObservationEventsCore(
  input: { scope: SyncScope; events: ObservationSyncEvent[]; realDataConfirmed: boolean },
  deps: SyncDeps,
): Promise<{ ok: true; results: PushItem[] } | SyncFailure> {
  const { scope } = input;
  const gate = syncGate(deps.env, scope.provenance);
  if (!gate.ok) return gate;
  if (scope.provenance === "real" && input.realDataConfirmed !== true) return { ok: false, code: "forbidden", message: "Explicit confirmation is required before uploading REAL observation data." };
  if (input.events.length > OBSERVATION_SYNC_BATCH_MAX) return fail("invalid");
  if (!(await callerMayAccess(deps, scope))) return fail("forbidden");
  const version = Math.max(...gate.keys.keys());
  const keys = await deriveScopeKeys(gate.keys.get(version)!, version, scope);
  const demoCatalogs = await serverDemoCatalogs(deps, scope);
  const local: PushItem[] = [];
  const sealed: SealedEvent[] = [];
  const seen = new Set<string>();
  for (const e of input.events) {
    const reason = seen.has(e.eventId) ? "Duplicate event in batch." : checkObservationSyncEvent(e, scope, demoCatalogs);
    seen.add(e.eventId);
    if (reason) local.push({ id: e.eventId, status: "rejected", fingerprint: null, receivedAt: null, detail: reason });
    else sealed.push(await sealEvent(keys, scope, e));
  }
  if (!sealed.length) return { ok: true, results: local };
  const { data, error } = await deps.rpc("observation_sync_append_v1", {
    p_mission_id: scope.missionId,
    p_crew_member_id: scope.crewMemberId,
    p_provenance: scope.provenance,
    p_events: sealed,
    p_real_data_confirmed: input.realDataConfirmed === true,
  });
  if (error) {
    console.error("[v9.4 observation sync] append refused", error.code ?? "unknown");
    return fail(classifyObservationSyncError(error.code));
  }
  if (!Array.isArray(data)) return fail("unavailable");
  const sent = new Set(sealed.map((s) => s.eventId));
  const results: PushItem[] = [...local];
  for (const r of data as Record<string, unknown>[]) {
    const id = r?.["id"], status = r?.["status"];
    if (typeof id !== "string" || !sent.has(id)) continue;
    if (status !== "inserted" && status !== "duplicate" && status !== "conflict" && status !== "rejected") continue;
    results.push({
      id,
      status,
      fingerprint: typeof r["fingerprint"] === "string" ? r["fingerprint"] : null,
      receivedAt: typeof r["received_at"] === "string" ? r["received_at"] : null,
      detail: typeof r["detail"] === "string" ? r["detail"] : null,
    });
    sent.delete(id);
  }
  // Anything the server did not report is NOT confirmed (no false success).
  for (const id of sent) results.push({ id, status: "rejected", fingerprint: null, receivedAt: null, detail: "No server confirmation received." });
  return { ok: true, results };
}

export interface PulledEvent {
  eventId: string;
  eventKind: "entry" | "status";
  observation: UnifiedObservation;
  fingerprint: string;
  receivedAt: string | null;
  receivedSeq: number;
}
export interface PullProblem {
  eventId: string;
  receivedSeq: number;
  problem: "undecryptable_or_tampered" | "invalid_payload" | "key_unavailable" | "scope_mismatch";
}

export async function pullObservationEventsCore(
  input: { scope: SyncScope; afterSeq: number; limit: number },
  deps: SyncDeps,
): Promise<{ ok: true; events: PulledEvent[]; problems: PullProblem[]; lastSeq: number; hasMore: boolean } | SyncFailure> {
  const { scope } = input;
  const gate = syncGate(deps.env, scope.provenance);
  if (!gate.ok) return gate;
  if (!(await callerMayAccess(deps, scope))) return fail("forbidden");
  const limit = Math.min(Math.max(1, input.limit), OBSERVATION_SYNC_PAGE_MAX);
  const { data, error } = await deps.rpc("observation_sync_list_v1", {
    p_mission_id: scope.missionId,
    p_crew_member_id: scope.crewMemberId,
    p_provenance: scope.provenance,
    p_after_seq: input.afterSeq,
    p_limit: limit,
  });
  if (error) {
    console.error("[v9.4 observation sync] list refused", error.code ?? "unknown");
    return fail(classifyObservationSyncError(error.code));
  }
  if (!Array.isArray(data)) return fail("unavailable");
  const demoCatalogs = await serverDemoCatalogs(deps, scope);
  const keyCache = new Map<number, ScopeKeys>();
  const events: PulledEvent[] = [];
  const problems: PullProblem[] = [];
  let lastSeq = input.afterSeq;
  for (const raw of data as Record<string, unknown>[]) {
    const seq = Number(raw?.["received_seq"] ?? 0) || 0;
    lastSeq = Math.max(lastSeq, seq);
    const eventId = typeof raw?.["event_id"] === "string" ? (raw["event_id"] as string) : "";
    if (raw["mission_id"] !== scope.missionId || raw["crew_member_id"] !== scope.crewMemberId || raw["provenance"] !== scope.provenance) {
      problems.push({ eventId, receivedSeq: seq, problem: "scope_mismatch" });
      continue;
    }
    const version = Number(raw["key_version"]);
    const master = gate.keys.get(version);
    if (!master || raw["cipher_alg"] !== CIPHER_ALG) {
      problems.push({ eventId, receivedSeq: seq, problem: "key_unavailable" });
      continue;
    }
    let keys = keyCache.get(version);
    if (!keys) keyCache.set(version, (keys = await deriveScopeKeys(master, version, scope)));
    let opened: ObservationSyncEvent;
    try {
      opened = await openEvent(keys, scope, raw as never);
    } catch {
      problems.push({ eventId, receivedSeq: seq, problem: "undecryptable_or_tampered" });
      continue;
    }
    if (checkObservationSyncEvent(opened, scope, demoCatalogs)) {
      problems.push({ eventId, receivedSeq: seq, problem: "invalid_payload" });
      continue;
    }
    events.push({
      eventId: opened.eventId,
      eventKind: opened.eventKind,
      observation: opened.observation,
      fingerprint: raw["fingerprint"] as string,
      receivedAt: typeof raw["received_at"] === "string" ? (raw["received_at"] as string) : null,
      receivedSeq: seq,
    });
  }
  return { ok: true, events, problems, lastSeq, hasMore: data.length >= limit };
}
