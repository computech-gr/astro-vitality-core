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

const triageAction = z.enum(["ACCEPT_FOR_REVIEW", "REQUEST_MORE_EVIDENCE", "REJECT_REVIEW_REQUEST"]);
const evidenceRequirement = z.enum(["identity", "unit", "method", "specimen", "protocol", "source_validation", "other"]);

/** Triage history for one authorized mission, plus whether this account may record triage. */
export const listGlobalTriage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ missionId: z.string().min(1).max(100), provenance }).parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { listTriageCore } = await import("./p36-global-triage.server");
    return listTriageCore(rpc, data.missionId, data.provenance);
  });

/** Records one triage action. Not scientific approval; never touches catalogs or submitted metadata. */
export const appendGlobalTriage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    missionId: z.string().min(1).max(100), provenance, submissionId: z.string().uuid(), termId: z.string().regex(/^ubt-[0-9a-f]{8}$/),
    action: triageAction, reason: z.string().max(2000).nullable(), evidenceRequirements: z.array(evidenceRequirement).max(7),
    expectedPreviousEventId: z.string().uuid().nullable(), idempotencyKey: z.string().uuid(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { appendTriageCore } = await import("./p36-global-triage.server");
    return appendTriageCore(rpc, data);
  });
