import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { handoffScopeSchema, validateCloudHandoff } from "@/domain/health-intelligence/p36-cloud-handoff";
import type { Rpc } from "./p36-scientific-authorization.server";

export const submitDynamicHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => validateCloudHandoff(v))
  .handler(async ({ data, context }) => {
    if (process.env["P36_DYNAMIC_HANDOFF_ENABLED"] !== "true") return { ok: false as const, code: "migration_required" as const, message: "Cloud handoff has not been activated by the owner. Your encrypted local request is unchanged." };
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { submitHandoffCore } = await import("./p36-dynamic-handoff.server");
    return submitHandoffCore(rpc, data);
  });

export const listDynamicHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => handoffScopeSchema.parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { listHandoffCore } = await import("./p36-dynamic-handoff.server");
    return listHandoffCore(rpc, data);
  });