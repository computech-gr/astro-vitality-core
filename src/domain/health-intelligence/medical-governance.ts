/** Browser-safe contract. A client digest is never server attestation. */
export const MEDICAL_GOVERNANCE_SCHEMA = "mitochondria.medical-governance.v3";
export type DurableReviewStatus = "draft_created" | "returned" | "approved" | "revoked" | "superseded" | "stale";
export interface DurableReviewEvent {
  id: string;
  mission_id: string;
  crew_member_id: string;
  provenance: "synthetic";
  actor_user_id: string;
  event_type: DurableReviewStatus;
  revision: number;
  previous_event_id: string | null;
  evidence_sha256: string;
  draft_text: string;
  final_text: string;
  rationale: string;
  created_at: string;
  verified_current: boolean;
}

export function canDisplayDurableAcknowledgment(event: DurableReviewEvent): boolean {
  return event.event_type === "approved" && event.verified_current === true;
}