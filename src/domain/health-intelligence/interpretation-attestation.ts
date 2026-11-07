/**
 * P41 — server attestation of Researcher interpretation decisions.
 *
 * A device-local APPROVE (or REVOKE) event becomes authoritative only when the
 * server has independently re-checked it and signed a statement binding the
 * exact event hash, record key, content fingerprint and the signed-in caller.
 * The server signs only after verifying an active Researcher membership from
 * the database as the caller, so a disabled button or edited device ledger can
 * never produce an applied approval. Devices and the owner-run registry merge
 * trust only the public keys in data/scientific/interpretation-attestation-keys.v1.json.
 *
 * Browser-safe (WebCrypto). The private key is derived on the server from the
 * existing secret-store seed with a domain-separation label, so it can never
 * sign catalog snapshots and catalog keys can never sign attestations.
 */
import keyFile from "../../../data/scientific/interpretation-attestation-keys.v1.json";
import {
  deriveSigningKeyFromSecret,
  signCanonicalPayload,
  verifyCanonicalPayload,
} from "./catalog-snapshot-signing";

export const INTERPRETATION_ATTESTATION_SCHEMA = "mitochondria.interpretation-attestation.v1" as const;
export const INTERPRETATION_ATTESTATION_KEY_LABEL = "mitochondria.p41.interpretation-attestation.v1|";
export const INTERPRETATION_ATTESTATION_KEY_ID = "p41-interpretation-attestation-2026-11-07";
export const ATTESTATION_BASIS = "server_verified_active_researcher_membership" as const;

export interface AttestationTrustedKey {
  keyId: string;
  publicKeySpkiBase64: string;
  environment: "interpretation_attestation";
}
export const BUNDLED_ATTESTATION_KEYS: readonly AttestationTrustedKey[] = (keyFile as { keys: AttestationTrustedKey[] }).keys;

export interface AttestationStatement {
  schema: typeof INTERPRETATION_ATTESTATION_SCHEMA;
  keyId: string;
  /** Hash of the attested APPROVE / REVOKE event. */
  eventHash: string;
  key: string;
  action: "APPROVE" | "REVOKE";
  contentSha256: string | null;
  /** Signed-in caller verified by the server; must equal the event actor. */
  actorUserId: string;
  attestedAt: string;
  basis: typeof ATTESTATION_BASIS;
}
export interface SignedAttestation {
  statement: AttestationStatement;
  signature: string;
}

export async function deriveInterpretationAttestationKey(secret: string) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("signing secret too short");
  return deriveSigningKeyFromSecret(INTERPRETATION_ATTESTATION_KEY_LABEL + secret);
}

export async function signAttestation(statement: AttestationStatement, privateKey: CryptoKey): Promise<SignedAttestation> {
  return { statement, signature: await signCanonicalPayload(statement, privateKey) };
}

/** True only for a well-formed statement signed by a trusted attestation key. Never throws. */
export async function verifyAttestation(
  signed: unknown,
  trustedKeys: readonly AttestationTrustedKey[] = BUNDLED_ATTESTATION_KEYS,
): Promise<boolean> {
  const s = signed as Partial<SignedAttestation> | null;
  const st = s?.statement;
  if (!s || typeof s.signature !== "string" || !st || st.schema !== INTERPRETATION_ATTESTATION_SCHEMA || st.basis !== ATTESTATION_BASIS) return false;
  const key = trustedKeys.find((k) => k.keyId === st.keyId && k.environment === "interpretation_attestation");
  if (!key) return false;
  return verifyCanonicalPayload(st, s.signature, key.publicKeySpkiBase64);
}
