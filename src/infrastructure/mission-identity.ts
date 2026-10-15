import { supabase } from "@/integrations/supabase/client";
import { getSupabaseBrowserConfigStatus } from "@/integrations/supabase/config";
import {
  clearActiveSelection,
  readActiveSelection,
  shouldClearSelection,
  writeActiveSelection,
} from "@/infrastructure/mission-selection-storage";

export type MissionRole = "crew_self" | "ground_medical" | "mission_operator" | "researcher";

export interface MissionMembershipContext {
  missionId: string;
  missionCode?: string;
  missionName?: string;
  crewMemberId?: string;
  crewDisplayName?: string;
  crewExternalRef?: string;
  role: MissionRole;
}

export interface MissionIdentitySnapshot {
  configured: boolean;
  signedIn: boolean;
  userId?: string;
  email?: string;
  memberships: MissionMembershipContext[];
  active?: MissionMembershipContext;
  error?: string;
}

const IDENTITY_CHANGED_EVENT = "mitochondria:mission-identity-changed";
let lastKnownUserId: string | undefined;

function readActiveKey(userId: string | undefined): string | undefined {
  if (typeof window === "undefined") return undefined;
  return readActiveSelection(window.localStorage, userId);
}

function membershipKey(
  value: Pick<MissionMembershipContext, "missionId" | "role" | "crewMemberId">,
) {
  return `${value.missionId}::${value.role}::${value.crewMemberId ?? ""}`;
}

function emitIdentityChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(IDENTITY_CHANGED_EVENT));
}

export function subscribeMissionIdentity(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(IDENTITY_CHANGED_EVENT, listener);
  if (!getSupabaseBrowserConfigStatus().configured) {
    return () => window.removeEventListener(IDENTITY_CHANGED_EVENT, listener);
  }
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const nextUserId = session?.user.id;
    if (shouldClearSelection(event, lastKnownUserId, nextUserId))
      clearActiveSelection(window.localStorage);
    lastKnownUserId = nextUserId;
    listener();
  });
  return () => {
    window.removeEventListener(IDENTITY_CHANGED_EVENT, listener);
    data.subscription.unsubscribe();
  };
}

export function setActiveMissionMembership(membership?: MissionMembershipContext) {
  if (typeof window === "undefined") return;
  if (!membership || !lastKnownUserId) clearActiveSelection(window.localStorage);
  else writeActiveSelection(window.localStorage, lastKnownUserId, membershipKey(membership));
  emitIdentityChanged();
}

