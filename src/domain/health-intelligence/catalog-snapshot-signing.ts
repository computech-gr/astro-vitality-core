/**
 * Integrity-verified offline catalog snapshots (Ed25519 over canonical JSON).
 * Browser-safe; uses WebCrypto only. Private keys are never bundled: the server
 * signs with an owner-provisioned secret and devices trust only public keys
 * listed in data/scientific/catalog-signing-keys.v1.json (or injected in tests).
 */
import trustedKeyFile from "../../../data/scientific/catalog-signing-keys.v1.json";
import { canonicalJson } from "./observation-envelope";
import {
  ACTIVE_CATALOG_SNAPSHOT_SCHEMA, BASE_CATALOG_VERSION,
  type ActiveCatalogSnapshot, type CatalogEnvironment,
} from "./catalog-lifecycle";

export const SIGNED_SNAPSHOT_SCHEMA = "mitochondria.signed-catalog-snapshot.v1" as const;
export interface SignedCatalogSnapshot {
  schema: typeof SIGNED_SNAPSHOT_SCHEMA;
  keyId: string;
  signature: string; // base64 Ed25519 over canonicalJson(snapshot)
  snapshot: ActiveCatalogSnapshot;
}
export interface TrustedKey { keyId: string; publicKeySpkiBase64: string; environment: CatalogEnvironment }
export const BUNDLED_TRUSTED_KEYS: readonly TrustedKey[] = (trustedKeyFile as { keys: TrustedKey[] }).keys;

const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ""; for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ALG = { name: "Ed25519" } as const;

export async function generateTestSigningKey(keyId: string): Promise<{ privateKey: CryptoKey; trusted: TrustedKey }> {
  const pair = (await crypto.subtle.generateKey(ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  return { privateKey: pair.privateKey, trusted: { keyId, environment: "test", publicKeySpkiBase64: b64(await crypto.subtle.exportKey("spki", pair.publicKey)) } };
}
export async function importPrivateSigningKey(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", unb64(pkcs8Base64), ALG, false, ["sign"]);
}

export async function signCatalogSnapshot(snapshot: ActiveCatalogSnapshot, keyId: string, privateKey: CryptoKey): Promise<SignedCatalogSnapshot> {
  const sig = await crypto.subtle.sign(ALG, privateKey, new TextEncoder().encode(canonicalJson(snapshot)));
  return { schema: SIGNED_SNAPSHOT_SCHEMA, keyId, signature: b64(sig), snapshot };
}

export type VerifyResult = { ok: true; snapshot: ActiveCatalogSnapshot } | { ok: false; reason: string };

export async function verifySignedCatalogSnapshot(
  signed: unknown, trustedKeys: readonly TrustedKey[] = BUNDLED_TRUSTED_KEYS, allowEnvironments: readonly CatalogEnvironment[] = ["production"],
): Promise<VerifyResult> {
  const s = signed as SignedCatalogSnapshot | null;
  if (!s || s.schema !== SIGNED_SNAPSHOT_SCHEMA || typeof s.signature !== "string" || !s.snapshot) return { ok: false, reason: "Not a signed catalog snapshot." };
  const snap = s.snapshot;
  if (snap.schema !== ACTIVE_CATALOG_SNAPSHOT_SCHEMA || snap.baseCatalogVersion !== BASE_CATALOG_VERSION || !Number.isInteger(snap.catalogVersion) || snap.catalogVersion < 0 || !Array.isArray(snap.entries))
    return { ok: false, reason: "Snapshot schema or base catalog version is not supported." };
  const key = trustedKeys.find((k) => k.keyId === s.keyId);
  if (!key) return { ok: false, reason: "Snapshot is signed by an untrusted key." };
  if (key.environment !== snap.environment || !allowEnvironments.includes(snap.environment)) return { ok: false, reason: `A ${snap.environment} snapshot is not accepted here.` };
  try {
    const pub = await crypto.subtle.importKey("spki", unb64(key.publicKeySpkiBase64), ALG, false, ["verify"]);
    const valid = await crypto.subtle.verify(ALG, pub, unb64(s.signature), new TextEncoder().encode(canonicalJson(snap)));
    return valid ? { ok: true, snapshot: snap } : { ok: false, reason: "Snapshot failed integrity verification." };
  } catch {
    return { ok: false, reason: "Snapshot failed integrity verification." };
  }
}

export type AcceptDecision =
  | { action: "install"; snapshot: SignedCatalogSnapshot }
  | { action: "keep"; reason: string };

/** Only a verified, strictly newer snapshot replaces the installed one; older or tampered offers keep the last verified catalog. */
export async function decideSnapshotInstall(
  installed: SignedCatalogSnapshot | null, offered: unknown, trustedKeys: readonly TrustedKey[] = BUNDLED_TRUSTED_KEYS, allowEnvironments: readonly CatalogEnvironment[] = ["production"],
): Promise<AcceptDecision> {
  const v = await verifySignedCatalogSnapshot(offered, trustedKeys, allowEnvironments);
  if (!v.ok) return { action: "keep", reason: v.reason };
  if (installed && v.snapshot.catalogVersion < installed.snapshot.catalogVersion)
    return { action: "keep", reason: `Offered catalog version ${v.snapshot.catalogVersion} is older than installed version ${installed.snapshot.catalogVersion}.` };
  if (installed && v.snapshot.catalogVersion === installed.snapshot.catalogVersion)
    return canonicalJson(v.snapshot.entries) === canonicalJson(installed.snapshot.entries)
      ? { action: "keep", reason: "Catalog is already up to date." }
      : { action: "keep", reason: "Same catalog version with different content; refused." };
  return { action: "install", snapshot: offered as SignedCatalogSnapshot };
}
