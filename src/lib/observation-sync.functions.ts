/**
 * v9.4 explicit cross-device observation sync (user-initiated only).
 *
 * - Identity comes from the verified bearer JWT (requireSupabaseAuth). The server
 *   re-checks the caller's own active membership for the exact mission + crew
 *   (crew_self for that crew member, or scoped ground_medical); the caller-scoped
 *   SECURITY DEFINER RPCs in supabase/pending/20261102000000_v94_observation_sync.sql
 *   check again (including active crew assignment) and RLS limits direct reads.
 *   No service-role key is used.
 * - Payloads are encrypted here with AES-256-GCM under server-only keys before they
 *   reach the database (observation-sync.server.ts); the database stores ciphertext.
 * - Default-off: MITO_OBSERVATION_SYNC_ENABLED, a configured key and, for REAL data,
 *   MITO_OBSERVATION_SYNC_REAL_ENABLED plus explicit per-run confirmation. Until the
 *   migration is applied every call returns "migration required"; nothing is claimed.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ObservationSyncEvent } from "@/domain/health-intelligence/observation-sync";
import { observationSyncPullInput as pullInput, observationSyncPushInput as pushInput } from "./observation-sync.schema";

type Ctx = { supabase: { rpc: unknown; from: (t: string) => unknown }; userId: string };

async function depsFor(context: Ctx) {
  const supabase = context.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;
    from: (t: "mission_memberships") => {
      select: (c: string) => { eq: (k: string, v: unknown) => { eq: (k: string, v: unknown) => { eq: (k: string, v: unknown) => Promise<{ data: unknown; error: unknown }> } } };
    };
  };
  return {
    env: (name: string) => process.env[name],
    rpc: (fn: string, args: Record<string, unknown>) => supabase.rpc(fn, args),
    memberships: async (missionId: string) => {
      const { data, error } = await supabase
        .from("mission_memberships")
        .select("role, crew_member_id, active")
        .eq("mission_id", missionId)
        .eq("user_id", context.userId)
        .eq("active", true);
      if (error || !Array.isArray(data)) return null;
      return data as { role: string; crew_member_id: string | null; active: boolean }[];
    },
  };
}

export const pushObservationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pushInput.parse(input))
  .handler(async ({ data, context }) => {
    const { pushObservationEventsCore } = await import("./observation-sync.server");
    return pushObservationEventsCore(
      { scope: data.scope, events: data.events as unknown as ObservationSyncEvent[], realDataConfirmed: data.realDataConfirmed },
      await depsFor(context as unknown as Ctx),
    );
  });

export const pullObservationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pullInput.parse(input))
  .handler(async ({ data, context }) => {
    const { pullObservationEventsCore } = await import("./observation-sync.server");
    return pullObservationEventsCore(data, await depsFor(context as unknown as Ctx));
  });