export async function loadMissionIdentity(): Promise<MissionIdentitySnapshot> {
  const config = getSupabaseBrowserConfigStatus();
  if (!config.configured) {
    return {
      configured: false,
      signedIn: false,
      memberships: [],
      error: "Cloud identity configuration is unavailable.",
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { configured: true, signedIn: false, memberships: [], error: sessionError.message };
  }
  const session = sessionData.session;
  if (!session) {
    if (typeof window !== "undefined") clearActiveSelection(window.localStorage);
    lastKnownUserId = undefined;
    return { configured: true, signedIn: false, memberships: [] };
  }
  if (lastKnownUserId && lastKnownUserId !== session.user.id && typeof window !== "undefined") {
    clearActiveSelection(window.localStorage);
  }
  lastKnownUserId = session.user.id;

  const { data, error } = await supabase
    .from("mission_memberships")
    .select("mission_id, crew_member_id, role, active")
    .eq("user_id", session.user.id)
    .eq("active", true);

  const membershipRows = data ?? [];
  const missionIds = [...new Set(membershipRows.map((row) => row.mission_id))];
  const crewIds = [
    ...new Set(
      membershipRows
        .map((row) => row.crew_member_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [missionResult, crewResult] = await Promise.all([
    missionIds.length
      ? supabase.from("missions").select("id, code, name").in("id", missionIds)
      : Promise.resolve({ data: [], error: null }),
    crewIds.length
      ? supabase.from("crew_members").select("id, display_name, external_ref").in("id", crewIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const metadataError = missionResult.error ?? crewResult.error;
  if (metadataError) {
    return {
      configured: true,
      signedIn: true,
      userId: session.user.id,
      ...(session.user.email ? { email: session.user.email } : {}),
      memberships: [],
      error: metadataError.message,
    };
  }

  const missionById = new Map(
    (missionResult.data ?? []).map((mission) => [mission.id, mission] as const),
  );
  const crewById = new Map((crewResult.data ?? []).map((crew) => [crew.id, crew] as const));
  const memberships: MissionMembershipContext[] = membershipRows.map((row) => {
    const mission = missionById.get(row.mission_id);
    const crew = row.crew_member_id ? crewById.get(row.crew_member_id) : undefined;
    return {
      missionId: row.mission_id,
      role: row.role as MissionRole,
      ...(row.crew_member_id ? { crewMemberId: row.crew_member_id } : {}),
      ...(mission?.code ? { missionCode: mission.code } : {}),
      ...(mission?.name ? { missionName: mission.name } : {}),
      ...(crew?.display_name ? { crewDisplayName: crew.display_name } : {}),
      ...(crew?.external_ref ? { crewExternalRef: crew.external_ref } : {}),
    };
  });

  const preferred = readActiveKey(session.user.id);
  let active = memberships.find((item) => membershipKey(item) === preferred);
  if (!active && memberships.length === 1) active = memberships[0];
  if (!active) active = memberships.find((item) => item.role === "crew_self" && item.crewMemberId);

  if (active && preferred !== membershipKey(active) && typeof window !== "undefined") {
    writeActiveSelection(window.localStorage, session.user.id, membershipKey(active));
  }

  return {
    configured: true,
    signedIn: true,
    userId: session.user.id,
    ...(session.user.email ? { email: session.user.email } : {}),
    memberships,
    ...(active ? { active } : {}),
  };
}

export function validateMissionSignInInput(email: string, password: string): string | null {
  if (!email.trim()) return "Please enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Please enter a valid email address.";
  if (!password) return "Please enter your password.";
  return null;
}

export function missionSignInErrorMessage(error: {
  message?: string;
  status?: number;
  code?: string;
}): string {
  const msg = (error.message ?? "").toLowerCase();
  if (error.status === 429 || /rate.limit|too many requests|over_email_send_rate_limit/.test(msg))
    return "Too many attempts. Please wait and try again.";
  if (/email not confirmed|email_not_confirmed/.test(msg))
    return "Please verify your email address before signing in.";
  if (/network|fetch|connection|timeout|failed to fetch/.test(msg))
    return "Unable to connect. Check your internet connection and try again.";
  // Do not distinguish unknown accounts from incorrect passwords.
  return "Incorrect email or password. Please try again.";
}

export async function signInMissionIdentity(email: string, password: string): Promise<void> {
  const validation = validateMissionSignInInput(email, password);
  if (validation) throw new Error(validation);
  if (typeof navigator !== "undefined" && !navigator.onLine)
    throw new Error("Unable to connect. Check your internet connection and try again.");
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(missionSignInErrorMessage(error));
  } catch (error) {
    if (
      error instanceof Error &&
      /^(Incorrect email|Too many attempts|Please verify|Unable to connect)/.test(error.message)
    )
      throw error;
    throw new Error("Unable to connect. Check your internet connection and try again.");
  }
  emitIdentityChanged();
}

export const MISSION_PASSWORD_MIN_LENGTH = 12;

export function validateMissionSignUpPassword(password: string): string | null {
  if (password.length < MISSION_PASSWORD_MIN_LENGTH) {
    return `Password must contain at least ${MISSION_PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export async function signUpMissionIdentity(
  email: string,
  password: string,
): Promise<{ confirmationRequired: boolean }> {
  const passwordError = validateMissionSignUpPassword(password);
  if (passwordError) throw new Error(passwordError);
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  emitIdentityChanged();
  return { confirmationRequired: !data.session };
}

export async function requestMissionMagicLink(email: string): Promise<void> {
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/mission/identity` : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}),
  });
  if (error) throw new Error(error.message);
}

export async function signOutMissionIdentity(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  setActiveMissionMembership(undefined);
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

export async function acceptMissionInvite(code: string): Promise<void> {
  const normalized = code.trim();
  if (!normalized) throw new Error("Enter a mission invite code.");
  const { data, error } = await rpcClient().rpc<{ status?: string; message?: string }>(
    "accept_mission_invite",
    { p_code: normalized },
  );
  if (error) throw new Error(error.message);
  // FV-01.1: binding conflicts are returned (not raised) so the audit record persists.
  if (data?.status === "rejected")
    throw new Error(data.message ?? "Mission invite rejected; operator review required.");
  emitIdentityChanged();
}

export async function createMissionInvite(input: {
  missionId: string;
  role: MissionRole;
  crewMemberId?: string;
  expiresInHours?: number;
}): Promise<string> {
  const { data, error } = await rpcClient().rpc<{ code?: string }>("create_mission_invite", {
    p_mission_id: input.missionId,
    p_role: input.role,
    p_crew_member_id: input.crewMemberId?.trim() || null,
    p_expires_in_hours: input.expiresInHours ?? 24,
  });
  if (error) throw new Error(error.message);
  if (!data?.code) throw new Error("Invite creation returned no code.");
  return data.code;
}

export async function activeLiveMissionContext(): Promise<{
  missionId: string;
  crewMemberId: string;
  classification: "medical_sensitive";
  source: "authenticated_membership" | "local_fallback";
}> {
  const identity = await loadMissionIdentity();
  const active = identity.active;
  if (identity.signedIn && active?.role === "crew_self" && active.crewMemberId) {
    return {
      missionId: active.missionId,
      crewMemberId: active.crewMemberId,
      classification: "medical_sensitive",
      source: "authenticated_membership",
    };
  }
  return {
    missionId: "mission-local-p9",
    crewMemberId: "crew-local-p9",
    classification: "medical_sensitive",
    source: "local_fallback",
  };
}

export interface MissionPasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Pure validation for the password-change form. Returns a user-facing error or null. */
export function validateMissionPasswordChange(input: MissionPasswordChangeInput): string | null {
  if (!input.currentPassword || !input.newPassword || !input.confirmPassword)
    return "Enter your current password, a new password and its confirmation.";
  const strength = validateMissionSignUpPassword(input.newPassword);
  if (strength) return strength;
  if (input.newPassword !== input.confirmPassword) return "Passwords do not match.";
  if (input.newPassword === input.currentPassword)
    return "The new password must differ from the current password.";
  return null;
}

let passwordChangeInFlight = false;

/**
 * Change the signed-in user's own password through the auth service, never a mission table.
 * The current password is verified against the signed-in account before any update; a wrong
 * current password leaves credentials untouched. Passwords are never logged or persisted.
 */
export async function changeMissionPassword(input: MissionPasswordChangeInput): Promise<void> {
  const validation = validateMissionPasswordChange(input);
  if (validation) throw new Error(validation);
  if (passwordChangeInFlight) throw new Error("A password change is already in progress.");
  passwordChangeInFlight = true;
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine)
      throw new Error("Password changes require an online connection.");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userError || !user?.email) throw new Error("Sign in before changing your password.");
    let verifiedUserId: string | undefined;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: input.currentPassword,
      });
      if (!error) verifiedUserId = data.user?.id;
    } catch {
      throw new Error("Could not reach the sign-in service. Check your connection and try again.");
    }
    if (verifiedUserId !== user.id) throw new Error("Current password is incorrect.");
    let updateError: { message: string } | null = null;
    try {
      ({ error: updateError } = await supabase.auth.updateUser({
        password: input.newPassword,
        current_password: input.currentPassword,
      }));
    } catch {
      throw new Error("Could not reach the sign-in service. Your password was not changed.");
    }
    if (updateError) throw new Error(`Password was not changed: ${updateError.message}`);
  } finally {
    passwordChangeInFlight = false;
  }
}
