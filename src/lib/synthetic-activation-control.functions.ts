import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SYNTHETIC_GUARD_VERSION } from "@/domain/health-intelligence/synthetic-activation-policy";
import { operatorDeploymentRevision, syntheticStatusFailure } from "@/domain/health-intelligence/synthetic-status";

export const getSyntheticActivationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const revision = process.env["MITO_MEDICAL_DEPLOYMENT_REVISION"];
    const configurationEnabled =
      process.env["MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED"] === "true";
    const client = context.supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: unknown }>;
    };
    const permanent = process.env["MITO_MEDICAL_RESEARCH_POLICY_ENABLED"] === "true";
    if (permanent) {
      const { researchStatusSchema } =
        await import("@/domain/health-intelligence/synthetic-research-policy");
      const result = await Promise.resolve(client.rpc("medical_research_status", {}))
        .catch((error: unknown) => ({ data: null, error }));
      const parsed = researchStatusSchema.safeParse(result.data);
      return {
        mode: "research" as const,
        statusFailure: syntheticStatusFailure(result.error, parsed.success),
        configurationEnabled,
        revision: operatorDeploymentRevision(revision),
        guard: null,
        research: !result.error && parsed.success ? parsed.data : null,
      };
    }
    const result = await Promise.resolve(client.rpc("medical_demo_status", {}))
      .catch((error: unknown) => ({ data: null, error }));
    const parsed = z
      .object({
        version: z.literal(SYNTHETIC_GUARD_VERSION),
        enabled: z.boolean(),
        eligible: z.boolean(),
        attempts: z.number().int().min(0).max(10),
        heldMicrousd: z.number().int().min(0).max(1_000_000),
        startsAt: z.string().nullable(),
        endsAt: z.string().nullable(),
        operatorId: z.uuid().nullable(),
      })
      .strict()
      .safeParse(result.data);
    return {
      mode: "legacy" as const,
      statusFailure: syntheticStatusFailure(result.error, parsed.success),
      configurationEnabled,
      // Operator-supplied deployment label, not independent proof of deployed Git bytes.
      revision: operatorDeploymentRevision(revision),
      guard: !result.error && parsed.success ? parsed.data : null,
      research: null,
    };
  });

/** Existing signed-in operator only, independently enforced by the database. Never enables AI. */
export const emergencyDisableSyntheticAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ reference: z.string().min(1).max(200) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
    };
    const result = await client.rpc(
      process.env["MITO_MEDICAL_RESEARCH_POLICY_ENABLED"] === "true"
        ? "medical_research_pause"
        : "medical_demo_disable",
      { p_ref: data.reference },
    );
    if (result.error)
      throw new Error(
        "Emergency disable not confirmed; use trusted SQL retaining-disable procedure.",
      );
    return { disabled: true as const };
  });
