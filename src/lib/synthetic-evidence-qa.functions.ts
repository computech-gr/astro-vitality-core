import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { syntheticDemoMode } from "@/domain/health-intelligence/production-synthetic-demo";
type PendingRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export const askSyntheticEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z.string().max(1000),
        consent: z.literal(true),
        provenance: z.literal("synthetic"),
        missionId: z.string().min(1).max(100),
        crewMemberId: z.string().min(1).max(100),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Separate from persistence and test-environment switches. Defaults off.
    const { answerSyntheticQuestion } = await import("./synthetic-evidence-qa.server");
    const mode = syntheticDemoMode({
      production: process.env["MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED"],
      isolated: process.env["MITO_MEDICAL_QA_ISOLATED_ENABLED"],
      environment: process.env["MITO_MEDICAL_TEST_ENVIRONMENT"],
    });
    const response = await answerSyntheticQuestion(data, {
      enabled: mode !== "disabled",
      productionSynthetic: mode === "production-synthetic",
      apiKey: process.env["OPENAI_API_KEY"],
      model: process.env["MITO_MEDICAL_AI_MODEL"],
      rpc: async (name, args) =>
        await (context.supabase as unknown as PendingRpcClient).rpc(name, args),
      providerFetch: fetch,
      now: () => new Date().toISOString(),
    });
    const body = (await response.json()) as {
      error?: string;
      text?: string;
      citedIds?: string[];
      evidence_sha256?: string;
      generated_at?: string;
      warning?: string;
    };
    return { status: response.status, ...body };
  });
