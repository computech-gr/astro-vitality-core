import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Rpc } from "./p36-scientific-authorization.server";

const uuid = z.string().uuid();
const mission = z.string().min(1).max(100);
const term = z.string().regex(/^ubt-[0-9a-f]{8}$/);
const demoId = z.string().regex(/^demo:ubt-[0-9a-f]{8}$/);

/** One bounded batch (1 to 50) of Researcher synthetic demo scope authorizations. */
export const authorizeDemoScopeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: mission,
        items: z
          .array(z.object({ submissionId: uuid, termId: term, exactUnit: z.string().min(1).max(64) }))
          .min(1)
          .max(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { authorizeScopeCore } = await import("./p615-demo-scope.server");
    return authorizeScopeCore(rpc, context.userId, data);
  });

/** Researcher scope grants, alias lifecycle and caller capabilities for one mission. */
export const getDemoGovernanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ missionId: mission }).parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { governanceCore } = await import("./p615-demo-scope.server");
    return governanceCore(rpc, data.missionId);
  });

/** Researcher alias decision to an existing active demo entry (identical exact unit). */
export const decideDemoAliasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: mission,
        submissionId: uuid,
        termId: term,
        targetDemoId: demoId,
        rationale: z.string().trim().min(8).max(2000),
        acknowledgement: z.string().max(120),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { aliasDecideCore } = await import("./p615-demo-scope.server");
    return aliasDecideCore(rpc, context.userId, data);
  });

/** Ground Medical activation of an alias decision. */
export const activateDemoAliasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ decisionEventId: uuid, expectedEntrySha256: z.string().regex(/^[0-9a-f]{64}$/) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { aliasActivateCore } = await import("./p615-demo-scope.server");
    return aliasActivateCore(rpc, context.userId, data);
  });

/** Ground Medical revocation of an active alias. */
export const revokeDemoAliasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ activationEventId: uuid, reason: z.string().trim().min(8).max(2000) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { aliasRevokeCore } = await import("./p615-demo-scope.server");
    return aliasRevokeCore(rpc, context.userId, data);
  });
