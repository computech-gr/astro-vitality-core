/**
 * P57 — server attestation of Researcher reference-criteria decisions.
 *
 * Same trust model as P41 interpretation attestation: a device-recorded
 * APPROVE becomes effective only after the server re-checks the event and the
 * caller's active Researcher membership for every named mission, then signs a
 * statement binding the event hash, criterion ID, criterion fingerprint,
 * missions with attested conditions and the caller. The Ed25519 key is
 * derived from the existing server secret with its own domain-separation
 * label, so it can never sign catalog snapshots or P41 interpretation
 * attestations (and vice versa). Devices trust only the public keys in
 * data/scientific/p57-criteria-attestation-keys.v1.json.
 */
import keyFile from "../../../data/scientific/p57-criteria-attestation-keys.v1.json";
import { deriveSigningKeyFromSecret, signCanonicalPayload, verifyCanonicalPayload } from "./catalog-snapshot-signing";

export const CRITERIA_ATTESTATION_SCHEMA = "mitochondria.p57-criteria-attestation.v1" as const;
export const CRITERIA_ATTESTATION_KEY_LABEL = "mitochondria.p57.criteria-attestation.v1|";
export const CRITERIA_ATTESTATION_KEY_ID = "p57-criteria-attestation-2026-11-08";
export const CRITERIA_ATTESTATION_BASIS = "server_verified_active_researcher_membership" as const;

export interface CriteriaTrustedKey {
  keyId: string;
  publicKeySpkiBase64: string;
  environment: "criteria_attestation";
}
export const BUNDLED_CRITERIA_KEYS: readonly CriteriaTrustedKey[] = (keyFile as { keys: CriteriaTrustedKey[] }).keys;

export interface CriteriaAttestationStatement {
  schema: typeof CRITERIA_ATTESTATION_SCHEMA;
  keyId: string;
  eventHash: string;
  criterionId: string;
  criterionSha256: string;
  action: "APPROVE" | "REJECT" | "REVOKE";
  missions: { missionId: string; conditions: string[] }[];
  actorUserId: string;
  attestedAt: string;
  basis: typeof CRITERIA_ATTESTATION_BASIS;
}
export interface SignedCriteriaAttestation {
  statement: CriteriaAttestationStatement;
  signature: string;
}

export async function deriveCriteriaAttestationKey(secret: string) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("signing secret too short");
  return deriveSigningKeyFromSecret(CRITERIA_ATTESTATION_KEY_LABEL + secret);
}

export async function signCriteriaAttestation(statement: CriteriaAttestationStatement, privateKey: CryptoKey): Promise<SignedCriteriaAttestation> {
  return { statement, signature: await signCanonicalPayload(statement, privateKey) };
}

/** True only for a well-formed statement signed by a trusted P57 key. Never throws. */
export async function verifyCriteriaAttestation(signed: unknown, trustedKeys: readonly CriteriaTrustedKey[] = BUNDLED_CRITERIA_KEYS): Promise<boolean> {
  const s = signed as Partial<SignedCriteriaAttestation> | null;
  const st = s?.statement;
  if (!s || typeof s.signature !== "string" || !st || st.schema !== CRITERIA_ATTESTATION_SCHEMA || st.basis !== CRITERIA_ATTESTATION_BASIS) return false;
  if (!Array.isArray(st.missions) || typeof st.eventHash !== "string" || typeof st.criterionSha256 !== "string") return false;
  const key = trustedKeys.find((k) => k.keyId === st.keyId && k.environment === "criteria_attestation");
  if (!key) return false;
  return verifyCanonicalPayload(st, s.signature, key.publicKeySpkiBase64);
}
