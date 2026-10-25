import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { researchStatusSchema } from "@/domain/health-intelligence/synthetic-research-policy";
type Client = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
async function owner(client: Client) {
  const result = await client.rpc("medical_research_is_owner", {});
  if (result.error || result.data !== true)
    throw new Error("Owner administration unavailable or access denied.");
}
export const getResearchAdministration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as Client;
    await owner(client);
    const result = await client.rpc("medical_research_status", {});
    if (result.error) throw new Error("Research policy unavailable");
    const audit = await client.rpc("medical_research_audit_log", {});
    return {
      status: researchStatusSchema.parse(result.data),
      audit: audit.error
        ? []
        : (audit.data as Array<{
            at: string;
            actor_id: string | null;
            action: string;
            details: Record<string, unknown>;
          }>),
      configurationEnabled: process.env["MITO_MEDICAL_RESEARCH_POLICY_ENABLED"] === "true",
      adminCredentialConfigured: Boolean(process.env["OPENAI_ADMIN_API_KEY"]),
      generationCredentialConfigured: Boolean(process.env["OPENAI_API_KEY"]),
    };
  });
export const configureResearchPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        budgetUsd: z.number().min(0).max(100000).multipleOf(0.01),
        rollingLimit: z.number().int().min(1).max(10000),
        rollingSeconds: z.number().int().min(60).max(2678400),
        providerProject: z
          .string()
          .regex(/^proj_[A-Za-z0-9_-]+$/)
          .nullable(),
        syncRequired: z.boolean(),
        revision: z.number().int().positive(),
        reference: z.string().min(1).max(200),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as Client;
    await owner(client);
    const result = await client.rpc("medical_research_configure", {
      p_enabled: data.enabled,
      p_budget: Math.round(data.budgetUsd * 1000000),
      p_limit: data.rollingLimit,
      p_seconds: data.rollingSeconds,
      p_project: data.providerProject,
      p_sync: data.syncRequired,
      p_revision: data.revision,
      p_ref: data.reference,
    });
    if (result.error)
      throw new Error(
        "Configuration rejected: refresh revision, verify budget and resolve any pending attempt.",
      );
    return { saved: true };
  });
export const pauseResearchAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({ reference: z.string().min(1).max(200) })
      .strict()
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as Client;
    await owner(client);
    const r = await client.rpc("medical_research_pause", { p_ref: data.reference });
    if (r.error) throw new Error("Pause unconfirmed; use retaining-pause SQL recovery.");
    return { paused: true };
  });
export const resolveResearchAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({ attempt: z.uuid(), reference: z.string().min(10).max(200) })
      .strict()
      .parse(x),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as Client;
    await owner(client);
    const r = await client.rpc("medical_research_resolve", {
      p_attempt: data.attempt,
      p_ref: data.reference,
    });
    if (r.error)
      throw new Error(
        "Recovery denied: pause, wait at least two minutes and retain the cost hold.",
      );
    return { resolved: true };
  });
export const synchronizeResearchCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = context.supabase as unknown as Client;
    await owner(client);
    const state = await client.rpc("medical_research_status", {});
    const status = researchStatusSchema.parse(state.data);
    const key = process.env["OPENAI_ADMIN_API_KEY"];
    if (!key || !status.providerProject)
      return {
        synchronized: false,
        message: "Administrative reporting credential and dedicated OpenAI project required.",
      };
    try {
      const { readOpenAIOrganizationTotals } = await import("./openai-organization-costs.server");
      const totals = await readOpenAIOrganizationTotals(key, status.providerProject, new Date());
      // Privileged metadata write only after independent caller-scoped owner verification.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const r = await (supabaseAdmin as unknown as Client).rpc("medical_research_record_sync", {
        p_month: totals.month,
        p_project: totals.project,
        p_cost: totals.costMicrousd,
        p_input: totals.inputTokens,
        p_output: totals.outputTokens,
        p_requests: totals.requests,
      });
      if (r.error) throw new Error("Report could not be recorded");
      return {
        synchronized: true,
        message: "Provider project costs synchronized; prepaid balance remains unavailable.",
      };
    } catch {
      return {
        synchronized: false,
        message:
          "Provider reporting failed or attribution incomplete; prior totals retained. Check administrative permissions and project.",
      };
    }
  });
