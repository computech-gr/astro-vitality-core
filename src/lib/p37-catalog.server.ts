/**
 * Server core for the P37 governed catalog lifecycle. Calls the caller-scoped
 * RPCs staged in supabase/pending/20261108000000_p37_catalog_activation.sql as
 * the signed-in user (never the service role) and signs activated-catalog
 * snapshots for offline devices with the owner-provisioned server secret.
 * Fails closed while the migration or the signing key is missing. Framework-free.
 */
import {
  classifyAuthorizationError,
  failure,
  type Rpc,
} from "./p36-scientific-authorization.server";
import {
  snapshotFromLedgerRpc,
  type CatalogEntryDefinition,
  type LedgerSnapshotRpc,
} from "@/domain/health-intelligence/catalog-lifecycle";
import {
  BUNDLED_TRUSTED_KEYS,
  deriveSigningKeyFromSecret,
  signCatalogSnapshot,
  type SignedCatalogSnapshot,
} from "@/domain/health-intelligence/catalog-snapshot-signing";

const MIGRATION_MESSAGE =
  "Catalog approval and activation are not installed yet: the owner-approved database change has not been applied. Nothing was recorded.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fail(code: string | undefined) {
  const c = classifyAuthorizationError(code);
  if (c === "migration_required") return failure(c, MIGRATION_MESSAGE);
  if (c === "forbidden")
    return failure(
      c,
      "This account is not authorized for that catalog action or mission. Nothing was recorded.",
    );
  return failure(c);
}

export interface LifecycleRow {
  approvalEventId: string;
  submissionId: string;
  termId: string;
  canonicalId: string;
  entry: CatalogEntryDefinition;
  entrySha256: string;
  approvedAt: string;
  approvedByCaller: boolean;
  activationEventId: string | null;
  activatedAt: string | null;
  activatedByCaller: boolean | null;
  revocationEventId: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}
