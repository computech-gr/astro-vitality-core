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
