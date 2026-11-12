/**
 * Server core for P61.5 Researcher SYNTHETIC DEMO scope authorization and alias
 * mappings. Calls the caller-scoped functions staged in
 * supabase/pending/20261112000000_p615_researcher_demo_scope.sql as the
 * signed-in user (never the service role). The database re-checks every rule
 * (Researcher capability, mission, synthetic provenance, submission membership,
 * review acceptance, exact unit, duplicates); this module only shapes requests,
 * derives deterministic idempotency keys and validates responses. Fails closed
 * with a "not installed" message until the owner applies the change.
 */
import {
  classifyAuthorizationError,
  failure,
  type Rpc,
} from "./p36-scientific-authorization.server";
import { deterministicUuid, parseResults, termRef } from "./p38-bulk-demo.server";
import type { BatchResponse } from "@/domain/health-intelligence/p38-bulk-demo-batches";
import { SYNTHETIC_DEMO_ALIAS_ACKNOWLEDGEMENT } from "@/domain/health-intelligence/synthetic-demo-catalog";

export const P615_MIGRATION_MESSAGE =
  "Researcher synthetic demo authorization is not installed yet: the owner-approved database change has not been applied. Nothing was recorded.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TERM = /^ubt-[0-9a-f]{8}$/;
const str = (v: unknown) => (typeof v === "string" ? v : null);

function fail(code: string | undefined) {
  const c = classifyAuthorizationError(code);
  if (c === "migration_required") return failure(c, P615_MIGRATION_MESSAGE);
  if (c === "forbidden")
    return failure(
      c,
      "This account is not authorized for this synthetic demo action or mission. Nothing was recorded.",
    );
  if (c === "invalid") return failure(c, "The request was refused as malformed. Nothing was recorded.");
  return failure(c, "The request could not be completed. Nothing was recorded.");
}

/** One bounded batch (1 to 50) of Researcher additions to the mission's synthetic demo scope. */
export async function authorizeScopeCore(
  rpc: Rpc,
  userId: string,
  d: { missionId: string; items: { submissionId: string; termId: string; exactUnit: string }[] },
): Promise<BatchResponse> {
  const items = await Promise.all(
    d.items.map(async (i) => ({
      submission_id: i.submissionId,
      term_id: i.termId,
      exact_unit: i.exactUnit,
      idempotency_key: await deterministicUuid(
        "p615-scope-authorize",
        userId,
        d.missionId,
        i.submissionId,
        i.termId,
        i.exactUnit,
      ),
    })),
  );
  const { data, error } = await rpc("p615_demo_scope_authorize_v1", {
    p_mission_id: d.missionId,
    p_items: items,
  });
  return error ? fail(error.code) : parseResults(data, d.missionId, items.length, termRef);
}

export interface ScopeGrant {
  grantId: string;
  submissionId: string;
  termId: string;
  exactUnit: string;
  authorizationRef: string;
  recordedAt: string;
  authorizedByCaller: boolean;
}
export interface AliasEntry {
  aliasId: string;
  targetDemoId: string;
  targetDisplayName: string;
  labels: string[];
  unit: string;
  domain: string;
  rationale: string;
}
export interface AliasLifecycleRow {
  decisionEventId: string;
  submissionId: string;
  termId: string;
  entry: AliasEntry;
  entrySha256: string;
  decidedAt: string;
  decidedByCaller: boolean;
  activationEventId: string | null;
  activatedAt: string | null;
  revocationEventId: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  callerMayActivate: boolean;
}
export type GovernanceResponse =
  | {
      ok: true;
      canAuthorize: boolean;
      canActivate: boolean;
      grants: ScopeGrant[];
      aliases: AliasLifecycleRow[];
    }
  | { ok: false; code: string; message: string };

