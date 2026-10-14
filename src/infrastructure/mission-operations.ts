import { supabase } from "@/integrations/supabase/client";
import type { MissionRole } from "@/infrastructure/mission-identity";
import { sanitizeAuditPage, type MissionAuditPage } from "@/domain/mission-audit/audit";

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
  /** FV-01.4.3 (staged): absent until the hardening migration is applied. */
  approval_state?: InviteApprovalState;
  approved_at?: string | null;
  issued_by_me?: boolean;
  /** Verified account the Ground Medical invite is bound to (operators of this mission only). */
  recipient_email?: string | null;
  recipient_bound_at?: string | null;
}

export type InviteApprovalState = "not_required" | "pending" | "approved";

interface RejectableResult {
  status?: string;
  reason?: string;
  message?: string;
}

/** Hardened RPCs return a 'rejected' result (so audit rows commit) instead of raising. */
export function assertNotRejected(result: RejectableResult | null | undefined, fallback: string): void {
  if (result?.status === "rejected") throw new Error(result.message ?? fallback);
}

/** Ground Medical invites awaiting an independent approver; the inviter can never approve their own. */
export function pendingApprovalsFor(invites: MissionOperationsInvite[]): Array<MissionOperationsInvite & { canApprove: boolean }> {
  return invites
    .filter((invite) => invite.role === "ground_medical" && invite.approval_state === "pending" && invite.active && !invite.claimed_at)
    .map((invite) => ({ ...invite, canApprove: invite.issued_by_me !== true && Boolean(invite.recipient_email) }));
}

const APPROVAL_REASONS: Record<string, string> = {
  inviter_cannot_approve: "The inviter cannot approve their own Ground Medical invitation.",
  not_pending: "This invitation is not awaiting approval.",
  invite_unavailable: "This invitation is expired, revoked or already used.",
  recipient_unbound: "Bind the invitation to a verified recipient account before approval.",
  recipient_cannot_approve: "The recipient cannot approve their own access.",
  recipient_mismatch: "The recipient changed since you reviewed it. Reload and verify again.",
};

/** Approver restates the exact identity they reviewed; the server refuses if the binding changed. */
export async function approveMissionInvite(inviteId: string, expectedRecipientEmail: string): Promise<void> {
  const result = await rpc<RejectableResult>("approve_mission_invite", { p_invite_id: inviteId, p_expected_recipient_email: expectedRecipientEmail });
  if (result.status === "rejected") throw new Error(APPROVAL_REASONS[result.reason ?? ""] ?? "Invitation approval refused.");
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
  const result = await rpc<RejectableResult>("set_mission_membership_active", {
    p_mission_id: input.missionId,
    p_membership_id: input.membershipId,
    p_active: input.active,
  });
  assertNotRejected(result, "Membership change refused.");
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

/** Binds a Ground Medical invite to one verified account; any re-binding restarts approval. */
export async function bindMissionInviteRecipient(inviteId: string, recipientEmail: string): Promise<void> {
  const email = recipientEmail.trim();
  if (!email) throw new Error("Enter the recipient's verified account email.");
  await rpc("bind_mission_invite_recipient", { p_invite_id: inviteId, p_recipient_email: email });
}

/** FV-01.4.6: read-only, operator-only, redacted mission audit log (server function get_mission_audit_log). */
export async function loadMissionAuditLog(input: {
  missionId: string;
  from?: string | null;
  to?: string | null;
  action?: string;
  outcome?: "" | "success" | "refused";
  search?: string;
  limit?: number;
  before?: { at: string; id: string } | null;
}): Promise<MissionAuditPage> {
  const raw = await rpc<unknown>("get_mission_audit_log", {
    p_mission_id: input.missionId,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_action: input.action || null,
    p_outcome: input.outcome || null,
    p_search: input.search?.trim() || null,
    p_limit: input.limit ?? 25,
    p_before_at: input.before?.at ?? null,
    p_before_id: input.before?.id ?? null,
  });
  return sanitizeAuditPage(raw);
}
