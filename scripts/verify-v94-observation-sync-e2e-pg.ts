// v9.4 two-device end-to-end check against REAL SQL (pending migration in a DISPOSABLE local server)
// and the REAL server encryption core. Refuses managed PG* variables; never touches the project DB.
// Device A (Ground Medical) saves 2 synthetic observations, attests both locally, syncs; device B
// (fresh, Crew Self) syncs and must show the same 2 records Attested; replays add nothing.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryOfflineMissionStore } from "../src/infrastructure/offline/store";
import { InMemoryReviewLedgerStore } from "../src/infrastructure/offline/review-ledger-store";
import { UNIFIED_OBSERVATION_SCHEMA, type UnifiedObservation } from "../src/domain/health-intelligence/observation-envelope";
import { importUnifiedObservationEvent, listUnifiedObservationEvents, listUnifiedObservations } from "../src/domain/health-intelligence/observation-store";
import { runObservationSync } from "../src/domain/health-intelligence/observation-sync-runner";
import { runReviewSync } from "../src/domain/health-intelligence/review-sync-runner";
import { appendAttestationEvents, appendObservationSyncReceipts, listAttestationEvents, listObservationSyncReceipts } from "../src/domain/health-intelligence/review-ledger";
import { planAttestation } from "../src/domain/health-intelligence/evidence-attestation";
import { buildStoredObservationReview } from "../src/domain/health-intelligence/stored-observation-review";
import { pullObservationEventsCore, pushObservationEventsCore, type SyncDeps } from "../src/lib/observation-sync.server";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["FV01_PG_SOCKET_DIR"];
if (!socket) {
  console.log("v9.4 observation sync e2e: SKIPPED (set FV01_PG_SOCKET_DIR to a disposable local server)");
  process.exit(0);
}
const port = process.env["FV01_PG_PORT"] ?? "55432";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = ["-h", socket, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X"];
const DB = "v94_e2e_it";
const psql = (args: string[], d = "postgres", input?: string) => execFileSync("psql", [...base, "-d", d, ...args], { env, encoding: "utf8", cwd: root, input });

psql(["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
psql(["-c", `alter database ${DB} set search_path = public, extensions`]);
psql(["-f", "tests/integration-pg/stub.sql"], DB);
for (const f of readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) psql(["-f", join("supabase/migrations", f)], DB);
psql(["-f", "supabase/pending/20261101000000_v9_review_sync.sql"], DB);
psql(["-f", "supabase/pending/20261102000000_v94_observation_sync.sql"], DB);
psql(["-f", "tests/integration-pg/fv01-setup.sql"], DB);

const GM = "00000000-0000-0000-0000-0000000000a2";
const CREW = "00000000-0000-0000-0000-0000000000b1";
const SCOPE = { missionId: "m1", crewMemberId: "c1", provenance: "synthetic" as const };
const KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
const ENV: Record<string, string> = { MITO_OBSERVATION_SYNC_ENABLED: "true", MITO_OBSERVATION_SYNC_KEY_V1: KEY };

/** Calls a function as `authenticated` with the given auth.uid(); returns parsed jsonb or a SQLSTATE error. */
function call(uid: string, fn: string, args: string[]): { data: unknown; error: { code?: string } | null } {
  const vars = args.flatMap((a, i) => ["-v", `a${i}=${a}`]);
  const placeholders = args.map((_, i) => `:'a${i}'`).join(",");
  const sql = `\\set ON_ERROR_STOP 1\nset role authenticated;\nselect set_config('request.jwt.claim.sub', '${uid}', false);\n\\t on\n\\a\nselect public.${fn}(${placeholders})::text;\n`;
  try {
    const out = execFileSync("psql", [...base, "-d", DB, ...vars, "-f", "-"], { env, encoding: "utf8", input: sql });
    const line = out.trim().split("\n").filter(Boolean).at(-1) ?? "null";
    return { data: JSON.parse(line), error: null };
  } catch (e) {
    const m = /ERROR:\s+(\w+)?/.exec(String((e as { stderr?: string }).stderr ?? ""));
    return { data: null, error: { code: /42501|denied|required/.test(String((e as { stderr?: string }).stderr)) ? "42501" : (m?.[1] ?? "XX000") } };
  }
}

const memberships: Record<string, { role: string; crew_member_id: string | null; active: boolean }[]> = {
  [GM]: [{ role: "ground_medical", crew_member_id: null, active: true }],
  [CREW]: [{ role: "crew_self", crew_member_id: "c1", active: true }],
};
const serverDeps = (uid: string): SyncDeps => ({
  env: (n) => ENV[n],
  memberships: async () => memberships[uid] ?? [],
  rpc: async (fn, a) => {
    if (fn === "observation_sync_append_v1")
      return call(uid, fn, [a["p_mission_id"] as string, a["p_crew_member_id"] as string, a["p_provenance"] as string, JSON.stringify(a["p_events"]), String(a["p_real_data_confirmed"])]);
    return call(uid, fn, [a["p_mission_id"] as string, a["p_crew_member_id"] as string, a["p_provenance"] as string, String(a["p_after_seq"]), String(a["p_limit"])]);
  },
});
const reviewDeps = (uid: string) => ({
  now: () => new Date().toISOString(),
  push: async (a: { scope: typeof SCOPE; attestations: unknown[]; corrections: unknown[] }) => {
    const r = call(uid, "review_sync_append_v1", [a.scope.missionId, a.scope.crewMemberId, a.scope.provenance, JSON.stringify(a.attestations), JSON.stringify(a.corrections)]);
    if (r.error) return { ok: false as const, code: "forbidden" as const, message: "refused" };
    return { ok: true as const, results: (r.data as Record<string, unknown>[]).map((x) => ({ kind: x["kind"] as "attestation", id: x["id"] as string, status: x["status"] as "inserted", receivedAt: (x["received_at"] as string) ?? null, detail: (x["detail"] as string) ?? null })) };
  },
  pull: async (a: { scope: typeof SCOPE; kind: "attestation" | "correction"; afterSeq: number; limit: number }) => {
    const r = call(uid, "review_sync_list_v1", [a.scope.missionId, a.scope.crewMemberId, a.scope.provenance, a.kind, String(a.afterSeq), String(a.limit)]);
    if (r.error) return { ok: false as const, code: "forbidden" as const, message: "refused" };
    const rows = (r.data as Record<string, string | number | null>[]).map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "string" || typeof v === "number" ? v : null])));
    return { ok: true as const, rows, lastSeq: rows.reduce((m, x) => Math.max(m, Number(x["received_seq"])), a.afterSeq), hasMore: rows.length >= a.limit };
  },
});

