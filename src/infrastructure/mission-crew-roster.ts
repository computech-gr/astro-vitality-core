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
  // This caller-scoped RPC handles mission-wide reviewers without widening the
  // existing membership/name table policies. It returns active assignments only.
  const { data: roster, error: rosterError } = await (supabase.rpc as unknown as (
    name: string, args: { p_mission_id: string },
  ) => Promise<{ data: { mission_id: string; crew_member_id: string; display_name: string }[] | null; error: { code?: string } | null }>).call(supabase, "p36_dynamic_crew_roster_v1", { p_mission_id: missionId });
  if (!rosterError && Array.isArray(roster)) return {
    ok: true,
    crew: roster.filter((r) => r.mission_id === missionId).map((r) => ({ missionId, crewMemberId: r.crew_member_id, displayName: r.display_name })),
  };
  if (rosterError && !["42883", "PGRST202"].includes(rosterError.code ?? "")) return { ok: false, message: "The authorized crew roster could not be read. Access was not broadened." };
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
  if (!crewIds.length) return { ok: false, message: "Mission-wide crew visibility requires the owner-approved roster migration. Existing policies may hide crew from this account; no crew IDs were guessed." };
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
