/**
 * P62 regression: the observation-sync server input check refused synthetic demo records
 * ("Unrecognized key: \"catalogBasis\"") and, because the refused key was then missing,
 * also reported the misleading "Invalid observation envelope/date precision".
 */
import { describe, expect, test } from "bun:test";
import {
  canonicalJson,
  DATED_OBSERVATION_SCHEMA,
  SYNTHETIC_DEMO_BASIS_CLASSIFICATION,
  UNIFIED_OBSERVATION_SCHEMA,
  type UnifiedObservation,
} from "../../src/domain/health-intelligence/observation-envelope";
import {
  OBSERVATION_SYNC_ALLOWED_FIELDS,
  observationSyncCounts,
  type ObservationSyncEvent,
  type SyncScope,
} from "../../src/domain/health-intelligence/observation-sync";
import { ObservationSyncUploadError, runObservationSync } from "../../src/domain/health-intelligence/observation-sync-runner";
import { SYNTHETIC_DEMO_CLASSIFICATION, type SyntheticDemoEntry } from "../../src/domain/health-intelligence/synthetic-demo-catalog";
import { pullObservationEventsCore, pushObservationEventsCore, type SyncDeps } from "../../src/lib/observation-sync.server";
import {
  observationSyncObservationShape,
  observationSyncPushInput,
} from "../../src/lib/observation-sync.schema";

const MISSION = "MITO_DEMO_2026";
const CREW = "crew-alex-morgan";
const SCOPE: SyncScope = { missionId: MISSION, crewMemberId: CREW, provenance: "synthetic" };
const UNIT = "ng/mL";
const DEMO_ID = "demo:ubt-7b25ce69";
const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 11 + 5) & 255)).toString("base64");
const ENV: Record<string, string> = { MITO_OBSERVATION_SYNC_ENABLED: "true", MITO_OBSERVATION_SYNC_KEY_V1: KEY };

const basis = {
  kind: "synthetic_demo" as const,
  demoId: DEMO_ID,
  termId: "ubt-7b25ce69",
  displayName: "25-Hydroxyvitamin D",
  demoCatalogVersion: 2,
  classification: SYNTHETIC_DEMO_BASIS_CLASSIFICATION,
};
const entry: SyntheticDemoEntry = {
  demoId: DEMO_ID,
  displayName: "25-Hydroxyvitamin D",
  aliases: ["25(OH) Vitamin D"],
  unit: UNIT,
  domain: "bone",
  provenance: "synthetic",
  missionId: MISSION,
  submissionId: "79291202-436a-4568-af8a-5458640913eb",
  termId: "ubt-7b25ce69",
  classification: SYNTHETIC_DEMO_CLASSIFICATION,
  sourceDocumentSha256: ["a".repeat(64)],
  status: "ACTIVE",
  decision: { decisionEventId: "d1", decidedAt: "2026-11-07T12:16:19Z", entrySha256: "b".repeat(64) },
  activation: { activationEventId: "a1", activatedAt: "2026-11-07T12:19:13Z", demoCatalogVersion: 2 },
  revocation: null,
};

let n = 0;
function demoObs(over: Partial<UnifiedObservation> = {}): UnifiedObservation {
  n++;
  return {
    schema: DATED_OBSERVATION_SCHEMA,
    id: `obs-p62-${String(n).padStart(6, "0")}`,
    missionId: MISSION,
    crewMemberId: CREW,
    metricId: DEMO_ID,
    domain: "bone",
    value: "31.4",
    originalUnit: UNIT,
    observedAt: "2026-11-07",
    datePrecision: "date",
    collectionDate: "2026-11-07",
    source: { kind: "pdf_text", label: "PDF text", documentName: "exam.pdf", documentSha256: "c".repeat(64), excerpt: "25(OH) Vitamin D 31.4 ng/mL" },
    provenance: "synthetic",
    quality: { reviewerConfirmed: true },
    reviewState: "accepted",
    status: "active",
    catalogBasis: { ...basis },
    recordedAt: "2026-11-07T15:00:00.000Z",
    ...over,
  };
}
const ev = (o: UnifiedObservation): ObservationSyncEvent => ({ eventId: `${o.id}:entry`, eventKind: "entry", observation: o });
const push = (events: ObservationSyncEvent[]) => observationSyncPushInput.safeParse({ scope: SCOPE, events, realDataConfirmed: false });
const messages = (r: ReturnType<typeof push>) => (r.success ? [] : r.error.issues.map((i) => i.message));

