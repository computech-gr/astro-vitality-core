import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attestationSyncPayload,
  classifyReviewSyncError,
  correctionSyncPayload,
  mergeAttestationEvents,
  pendingForPush,
  receiptsFromServer,
  remoteRowToAttestation,
  REVIEW_SYNC_MIGRATION_REQUIRED,
  syncCounts,
} from "../../src/domain/health-intelligence/review-sync";
import { attestationStateFor, planAttestation, planRevocation, type AttestationEvent } from "../../src/domain/health-intelligence/evidence-attestation";
import { buildStoredObservationReview, planObservationCorrection } from "../../src/domain/health-intelligence/stored-observation-review";
import { appendSyncReceipts, importRemoteAttestationEvents, listAttestationEvents, listSyncReceipts } from "../../src/domain/health-intelligence/review-ledger";
import { InMemoryReviewLedgerStore } from "../../src/infrastructure/offline/review-ledger-store";
import { GM_USER, V9_SCOPE, gmCtx, obs } from "./fixtures-v9-observations";

const reason = "Checked against the source lab sheet";
const a = obs();
const b = obs();
const review = buildStoredObservationReview([a, b], V9_SCOPE, []);
const plan = planAttestation(review.report, [a.id, b.id], [], gmCtx(), { reason, confirmed: true });
if (!plan.ok) throw new Error(plan.reason);
const local: AttestationEvent[] = plan.events;

const toRow = (e: AttestationEvent, over: Record<string, unknown> = {}) => ({
  event_id: e.eventId, action: e.action, record_id: e.recordId, record_fingerprint: e.recordFingerprint, metric_id: e.metricId, badge: e.badge,
  mission_id: e.scope.missionId, crew_member_id: e.scope.crewMemberId, provenance: e.scope.provenance, actor_user_id: e.actorUserId,
  reason: e.reason, decided_at: e.decidedAt, batch_id: e.batchId, supersedes_event_id: e.supersedesEventId, received_at: "2026-11-01T10:00:01Z", received_seq: 1, ...over,
});

describe("v9 review sync payloads (metadata only)", () => {
  test("attestation payload is an allow-list without values, units, documents or excerpts", () => {
    const p = attestationSyncPayload(local[0]!);
    expect(Object.keys(p).sort()).toEqual(["action", "actorUserId", "badge", "batchId", "decidedAt", "eventId", "metricId", "reason", "recordFingerprint", "recordId", "supersedesEventId"]);
    expect(JSON.stringify(p)).not.toContain(a.value);
    expect(JSON.stringify(p)).not.toContain("synthetic-kit.csv");
  });

  test("correction payload carries IDs and reason only, never the corrected value", () => {
    const c = planObservationCorrection(a, [a], { metricId: "cv-001", value: "99", unit: "bpm", observedAt: a.observedAt, reason: "Transcription error fixed", confirmed: true }, gmCtx());
    if (!c.ok) throw new Error(c.reason);
    const p = correctionSyncPayload(c.corrected)!;
    expect(p).toMatchObject({ originalRecordId: a.id, correctedRecordId: c.corrected.id, actorUserId: GM_USER });
    expect(JSON.stringify(p)).not.toContain('"99"');
    expect(JSON.stringify(p)).not.toContain("bpm");
    expect(correctionSyncPayload(a)).toBeNull();
  });

  test("missing cloud schema fails closed with the exact message", () => {
    for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) expect(classifyReviewSyncError(code)).toBe("migration_required");
    expect(classifyReviewSyncError("42501")).toBe("forbidden");
    expect(classifyReviewSyncError(undefined)).toBe("unavailable");
    expect(REVIEW_SYNC_MIGRATION_REQUIRED).toBe("Cloud review sync unavailable: migration required");
  });
});