function device(uid: string) {
  const store = new InMemoryOfflineMissionStore();
  const ledger = new InMemoryReviewLedgerStore();
  return {
    store,
    ledger,
    history: () => listUnifiedObservations("m1", "c1", store),
    obs: () =>
      runObservationSync(
        { scope: SCOPE, canUpload: true, realDataConfirmed: false },
        {
          listLocal: async () => (await listUnifiedObservationEvents("m1", "c1", store)).map(({ eventId, eventKind, observation }) => ({ eventId, eventKind, observation })),
          listReceipts: () => listObservationSyncReceipts(SCOPE, ledger),
          appendReceipts: async (r) => void (await appendObservationSyncReceipts(r, SCOPE, uid, ledger)),
          importEvent: (e) => importUnifiedObservationEvent(e, store),
          push: (a) => pushObservationEventsCore(a, serverDeps(uid)),
          pull: (a) => pullObservationEventsCore(a, serverDeps(uid)),
          now: () => new Date().toISOString(),
        },
      ),
    reviews: async (canPush: boolean) => runReviewSync({ scope: SCOPE, actorUserId: uid, canPush, history: await listUnifiedObservations("m1", "c1", store) }, { ...reviewDeps(uid), store: ledger }),
  };
}

const mk = (id: string, metricId: string, domain: UnifiedObservation["domain"], value: string, unit: string, minute: number): UnifiedObservation => ({
  schema: UNIFIED_OBSERVATION_SCHEMA, id, missionId: "m1", crewMemberId: "c1", metricId, domain, value, originalUnit: unit,
  observedAt: new Date(Date.UTC(2026, 9, 14, 7, minute)).toISOString(), source: { kind: "csv", label: "CSV: synthetic-e2e.csv" },
  provenance: "synthetic", quality: { reviewerConfirmed: true }, reviewState: "accepted", status: "active", recordedAt: "2026-10-30T10:00:00.000Z",
});

const check = (ok: boolean, name: string) => {
  if (!ok) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
};

