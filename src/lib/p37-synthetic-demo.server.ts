/**
 * Server core for the P37 SYNTHETIC DEMO catalog lifecycle. Calls the
 * caller-scoped RPCs staged in supabase/pending/20261108020000_p37_synthetic_demo_catalog.sql
 * as the signed-in user (never the service role) and signs mission-scoped demo
 * snapshots with a key derived (domain-separated) from the owner-provisioned
 * catalog secret. Fails closed while the migration or secret is missing.
 * Never touches the production catalog ledger. Framework-free.
 */
import {
  classifyAuthorizationError,
  failure,
  type Rpc,
} from "./p36-scientific-authorization.server";
import { BUNDLED_TRUSTED_KEYS } from "@/domain/health-intelligence/catalog-snapshot-signing";
import {
  SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
  demoSnapshotFromRpc,
  deriveSyntheticDemoSigningKey,
  signSyntheticDemoSnapshot,
  type DemoSnapshotRpc,
  type SignedSyntheticDemoSnapshot,
  type SyntheticDemoEntryDefinition,
} from "@/domain/health-intelligence/synthetic-demo-catalog";

export const SYNTHETIC_DEMO_KEY_ID = "p37-synthetic-demo-2026-11-07";
const MIGRATION_MESSAGE =
  "The synthetic demo catalog is not installed yet: the owner-approved database change has not been applied. Nothing was recorded.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const str = (v: unknown) => (typeof v === "string" ? v : null);

function fail(code: string | undefined) {
  const c = classifyAuthorizationError(code);
  if (c === "migration_required") return failure(c, MIGRATION_MESSAGE);
  if (c === "forbidden")
    return failure(
      c,
      "This account is not authorized for that synthetic demo action or mission. Nothing was recorded.",
    );
  return failure(c);
}

