// FV-01.4.2H B6-A TEMPORARY SYNTHETIC EVENT TEST — REMOVE AFTER B6 ACCEPTANCE.
// Builds exactly one predefined synthetic operational_event per authorized test account.
// Mission/crew identifiers come only from the signed-in user's active Crew Self membership.
import type { MissionMembershipContext } from "@/infrastructure/mission-identity";
import { sha256Hex } from "@/domain/offline-mission";

/**
 * Production submission is technically blocked until a separate owner authorization (B6-B).
 * Changing this requires a code change, review and a new publication.
 */
export const FV0142H_SUBMISSION_ENABLED: boolean = true;

export const FV0142H_ALLOWED = [
  { missionCode: "FV01-TEST-A", crewExternalRef: "FV01-CREW-A", eventId: "fv01-b6-a-001" },
  { missionCode: "FV01-TEST-B", crewExternalRef: "FV01-CREW-B", eventId: "fv01-b6-b-001" },
] as const;

export const FV0142H_PAYLOAD = Object.freeze({ fv01Test: "B6", synthetic: true }) as Readonly<{ fv01Test: "B6"; synthetic: true }>;

export type Fv0142hResolution =
  | { ok: true; missionId: string; crewMemberId: string; missionCode: string; eventId: string }
  | { ok: false; reason: "not_signed_in" | "no_eligible_membership" | "ambiguous_membership" };

export function resolveFv0142hTarget(signedIn: boolean, memberships: readonly MissionMembershipContext[]): Fv0142hResolution {
  if (!signedIn) return { ok: false, reason: "not_signed_in" };
  const crewSelf = memberships.filter((m) => m.role === "crew_self" && m.crewMemberId);
  const matches = crewSelf.flatMap((m) => {
    const allowed = FV0142H_ALLOWED.find((a) => a.missionCode === m.missionCode && a.crewExternalRef === m.crewExternalRef);
    return allowed ? [{ m, allowed }] : [];
  });
  if (matches.length === 0) return { ok: false, reason: "no_eligible_membership" };
  // Fail closed if the account holds ANY other active membership (any role) or more than one match.
  if (matches.length !== 1 || crewSelf.length !== 1 || memberships.length !== 1) return { ok: false, reason: "ambiguous_membership" };
  const { m, allowed } = matches[0]!;
  return { ok: true, missionId: m.missionId, crewMemberId: m.crewMemberId!, missionCode: allowed.missionCode, eventId: allowed.eventId };
}

export function buildFv0142hEvent(target: Extract<Fv0142hResolution, { ok: true }>, nowIso: string) {
  return {
    id: target.eventId,
    kind: "operational_event" as const,
    classification: "synthetic" as const,
    sourceId: "fv01-b6-synthetic",
    sourceVersion: "1.0.0",
    sourcePriority: 50,
    mission: { missionId: target.missionId, crewMemberId: target.crewMemberId },
    eventTimestamp: nowIso,
    createdAt: nowIso,
    payload: { ...FV0142H_PAYLOAD },
  };
}

export type Fv0142hSubmitOutcome = "BLOCKED" | "ACCEPTED" | "DUPLICATE" | "REJECTED" | "ERROR";

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** Direct single RPC call; never uses the offline queue or background sync. */
export async function submitFv0142hEvent(
  client: RpcClient,
  target: Extract<Fv0142hResolution, { ok: true }>,
  nowIso: string,
  enabled: boolean = FV0142H_SUBMISSION_ENABLED,
): Promise<Fv0142hSubmitOutcome> {
  if (enabled !== true) return "BLOCKED";
  const event = buildFv0142hEvent(target, nowIso);
  const idempotencyKey = `${event.id}:${event.sourceVersion}:${await sha256Hex(event.payload)}`;
  try {
    const { data, error } = await client.rpc("ingest_mission_event", { p_event: event, p_idempotency_key: idempotencyKey });
    if (error) return "ERROR";
    const status = (data as { status?: string } | null)?.status;
    if (status === "accepted") return "ACCEPTED";
    if (status === "duplicate") return "DUPLICATE";
    return "REJECTED";
  } catch {
    return "ERROR";
  }
}
