/**
 * P58 server function: AI-assisted elaboration of the preliminary clinical
 * assessment. Requires a signed-in caller with an ACTIVE Ground Medical
 * membership for the exact mission and crew member, read as that caller (RLS
 * applies; no service role). The mission/crew IDs are used only for the
 * membership check and never forwarded to the AI provider.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ClinicalPacket } from "@/domain/health-intelligence/p58-clinical-reasoning";

const s = (n: number) => z.string().max(n);
const packet = z.object({
  schema: z.literal("mitochondria.p58-clinical-packet.v1"),
  provenance: z.enum(["synthetic", "real"]),
  items: z
    .array(
      z.object({
        ref: z.string().regex(/^O\d{1,4}$/),
        catalogId: s(200),
        name: s(200),
        domain: s(80),
        unit: s(80),
        series: z.array(z.object({ day: z.number().int().min(0).max(100_000), value: s(120) })).max(200),
        severity: z.enum(["red", "amber", "normal", "neutral"]),
        classification: s(300),
        reviewFlags: z.array(s(600)).max(10),
      }),
    )
    .max(200),
  concerns: z
    .array(
      z.object({
        id: s(80),
        title: s(200),
        observationRefs: z.array(z.string().regex(/^O\d{1,4}$/)).max(40),
        priority: z.enum(["high", "prompt", "measurement_check", "routine"]),
        supporting: z.array(s(800)).max(20),
        contradicting: z.array(s(800)).max(20),
        criteria: z.array(s(800)).max(10),
        missing: z.array(s(400)).max(20),
      }),
    )
    .max(20),
});

type Ctx = { supabase: { from: (t: string) => unknown }; userId: string };
type Query = { select: (c: string) => { eq: (a: string, b: unknown) => Query2 } };
type Query2 = { eq: (a: string, b: unknown) => Query2; limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> };

async function isGroundMedical(context: Ctx, missionId: string, crewMemberId: string) {
  const q = context.supabase.from("mission_memberships") as Query;
  const { data, error } = await q.select("id").eq("user_id", context.userId).eq("mission_id", missionId).eq("crew_member_id", crewMemberId).eq("role", "ground_medical").eq("active", true).limit(1);
  return !error && Boolean(data?.length);
}

export const elaborateClinicalAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ missionId: z.string().min(1).max(120), crewMemberId: z.string().min(1).max(120), packet }).parse(v))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    if (!(await isGroundMedical(ctx, data.missionId, data.crewMemberId)))
      return { ok: false as const, code: "forbidden" as const, message: "Only an active Ground Medical clinician for this exact mission and crew member can request AI-assisted clinical reasoning." };
    const { elaborateClinicalAssessmentCore } = await import("./clinical-reasoning.server");
    return elaborateClinicalAssessmentCore(
      { packet: data.packet as ClinicalPacket },
      {
        env: (n) => process.env[n],
        fetch: (input, init) => fetch(input, init),
        userId: ctx.userId,
        audit: (event) => {
          try {
            console.info(JSON.stringify({ ...event, at: new Date().toISOString() }));
          } catch {
            /* audit never changes outcomes */
          }
        },
      },
    );
  });