describe("v9 deterministic merge and cross-device status", () => {
  test("union by event ID; identical remote events are not duplicated", () => {
    const m = mergeAttestationEvents(local, local.map((e) => remoteRowToAttestation(toRow(e), V9_SCOPE)!));
    expect(m.events).toHaveLength(2);
    expect(m.imported).toHaveLength(0);
    expect(m.conflicts).toHaveLength(0);
  });

  test("same ID with different content is a conflict; local is kept", () => {
    const tampered = remoteRowToAttestation(toRow(local[0]!, { reason: "A completely different reason" }), V9_SCOPE)!;
    const m = mergeAttestationEvents(local, [tampered]);
    expect(m.conflicts.map((c) => c.eventId)).toEqual([local[0]!.eventId]);
    expect(m.events.find((e) => e.eventId === local[0]!.eventId)!.reason).toBe(reason);
  });

  test("absence from a limited remote page never deletes local events", () => {
    expect(mergeAttestationEvents(local, []).events).toHaveLength(2);
  });

  test("foreign-scope or malformed remote rows are rejected", () => {
    expect(remoteRowToAttestation(toRow(local[0]!, { mission_id: "mission-b" }), V9_SCOPE)).toBeNull();
    expect(remoteRowToAttestation(toRow(local[0]!, { provenance: "real" }), V9_SCOPE)).toBeNull();
    expect(remoteRowToAttestation(toRow(local[0]!, { reason: "short" }), V9_SCOPE)).toBeNull();
    expect(remoteRowToAttestation(toRow(local[0]!, { action: "approve" }), V9_SCOPE)).toBeNull();
  });

  test("attest on device A + revoke on device B merges to Revoked on both devices", async () => {
    const deviceA = new InMemoryReviewLedgerStore();
    const deviceB = new InMemoryReviewLedgerStore();
    await importRemoteAttestationEvents(local, V9_SCOPE, deviceA);
    await importRemoteAttestationEvents(local, V9_SCOPE, deviceB); // B pulled A's events
    const rev = planRevocation(review.report, a.id, await listAttestationEvents(V9_SCOPE, deviceB), gmCtx({ decidedAt: "2026-11-02T09:00:00.000Z" }), { reason: "Wrong lab sheet referenced", confirmed: true });
    if (!rev.ok) throw new Error(rev.reason);
    await importRemoteAttestationEvents(rev.events, V9_SCOPE, deviceB);
    // A pulls B's revocation
    const remote = (await listAttestationEvents(V9_SCOPE, deviceB)).map((e) => remoteRowToAttestation(toRow(e), V9_SCOPE)!);
    const merged = mergeAttestationEvents(await listAttestationEvents(V9_SCOPE, deviceA), remote);
    expect(merged.imported.map((e) => e.action)).toEqual(["revoke"]);
    await importRemoteAttestationEvents(merged.imported, V9_SCOPE, deviceA);
    const rowA = review.report.rows.find((r) => r.recordId === a.id)!;
    expect(attestationStateFor(rowA, await listAttestationEvents(V9_SCOPE, deviceA)).status).toBe("revoked");
    expect(attestationStateFor(rowA, await listAttestationEvents(V9_SCOPE, deviceB)).status).toBe("revoked");
    // Re-importing is idempotent.
    expect((await importRemoteAttestationEvents(merged.imported, V9_SCOPE, deviceA)).inserted).toBe(0);
  });
});

describe("v9 sync counters, receipts and push selection", () => {
  test("pending → synced/conflict only from server outcomes; rejected stays failed", async () => {
    const store = new InMemoryReviewLedgerStore();
    expect(syncCounts(local, [], [], new Set(), GM_USER)).toMatchObject({ pending: 2, synced: 0, failed: 0, conflict: 0, lastSyncedAt: null });
    const receipts = receiptsFromServer(
      [
        { kind: "attestation", id: local[0]!.eventId, status: "inserted", receivedAt: "2026-11-01T10:00:01Z", detail: null },
        { kind: "attestation", id: local[1]!.eventId, status: "rejected", receivedAt: null, detail: "invalid decision time" },
      ],
      "2026-11-01T10:00:02.000Z",
    );
    await appendSyncReceipts(receipts, V9_SCOPE, GM_USER, store);
    const stored = await listSyncReceipts(V9_SCOPE, store);
    expect(syncCounts(local, [], stored, new Set([local[1]!.eventId]), GM_USER)).toMatchObject({ pending: 0, synced: 1, failed: 1, conflict: 0, lastSyncedAt: "2026-11-01T10:00:02.000Z" });
    expect(pendingForPush(local, [], stored, GM_USER).attestations.map((p) => p.eventId)).toEqual([local[1]!.eventId]);
  });

  test("only the signed-in reviewer's own events are pushed; revocations follow their attestation", () => {
    const other = { ...local[0]!, eventId: "att-ffffffff", actorUserId: "00000000-0000-4000-8000-000000000999" };
    const rev = { ...local[0]!, eventId: "att-00000abc", action: "revoke" as const, supersedesEventId: local[0]!.eventId, decidedAt: local[0]!.decidedAt };
    const push = pendingForPush([rev, other, ...local], [], [], GM_USER);
    expect(push.attestations.map((p) => p.eventId)).not.toContain("att-ffffffff");
    expect(push.attestations.at(-1)!.action).toBe("revoke");
    expect(syncCounts([other], [], [], new Set(), GM_USER).otherAuthor).toBe(1);
  });
});

describe("v9 pending migration contract (static)", () => {
  const sql = readFileSync(join(import.meta.dir, "../../supabase/pending/20261101000000_v9_review_sync.sql"), "utf8");
  test("is staged in supabase/pending, never in production migrations", () => {
    const migrations = readFileSync(join(import.meta.dir, "../../supabase/pending/20261101000000_v9_review_sync.rollback.sql"), "utf8");
    expect(migrations).toContain("refuses to run while either");
    expect(sql).toContain("PENDING");
  });
  test("server enforces auth.uid(), exact Ground Medical scope, append-only and no anon", () => {
    expect(sql).toContain("v_uid uuid := auth.uid()");
    expect(sql).toContain("m.role = 'ground_medical'");
    expect(sql).toContain("a.status = 'active'");
    expect(sql).toContain("actor must be the signed-in reviewer");
    expect(sql).toMatch(/before update or delete on public\.review_sync_attestation_events/);
    expect(sql).toMatch(/before truncate on public\.review_sync_correction_events/);
    expect(sql).toMatch(/revoke all on public\.review_sync_attestation_events from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)/i);
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/\b(value|unit|excerpt|document_sha256|draft)\s+text/);
  });
});
