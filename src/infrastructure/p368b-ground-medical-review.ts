import { supabase } from "@/integrations/supabase/client";

// RPC authorization is enforced by the deployed P36.8A PostgreSQL functions.
// The generated Supabase types have not yet incorporated migration 0009.
export interface GroundMedicalPendingBatch {
  batch_id: string;
  crew_member_id: string;
  observed_on: string;
  submitted_at: string;
  item_count: number;
  review_status: string;
}

export interface GroundMedicalReviewItem {
  batch_id: string;
  crew_member_id: string;
  observed_on: string;
  submitted_at: string;
  review_status: string;
  metric_id: string;
  measured_value: number;
  unit: string;
  source_excerpt: string | null;
}

export async function listGroundMedicalPending(missionId: string): Promise<GroundMedicalPendingBatch[]> {
  if (!missionId) throw new Error("Select an authorized mission.");
  const { data, error } = await supabase.rpc("p368_list_ground_medical_pending" as never, {
    p_mission_id: missionId,
  } as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as GroundMedicalPendingBatch[];
}

export async function getGroundMedicalBatch(missionId: string, batchId: string): Promise<GroundMedicalReviewItem[]> {
  if (!missionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId))
    throw new Error("Invalid mission or batch selection.");
  const { data, error } = await supabase.rpc("p368_get_ground_medical_batch" as never, {
    p_mission_id: missionId,
    p_batch_id: batchId,
  } as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as GroundMedicalReviewItem[];
}

// P36.8C: governed research decision (staged migration 0010; RPC absent until owner-approved deployment).
export type ResearchDecision = "accepted_for_research" | "rejected_for_research";
export interface ResearchDecisionReceipt {
  batch_id: string;
  decision: ResearchDecision;
  decision_request_id: string;
  decided_at: string;
  replay: boolean;
}

export function newDecisionIdempotencyKey(): string {
  return `p368c_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function decideGroundMedicalBatch(input: {
  missionId: string;
  batchId: string;
  decision: ResearchDecision;
  note: string;
  idempotencyKey: string;
  expectedItemCount: number;
}): Promise<ResearchDecisionReceipt> {
  const note = input.note.trim();
  if (!input.missionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.batchId))
    throw new Error("Invalid mission or batch selection.");
  if (input.decision !== "accepted_for_research" && input.decision !== "rejected_for_research")
    throw new Error("Invalid research decision.");
  if (note.length > 500) throw new Error("Note must be at most 500 characters.");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) throw new Error("Invalid request key.");
  if (!Number.isInteger(input.expectedItemCount) || input.expectedItemCount < 1 || input.expectedItemCount > 100)
    throw new Error("Invalid item count.");
  const { data, error } = await supabase.rpc("p368_decide_ground_medical_batch" as never, {
    p_mission_id: input.missionId,
    p_batch_id: input.batchId,
    p_decision: input.decision,
    p_note: note || null,
    p_idempotency_key: input.idempotencyKey,
    p_expected_item_count: input.expectedItemCount,
  } as never);
  if (error) {
    if (/already_decided/.test(error.message)) throw new Error("This batch has already been decided.");
    if (/stale view/.test(error.message)) throw new Error("The batch changed since you viewed it. Refresh and review again.");
    if (/access denied|self-review/.test(error.message)) throw new Error("You are not authorized to decide this batch.");
    throw new Error("Decision could not be recorded. No change was made.");
  }
  const r = data as ResearchDecisionReceipt | null;
  if (!r || typeof r.decision_request_id !== "string" || r.batch_id !== input.batchId)
    throw new Error("Unexpected decision response.");
  return r;
}
