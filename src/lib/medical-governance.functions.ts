import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DurableReviewEvent } from "@/domain/health-intelligence/medical-governance";
import type { SyntheticEvidenceSnapshot } from "@/domain/health-intelligence/synthetic-evidence";
import { validateAIDraft } from "@/domain/health-intelligence/ai-draft-validation";
import {
  buildSyntheticReviewExport,
  validateSyntheticSnapshot,
} from "@/domain/health-intelligence/synthetic-review-export";

const scope = z
  .object({ missionId: z.string().min(1).max(100), crewMemberId: z.string().min(1).max(100) })
  .strict();
// Generated database types must not be edited for an unapplied migration.
type PendingRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export const getSyntheticMedicalEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (process.env["MITO_MEDICAL_GOVERNANCE_V3_ENABLED"] !== "true")
      return { available: false as const, snapshot: null };
    const client = context.supabase as unknown as PendingRpcClient;
    const result = await client.rpc("medical_v3_fixture_snapshot", {});
    if (result.error || !result.data)
      throw new Error("Authoritative synthetic source unavailable.");
    return { available: true as const, snapshot: result.data as SyntheticEvidenceSnapshot };
  });

export const getMedicalReviewHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => scope.parse(data))
  .handler(async ({ data, context }) => {
    if (process.env["MITO_MEDICAL_GOVERNANCE_V3_ENABLED"] !== "true")
      return {
        available: false,
        events: [] as DurableReviewEvent[],
        reason:
          "Persistent review history is disabled pending migration approval. Local review remains session-only.",
      };
    const client = context.supabase as unknown as PendingRpcClient;
    const result = await client.rpc("medical_v3_review_history", {
      p_mission: data.missionId,
      p_crew: data.crewMemberId,
    });
    if (result.error)
      throw new Error(
        "Review history unavailable or access denied. No verified status can be shown.",
      );
    return {
      available: true,
      events: result.data as DurableReviewEvent[],
      reason: "Server history; approvals require current authoritative evidence.",
    };
  });

export const appendMedicalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    scope
      .extend({
        type: z.enum(["draft_created", "returned", "approved", "revoked", "superseded"]),
        previousId: z.uuid().nullable(),
        requestId: z.uuid(),
        evidenceSha256: z.string().regex(/^sha256-[a-f0-9]{64}$/),
        draftText: z.string().min(1).max(12000),
        finalText: z.string().max(12000),
        rationale: z.string().min(1).max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (process.env["MITO_MEDICAL_GOVERNANCE_V3_ENABLED"] !== "true")
      throw new Error(
        "Persistence disabled pending owner-approved migration; no review was saved.",
      );
    const client = context.supabase as unknown as PendingRpcClient;
    if (data.type !== "revoked") {
      const source = await client.rpc("medical_v3_fixture_snapshot", {});
      if (source.error || !source.data)
        throw new Error("Authoritative synthetic source unavailable.");
      const snapshot = source.data as SyntheticEvidenceSnapshot;
      if (
        snapshot.missionId !== data.missionId ||
        snapshot.crewMemberId !== data.crewMemberId ||
        snapshot.sha256 !== data.evidenceSha256
      )
        throw new Error("Stale or mismatched synthetic evidence.");
      if (
        !validateAIDraft(data.draftText, snapshot.evidence).ok ||
        (data.finalText.trim() && !validateAIDraft(data.finalText, snapshot.evidence).ok)
      )
        throw new Error("Invalid evidence citations or unsupported statements; review rejected.");
    }
    const result = await client.rpc("medical_v3_append_review", {
      p_mission: data.missionId,
      p_crew: data.crewMemberId,
      p_type: data.type,
      p_previous: data.previousId,
      p_request: data.requestId,
      p_sha: data.evidenceSha256,
      p_draft: data.draftText,
      p_final: data.finalText,
      p_rationale: data.rationale,
    });
    if (result.error)
      throw new Error(
        "Review not saved: authorization, revision or authoritative evidence verification failed.",
      );
    return result.data as DurableReviewEvent;
  });

export const exportSyntheticMedicalHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => scope.parse(data))
  .handler(async ({ data, context }) => {
    if (process.env["MITO_MEDICAL_GOVERNANCE_V3_ENABLED"] !== "true")
      throw new Error("History export disabled; no file generated.");
    const client = context.supabase as unknown as PendingRpcClient;
    const source = await client.rpc("medical_v3_fixture_snapshot", {});
    if (source.error) throw new Error("Authorized evidence unavailable.");
    const snapshot = await validateSyntheticSnapshot(source.data);
    if (snapshot.missionId !== data.missionId || snapshot.crewMemberId !== data.crewMemberId)
      throw new Error("Synthetic export scope mismatch.");
    const history = await client.rpc("medical_v3_review_history", {
      p_mission: data.missionId,
      p_crew: data.crewMemberId,
    });
    if (history.error) throw new Error("Authorized history unavailable; export denied.");
    const check = await client.rpc("medical_v3_fixture_snapshot", {});
    if (check.error || (await validateSyntheticSnapshot(check.data)).sha256 !== snapshot.sha256)
      throw new Error("Evidence changed during export; retry with current evidence.");
    return buildSyntheticReviewExport(snapshot, history.data, new Date().toISOString());
  });
