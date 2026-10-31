/**
 * P48 FINAL — Crew Self-only synthetic observation intake (server).
 *
 * - Default OFF: does nothing unless the server env flag P48_SYNTHETIC_INTAKE_ENABLED is "true".
 * - Identity comes from the verified bearer (requireSupabaseAuth); every read and write runs as
 *   the signed-in user, so RLS and the security-definer `ingest_mission_event` checks apply.
 *   No service role, no direct table writes; the existing RPC is the sole writer.
 * - Eligibility is re-derived on every call: dedicated P48_SYNTHETIC_DEMO mission, open
 *   status, the caller's own active crew_self membership for exactly this crew, and no other
 *   role in that mission (no operator/researcher/medical bypass).
 * - Requires explicit irreversible-write confirmation bound to the exact planned count.
 * - Returns and logs counts/categories only; never values, identifiers or tokens.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSyntheticBatch,
  P48_MAX_BATCH,
  P48_SYNTHETIC_MISSION_CODE,
  syntheticIntakeEligibility,
  tallyIngestStatuses,
  type EligibilityFacts,
  type EligibilityReason,
  type SubmissionCounts,
} from "@/domain/companion/synthetic-intake";

const flagEnabled = () => process.env["P48_SYNTHETIC_INTAKE_ENABLED"] === "true";

const scopeSchema = z
  .object({ missionId: z.string().min(1).max(128), crewMemberId: z.string().min(1).max(128) })
  .strict();

const submitSchema = z
  .object({
    scope: scopeSchema,
    readings: z
      .array(
        z
          .object({
            metricCode: z.string().max(64),
            value: z.number(),
            unit: z.string().max(32),
            observedAt: z.string().max(40),
            source: z.string().max(16),
            quality: z.string().max(16),
          })
          .strict(),
      )
      .min(1)
      .max(P48_MAX_BATCH),
    confirmation: z
      .object({
        irreversible: z.literal(true),
        typedMissionCode: z.string().max(64),
        plannedCount: z.number().int(),
      })
      .strict(),
  })
  .strict();

type Supa = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function readFacts(
  supabase: Supa,
  userId: string,
  missionId: string,
): Promise<EligibilityFacts | null> {
  const [mission, memberships] = await Promise.all([
    supabase.from("missions").select("code, status").eq("id", missionId).maybeSingle(),
    supabase
      .from("mission_memberships")
      .select("role, crew_member_id")
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .eq("active", true),
  ]);
  if (mission.error || memberships.error) return null;
  return {
    flagEnabled: flagEnabled(),
    mission: mission.data ? { code: String(mission.data.code), status: String(mission.data.status) } : null,
    memberships: ((memberships.data ?? []) as Array<{ role: string; crew_member_id: string | null }>).map(
      (m) => ({ role: m.role, crewMemberId: m.crew_member_id }),
    ),
  };
}

export type P48IntakeStatus = { enabled: false } | { enabled: true; reason: EligibilityReason | "unavailable" };

export const getP48SyntheticIntakeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scopeSchema.parse(input))
  .handler(async ({ data, context }): Promise<P48IntakeStatus> => {
    if (!flagEnabled()) return { enabled: false };
    const facts = await readFacts(context.supabase as unknown as Supa, context.userId, data.missionId);
    if (!facts) return { enabled: true, reason: "unavailable" };
    return { enabled: true, reason: syntheticIntakeEligibility(facts, data.crewMemberId) };
  });

export type P48SubmitResult =
  | { ok: true; counts: SubmissionCounts }
  | { ok: false; code: "disabled" | "forbidden" | "invalid" | "unconfirmed" | "unavailable"; message: string; counts?: SubmissionCounts; issues?: string[] };

export const submitP48SyntheticReadings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }): Promise<P48SubmitResult> => {
    if (!flagEnabled())
      return { ok: false, code: "disabled", message: "Synthetic intake is not enabled in this deployment." };
    if (
      data.confirmation.typedMissionCode !== P48_SYNTHETIC_MISSION_CODE ||
      data.confirmation.plannedCount !== data.readings.length
    )
      return { ok: false, code: "unconfirmed", message: "The irreversible-write confirmation does not match this batch. Nothing was saved." };
    const supabase = context.supabase as unknown as Supa;
    const facts = await readFacts(supabase, context.userId, data.scope.missionId);
    if (!facts)
      return { ok: false, code: "unavailable", message: "Authorization could not be checked. Nothing was saved." };
    if (syntheticIntakeEligibility(facts, data.scope.crewMemberId) !== "eligible")
      return { ok: false, code: "forbidden", message: "Only the active Crew Self of this dedicated synthetic mission can add these readings. Nothing was saved." };
    const batch = buildSyntheticBatch(data.scope, data.readings, new Date());
    if (!batch.ok)
      return { ok: false, code: "invalid", message: "The batch did not pass validation. Nothing was saved.", issues: batch.issues };

    const statuses: Array<"accepted" | "duplicate" | "conflict" | "rejected"> = [];
    for (const planned of batch.events) {
      const { data: result, error } = await supabase.rpc("ingest_mission_event", {
        p_event: planned.event,
        p_idempotency_key: planned.idempotencyKey,
      });
      const status = (result as { status?: string } | null)?.status;
      if (error || !status || !["accepted", "duplicate", "conflict", "rejected"].includes(status)) {
        // Stop on the first refusal (e.g. revocation mid-batch); log the category only.
        console.error("[P48] synthetic ingest stopped", (error as { code?: string } | null)?.code ?? "unknown");
        return {
          ok: false,
          code: "unavailable",
          message: "The database refused or did not confirm a reading; remaining readings were not sent.",
          counts: tallyIngestStatuses(statuses, batch.events.length),
        };
      }
      statuses.push(status as (typeof statuses)[number]);
    }
    return { ok: true, counts: tallyIngestStatuses(statuses, batch.events.length) };
  });