export interface DemoScopeTerm {
  submissionId: string;
  termId: string;
  originalLabels: string[];
  exactUnit: string;
  candidateMetricIds: string[];
  triageAction: string | null;
  submittedByCaller: boolean;
  callerMayActivate: boolean;
}
export interface DemoLifecycleRow {
  decisionEventId: string;
  submissionId: string;
  termId: string;
  demoId: string;
  entry: SyntheticDemoEntryDefinition;
  entrySha256: string;
  decidedAt: string;
  decidedByCaller: boolean;
  activationEventId: string | null;
  activatedAt: string | null;
  activatedByCaller: boolean | null;
  revocationEventId: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export async function demoLifecycleCore(rpc: Rpc, missionId: string) {
  const { data, error } = await rpc("p37_demo_lifecycle_v1", { p_mission_id: missionId });
  if (error) return fail(error.code);
  const o = data as Record<string, unknown> | null;
  if (
    !o ||
    typeof o["can_decide"] !== "boolean" ||
    typeof o["can_activate"] !== "boolean" ||
    !Array.isArray(o["terms"]) ||
    !Array.isArray(o["events"])
  )
    return failure(
      "integrity",
      "The synthetic demo lifecycle failed validation. Nothing was shown.",
    );
  const terms: DemoScopeTerm[] = [];
  for (const r of o["terms"] as Record<string, unknown>[]) {
    const sub = str(r["submission_id"]),
      term = str(r["term_id"]);
    if (!sub || !UUID.test(sub) || !term || !/^ubt-[0-9a-f]{8}$/.test(term))
      return failure("integrity", "A synthetic demo term failed validation.");
    terms.push({
      submissionId: sub,
      termId: term,
      originalLabels: strings(r["original_labels"]),
      exactUnit: str(r["exact_unit"]) ?? "",
      candidateMetricIds: strings(r["candidate_metric_ids"]),
      triageAction: str(r["triage_action"]),
      submittedByCaller: r["submitted_by_caller"] === true,
      callerMayActivate: r["caller_may_activate"] === true,
    });
  }
  const events: DemoLifecycleRow[] = [];
  for (const r of o["events"] as Record<string, unknown>[]) {
    const id = str(r["decision_event_id"]),
      sha = str(r["entry_sha256"]),
      demoId = str(r["demo_id"]);
    const entry = r["entry"] as SyntheticDemoEntryDefinition | null;
    if (
      !id ||
      !UUID.test(id) ||
      !sha ||
      !/^[0-9a-f]{64}$/.test(sha) ||
      !demoId ||
      !entry ||
      typeof entry !== "object" ||
      entry.provenance !== "synthetic" ||
      entry.demoId !== demoId
    )
      return failure(
        "integrity",
        "A synthetic demo decision failed validation. Nothing was shown.",
      );
    events.push({
      decisionEventId: id,
      submissionId: str(r["submission_id"]) ?? "",
      termId: str(r["term_id"]) ?? "",
      demoId,
      entry,
      entrySha256: sha,
      decidedAt: str(r["decided_at"]) ?? "",
      decidedByCaller: r["decided_by_caller"] === true,
      activationEventId: str(r["activation_event_id"]),
      activatedAt: str(r["activated_at"]),
      activatedByCaller:
        typeof r["activated_by_caller"] === "boolean"
          ? (r["activated_by_caller"] as boolean)
          : null,
      revocationEventId: str(r["revocation_event_id"]),
      revokedAt: str(r["revoked_at"]),
      revocationReason: str(r["revocation_reason"]),
    });
  }
  return {
    ok: true as const,
    canDecide: o["can_decide"] as boolean,
    canActivate: o["can_activate"] as boolean,
    terms,
    events,
  };
}

type Recorded =
  | { ok: true; status: "recorded" | "duplicate"; eventId: string; entrySha256?: string }
  | { ok: false; code: string; message: string };
function recorded(data: unknown): Recorded {
  const o = data as Record<string, unknown> | null;
  const status = o?.["status"];
  if (status === "recorded" || status === "duplicate") {
    const eventId = str(o?.["event_id"]);
    if (!eventId || !UUID.test(eventId))
      return failure("integrity", "The response failed validation.");
    const sha = str(o?.["entry_sha256"]);
    return { ok: true, status, eventId, ...(sha ? { entrySha256: sha } : {}) };
  }
  return failure("invalid", `Not recorded: ${str(o?.["detail"]) ?? "request rejected"}.`);
}

export async function demoDecideCore(
  rpc: Rpc,
  d: {
    missionId: string;
    submissionId: string;
    termId: string;
    displayName: string;
    domain: string;
    acknowledgement: string;
    idempotencyKey: string;
  },
): Promise<Recorded> {
  if (d.acknowledgement !== SYNTHETIC_DEMO_ACKNOWLEDGEMENT)
    return failure("invalid", "Not recorded: the synthetic demo acknowledgement is required.");
  const { data, error } = await rpc("p37_demo_decide_v1", {
    p_mission_id: d.missionId,
    p_submission_id: d.submissionId,
    p_term_id: d.termId,
    p_display_name: d.displayName,
    p_domain: d.domain,
    p_acknowledgement: d.acknowledgement,
    p_idempotency_key: d.idempotencyKey,
  });
  return error ? fail(error.code) : recorded(data);
}
export async function demoActivateCore(
  rpc: Rpc,
  d: { decisionEventId: string; expectedEntrySha256: string; idempotencyKey: string },
): Promise<Recorded> {
  const { data, error } = await rpc("p37_demo_activate_v1", {
    p_decision_event_id: d.decisionEventId,
    p_expected_entry_sha256: d.expectedEntrySha256,
    p_idempotency_key: d.idempotencyKey,
  });
  return error ? fail(error.code) : recorded(data);
}
export async function demoRevokeCore(
  rpc: Rpc,
  d: { activationEventId: string; reason: string; idempotencyKey: string },
): Promise<Recorded> {
  const { data, error } = await rpc("p37_demo_revoke_v1", {
    p_activation_event_id: d.activationEventId,
    p_reason: d.reason,
    p_idempotency_key: d.idempotencyKey,
  });
  return error ? fail(error.code) : recorded(data);
}

/** Mission-scoped signed demo snapshot; signed with the domain-separated demo key only. */
export async function signedDemoSnapshotCore(
  rpc: Rpc,
  secret: string | undefined,
  missionId: string,
  now: () => string,
): Promise<
  { ok: true; signed: SignedSyntheticDemoSnapshot } | { ok: false; code: string; message: string }
> {
  if (!secret)
    return failure(
      "unavailable",
      "Synthetic demo catalog signing is not configured. Devices keep their last verified demo catalog.",
    );
  const { data, error } = await rpc("p37_demo_catalog_snapshot_v1", { p_mission_id: missionId });
  if (error) return fail(error.code);
  const o = data as DemoSnapshotRpc | null;
  if (
    !o ||
    o.mission_id !== missionId ||
    !Array.isArray(o.entries) ||
    typeof o.demo_catalog_version !== "number"
  )
    return failure("integrity", "The synthetic demo catalog failed validation.");
  let key: CryptoKey;
  try {
    key = (await deriveSyntheticDemoSigningKey(secret)).privateKey;
  } catch {
    return failure(
      "unavailable",
      "The catalog signing secret is invalid. Devices keep their last verified demo catalog.",
    );
  }
  return {
    ok: true,
    signed: await signSyntheticDemoSnapshot(
      demoSnapshotFromRpc(o, now()),
      SYNTHETIC_DEMO_KEY_ID,
      key,
    ),
  };
}

export async function demoSigningPublicKeyCore(secret: string | undefined) {
  if (!secret) return failure("unavailable", "The catalog signing secret is not provisioned.");
  try {
    const { publicKeySpkiBase64 } = await deriveSyntheticDemoSigningKey(secret);
    const trustedInBundle = BUNDLED_TRUSTED_KEYS.some(
      (k) =>
        k.keyId === SYNTHETIC_DEMO_KEY_ID &&
        k.publicKeySpkiBase64 === publicKeySpkiBase64 &&
        k.environment === "synthetic_demo",
    );
    return {
      ok: true as const,
      keyId: SYNTHETIC_DEMO_KEY_ID,
      publicKeySpkiBase64,
      trustedInBundle,
    };
  } catch {
    return failure("unavailable", "The catalog signing secret is invalid.");
  }
}