describe("P62 error 1 — catalogBasis is an accepted, exact-key envelope field", () => {
  test("a synthetic demo record passes the server input check unchanged (never stripped)", () => {
    const o = demoObs();
    const r = push([ev(o)]);
    expect(messages(r)).toEqual([]);
    expect(r.success && canonicalJson(r.data.events[0]!.observation)).toBe(canonicalJson(o));
    expect(r.success && r.data.events[0]!.observation.catalogBasis).toEqual(basis);
  });

  test("the server input schema accepts exactly the canonical envelope fields", () => {
    expect(Object.keys(observationSyncObservationShape.shape).sort()).toEqual([...OBSERVATION_SYNC_ALLOWED_FIELDS].sort());
  });

  test("validation is not weakened: malformed or misplaced demo bases are still refused", () => {
    expect(push([ev(demoObs({ catalogBasis: { ...basis, extra: 1 } as never }))]).success).toBe(false);
    expect(push([ev(demoObs({ catalogBasis: { ...basis, classification: "SCIENTIFICALLY_APPROVED" } as never }))]).success).toBe(false);
    expect(push([ev(demoObs({ catalogBasis: { ...basis, kind: "production" } as never }))]).success).toBe(false);
    expect(push([ev(demoObs({ catalogBasis: { ...basis, demoCatalogVersion: 0 } }))]).success).toBe(false);
    // Demo basis on a non-demo metric, or on REAL data, is refused by the envelope rules.
    expect(messages(push([ev(demoObs({ metricId: "cv-001" }))])).join(" ")).toContain("must appear together");
    expect(messages(push([ev(demoObs({ provenance: "real" }))])).join(" ")).toContain("must be synthetic");
  });

  test("a demo metric without its basis is refused with the specific reason, not a date message", () => {
    const { catalogBasis: _drop, ...noBasis } = demoObs();
    const m = messages(push([ev(noBasis as UnifiedObservation)])).join(" ");
    expect(m).toContain("synthetic demo catalog basis must appear together");
    expect(m).not.toContain("date precision");
  });

  test("an unknown top-level field is still refused (strict, never silently removed)", () => {
    const m = messages(push([ev({ ...demoObs(), injected: true } as never)]));
    expect(m.some((x) => x.includes("injected"))).toBe(true);
  });
});

describe("P62 error 2 — date-only and zoned-instant precision is preserved and enforced", () => {
  test("a date-only v2 observation passes and keeps its calendar date (no fabricated time)", () => {
    const o = demoObs({ observedAt: "2026-11-08", collectionDate: "2026-11-08" });
    const r = push([ev(o)]);
    expect(r.success).toBe(true);
    expect(r.success && r.data.events[0]!.observation.observedAt).toBe("2026-11-08");
    expect(r.success && r.data.events[0]!.observation.datePrecision).toBe("date");
  });

  test("a timestamped observation keeps its explicit time-zone offset", () => {
    const o = demoObs({ observedAt: "2026-11-08T08:15:00+02:00", datePrecision: "instant" });
    const r = push([ev(o)]);
    expect(r.success && r.data.events[0]!.observation.observedAt).toBe("2026-11-08T08:15:00+02:00");
  });

  test("invalid precision combinations are refused with a specific reason", () => {
    const cases: [Partial<UnifiedObservation>, string][] = [
      [{ schema: UNIFIED_OBSERVATION_SCHEMA }, "require the v2 schema"],
      [{ datePrecision: undefined }, "Date precision is required"],
      [{ observedAt: "2026-11-08T08:15:00Z" }, "declared precision"],
      [{ observedAt: "2026-11-08T08:15:00", datePrecision: "instant" }, "declared precision"],
      [{ observedAt: "2026-02-30" }, "declared precision"],
      [{ collectionDate: "08/11/2026" }, "Collection date"],
    ];
    for (const [over, reason] of cases) expect(messages(push([ev(demoObs(over))])).join(" ")).toContain(reason);
  });
});

/** Minimal cloud with the pending SQL's duplicate/conflict semantics plus the caller-scoped demo snapshot. */
function cloud() {
  const rows: Record<string, unknown>[] = [];
  let seq = 0;
  const deps: SyncDeps = {
    env: (k) => ENV[k],
    memberships: async () => [{ role: "ground_medical", crew_member_id: null, active: true }],
    rpc: async (fn, a) => {
      if (fn === "p37_demo_catalog_snapshot_v1") return { data: { mission_id: MISSION, demo_catalog_version: 2, entries: [entry] }, error: null };
      if (fn === "observation_sync_append_v1") {
        const out = (a["p_events"] as Record<string, unknown>[]).map((e) => {
          const ex = rows.find((r) => r["event_id"] === e["eventId"]);
          if (ex) return { id: e["eventId"], status: ex["fingerprint"] === e["fingerprint"] ? "duplicate" : "conflict", fingerprint: ex["fingerprint"], received_at: null };
          rows.push({ mission_id: MISSION, crew_member_id: CREW, provenance: "synthetic", event_id: e["eventId"], observation_id: e["observationId"], event_kind: e["eventKind"], cipher_alg: e["cipherAlg"], key_version: e["keyVersion"], iv: e["iv"], ciphertext: e["ciphertext"], fingerprint: e["fingerprint"], received_at: "2026-11-14T08:00:00.000Z", received_seq: ++seq });
          return { id: e["eventId"], status: "inserted", fingerprint: e["fingerprint"], received_at: "2026-11-14T08:00:00.000Z" };
        });
        return { data: out, error: null };
      }
      if (fn === "observation_sync_list_v1") return { data: rows.filter((r) => (r["received_seq"] as number) > (a["p_after_seq"] as number)).map((r) => ({ ...r })), error: null };
      return { data: null, error: { code: "PGRST202" } };
    },
  };
  return { rows, deps };
}

