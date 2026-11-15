import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Rpc } from "./p36-scientific-authorization.server";

const mission = z.string().min(1).max(100);
const uuid = z.string().uuid();
const term = z.string().regex(/^ubt-[0-9a-f]{8}$/);
const domain = z.enum(["bone", "immune", "cardiovascular", "behavioral"]);
const rpcOf = (supabase: { rpc: unknown }): Rpc => (fn, args) => (supabase.rpc as unknown as Rpc).call(supabase, fn, args);

/** P72.8 classification, caller capabilities and decision records of one mission (fails closed). */
export const getDemoDecisionStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ missionId: mission }).parse(v))
  .handler(async ({ data, context }) => {
    const { getDemoDecisionStateCore } = await import("./p728-demo-decision.server");
    return getDemoDecisionStateCore(rpcOf(context.supabase), data.missionId);
  });

/** One bounded batch of Researcher DEMO SCIENTIFIC APPROVE / REJECT decisions with rationale. */
export const researcherDemoDecideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: mission,
        decision: z.enum(["APPROVE", "REJECT"]),
        rationale: z.string().max(2000),
        evidenceRefs: z.array(z.string().max(300)).max(20),
        items: z
          .array(
            z.object({
              submissionId: uuid,
              termId: term,
              exactUnit: z.string().max(64),
              displayName: z.string().max(120),
              domain: domain.nullable(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { researcherDemoDecideCore } = await import("./p728-demo-decision.server");
    return researcherDemoDecideCore(rpcOf(context.supabase), context.userId, data);
  });

/** One bounded batch of Ground Medical ACTIVATE / DECLINE decisions with rationale. */
export const medicalDemoDecideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: mission,
        decision: z.enum(["ACTIVATE", "DECLINE"]),
        rationale: z.string().max(2000),
        items: z
          .array(z.object({ decisionEventId: uuid, expectedEntrySha256: z.string().regex(/^[0-9a-f]{64}$/) }))
          .min(1)
          .max(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { medicalDemoDecideCore } = await import("./p728-demo-decision.server");
    return medicalDemoDecideCore(rpcOf(context.supabase), context.userId, data);
  });
