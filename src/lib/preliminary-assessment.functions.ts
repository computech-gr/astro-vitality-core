/**
 * P54 server function: AI-assisted preliminary medical assessment draft.
 *
 * Requires a signed-in caller with an ACTIVE Ground Medical membership for the
 * exact mission and crew member, read from the database as that caller (RLS
 * applies; no service role). Accepts only a bounded, de-identified packet; the
 * mission ID is used for the membership check and synthetic-demo reference
 * matching and is never forwarded to the AI provider.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AssessmentPacket } from "@/domain/health-intelligence/preliminary-medical-assessment";

const short = z.string().max(200);
const context = z.object({ text: z.string().min(1).max(1200), citationIds: z.array(short).max(10) });
const status = z.enum(["within_verified_reference", "below_verified_reference", "above_verified_reference", "clinically_concerning", "insufficient_evidence"]);
const domain = z.enum(["bone", "cardiovascular", "immune", "behavioral"]);
const packet = z.object({
  schema: z.literal("mitochondria.p54-assessment-packet.v1"),
  provenance: z.enum(["synthetic", "real"]),
  items: z
    .array(
      z.object({
        ref: z.string().regex(/^O\d{1,4}$/),
        catalogId: short,
        name: short,
        domain,
        value: z.string().max(120),
        unit: z.string().max(80),
        previousValue: z.string().max(120).nullable(),
        change: z.string().max(200).nullable(),
        status,
        severity: z.enum(["red", "amber", "normal", "neutral"]),
        reference: short.nullable(),
        measures: context.nullable(),
        higher: context.nullable(),
        lower: context.nullable(),
        comparability: z.array(context).max(6),
        interpretationApproved: z.boolean(),
        syntheticDemo: z.boolean(),
      }),
    )
    .max(400),
  citations: z.array(z.object({ id: short, title: z.string().max(400), locator: z.string().max(300) })).max(400),
  domainsWithoutData: z.array(domain).max(4),
  crossDomain: z.array(z.string().max(1200)).max(20),
});

type Ctx = { supabase: { from: (t: string) => unknown }; userId: string };
type Query = { select: (c: string) => { eq: (a: string, b: unknown) => Query2 } };
type Query2 = { eq: (a: string, b: unknown) => Query2; limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> };

async function isGroundMedical(context: Ctx, missionId: string, crewMemberId: string) {
  const q = context.supabase.from("mission_memberships") as Query;
  const { data, error } = await q
    .select("id")
    .eq("user_id", context.userId)
    .eq("mission_id", missionId)
    .eq("crew_member_id", crewMemberId)
    .eq("role", "ground_medical")
    .eq("active", true)
    .limit(1);
  return !error && Boolean(data?.length);
}

export const draftPreliminaryAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ missionId: z.string().min(1).max(120), crewMemberId: z.string().min(1).max(120), packet }).parse(v))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    if (!(await isGroundMedical(ctx, data.missionId, data.crewMemberId)))
      return { ok: false as const, code: "forbidden" as const, message: "Only an active Ground Medical clinician for this exact mission and crew member can request an AI-assisted assessment." };
    const { draftPreliminaryAssessmentCore } = await import("./preliminary-assessment.server");
    return draftPreliminaryAssessmentCore(
      { missionId: data.missionId, packet: data.packet as AssessmentPacket },
      {
        env: (n) => process.env[n],
        fetch: (input, init) => fetch(input, init),
        now: () => new Date(),
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
