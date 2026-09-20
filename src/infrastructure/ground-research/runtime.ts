import { supabase } from "@/integrations/supabase/client";
import { getSupabaseBrowserConfigStatus } from "@/integrations/supabase/config";
import { synchronizeOfflineMissionQueue } from "@/infrastructure/offline";
import { SupabaseMissionSyncTransport } from "./supabase-transport";

let cleanupOnlineListener: (() => void) | undefined;

export async function synchronizeGroundQueueIfAuthenticated(): Promise<
  "synced" | "anonymous" | "unavailable" | "configuration_required"
> {
  if (typeof window === "undefined" || !navigator.onLine) return "unavailable";
  if (!getSupabaseBrowserConfigStatus().configured) return "configuration_required";
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return "anonymous";
  await synchronizeOfflineMissionQueue(new SupabaseMissionSyncTransport());
  return "synced";
}

export function initializeGroundSyncRuntime(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (cleanupOnlineListener) return cleanupOnlineListener;
  const onOnline = () => { void synchronizeGroundQueueIfAuthenticated().catch(() => undefined); };
  window.addEventListener("online", onOnline);
  void synchronizeGroundQueueIfAuthenticated().catch(() => undefined);
  cleanupOnlineListener = () => {
    window.removeEventListener("online", onOnline);
    cleanupOnlineListener = undefined;
  };
  return cleanupOnlineListener;
}
