import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { handoffScopeSchema, cloudAuthorizationContext } from "@/domain/health-intelligence/p36-cloud-handoff";
import { submitInput } from "./p36-scientific-authorization.functions";
import type { Rpc } from "./p36-scientific-authorization.server";

export const listDynamicAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => handoffScopeSchema.parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { listAuthorizationCore } = await import("./p36-scientific-authorization.server");
    const scoped: Rpc = (fn, args) => rpc(fn.replace("p36_sci_auth", "p36_dynamic_auth"), { ...args, p_crew_member_id: data.crewMemberId, p_provenance: data.provenance });
    return listAuthorizationCore({ rpc: scoped }, data.missionId);
  });

export const submitDynamicAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => submitInput.extend({ scope: handoffScopeSchema }).parse(v))
  .handler(async ({ data, context }) => {
    if (process.env["P36_DYNAMIC_AUTHORIZATION_ENABLED"] !== "true") return { ok: false as const, code: "migration_required" as const, message: "Dynamic scientific authorization has not been activated by the owner." };
    if (data.scope.missionId !== data.authorityMissionId) return { ok: false as const, code: "invalid" as const, message: "Authority scope mismatch." };
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { listHandoffCore } = await import("./p36-dynamic-handoff.server");
    const handoff = await listHandoffCore(rpc, data.scope);
    if (!handoff.ok) return handoff;
    if (handoff.conflicts.includes(data.termId)) return { ok: false as const, code: "integrity" as const, message: "Conflicting immutable metadata; nothing was recorded." };
    const ctx = await cloudAuthorizationContext(handoff.terms);
    const { submitAuthorizationCore } = await import("./p36-scientific-authorization.server");
    const scoped: Rpc = (fn, args) => rpc(fn.replace("p36_sci_auth", "p36_dynamic_auth"), { ...args, p_crew_member_id: data.scope.crewMemberId, p_provenance: data.scope.provenance });
    return submitAuthorizationCore({ rpc: scoped, userId: context.userId, now: () => new Date().toISOString(), context: ctx, scope: { crewMemberId: data.scope.crewMemberId, provenance: data.scope.provenance } }, data);
  });