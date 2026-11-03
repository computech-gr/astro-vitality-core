/**
 * Server core for P36 scientific authorization (framework-free so it can be
 * exercised against a disposable PostgreSQL with the real SQL).
 *
 * Identity (userId) comes from the verified session; the caller-scoped RPCs
 * in supabase/pending/20261104000000_p36_scientific_authorization.sql
 * re-derive auth.uid() and the mission role. The bundled dossiers are the
 * only source of term facts and fingerprints. No service-role key is used.
 */
import { canonicalJson } from "@/domain/health-intelligence/observation-envelope";
import {
  authorizationContext,
  buildAuthorizationPayload,
  sha256Hex,
  validateAuthorizationPayload,
  verifyAuthorizationLedger,
  type AuthorizationActorRole,
  type AuthorizationLedgerRow,
  type SubmissionInput,
} from "@/domain/health-intelligence/p36-scientific-authorization";

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;
export interface AuthorizationDeps {
  rpc: Rpc;
  userId: string;
  now: () => string;
}

export type AuthorizationErrorCode = "migration_required" | "forbidden" | "invalid" | "integrity" | "unavailable";
export type AuthorizationFailure = { ok: false; code: AuthorizationErrorCode; message: string };

const MESSAGES: Record<AuthorizationErrorCode, string> = {
  migration_required: "Final scientific authorization is unavailable: the staged database change has not been applied.",
  forbidden: "The server refused: this action needs an active membership with the required role for the selected mission.",
  invalid: "The server rejected the submission as invalid. Nothing was recorded.",
  integrity: "The authorization history for this term failed verification; nothing was recorded.",
  unavailable: "Scientific authorization is temporarily unavailable. Try again.",
};
export const failure = (code: AuthorizationErrorCode, message = MESSAGES[code]): AuthorizationFailure => ({ ok: false, code, message });

export function classifyAuthorizationError(code: string | undefined): AuthorizationErrorCode {
  if (code === "PGRST202" || code === "PGRST205" || code === "42883" || code === "42P01") return "migration_required";
  if (code === "42501") return "forbidden";
  if (code === "22023" || code === "22P02") return "invalid";
  return "unavailable";
}

const ROW_KEYS = [
  "authority_mission_id", "event_id", "term_id", "kind", "action", "submission_id", "payload_canonical", "payload_sha256",
  "references_recommendation_id", "supersedes_event_id", "prev_event_hash", "event_hash", "actor_user_id", "actor_role", "received_at", "received_seq",
] as const;

function cleanRow(r: unknown): AuthorizationLedgerRow | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ROW_KEYS) {
    const v = o[k];
    if (k === "received_seq") {
      if (typeof v !== "number" || !Number.isSafeInteger(v)) return null;
    } else if (k === "references_recommendation_id" || k === "supersedes_event_id") {
      if (v !== null && typeof v !== "string") return null;
    } else if (typeof v !== "string") return null;
    out[k] = v;
  }
  return out as unknown as AuthorizationLedgerRow;
}

export async function listAuthorizationCore(deps: Pick<AuthorizationDeps, "rpc">, missionId: string): Promise<{ ok: true; rows: AuthorizationLedgerRow[] } | AuthorizationFailure> {
  const rows: AuthorizationLedgerRow[] = [];
  let after = 0;
  for (let page = 0; page < 20; page++) {
    const { data, error } = await deps.rpc("p36_sci_auth_list_v1", { p_mission_id: missionId, p_after_seq: after, p_limit: 1000 });
    if (error) {
      console.error("[p36 authorization] list refused", error.code ?? "unknown");
      return failure(classifyAuthorizationError(error.code));
    }
    if (!Array.isArray(data)) return failure("unavailable");
    for (const r of data) {
      const c = cleanRow(r);
      if (!c) return failure("integrity", "The server returned a malformed authorization row; nothing is trusted.");
      rows.push(c);
      after = Math.max(after, c.received_seq);
    }
    if (data.length < 1000) return { ok: true, rows };
  }
  return failure("unavailable", "Authorization history is too large to load.");
}

export type SubmitStatus = "inserted" | "duplicate" | "conflict" | "rejected" | "stale";
export interface SubmitResult {
  ok: true;
  status: SubmitStatus;
  eventId: string | null;
  detail: string | null;
}

export async function submitAuthorizationCore(
  deps: AuthorizationDeps,
  input: SubmissionInput & { actorRole: AuthorizationActorRole },
): Promise<SubmitResult | AuthorizationFailure> {
  const ctx = await authorizationContext();
  if (!ctx.sourceIntegrityOk) return failure("integrity", "Bundled handoff or crosswalk failed its integrity check.");
  const listed = await listAuthorizationCore(deps, input.authorityMissionId);
  if (!listed.ok) return listed;
  const ledgers = await verifyAuthorizationLedger(listed.rows, input.authorityMissionId, ctx);
  const term = ledgers.get(input.termId);
  if (!term) return failure("invalid", "Unknown term; only the 12 handoff terms can be authorized.");
  if (term.integrity !== "VERIFIED") return failure("integrity");
  const role: AuthorizationActorRole = input.kind === "decision" ? "researcher" : input.actorRole;
  const payload = buildAuthorizationPayload(input, { userId: deps.userId, role, now: deps.now() }, ctx);
  const recommendation = input.recommendationEventId ? term.events.find((e) => e.row.event_id === input.recommendationEventId) : undefined;
  const latestDecision = [...term.events].reverse().find((e) => e.payload.kind === "decision");
  const v = validateAuthorizationPayload(payload, ctx, { recommendation, latestDecision });
  if (!v.ok) return failure("invalid", v.reason);
  const canonical = canonicalJson(payload);
  const sha = await sha256Hex(canonical);
  const { data, error } = await deps.rpc("p36_sci_auth_append_v1", {
    p_mission_id: input.authorityMissionId,
    p_submission_id: input.submissionId,
    p_payload_canonical: canonical,
    p_payload_sha256: sha,
  });
  if (error) {
    console.error("[p36 authorization] append refused", error.code ?? "unknown");
    return failure(classifyAuthorizationError(error.code));
  }
  const r = (data ?? {}) as Record<string, unknown>;
  const status = r["status"];
  if (status !== "inserted" && status !== "duplicate" && status !== "conflict" && status !== "rejected" && status !== "stale") return failure("unavailable");
  return { ok: true, status, eventId: typeof r["event_id"] === "string" ? r["event_id"] : null, detail: typeof r["detail"] === "string" ? r["detail"] : null };
}
