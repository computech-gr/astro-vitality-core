import { supabase } from "@/integrations/supabase/client";
import type { MissionRole } from "@/infrastructure/mission-identity";

export type MissionStatus = "planning" | "active" | "completed" | "aborted";
export type CrewStatus = "candidate" | "active" | "inactive";

export interface MissionOperationsMission {
  id: string;
  code: string;
  name: string;
  status: MissionStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MissionOperationsCrew {
  crew_member_id: string;
  display_name: string;
  external_ref?: string | null;
  status: CrewStatus;
  created_at?: string;
  updated_at?: string;
}

export interface MissionOperationsMembership {
  id: string;
  user_id: string;
  crew_member_id?: string | null;
  role: MissionRole;
  active: boolean;
  created_at?: string;
}

export interface MissionOperationsInvite {
  id: string;
  role: MissionRole;
  crew_member_id?: string | null;
  expires_at: string;
  created_at: string;
  claimed_at?: string | null;
  active: boolean;
}

export interface MissionOperationsWorkspace {
  mission: MissionOperationsMission;
  crew: MissionOperationsCrew[];
  memberships: MissionOperationsMembership[];
  invites: MissionOperationsInvite[];
}

interface RpcResponse<T> {
  data: T | null;
  error: { message: string } | null;
}
interface RpcClient {
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): PromiseLike<RpcResponse<T>>;
}
function rpcClient(): RpcClient {
  return supabase as unknown as RpcClient;
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcClient().rpc<T>(name, args);
  if (error) throw new Error(error.message);
  if (data === null) throw new Error(`${name} returned no result.`);
  return data;
}

export function missionTransitionOptions(status: MissionStatus): MissionStatus[] {
  if (status === "planning") return ["planning", "active", "aborted"];
  if (status === "active") return ["active", "completed", "aborted"];
  return [status];
}

export function canDeactivateMembership(
  membership: Pick<MissionOperationsMembership, "id" | "role" | "active">,
  memberships: Array<Pick<MissionOperationsMembership, "id" | "role" | "active">>,
): boolean {
  if (!membership.active) return false;
  if (membership.role !== "mission_operator") return true;
  return memberships.some((item) => item.id !== membership.id && item.role === "mission_operator" && item.active);
}

export async function loadMissionOperationsWorkspace(missionId: string): Promise<MissionOperationsWorkspace> {
  return rpc<MissionOperationsWorkspace>("get_mission_operations_workspace", { p_mission_id: missionId });
}

/** Crew members eligible for a crew_self invite: active crew of the selected mission only. */
export function eligibleInviteCrew(crew: MissionOperationsCrew[]): MissionOperationsCrew[] {
  return crew.filter((member) => member.status === "active");
}

export async function loadInviteCrewOptions(missionId: string): Promise<MissionOperationsCrew[]> {
  const workspace = await loadMissionOperationsWorkspace(missionId);
  return eligibleInviteCrew(workspace.crew);
}

export async function createMissionOperation(input: { code: string; name: string; startsAt?: string }): Promise<{ mission_id: string }> {
  return rpc("create_mission_operation", {
    p_code: input.code.trim(),
    p_name: input.name.trim(),
    p_starts_at: input.startsAt || null,
  });
}

export async function updateMissionOperation(input: {
  missionId: string;
  name?: string;
  status?: MissionStatus;
  startsAt?: string;
  endsAt?: string;
}): Promise<void> {
  await rpc("update_mission_operation", {
    p_mission_id: input.missionId,
    p_name: input.name?.trim() || null,
    p_status: input.status ?? null,
    p_starts_at: input.startsAt || null,
    p_ends_at: input.endsAt || null,
  });
}

export async function createMissionCrewMember(input: {
  missionId: string;
  displayName: string;
  externalRef?: string;
  status?: CrewStatus;
}): Promise<{ crew_member_id: string }> {
  return rpc("create_mission_crew_member", {
    p_mission_id: input.missionId,
    p_display_name: input.displayName.trim(),
    p_external_ref: input.externalRef?.trim() || null,
    p_status: input.status ?? "candidate",
  });
}

export async function updateMissionCrewMember(input: {
  missionId: string;
  crewMemberId: string;
  displayName?: string;
  externalRef?: string | null;
  status?: CrewStatus;
}): Promise<void> {
  await rpc("update_mission_crew_member", crewMemberUpdateParams(input));
}

export function crewMemberUpdateParams(input: {
  missionId: string;
  crewMemberId: string;
  displayName?: string;
  externalRef?: string | null;
  status?: CrewStatus;
}) {
  return {
    p_mission_id: input.missionId,
    p_crew_member_id: input.crewMemberId,
    p_display_name: input.displayName?.trim() || null,
    p_external_ref: input.externalRef === null ? "" : input.externalRef?.trim() || null,
    p_status: input.status ?? null,
  };
}

export const CREW_DISPLAY_NAME_MIN = 2;
export const CREW_DISPLAY_NAME_MAX = 100;

/** Mirrors the backend rule in update_mission_crew_member (trimmed, 2-100 chars). */
export function validateCrewDisplayName(value: string, current?: string): string | null {
  const name = value.trim();
  if (name.length < CREW_DISPLAY_NAME_MIN || name.length > CREW_DISPLAY_NAME_MAX) {
    return `Display name must be ${CREW_DISPLAY_NAME_MIN}-${CREW_DISPLAY_NAME_MAX} characters.`;
  }
  if (current !== undefined && name === current.trim()) return "Display name is unchanged.";
  return null;
}

/** UI gate only; the backend independently requires an active Mission Operator membership. */
export function canEditCrewDisplayName(operatorMissionIds: readonly string[], missionId: string): boolean {
  return Boolean(missionId) && operatorMissionIds.includes(missionId);
}

/** Display-name-only update: external reference and status are omitted so the backend preserves them. */
export function crewDisplayNameUpdate(missionId: string, crewMemberId: string, displayName: string) {
  return { missionId, crewMemberId, displayName: displayName.trim() };
}

export async function setMissionMembershipActive(input: { missionId: string; membershipId: string; active: boolean }): Promise<void> {
  await rpc("set_mission_membership_active", {
    p_mission_id: input.missionId,
    p_membership_id: input.membershipId,
    p_active: input.active,
  });
}

/** Reuses a global crew identity without copying or transferring any mission health records. */
export async function assignExistingCrewToMission(input: {
  sourceMissionId: string;
  targetMissionId: string;
  crewMemberId: string;
}): Promise<{ crew_member_id: string; mission_id: string; status: CrewStatus }> {
  return rpc("assign_existing_crew_to_mission", {
    p_source_mission_id: input.sourceMissionId,
    p_target_mission_id: input.targetMissionId,
    p_crew_member_id: input.crewMemberId,
  });
}
