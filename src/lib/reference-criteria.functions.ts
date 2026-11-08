/**
 * P57 server function: attest reference-criteria decisions recorded on the
 * Researcher's device. Requires a signed-in caller; active Researcher mission
 * memberships are read from the database as that caller (RLS applies, no
 * service role). Inputs are catalog-level decision events only — never
 * observations, values or crew identity.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { from: (t: string) => unknown }; userId: string };
type Q = { select: (c: string) => { eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => { limit: (n: number) => Promise<{ data: { mission_id: string }[] | null; error: unknown }> } } } } };

async function researcherMissions(context: Ctx): Promise<string[]> {
  const q = context.supabase.from("mission_memberships") as Q;
  const { data, error } = await q.select("mission_id").eq("user_id", context.userId).eq("active", true).eq("role", "researcher").limit(200);
  if (error || !data) return [];
  return [...new Set(data.map((r) => r.mission_id).filter((x): x is string => typeof x === "string"))];
}

export const attestReferenceCriteriaDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ events: z.array(z.record(z.string(), z.unknown())).min(1).max(50) }).parse(v))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const missions = await researcherMissions(ctx);
    const { attestCriteriaDecisionsCore } = await import("./reference-criteria.server");
    return attestCriteriaDecisionsCore(data.events, { env: (n) => process.env[n], now: () => new Date(), userId: ctx.userId, researcherMissions: missions });
  });

/** Missions where the caller is an active Researcher (for the approval form; read as the caller). */
export const listResearcherMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ missions: await researcherMissions(context as unknown as Ctx) }));