describe("P62 end to end — through the server input check, encryption and back", () => {
  test("demo provenance and date-only precision survive upload and download byte-identically", async () => {
    const c = cloud();
    const o = demoObs();
    const parsed = observationSyncPushInput.parse({ scope: SCOPE, events: [ev(o)], realDataConfirmed: false });
    const pushed = await pushObservationEventsCore(parsed as never, c.deps);
    expect(pushed.ok && pushed.results.map((r) => r.status)).toEqual(["inserted"]);
    expect(JSON.stringify(c.rows)).not.toContain("Vitamin");
    const pulled = await pullObservationEventsCore({ scope: SCOPE, afterSeq: 0, limit: 100 }, c.deps);
    expect(pulled.ok && pulled.problems).toEqual([]);
    expect(pulled.ok && canonicalJson(pulled.events[0]!.observation)).toBe(canonicalJson(o));
    // Replay is an idempotent duplicate, never a second row.
    const again = await pushObservationEventsCore(parsed as never, c.deps);
    expect(again.ok && again.results.map((r) => r.status)).toEqual(["duplicate"]);
    expect(c.rows.length).toBe(1);
  });
});

describe("P62 accurate counts when an upload batch is refused", () => {
  test("a thrown upload marks the batch Failed (retryable), records no receipts, then retries cleanly", async () => {
    const c = cloud();
    // Handbook-catalog date-only records: the device pre-check needs no installed demo snapshot here.
    const plain = () => demoObs({ metricId: "cv-001", domain: "cardiovascular", originalUnit: "bpm", value: "62", catalogBasis: undefined });
    const local = [ev(plain()), ev(plain())];
    const receipts: Parameters<typeof observationSyncCounts>[1][number][] = [];
    let refuse = true;
    const deps = {
      listLocal: async () => local,
      listReceipts: async () => receipts,
      appendReceipts: async (r: typeof receipts) => void receipts.push(...r),
      importEvent: async () => "duplicate" as const,
      push: async (a: { scope: SyncScope; events: ObservationSyncEvent[]; realDataConfirmed: boolean }) => {
        if (refuse) throw new Error('Unrecognized key: "catalogBasis"');
        return pushObservationEventsCore(observationSyncPushInput.parse(a) as never, c.deps);
      },
      pull: (a: { scope: SyncScope; afterSeq: number; limit: number }) => pullObservationEventsCore(a, c.deps),
      now: () => "2026-11-14T08:00:00.000Z",
    };
    const err = await runObservationSync({ scope: SCOPE, canUpload: true, realDataConfirmed: false }, deps).catch((e) => e);
    expect(err).toBeInstanceOf(ObservationSyncUploadError);
    expect(err.message).toBe('Unrecognized key: "catalogBasis"');
    expect([...err.failedIds].sort()).toEqual(local.map((e) => e.eventId).sort());
    expect(receipts.length).toBe(0);
    const counts = await observationSyncCounts(local, receipts, new Set(err.failedIds), SCOPE);
    expect([counts.pending, counts.failed, counts.synced, counts.conflict]).toEqual([0, 2, 0, 0]);

    refuse = false;
    const ok = await runObservationSync({ scope: SCOPE, canUpload: true, realDataConfirmed: false }, deps);
    expect(ok.status).toBe("ok");
    expect(ok.uploaded.inserted).toBe(2);
    const after = await observationSyncCounts(local, receipts, new Set(ok.failedIds), SCOPE);
    expect([after.pending, after.failed, after.synced, after.conflict]).toEqual([0, 0, 2, 0]);
    expect(c.rows.length).toBe(2);
  });
});


describe("P62.1 structured upload refusal safety", () => {
  test("non-throwing server refusal marks the whole batch Failed without receipts", async () => {
    const local = [ev(demoObs({ metricId: "cv-001", domain: "cardiovascular", catalogBasis: undefined }))];
    const receipts: Parameters<typeof observationSyncCounts>[1][number][] = [];
    const result = await runObservationSync(
      { scope: SCOPE, canUpload: true, realDataConfirmed: false },
      {
        listLocal: async () => local,
        listReceipts: async () => receipts,
        appendReceipts: async (r) => void receipts.push(...r),
        importEvent: async () => "duplicate" as const,
        push: async () => ({ ok: false as const, code: "invalid" as const, message: "Server rejected this batch" }),
        pull: async () => { throw new Error("Pull must not run after upload refusal"); },
        now: () => "2026-11-14T08:00:00.000Z",
      },
    );
    expect(result.status).toBe("failed");
    expect(result.failedIds).toEqual(local.map((e) => e.eventId));
    expect(receipts).toEqual([]);
    const counts = await observationSyncCounts(local, receipts, new Set(result.failedIds), SCOPE);
    expect([counts.pending, counts.failed, counts.synced]).toEqual([0, 1, 0]);
  });
});
