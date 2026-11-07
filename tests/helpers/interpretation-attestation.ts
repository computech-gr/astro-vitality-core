/**
 * Test-only server attestation stand-in (P41). Uses a throwaway secret that is
 * never deployed; the derived public key is trusted only by the tests that pass
 * it explicitly, so production devices never accept these signatures.
 */
import {
  ATTESTATION_BASIS,
  INTERPRETATION_ATTESTATION_SCHEMA,
  deriveInterpretationAttestationKey,
  signAttestation,
  type AttestationTrustedKey,
} from "../../src/domain/health-intelligence/interpretation-attestation";
import {
  planAttestation,
  sealInterpretationEvent,
  type InterpretationEvent,
} from "../../src/domain/health-intelligence/biomarker-interpretation";

const TEST_SECRET = "test-only-interpretation-attestation-secret-not-deployed-0123456789";
export const TEST_KEY_ID = "test-interpretation-attestation";

const derived = await deriveInterpretationAttestationKey(TEST_SECRET);
export const TEST_ATTESTATION_KEYS: readonly AttestationTrustedKey[] = [
  { keyId: TEST_KEY_ID, publicKeySpkiBase64: derived.publicKeySpkiBase64, environment: "interpretation_attestation" },
];

/** Sign an attestation for one decision event, as the server would after its checks. */
export async function testAttestation(event: InterpretationEvent, attestedAt = "2026-11-08T10:00:01.000Z") {
  if (event.action !== "APPROVE" && event.action !== "REVOKE") throw new Error("only decisions are attested");
  return signAttestation(
    {
      schema: INTERPRETATION_ATTESTATION_SCHEMA,
      keyId: TEST_KEY_ID,
      eventHash: event.hash,
      key: event.key,
      action: event.action,
      contentSha256: event.contentSha256,
      actorUserId: event.actorUserId,
      attestedAt,
      basis: ATTESTATION_BASIS,
    },
    derived.privateKey,
  );
}

/** Append a verified ATTEST event for `event` to the chain. */
export async function withAttestation(events: readonly InterpretationEvent[], event: InterpretationEvent): Promise<InterpretationEvent[]> {
  const plan = await planAttestation(events, await testAttestation(event), { userId: event.actorUserId, name: event.actorName, now: "2026-11-08T10:00:02.000Z" }, TEST_ATTESTATION_KEYS);
  if (!plan.ok) throw new Error(plan.reason);
  return [...events, await sealInterpretationEvent(plan.body)];
}
