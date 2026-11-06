/**
 * Caller-scoped mission crew roster for mission-level reviewers.
 * Reads only rows the signed-in account can already see under existing RLS
 * (active crew_self memberships of the mission plus crew display names).
 * Never uses elevated credentials; an unreadable roster fails closed (empty).
 */
import { supabase } from "@/integrations/supabase/client";
import type { RosterCrewMember } from "@/domain/health-intelligence/p36-crew-choices";

export async function loadMissionCrewRoster(
  missionId: string,
): Promise<{ ok: true; crew: RosterCrewMember[] } | { ok: false; message: string }> {
  const { data: rows, error } = await supabase
    .from("mission_memberships")
    .select("mission_id, crew_member_id")
    .eq("mission_id", missionId)
    .eq("active", true)
    .eq("role", "crew_self");
  if (error) return { ok: false, message: "The authorized crew roster could not be read." };
  const crewIds = [
    ...new Set((rows ?? []).map((r) => r.crew_member_id).filter((id): id is string => Boolean(id))),
  ];
  if (!crewIds.length) return { ok: true, crew: [] };
  const { data: crew, error: crewError } = await supabase
    .from("crew_members")
    .select("id, display_name")
    .in("id", crewIds);
  if (crewError) return { ok: false, message: "Crew names could not be read." };
  const names = new Map((crew ?? []).map((c) => [c.id, c.display_name ?? c.id]));
  return {
    ok: true,
    crew: crewIds.map((id) => ({ missionId, crewMemberId: id, displayName: names.get(id) ?? id })),
  };
}
