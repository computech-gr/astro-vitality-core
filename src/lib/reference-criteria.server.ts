/**
 * P57 server core: attest Researcher reference-criteria decisions.
 *
 * Called only after the functions layer has read the caller's ACTIVE
 * Researcher memberships from the database as that caller. Re-validates each
 * event against the bundled registry (fingerprint, approvability, exact
 * acknowledgement, mission-level conditions, missions held by the caller)
 * before signing with the domain-separated P57 key. Nothing is stored.
 */
import { bundledCriteriaRegistry } from "@/domain/health-intelligence/p57-reference-criteria";
import { attestationProblem, type CriteriaEvent } from "@/domain/health-intelligence/p57-criteria-review";
import {
  CRITERIA_ATTESTATION_BASIS,
  CRITERIA_ATTESTATION_KEY_ID,
  CRITERIA_ATTESTATION_SCHEMA,
  deriveCriteriaAttestationKey,
  signCriteriaAttestation,
  type SignedCriteriaAttestation,
} from "@/domain/health-intelligence/p57-criteria-attestation";

export interface CriteriaAttestDeps {
  env: (name: string) => string | undefined;
  now: () => Date;
  userId: string;
  researcherMissions: readonly string[];
}
export type CriteriaAttestResult =
  | { ok: true; attestations: SignedCriteriaAttestation[]; failures: { eventHash: string; reason: string }[] }
  | { ok: false; code: "unavailable" | "forbidden" | "invalid"; message: string };

export async function attestCriteriaDecisionsCore(events: readonly unknown[], deps: CriteriaAttestDeps): Promise<CriteriaAttestResult> {
  if (!deps.researcherMissions.length) return { ok: false, code: "forbidden", message: "Only an active Researcher can have criteria decisions attested." };
  const secret = deps.env("P37_CATALOG_SIGNING_KEY");
  if (!secret) return { ok: false, code: "unavailable", message: "Attestation is not configured; the decision stays on this device and is not applied." };
  if (!events.length || events.length > 50) return { ok: false, code: "invalid", message: "Send between 1 and 50 decision events." };
  const registry = bundledCriteriaRegistry();
  const { privateKey } = await deriveCriteriaAttestationKey(secret);
  const attestations: SignedCriteriaAttestation[] = [];
  const failures: { eventHash: string; reason: string }[] = [];
  for (const raw of events) {
    const problem = await attestationProblem(raw, registry, { userId: deps.userId, researcherMissions: deps.researcherMissions });
    const e = raw as CriteriaEvent;
    if (problem) {
      failures.push({ eventHash: typeof e?.hash === "string" ? e.hash : "?", reason: problem });
      continue;
    }
    attestations.push(
      await signCriteriaAttestation(
        {
          schema: CRITERIA_ATTESTATION_SCHEMA,
          keyId: CRITERIA_ATTESTATION_KEY_ID,
          eventHash: e.hash,
          criterionId: e.criterionId,
          criterionSha256: e.criterionSha256,
          action: e.action as "APPROVE" | "REJECT" | "REVOKE",
          missions: e.missions,
          actorUserId: deps.userId,
          attestedAt: deps.now().toISOString(),
          basis: CRITERIA_ATTESTATION_BASIS,
        },
        privateKey,
      ),
    );
  }
  return { ok: true, attestations, failures };
}
