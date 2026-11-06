/** A code-review artifact only: never writes or activates the registry. */
import { canonicalJson } from "./observation-envelope";
import { sha256Hex, type TermAuthorizationState } from "./p36-scientific-authorization";
import { catalogEntryFor } from "./p36-scientific-review";

export async function prepareGovernedPromotion(state: TermAuthorizationState, verifiedCommit: string) {
  const event = state.latestDecision;
  if (state.integrity !== "VERIFIED" || state.stale || state.scientificStatus !== "SCIENTIFICALLY_APPROVED" || !event) throw new Error("Current independent scientific approval is required.");
  if (!/^[0-9a-f]{40}$/.test(verifiedCommit)) throw new Error("Exact validated code revision is required; this input is a declaration, not proof of CI.");
  const p = event.payload;
  const target = catalogEntryFor(p.canonicalCatalogId ?? "");
  if (!target || target.catalog !== "P36" || target.unit !== p.validatedUnit || !target.unit) throw new Error("Catalog unit is not validated and exact; a separate catalog scientific review is needed.");
  const artifact = {
    schema: "mitochondria.p36-governed-promotion.v1", appliesNothing: true,
    independentDecisionEventId: event.row.event_id, sourceFingerprint: p.sourceFingerprint, termDossierFingerprint: p.termDossierFingerprint,
    scope: { missionId: p.authorityMissionId, crewMemberId: p.crewMemberId ?? null, provenance: p.provenance ?? null },
    extension: { extensionId: `ext-${p.termId}`, version: 1, kind: "alias_to_existing_metric", sourceLabel: p.sourceLabel, sourceUnit: p.sourceUnit, targetMetricId: p.canonicalCatalogId, status: "APPROVED", evidenceRefs: p.sourceRefs,
      matchingContext: { method: p.methodOrInstrument, specimen: p.specimenOrAcquisitionContext } },
    approvalRecord: { extensionId: `ext-${p.termId}`, version: 1, decision: "APPROVED", reviewer: p.reviewerName, decidedAt: p.decidedAt,
      handbookEvidenceRefs: [...p.validationEvidenceRefs, `p36-auth:${event.row.event_id}`], note: `verifiers-passed:${verifiedCommit}` },
    productionCodeReviewRequired: true, historicalObservationRewriteAllowed: false,
  };
  return { ...artifact, digest: await sha256Hex(canonicalJson(artifact)) };
}