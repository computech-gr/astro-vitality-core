/**
 * P41 server functions: literature retrieval, citation verification, AI draft
 * and approval attestation for biomarker interpretations.
 *
 * Every function requires a signed-in caller AND an active Researcher mission
 * membership read from the database as that caller (RLS applies; no service
 * role). Client-supplied roles are never trusted. Inputs carry catalog concepts
 * and public reference IDs only — never observations, values or crew identity.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ResearchDeps } from "./interpretation-research.server";

const concept = z.object({
  label: z.string().min(1).max(120),
  aliases: z.array(z.string().min(1).max(120)).max(6),
  domain: z.enum(["bone", "cardiovascular", "immune", "behavioral"]).nullable(),
});
const key = z.string().min(3).max(400);

type Ctx = { supabase: { from: (t: string) => unknown }; userId: string };
async function requireResearcher(context: Ctx): Promise<{ ok: true } | { ok: false; code: "forbidden"; message: string }> {
  const q = context.supabase.from("mission_memberships") as {
    select: (c: string) => { eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> } } } };
  };
  const { data, error } = await q.select("mission_id").eq("user_id", context.userId).eq("active", true).eq("role", "researcher").limit(1);
  if (error || !data?.length) return { ok: false, code: "forbidden", message: "Only an active Researcher can use interpretation research." };
  return { ok: true };
}

function deps(userId: string): ResearchDeps {
  return {
    env: (n) => process.env[n],
    // workerd requires the global receiver for fetch.
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
    userId,
    audit: (event) => {
      try {
        console.info(JSON.stringify({ ...event, at: new Date().toISOString() }));
      } catch {
        /* audit never changes outcomes */
      }
    },
  };
}

/** Retrieve literature for one biomarker concept (PubMed abstracts, NASA NTRS public records). */
export const searchInterpretationLiterature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ key, concept }).parse(v))
  .handler(async ({ data, context }) => {
    const gate = await requireResearcher(context as unknown as Ctx);
    if (!gate.ok) return gate;
    const { searchLiteratureCore } = await import("./interpretation-research.server");
    return searchLiteratureCore(data.key, data.concept, deps(context.userId));
  });

/** Verify that one citation identifier (PMID, PMCID, DOI, NASA NTRS ID) exists. */
export const verifyInterpretationCitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ citation: z.string().min(1).max(500) }).parse(v))
  .handler(async ({ data, context }) => {
    const gate = await requireResearcher(context as unknown as Ctx);
    if (!gate.ok) return gate;
    const { verifyIdentifierCore } = await import("./interpretation-research.server");
    return verifyIdentifierCore(data.citation, deps(context.userId));
  });

/** Evidence-aware AI draft from server-retrieved references; never approves anything. */
export const draftInterpretationFromEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ key, concept, refIds: z.array(z.string().regex(/^(pmid:\d{1,9}|ntrs:\d{11})$/)).min(1).max(10) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const gate = await requireResearcher(context as unknown as Ctx);
    if (!gate.ok) return gate;
    const { draftInterpretationCore } = await import("./interpretation-research.server");
    return draftInterpretationCore(data, deps(context.userId));
  });

/** Server attestation of one device-recorded APPROVE / REVOKE event of the caller. */
export const attestInterpretationDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ event: z.record(z.string(), z.unknown()) }).parse(v))
  .handler(async ({ data, context }) => {
    const gate = await requireResearcher(context as unknown as Ctx);
    if (!gate.ok) return gate;
    const { attestDecisionCore } = await import("./interpretation-research.server");
    return attestDecisionCore(data.event, deps(context.userId));
  });
