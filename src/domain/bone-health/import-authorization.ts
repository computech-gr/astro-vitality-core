import { supabase } from "@/integrations/supabase/client";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import { BONE_IMPORT_SESSION_KEY, type ImportScope } from "./import-session";

let watching = false;
export function watchBoneImportSignOut() {
  if (watching) return;
  watching = true;
  // Session lifetime watcher deliberately survives workspace unmounts. Never persist the session.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) clearRetainedBoneImport();
    else {
      try {
        const raw = window.sessionStorage.getItem(BONE_IMPORT_SESSION_KEY);
        if (raw && JSON.parse(raw).scope?.userId !== session.user.id) clearRetainedBoneImport();
      } catch { clearRetainedBoneImport(); }
    }
  });
}
export function clearRetainedBoneImport() {
  try { window.sessionStorage.removeItem(BONE_IMPORT_SESSION_KEY); } catch { /* Storage unavailable. */ }
}
export async function authorizeBoneImport(scope: Omit<ImportScope, "userId">): Promise<ImportScope> {
  const identity = await loadMissionIdentity();
  if (identity.error || !identity.signedIn || !identity.userId || !scope.missionId || !scope.crewMemberId || !["synthetic", "real"].includes(scope.dataOrigin)) throw new Error("Import authorization unavailable. Nothing restored or saved.");
  const self = identity.memberships.some(m => m.missionId === scope.missionId && m.role === "crew_self" && m.crewMemberId === scope.crewMemberId);
  const ground = identity.memberships.some(m => m.missionId === scope.missionId && m.role === "ground_medical");
  if (!self && ground) {
    const { data, error } = await supabase.from("mission_memberships").select("crew_member_id").eq("mission_id", scope.missionId).eq("crew_member_id", scope.crewMemberId).eq("role", "crew_self").eq("active", true);
    if (error || !data?.length) throw new Error("Import scope denied. Nothing restored or saved.");
  } else if (!self) throw new Error("Import scope denied. Nothing restored or saved.");
  return { ...scope, userId: identity.userId };
}