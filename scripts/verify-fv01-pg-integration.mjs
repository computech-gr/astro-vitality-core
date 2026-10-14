// FV-01.2 PostgreSQL integration runner.
// Requires a DISPOSABLE local PostgreSQL 17 reachable through FV01_PG_SOCKET_DIR
// (and optional FV01_PG_PORT). It refuses to run when any managed PG* connection
// variable would be used, so it cannot touch the project database.
// Steps: recreate database -> Supabase-like stubs -> every migration in supabase/migrations (FV-01 included once) ->
// fixtures -> sequential and concurrent scenarios.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket) {
  console.log("FV-01 PostgreSQL integration: SKIPPED (set FV01_PG_SOCKET_DIR to a disposable local server)");
  process.exit(0);
}
const port = process.env.FV01_PG_PORT ?? "55432";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = ["-h", socket, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X"];
const psql = (args, db = "postgres") => execFileSync("psql", [...base, "-d", db, ...args], { env, encoding: "utf8" });

psql(["-c", "drop database if exists fv01_it", "-c", "create database fv01_it"]);
psql(["-c", "alter database fv01_it set search_path = public, extensions"]);
psql(["-f", "tests/integration-pg/stub.sql"], "fv01_it");
const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
for (const f of migrations) psql(["-f", join("supabase/migrations", f)], "fv01_it");
// FV-01.4.3: staged (NOT applied in production) hardening migrations are exercised only when explicitly requested.
const includePending = process.env.FV0143_INCLUDE_PENDING === "1";
const pending = includePending && existsSync("supabase/pending")
  ? readdirSync("supabase/pending").filter((f) => f.endsWith(".sql") && !f.includes("rollback")).sort()
  : [];
for (const f of pending) psql(["-f", join("supabase/pending", f)], "fv01_it");
psql(["-f", "tests/integration-pg/fv01-setup.sql"], "fv01_it");
const seq = psql(["-t", "-A", "-f", "tests/integration-pg/fv01-sequential.sql"], "fv01_it");
const seqPasses = seq.split("\n").filter((l) => l.startsWith("PASS"));
if (!seq.includes("SEQUENTIAL DONE")) throw new Error("sequential scenarios incomplete");

function session(sql) {
  return new Promise((resolve) => {
    const child = spawn("psql", [...base, "-d", "fv01_it", "-t", "-A", "-c", sql], { env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}
const as = (uid) => `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`;
const RES = "00000000-0000-0000-0000-0000000000a3";
const OP = "00000000-0000-0000-0000-0000000000a1";
const C1 = "00000000-0000-0000-0000-0000000000b1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const passes = [...seqPasses];

// C1: concurrent exports by the same researcher on a closed mission.
psql(["-c", `${as(OP)} select public.update_mission_operation('m3', null, 'completed');`], "fv01_it");
const a = session(`${as(RES)} begin; select public.export_research_mission('m3'); select pg_sleep(2); commit;`);
await sleep(500);
const b = session(`${as(RES)} begin; select public.export_research_mission('m3'); commit;`);
const [ra, rb] = await Promise.all([a, b]);
if (ra.code !== 0) throw new Error("C1 first export failed: " + ra.out);
if (rb.code === 0 || !/rate limit/.test(rb.out)) throw new Error("C1 concurrent export not refused: " + rb.out);
passes.push("PASS: concurrent duplicate export blocked by lock and refused by 24h limit");

// C2: ingestion in flight while the mission closes -> snapshot includes it (close waits).
const ing = session(`${as(C1)} begin; select public.ingest_mission_event(fvtest.ev('m4','c1','e-m4-1', now()), 'key-e-m4-1-aaaaaaaaaa'); select pg_sleep(2); commit;`);
await sleep(500);
const close = session(`${as(OP)} select public.update_mission_operation('m4', null, 'completed');`);
const [ri, rc] = await Promise.all([ing, close]);
if (ri.code !== 0 || rc.code !== 0) throw new Error("C2 failed: " + ri.out + rc.out);
const snap = psql(["-t", "-A", "-c", "select event_count from public.mission_research_snapshots where mission_id='m4'"], "fv01_it").trim();
if (snap !== "1") throw new Error("C2 snapshot did not capture in-flight committed event: " + snap);
passes.push("PASS: close waits for in-flight ingestion; snapshot captures it consistently");

// C3: ingestion arriving during/after close -> excluded from frozen snapshot.
const late = await session(`${as(C1)} select public.ingest_mission_event(fvtest.ev('m4','c1','e-m4-2', now() - interval '1 minute'), 'key-e-m4-2-aaaaaaaaaa');`);
const snap2 = psql(["-t", "-A", "-c", "select event_count from public.mission_research_snapshots where mission_id='m4'"], "fv01_it").trim();
if (snap2 !== "1") throw new Error("C3 snapshot changed after close: " + snap2 + " " + late.out);
passes.push("PASS: post-close ingestion never changes the frozen snapshot");

psql(["-c", "drop database fv01_it"]);

// FV-01.4.3 multi-role scenarios in a fresh disposable database:
// migrations -> fixtures -> pre-existing invites -> staged hardening -> scenarios.
if (includePending) {
  psql(["-c", "drop database if exists fv0143_it", "-c", "create database fv0143_it"]);
  psql(["-c", "alter database fv0143_it set search_path = public, extensions"]);
  psql(["-f", "tests/integration-pg/stub.sql"], "fv0143_it");
  for (const f of migrations) psql(["-f", join("supabase/migrations", f)], "fv0143_it");
  psql(["-f", "tests/integration-pg/fv01-setup.sql"], "fv0143_it");
  psql(["-f", "tests/integration-pg/fv0143-pre-existing.sql"], "fv0143_it");
  for (const f of pending) psql(["-f", join("supabase/pending", f)], "fv0143_it");
  const mr = psql(["-t", "-A", "-f", "tests/integration-pg/fv0143-multirole.sql"], "fv0143_it");
  if (!mr.includes("FV0143 DONE")) throw new Error("FV-01.4.3 scenarios incomplete");
  passes.push(...mr.split("\n").filter((l) => l.startsWith("PASS")).map((l) => l.replace("PASS: ", "PASS: [FV-01.4.3] ")));
  psql(["-c", "drop database fv0143_it"]);
}
for (const p of passes) console.log(p);
console.log(`FV-01 PostgreSQL integration: PASS (${passes.length} assertions, disposable PostgreSQL ${psql(["-t", "-A", "-c", "show server_version"]).trim()})`);