export async function governanceCore(rpc: Rpc, missionId: string): Promise<GovernanceResponse> {
  const { data, error } = await rpc("p615_demo_governance_v1", { p_mission_id: missionId });
  if (error) return fail(error.code);
  const o = data as Record<string, unknown> | null;
  const bad = () => failure("integrity", "The synthetic demo governance state failed validation.");
  if (
    !o ||
    o["mission_id"] !== missionId ||
    typeof o["can_authorize"] !== "boolean" ||
    typeof o["can_activate"] !== "boolean" ||
    !Array.isArray(o["grants"]) ||
    !Array.isArray(o["aliases"])
  )
    return bad();
  const grants: ScopeGrant[] = [];
  for (const g of o["grants"] as Record<string, unknown>[]) {
    const id = str(g["grant_id"]),
      sub = str(g["submission_id"]),
      term = str(g["term_id"]);
    if (!id || !UUID.test(id) || !sub || !UUID.test(sub) || !term || !TERM.test(term)) return bad();
    grants.push({
      grantId: id,
      submissionId: sub,
      termId: term,
      exactUnit: str(g["exact_unit"]) ?? "",
      authorizationRef: str(g["authorization_ref"]) ?? "",
      recordedAt: str(g["recorded_at"]) ?? "",
      authorizedByCaller: g["authorized_by_caller"] === true,
    });
  }
  const aliases: AliasLifecycleRow[] = [];
  for (const a of o["aliases"] as Record<string, unknown>[]) {
    const id = str(a["decision_event_id"]),
      sha = str(a["entry_sha256"]),
      sub = str(a["submission_id"]),
      term = str(a["term_id"]);
    const e = a["entry"] as Record<string, unknown> | null;
    if (
      !id ||
      !UUID.test(id) ||
      !sha ||
      !/^[0-9a-f]{64}$/.test(sha) ||
      !sub ||
      !term ||
      !TERM.test(term) ||
      !e ||
      e["provenance"] !== "synthetic" ||
      e["aliasId"] !== `alias:${term}` ||
      !Array.isArray(e["labels"])
    )
      return bad();
    aliases.push({
      decisionEventId: id,
      submissionId: sub,
      termId: term,
      entry: {
        aliasId: e["aliasId"] as string,
        targetDemoId: str(e["targetDemoId"]) ?? "",
        targetDisplayName: str(e["targetDisplayName"]) ?? "",
        labels: (e["labels"] as unknown[]).filter((x): x is string => typeof x === "string"),
        unit: str(e["unit"]) ?? "",
        domain: str(e["domain"]) ?? "",
        rationale: str(e["rationale"]) ?? "",
      },
      entrySha256: sha,
      decidedAt: str(a["decided_at"]) ?? "",
      decidedByCaller: a["decided_by_caller"] === true,
      activationEventId: str(a["activation_event_id"]),
      activatedAt: str(a["activated_at"]),
      revocationEventId: str(a["revocation_event_id"]),
      revokedAt: str(a["revoked_at"]),
      revocationReason: str(a["revocation_reason"]),
      callerMayActivate: a["caller_may_activate"] === true,
    });
  }
  return {
    ok: true,
    canAuthorize: o["can_authorize"] as boolean,
    canActivate: o["can_activate"] as boolean,
    grants,
    aliases,
  };
}

type Recorded =
  | { ok: true; status: "recorded" | "duplicate"; eventId: string }
  | { ok: false; code: string; message: string };
function recorded(data: unknown): Recorded {
  const o = data as Record<string, unknown> | null;
  const status = o?.["status"];
  if (status === "recorded" || status === "duplicate") {
    const eventId = str(o?.["event_id"]);
    if (!eventId || !UUID.test(eventId))
      return failure("integrity", "The response failed validation.");
    return { ok: true, status, eventId };
  }
  return failure("invalid", `Not recorded: ${str(o?.["detail"]) ?? "request rejected"}.`);
}

/** Researcher alias decision: submitted term -> one existing active demo entry, identical exact unit. */
export async function aliasDecideCore(
  rpc: Rpc,
  userId: string,
  d: {
    missionId: string;
    submissionId: string;
    termId: string;
    targetDemoId: string;
    rationale: string;
    acknowledgement: string;
  },
): Promise<Recorded> {
  if (d.acknowledgement !== SYNTHETIC_DEMO_ALIAS_ACKNOWLEDGEMENT)
    return failure("invalid", "Not recorded: the synthetic demo alias acknowledgement is required.");
  const rationale = d.rationale.trim();
  const { data, error } = await rpc("p615_demo_alias_decide_v1", {
    p_mission_id: d.missionId,
    p_submission_id: d.submissionId,
    p_term_id: d.termId,
    p_target_demo_id: d.targetDemoId,
    p_rationale: rationale,
    p_acknowledgement: d.acknowledgement,
    p_idempotency_key: await deterministicUuid(
      "p615-alias-decide",
      userId,
      d.missionId,
      d.submissionId,
      d.termId,
      d.targetDemoId,
      rationale,
    ),
  });
  return error ? fail(error.code) : recorded(data);
}

/** Ground Medical activation of a Researcher alias decision (never the decider; exact digest). */
export async function aliasActivateCore(
  rpc: Rpc,
  userId: string,
  d: { decisionEventId: string; expectedEntrySha256: string },
): Promise<Recorded> {
  const { data, error } = await rpc("p615_demo_alias_activate_v1", {
    p_decision_event_id: d.decisionEventId,
    p_expected_entry_sha256: d.expectedEntrySha256,
    p_idempotency_key: await deterministicUuid(
      "p615-alias-activate",
      userId,
      d.decisionEventId,
      d.expectedEntrySha256,
    ),
  });
  return error ? fail(error.code) : recorded(data);
}

/** Ground Medical revocation of an active alias (stops future recognition; history unchanged). */
export async function aliasRevokeCore(
  rpc: Rpc,
  userId: string,
  d: { activationEventId: string; reason: string },
): Promise<Recorded> {
  const reason = d.reason.trim();
  const { data, error } = await rpc("p615_demo_alias_revoke_v1", {
    p_activation_event_id: d.activationEventId,
    p_reason: reason,
    p_idempotency_key: await deterministicUuid("p615-alias-revoke", userId, d.activationEventId, reason),
  });
  return error ? fail(error.code) : recorded(data);
}
