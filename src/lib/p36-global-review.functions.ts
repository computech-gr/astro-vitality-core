import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Rpc } from "./p36-scientific-authorization.server";

const provenance = z.enum(["synthetic", "real"]);

/** Missions the signed-in account may review (own Researcher missions or permitted global scope). */
export const listGlobalReviewMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ provenance }).parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { listGlobalReviewMissionsCore } = await import("./p36-global-review.server");
    return listGlobalReviewMissionsCore(rpc, data.provenance);
  });

/** Read-only submitted metadata for one authorized mission. */
export const listGlobalReviewSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ missionId: z.string().min(1).max(100), provenance }).parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { listGlobalReviewSubmissionsCore } = await import("./p36-global-review.server");
    return listGlobalReviewSubmissionsCore(rpc, data.missionId, data.provenance);
  });
