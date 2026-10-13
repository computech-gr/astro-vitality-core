import { validateResearchAggregate, type ResearchAggregate } from "@/domain/research/privacy";
import { supabase } from "@/integrations/supabase/client";

interface RpcResponse<T> {
  data: T | null;
  error: { message: string } | null;
}
interface RpcCapableClient {
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse<T>>;
}
function rpcClient(): RpcCapableClient {
  return supabase as unknown as RpcCapableClient;
}

export interface GroundSnapshotDto {
  mission_id: string;
  generated_at: string;
  total_events: number;
  latest_event_at: string | null;
  crew_count: number;
  finding_count: number;
  action_count: number;
  device_health_event_count: number;
  crew: Array<{ crew_member_id: string; event_count: number; latest_event_at: string | null }>;
}

export async function loadGroundMissionSnapshot(missionId: string): Promise<GroundSnapshotDto> {
  const { data, error } = await rpcClient().rpc<GroundSnapshotDto>("get_ground_mission_snapshot", {
    p_mission_id: missionId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Ground snapshot returned no data");
  return data;
}

export async function loadDeidentifiedResearchExport(missionId: string): Promise<ResearchAggregate[]> {
  const { data, error } = await rpcClient().rpc<unknown[]>("export_research_mission", {
    p_mission_id: missionId,
  });
  if (error) throw new Error(error.message);
  return validateResearchAggregate(data ?? []);
}