export interface ReceiptRow {
  termId: string;
  validationReference: string;
  canonicalMetricId: string;
  exactUnit: string;
  specimen: string;
  method: string;
  protocol: string;
  protocolVersion: string;
  verifiedAt: string;
}
const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function catalogLifecycleCore(
  rpc: Rpc,
  missionId: string,
  provenance: "synthetic" | "real",
) {
  const { data, error } = await rpc("p37_catalog_lifecycle_v1", {
    p_mission_id: missionId,
    p_provenance: provenance,
  });
  if (error) return fail(error.code);
  const o = data as Record<string, unknown> | null;
  if (
    !o ||
    typeof o["can_approve"] !== "boolean" ||
    typeof o["can_activate"] !== "boolean" ||
    !Array.isArray(o["events"]) ||
    !Array.isArray(o["receipts"])
  )
    return failure(
      "integrity",
      "The catalog lifecycle response failed validation. Nothing was shown.",
    );
  const events: LifecycleRow[] = [];
  for (const r of o["events"] as Record<string, unknown>[]) {
    const id = str(r["approval_event_id"]),
      sha = str(r["entry_sha256"]);
    if (
      !id ||
      !UUID.test(id) ||
      !sha ||
      !/^[0-9a-f]{64}$/.test(sha) ||
      !r["entry"] ||
      typeof r["entry"] !== "object"
    )
      return failure("integrity", "A catalog lifecycle row failed validation. Nothing was shown.");
    events.push({
      approvalEventId: id,
      submissionId: str(r["submission_id"]) ?? "",
      termId: str(r["term_id"]) ?? "",
      canonicalId: str(r["canonical_id"]) ?? "",
      entry: r["entry"] as CatalogEntryDefinition,
      entrySha256: sha,
      approvedAt: str(r["approved_at"]) ?? "",
      approvedByCaller: r["approved_by_caller"] === true,
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
  const receipts: ReceiptRow[] = (o["receipts"] as Record<string, unknown>[]).map((r) => ({
    termId: str(r["term_id"]) ?? "",
    validationReference: str(r["validation_reference"]) ?? "",
    canonicalMetricId: str(r["canonical_metric_id"]) ?? "",
    exactUnit: str(r["exact_unit"]) ?? "",
    specimen: str(r["specimen"]) ?? "",
    method: str(r["method"]) ?? "",
    protocol: str(r["protocol"]) ?? "",
    protocolVersion: str(r["protocol_version"]) ?? "",
    verifiedAt: str(r["verified_at"]) ?? "",
  }));
  return {
    ok: true as const,
    canApprove: o["can_approve"] as boolean,
    canActivate: o["can_activate"] as boolean,
    events,
    receipts,
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

export async function approveCore(
  rpc: Rpc,
  d: {
    missionId: string;
    provenance: "synthetic" | "real";
    submissionId: string;
    termId: string;
    validationReference: string;
    canonicalName: string;
    domain: string;
    idempotencyKey: string;
  },
): Promise<Recorded> {
  const { data, error } = await rpc("p37_catalog_approve_v1", {
    p_mission_id: d.missionId,
    p_provenance: d.provenance,
    p_submission_id: d.submissionId,
    p_term_id: d.termId,
    p_validation_reference: d.validationReference,
    p_canonical_name: d.canonicalName,
    p_domain: d.domain,
    p_idempotency_key: d.idempotencyKey,
  });
  return error ? fail(error.code) : recorded(data);
}
export async function activateCore(
  rpc: Rpc,
  d: { approvalEventId: string; expectedEntrySha256: string; idempotencyKey: string },
): Promise<Recorded> {
  const { data, error } = await rpc("p37_catalog_activate_v1", {
    p_approval_event_id: d.approvalEventId,
    p_expected_entry_sha256: d.expectedEntrySha256,
    p_idempotency_key: d.idempotencyKey,
  });
  return error ? fail(error.code) : recorded(data);
}
export async function revokeCore(
  rpc: Rpc,
  d: { activationEventId: string; reason: string; idempotencyKey: string },
): Promise<Recorded> {
  const { data, error } = await rpc("p37_catalog_revoke_v1", {
    p_activation_event_id: d.activationEventId,
    p_reason: d.reason,
    p_idempotency_key: d.idempotencyKey,
  });
  return error ? fail(error.code) : recorded(data);
}

/** Signed snapshot of activated entries for offline devices; requires the owner-provisioned signing secret. */
export async function signedSnapshotCore(
  rpc: Rpc,
  keyPkcs8Base64: string | undefined,
  keyId: string | undefined,
  now: () => string,
): Promise<
  { ok: true; signed: SignedCatalogSnapshot } | { ok: false; code: string; message: string }
> {
  if (!keyPkcs8Base64 || !keyId)
    return failure(
      "unavailable",
      "Catalog distribution is not configured: the owner has not provisioned the catalog signing key. Devices keep their last verified catalog.",
    );
  const { data, error } = await rpc("p37_catalog_snapshot_v1", {});
  if (error) return fail(error.code);
  const o = data as LedgerSnapshotRpc | null;
  if (!o || !Array.isArray(o.entries) || typeof o.catalog_version !== "number")
    return failure("integrity", "The catalog snapshot failed validation.");
  let key: CryptoKey;
  try {
    key = (await deriveSigningKeyFromSecret(keyPkcs8Base64)).privateKey;
  } catch {
    return failure(
      "unavailable",
      "The catalog signing key is invalid. Devices keep their last verified catalog.",
    );
  }
  return {
    ok: true,
    signed: await signCatalogSnapshot(snapshotFromLedgerRpc(o, "production", now()), keyId, key),
  };
}

/** Public verification key derived from the server secret (never the secret itself), for registration in the trusted-key list. */
export async function signingPublicKeyCore(
  secret: string | undefined,
  keyId: string | undefined,
): Promise<
  | { ok: true; keyId: string; publicKeySpkiBase64: string; trustedInBundle: boolean }
  | { ok: false; code: string; message: string }
> {
  if (!secret || !keyId)
    return failure("unavailable", "The catalog signing key is not provisioned.");
  try {
    const { publicKeySpkiBase64 } = await deriveSigningKeyFromSecret(secret);
    const trustedInBundle = BUNDLED_TRUSTED_KEYS.some(
      (k) =>
        k.keyId === keyId &&
        k.publicKeySpkiBase64 === publicKeySpkiBase64 &&
        k.environment === "production",
    );
    return { ok: true, keyId, publicKeySpkiBase64, trustedInBundle };
  } catch {
    return failure("unavailable", "The catalog signing key is invalid.");
  }
}