const a = device(GM);
const o1 = mk("synthe2e-0001", "cv-001", "cardiovascular", "62", "bpm", 30);
if (process.env["P3681_DATE_ONLY"] === "1") {
  o1.schema = "mitochondria.unified-observation.v2";
  o1.datePrecision = "date";
  o1.observedAt = "2026-10-14";
  o1.collectionDate = "2026-10-14";
}
const o2 = mk("synthe2e-0002", "cv-027", "cardiovascular", "48", "ms", 31);
for (const o of [o1, o2]) await importUnifiedObservationEvent({ eventId: `${o.id}:entry`, eventKind: "entry", observation: o }, a.store);
const review = buildStoredObservationReview(await a.history(), SCOPE, []);
const plan = planAttestation(review.report, [o1.id, o2.id], [], { actorUserId: GM, rolesForScope: ["ground_medical"], scope: SCOPE, decidedAt: new Date(Date.now() - 60_000).toISOString() }, { reason: "Reviewed against the synthetic e2e source", confirmed: true });
if (!plan.ok) throw new Error(plan.reason);
await appendAttestationEvents(plan.events, SCOPE, { actorUserId: GM, rolesForScope: ["ground_medical"] }, a.ledger);

const upA = await a.obs();
check(upA.status === "ok" && upA.uploaded.inserted === 2, "device A uploads 2 encrypted observation events");
const revA = await a.reviews(true);
check(revA.status === "ok", "device A syncs 2 attestations");
const stored = psql(["-t", "-A", "-c", "select string_agg(ciphertext || fingerprint || iv, '') from public.observation_sync_events"], DB);
const decoded = psql(["-t", "-A", "-c", "select string_agg(ciphertext, ',') from public.observation_sync_events"], DB).trim().split(",").map((c) => Buffer.from(c, "base64").toString("latin1")).join("");
check(!stored.includes("bpm") && !stored.includes("synthetic-e2e") && !decoded.includes("bpm") && !decoded.includes("synthetic-e2e") && !decoded.includes('"value"'), "database holds ciphertext only (no plaintext unit, source label or value field, even after base64 decoding)");

const b = device(CREW);
check((await b.history()).length === 0, "fresh device B starts with zero local observations");
const downB = await b.obs();
check(downB.downloaded.imported === 2, "device B imports the 2 observations");
await b.reviews(false);
const histB = await b.history();
const viewB = buildStoredObservationReview(histB, SCOPE, await listAttestationEvents(SCOPE, b.ledger));
check(viewB.views.length === 2 && viewB.views.every((v) => v.groundMedical === "attested"), "device B shows both records Attested");
check(JSON.stringify(histB.find((o) => o.id === o1.id)) === JSON.stringify(o1) || JSON.stringify(Object.entries(histB.find((o) => o.id === o1.id)!).sort()) === JSON.stringify(Object.entries(o1).sort()), "imported value, unit and metadata are unchanged");
if (process.env["P3681_DATE_ONLY"] === "1") check(histB.find((o) => o.id === o1.id)?.observedAt === "2026-10-14" && histB.find((o) => o.id === o1.id)?.datePrecision === "date", "date-only precision preserved through real SQL encryption, import and attestation");
const idsA = plan.events.map((e) => `${e.eventId}/${e.recordFingerprint}`).sort().join();
const idsB = (await listAttestationEvents(SCOPE, b.ledger)).map((e) => `${e.eventId}/${e.recordFingerprint}`).sort().join();
check(idsA === idsB, "same attestation event IDs and record fingerprints on both devices");

const again = await b.obs();
const againA = await a.obs();
check(again.uploaded.inserted === 0 && again.downloaded.imported === 0 && againA.uploaded.inserted === 0, "repeating sync sends zero new duplicates");
check(psql(["-t", "-A", "-c", "select count(*) from public.observation_sync_events"], DB).trim() === "2", "cloud still holds exactly 2 observation events");
check((await a.history()).length === 2, "source device A remains intact");
const res = device("00000000-0000-0000-0000-0000000000a3");
memberships["00000000-0000-0000-0000-0000000000a3"] = [{ role: "researcher", crew_member_id: null, active: true }];
const resRun = await res.obs();
check(resRun.status === "failed" && resRun.code === "forbidden", "researcher is refused before any decryption");
// Same as forbidden at DB level even if the server pre-check were bypassed:
check(call("00000000-0000-0000-0000-0000000000a3", "observation_sync_list_v1", ["m1", "c1", "synthetic", "0", "10"]).error?.code === "42501", "database refuses the researcher independently");
psql(["-c", `drop database ${DB}`]);
console.log("v9.4 observation sync e2e: all checks passed");
