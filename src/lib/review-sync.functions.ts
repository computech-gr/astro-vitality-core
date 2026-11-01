/**
 * v9 explicit cloud review sync (user-initiated only).
 *
 * - Identity comes from the verified bearer JWT (requireSupabaseAuth); the
 *   caller-scoped SECURITY DEFINER RPCs in the PENDING migration
 *   supabase/pending/20261101000000_v9_review_sync.sql re-derive auth.uid()
 *   and check exact mission + crew Ground Medical membership on the server.
 *   Client role checks are never trusted. No service-role key is used.
 * - Only review-event metadata is accepted (strict schemas below); values,
 *   units, documents, excerpts and AI drafts are rejected by construction.
 * - Until the owner applies the migration the RPCs do not exist and every
 *   call returns code "migration_required"; nothing is claimed as synced.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyReviewSyncError, type ReviewSyncErrorCode } from "@/domain/health-intelligence/review-sync";

const scopeSchema = z
  .object({
    missionId: z.string().min(1).max(128),
    crewMemberId: z.string().min(1).max(128),
    provenance: z.enum(["synthetic", "real"]),
  })
  .strict();

const iso = z.string().min(10).max(40).refine((v) => Number.isFinite(Date.parse(v)), "invalid instant");

const attestationSchema = z
  .object({
    eventId: z.string().regex(/^att-[0-9a-f]{8}$/),
    action: z.enum(["attest", "revoke"]),
    recordId: z.string().min(1).max(200),
    recordFingerprint: z.string().regex(/^rfp-[0-9a-f]{8}$/),
    metricId: z.string().min(1).max(128),
    badge: z.enum(["bone", "immune", "cardiovascular", "behavioral", "wearable", "device"]),
    actorUserId: z.string().uuid(),
    reason: z.string().trim().min(10).max(500),
    decidedAt: iso,
    batchId: z.string().regex(/^atb-[0-9a-f]{8}$/),
    supersedesEventId: z.string().regex(/^att-[0-9a-f]{8}$/).nullable(),
  })
  .strict();

const correctionSchema = z
  .object({
    intentId: z.string().regex(/^corr-[0-9a-f]{16}$/),
    originalRecordId: z.string().min(1).max(200),
    correctedRecordId: z.string().min(1).max(200),
    metricId: z.string().min(1).max(128),
    actorUserId: z.string().uuid(),
    reason: z.string().trim().min(10).max(500),
    decidedAt: iso,
  })
  .strict();

const pushInput = z
  .object({
    scope: scopeSchema,
    attestations: z.array(attestationSchema).max(500),
    corrections: z.array(correctionSchema).max(500),
  })
  .strict();

const pullInput = z
  .object({
    scope: scopeSchema,
    kind: z.enum(["attestation", "correction"]),
    afterSeq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    limit: z.number().int().min(1).max(500),
  })
  .strict();

export type ReviewSyncFailure = { ok: false; code: ReviewSyncErrorCode; message: string };

const messages: Record<ReviewSyncErrorCode, string> = {
  migration_required: "Cloud review sync unavailable: migration required",
  forbidden: "The server refused: an active Ground Medical membership for this exact mission and crew member is required.",
  invalid: "The server rejected the review metadata as invalid. Nothing was synced.",
  unavailable: "Cloud review sync is temporarily unavailable. Local events are kept; try again.",
};
const fail = (code: ReviewSyncErrorCode): ReviewSyncFailure => ({ ok: false, code, message: messages[code] });

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;

function classify(error: { code?: string }): ReviewSyncFailure {
  // Log only the failure class; never payloads or tokens.
  console.error("[v9 review sync] refused", error.code ?? "unknown");
  return fail(classifyReviewSyncError(error.code));
}

export interface PushItemResult {
  kind: "attestation" | "correction";
  id: string;
  status: "inserted" | "duplicate" | "conflict" | "rejected";
  receivedAt: string | null;
  detail: string | null;
}

export const pushReviewEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pushInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; results: PushItemResult[] } | ReviewSyncFailure> => {
    const rpc = context.supabase.rpc as unknown as Rpc;
    const { data: result, error } = await rpc.call(context.supabase, "review_sync_append_v1", {
      p_mission_id: data.scope.missionId,
      p_crew_member_id: data.scope.crewMemberId,
      p_provenance: data.scope.provenance,
      p_attestations: data.attestations,
      p_corrections: data.corrections,
    });
    if (error) return classify(error);
    if (!Array.isArray(result)) return fail("unavailable");
    const results: PushItemResult[] = result.slice(0, 1000).flatMap((r: Record<string, unknown>) => {
      const kind = r["kind"], status = r["status"], id = r["id"];
      if ((kind !== "attestation" && kind !== "correction") || typeof id !== "string") return [];
      if (status !== "inserted" && status !== "duplicate" && status !== "conflict" && status !== "rejected") return [];
      return [{ kind, id, status, receivedAt: typeof r["received_at"] === "string" ? r["received_at"] : null, detail: typeof r["detail"] === "string" ? r["detail"] : null }];
    });
    return { ok: true, results };
  });

export type SyncRow = Record<string, string | number | null>;

export const pullReviewEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pullInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; rows: SyncRow[]; lastSeq: number; hasMore: boolean } | ReviewSyncFailure> => {
    const rpc = context.supabase.rpc as unknown as Rpc;
    const { data: rows, error } = await rpc.call(context.supabase, "review_sync_list_v1", {
      p_mission_id: data.scope.missionId,
      p_crew_member_id: data.scope.crewMemberId,
      p_provenance: data.scope.provenance,
      p_kind: data.kind,
      p_after_seq: data.afterSeq,
      p_limit: data.limit,
    });
    if (error) return classify(error);
    if (!Array.isArray(rows)) return fail("unavailable");
    // Normalize to plain serializable scalars; nested or unexpected values are dropped.
    const clean: SyncRow[] = rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" || typeof v === "number" ? v : null])));
    const lastSeq = clean.reduce((m, r) => Math.max(m, Number(r["received_seq"] ?? 0) || 0), data.afterSeq);
    return { ok: true, rows: clean, lastSeq, hasMore: clean.length >= data.limit };
  });
