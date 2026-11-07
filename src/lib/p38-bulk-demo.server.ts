/**
 * Server core for P38 bulk SYNTHETIC DEMO batches. Calls the caller-scoped
 * batch functions staged in supabase/pending/20261108030000_p38_bulk_synthetic_demo.sql
 * as the signed-in user (never the service role). Each call is one bounded
 * transactional batch (1 to 50 terms). Idempotency keys are derived here from
 * the caller, the term and the exact request, so a retried batch returns
 * "duplicate" instead of writing twice, while a changed request gets a new key
 * and is refused by the one-decision / one-activation rules. Framework-free.
 */
import {
  classifyAuthorizationError,
  failure,
  type Rpc,
} from "./p36-scientific-authorization.server";
import { SYNTHETIC_DEMO_ACKNOWLEDGEMENT } from "@/domain/health-intelligence/synthetic-demo-catalog";
import type {
  BatchResponse,
  BulkItemResult,
  BulkItemStatus,
} from "@/domain/health-intelligence/p38-bulk-demo-batches";

const MIGRATION_MESSAGE =
  "Bulk synthetic demo processing is not installed yet: the owner-approved database change has not been applied. Nothing was recorded.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUSES: readonly BulkItemStatus[] = ["recorded", "duplicate", "skipped", "rejected", "stale"];
const str = (v: unknown) => (typeof v === "string" ? v : null);

function fail(code: string | undefined): BatchResponse {
  const c = classifyAuthorizationError(code);
  if (c === "migration_required") return failure(c, MIGRATION_MESSAGE);
  if (c === "forbidden")
    return failure(
      c,
      "This account is not authorized for this bulk synthetic demo action or mission. Nothing in the batch was recorded.",
    );
  if (c === "invalid")
    return failure(c, "The batch request was refused as malformed. Nothing in it was recorded.");
  return failure(c, "The batch could not be completed. Nothing in it was recorded.");
}

/** Deterministic RFC 4122-shaped UUID from SHA-256 of the request parts (never an integrity attestation). */
export async function deterministicUuid(...parts: string[]): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\u001f"))),
  ).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function parseResults(
  data: unknown,
  missionId: string,
  expected: number,
  refOf: (r: Record<string, unknown>) => string | null,
): BatchResponse {
  const o = data as Record<string, unknown> | null;
  if (!o || o["mission_id"] !== missionId || !Array.isArray(o["results"]))
    return failure("integrity", "The batch response failed validation; nothing was assumed.");
  const results: BulkItemResult[] = [];
  for (const r of o["results"] as Record<string, unknown>[]) {
    const status = str(r["status"]) as BulkItemStatus | null;
    const ref = refOf(r);
    const termId = str(r["term_id"]) ?? "";
    const eventId = str(r["event_id"]);
    if (!status || !STATUSES.includes(status) || !ref || (eventId !== null && !UUID.test(eventId)))
      return failure("integrity", "The batch response failed validation; nothing was assumed.");
    if ((status === "recorded" || status === "duplicate") && !eventId)
      return failure("integrity", "The batch response failed validation; nothing was assumed.");
    results.push({ ref, termId, status, detail: str(r["detail"]), eventId });
  }
  if (results.length !== expected)
    return failure("integrity", "The batch response failed validation; nothing was assumed.");
  return { ok: true, results };
}
const termRef = (r: Record<string, unknown>) => {
  const s = str(r["submission_id"]),
    t = str(r["term_id"]);
  return s && t ? `${s}:${t}` : null;
};

export async function bulkTriageAcceptCore(
  rpc: Rpc,
  userId: string,
  d: {
    missionId: string;
    items: { submissionId: string; termId: string; expectedPreviousEventId: string | null }[];
  },
): Promise<BatchResponse> {
  const items = await Promise.all(
    d.items.map(async (i) => ({
      submission_id: i.submissionId,
      term_id: i.termId,
      expected_previous_event_id: i.expectedPreviousEventId,
      idempotency_key: await deterministicUuid(
        "p38-triage-accept",
        userId,
        d.missionId,
        i.submissionId,
        i.termId,
        i.expectedPreviousEventId ?? "GENESIS",
      ),
    })),
  );
  const { data, error } = await rpc("p38_demo_bulk_triage_accept_v1", {
    p_mission_id: d.missionId,
    p_items: items,
  });
  return error ? fail(error.code) : parseResults(data, d.missionId, items.length, termRef);
}

export async function bulkDecideCore(
  rpc: Rpc,
  userId: string,
  d: {
    missionId: string;
    acknowledgement: string;
    items: { submissionId: string; termId: string; displayName: string; domain: string }[];
  },
): Promise<BatchResponse> {
  if (d.acknowledgement !== SYNTHETIC_DEMO_ACKNOWLEDGEMENT)
    return failure("invalid", "Not recorded: the synthetic demo acknowledgement is required.");
  const items = await Promise.all(
    d.items.map(async (i) => ({
      submission_id: i.submissionId,
      term_id: i.termId,
      display_name: i.displayName.trim(),
      domain: i.domain,
      idempotency_key: await deterministicUuid(
        "p38-demo-decide",
        userId,
        d.missionId,
        i.submissionId,
        i.termId,
        i.displayName.trim(),
        i.domain,
      ),
    })),
  );
  const { data, error } = await rpc("p38_demo_bulk_decide_v1", {
    p_mission_id: d.missionId,
    p_acknowledgement: d.acknowledgement,
    p_items: items,
  });
  return error ? fail(error.code) : parseResults(data, d.missionId, items.length, termRef);
}

export async function bulkActivateCore(
  rpc: Rpc,
  userId: string,
  d: { missionId: string; items: { decisionEventId: string; expectedEntrySha256: string }[] },
): Promise<BatchResponse> {
  const items = await Promise.all(
    d.items.map(async (i) => ({
      decision_event_id: i.decisionEventId,
      expected_entry_sha256: i.expectedEntrySha256,
      idempotency_key: await deterministicUuid(
        "p38-demo-activate",
        userId,
        i.decisionEventId,
        i.expectedEntrySha256,
      ),
    })),
  );
  const { data, error } = await rpc("p38_demo_bulk_activate_v1", {
    p_mission_id: d.missionId,
    p_items: items,
  });
  return error
    ? fail(error.code)
    : parseResults(data, d.missionId, items.length, (r) => str(r["decision_event_id"]));
}
