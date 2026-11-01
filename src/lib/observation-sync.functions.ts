/**
 * v9.4 explicit cross-device observation sync (user-initiated only).
 *
 * - Identity comes from the verified bearer JWT (requireSupabaseAuth). The server
 *   re-checks the caller's own active membership for the exact mission + crew
 *   (crew_self for that crew member, or scoped ground_medical); the caller-scoped
 *   SECURITY DEFINER RPCs in supabase/pending/20261102000000_v94_observation_sync.sql
 *   check again (including active crew assignment) and RLS limits direct reads.
 *   No service-role key is used.
 * - Payloads are encrypted here with AES-256-GCM under server-only keys before they
 *   reach the database (observation-sync.server.ts); the database stores ciphertext.
 * - Default-off: MITO_OBSERVATION_SYNC_ENABLED, a configured key and, for REAL data,
 *   MITO_OBSERVATION_SYNC_REAL_ENABLED plus explicit per-run confirmation. Until the
 *   migration is applied every call returns "migration required"; nothing is claimed.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OBSERVATION_SYNC_BATCH_MAX, OBSERVATION_SYNC_PAGE_MAX, type ObservationSyncEvent } from "@/domain/health-intelligence/observation-sync";

const id = z.string().min(1).max(128);
const iso = z.string().min(10).max(40).refine((v) => Number.isFinite(Date.parse(v)), "invalid instant");
const scopeSchema = z.object({ missionId: id, crewMemberId: id, provenance: z.enum(["synthetic", "real"]) }).strict();

const observationSchema = z
  .object({
    schema: z.literal("mitochondria.unified-observation.v1"),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{7,127}$/),
    missionId: id,
    crewMemberId: id,
    metricId: z.string().min(1).max(128),
    domain: z.string().min(1).max(64),
    value: z.string().min(1).max(64),
    originalUnit: z.string().min(1).max(64),
    observedAt: iso,
    source: z
      .object({
        kind: z.enum(["manual", "csv", "xlsx", "json", "fhir", "pdf_text", "ocr", "device", "self_assessment"]),
        label: z.string().min(1).max(300),
        documentName: z.string().max(300).optional(),
        documentSha256: z.string().max(128).optional(),
        excerpt: z.string().max(4000).optional(),
      })
      .strict(),
    provenance: z.enum(["synthetic", "real"]),
    quality: z.object({ reviewerConfirmed: z.boolean(), duplicateWarningAcknowledged: z.boolean().optional() }).strict(),
    reviewState: z.enum(["pending_review", "accepted", "rejected"]),
    status: z.enum(["active", "erroneous"]).optional(),
    statusReason: z.string().max(500).optional(),
    supersedesId: z.string().max(128).optional(),
    correction: z
      .object({
        intentId: z.string().max(64),
        originalRecordId: z.string().max(128),
        actorUserId: z.string().uuid(),
        actorRole: z.literal("ground_medical"),
        reason: z.string().max(500),
        decidedAt: iso,
      })
      .strict()
      .optional(),
    recordedAt: iso,
  })
  .strict();

const eventSchema = z
  .object({
    eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{7,127}:(entry|status)$/),
    eventKind: z.enum(["entry", "status"]),
    observation: observationSchema,
  })
  .strict();

const pushInput = z
  .object({ scope: scopeSchema, events: z.array(eventSchema).max(OBSERVATION_SYNC_BATCH_MAX), realDataConfirmed: z.boolean() })
  .strict();
const pullInput = z
  .object({
    scope: scopeSchema,
    afterSeq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    limit: z.number().int().min(1).max(OBSERVATION_SYNC_PAGE_MAX),
  })
  .strict();

type Ctx = { supabase: { rpc: unknown; from: (t: string) => unknown }; userId: string };

async function depsFor(context: Ctx) {
  const supabase = context.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;
    from: (t: "mission_memberships") => {
      select: (c: string) => { eq: (k: string, v: unknown) => { eq: (k: string, v: unknown) => { eq: (k: string, v: unknown) => Promise<{ data: unknown; error: unknown }> } } };
    };
  };
  return {
    env: (name: string) => process.env[name],
    rpc: (fn: string, args: Record<string, unknown>) => supabase.rpc(fn, args),
    memberships: async (missionId: string) => {
      const { data, error } = await supabase
        .from("mission_memberships")
        .select("role, crew_member_id, active")
        .eq("mission_id", missionId)
        .eq("user_id", context.userId)
        .eq("active", true);
      if (error || !Array.isArray(data)) return null;
      return data as { role: string; crew_member_id: string | null; active: boolean }[];
    },
  };
}

export const pushObservationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pushInput.parse(input))
  .handler(async ({ data, context }) => {
    const { pushObservationEventsCore } = await import("./observation-sync.server");
    return pushObservationEventsCore(
      { scope: data.scope, events: data.events as unknown as ObservationSyncEvent[], realDataConfirmed: data.realDataConfirmed },
      await depsFor(context as unknown as Ctx),
    );
  });

export const pullObservationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pullInput.parse(input))
  .handler(async ({ data, context }) => {
    const { pullObservationEventsCore } = await import("./observation-sync.server");
    return pullObservationEventsCore(data, await depsFor(context as unknown as Ctx));
  });
