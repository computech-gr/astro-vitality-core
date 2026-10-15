/**
 * P36.4 synthetic-only Cloud submission service.
 *
 * - Server-side only: identity comes from the verified bearer JWT (requireSupabaseAuth);
 *   the database function re-derives auth.uid() and re-checks active Crew Self membership.
 * - Never uses the service-role key; RLS/grants apply as the signed-in user.
 * - Never receives original documents: only the SHA-256, filename and reviewed values.
 * - Disabled unless the server env flag P36_CLOUD_SUBMISSION_ENABLED === "true" AND the staged
 *   database function exists (owner-approved deployment).
 */
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import registry from "../../data/scientific/p36-biomarker-source-registry.v1.json";
import {
  validateSyntheticCloudHandoff,
  type SyntheticCloudHandoff,
} from "@/domain/biomarkers/p364-cloud-handoff-contract";

// Scoped to this function only: attaches the current session bearer on the client.
const attachSessionBearer = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

const exactUnits = new Map(
  registry.metrics
    .filter((m) => typeof m.originalUnit === "string" && m.originalUnit.trim())
    .map((m) => [m.id, (m.originalUnit as string).trim()]),
);

const handoffSchema = z.object({
  schema: z.literal("mitochondria.p36.4.synthetic-cloud-handoff.v1"),
  syntheticOnly: z.literal(true),
  missionId: z.string().min(1).max(128),
  crewMemberId: z.string().min(1).max(128),
  observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceFilename: z.string().min(1).max(255),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observations: z
    .array(
      z
        .object({
          metricId: z.string().min(1).max(128),
          value: z.string().min(1).max(32),
          unit: z.string().min(1).max(64),
          sourceExcerpt: z.string().min(1).max(500),
        })
        .strict(),
    )
    .min(1)
    .max(100),
});
const inputSchema = z.object({
  handoff: handoffSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
});

export type P36SubmissionResult =
  | { ok: true; status: "submitted" | "replayed"; batchId: string; itemCount: number }
  | { ok: false; code: P36SubmissionErrorCode; message: string };
export type P36SubmissionErrorCode =
  "not_active" | "invalid" | "forbidden" | "duplicate" | "unavailable";

const messages: Record<P36SubmissionErrorCode, string> = {
  not_active: "Cloud submission is not active in this deployment.",
  invalid: "The reviewed batch did not pass exact catalog validation.",
  forbidden: "An active Crew Self membership for this mission and crew member is required.",
  duplicate: "This synthetic source and date has already been submitted.",
  unavailable: "Cloud submission is temporarily unavailable. Nothing was saved.",
};
const fail = (code: P36SubmissionErrorCode): P36SubmissionResult => ({
  ok: false,
  code,
  message: messages[code],
});

/** Exact registry check (defense in depth; the database repeats it against its catalog). */
export function matchesExactRegistry(handoff: SyntheticCloudHandoff): boolean {
  return handoff.observations.every((o) => exactUnits.get(o.metricId) === o.unit);
}

export const getP36CloudSubmissionStatus = createServerFn({ method: "GET" }).handler(async () => ({
  enabled: process.env["P36_CLOUD_SUBMISSION_ENABLED"] === "true",
}));

export const submitSyntheticReviewBatch = createServerFn({ method: "POST" })
  .middleware([attachSessionBearer, requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<P36SubmissionResult> => {
    if (process.env["P36_CLOUD_SUBMISSION_ENABLED"] !== "true") return fail("not_active");
    const handoff = data.handoff as SyntheticCloudHandoff;
    if (!validateSyntheticCloudHandoff(handoff) || !matchesExactRegistry(handoff)) {
      return fail("invalid");
    }
    // The staged RPC is not in generated types until the owner applies the migration.
    const rpc = context.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    const { data: result, error } = await rpc.call(
      context.supabase,
      "p36_submit_synthetic_review_batch",
      {
        p_mission_id: handoff.missionId,
        p_crew_member_id: handoff.crewMemberId,
        p_observed_on: handoff.observedOn,
        p_source_filename: handoff.sourceFilename,
        p_source_sha256: handoff.sourceSha256,
        p_items: handoff.observations,
        p_idempotency_key: data.idempotencyKey,
        p_synthetic_attestation: true,
      },
    );
    if (error) {
      // Log only the class of failure, never values, excerpts or tokens.
      console.error("[P36.4] submission refused", error.code ?? "unknown");
      if (error.code === "42501") return fail("forbidden");
      if (error.code === "23505") return fail("duplicate");
      if (error.code === "22023") return fail("invalid");
      if (error.code === "PGRST202" || error.code === "42883") return fail("not_active");
      return fail("unavailable");
    }
    const r = result as { status?: string; batch_id?: string; item_count?: number } | null;
    if (!r || (r.status !== "submitted" && r.status !== "replayed") || !r.batch_id) {
      return fail("unavailable");
    }
    return {
      ok: true,
      status: r.status,
      batchId: r.batch_id,
      itemCount: Number(r.item_count ?? 0),
    };
  });


// Read-only, crew-scoped synthetic history. The database function checks auth.uid(),
// current Crew Self membership, mission and crew again; no table SELECT grants.
const historyInput = z.object({ missionId: z.string().min(1).max(128), crewMemberId: z.string().min(1).max(128) }).strict();
export type SyntheticHistoryRow = { batchId: string; observedOn: string; createdAt: string; status: string; itemCount: number };
export const listSyntheticReviewHistory = createServerFn({ method: "POST" })
  .middleware([attachSessionBearer, requireSupabaseAuth])
  .inputValidator((input: unknown) => historyInput.parse(input))
  .handler(async ({ data, context }): Promise<{ok:true; records:SyntheticHistoryRow[]} | {ok:false; message:string}> => {
    if (process.env["P36_CLOUD_SUBMISSION_ENABLED"] !== "true") return {ok:false, message:"Cloud history is not activated."};
    const rpc = context.supabase.rpc as unknown as (fn:string, args:Record<string,unknown>) => Promise<{data:unknown; error:{code?:string}|null}>;
    const {data: rows, error} = await rpc.call(context.supabase, "p36_list_synthetic_review_history", {p_mission_id:data.missionId, p_crew_member_id:data.crewMemberId});
    if (error || !Array.isArray(rows)) return {ok:false, message:"Saved reviews unavailable or access denied."};
    return {ok:true, records: rows.slice(0, 100).map((row:Record<string,unknown>) => ({
      batchId:String(row["batch_id"] ?? ""), observedOn:String(row["observed_on"] ?? ""),
      createdAt:String(row["created_at"] ?? ""), status:String(row["review_status"] ?? ""), itemCount:Number(row["item_count"] ?? 0),
    }))};
  });
