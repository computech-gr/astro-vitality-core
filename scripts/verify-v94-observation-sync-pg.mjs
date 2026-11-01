// v9.4 observation sync PostgreSQL verifier. DISPOSABLE local server only (FV01_PG_SOCKET_DIR);
// refuses managed PG* variables so it can never touch the project database.
// Applies: stubs -> every committed migration -> pending v9 review sync -> ONLY the pending v9.4
// observation-sync file -> fixtures -> v9.4 scenarios -> the v9.4 rollback (proving it refuses with
// data, then succeeds when allowed, leaving the v9 review-sync objects in place).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket) {
  console.log("v9.4 observation sync PostgreSQL verification: SKIPPED (set FV01_PG_SOCKET_DIR to a disposable local server)");
  process.exit(0);
}
const port = process.env.FV01_PG_PORT ?? "55432";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = ["-h", socket, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X"];
const db = "v94_observation_sync_it";
const psql = (args, d = "postgres") => execFileSync("psql", [...base, "-d", d, ...args], { env, encoding: "utf8", cwd: root });

psql(["-c", `drop database if exists ${db}`, "-c", `create database ${db}`]);
psql(["-c", `alter database ${db} set search_path = public, extensions`]);
psql(["-f", "tests/integration-pg/stub.sql"], db);
for (const f of readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort())
  psql(["-f", join("supabase/migrations", f)], db);
psql(["-f", "supabase/pending/20261101000000_v9_review_sync.sql"], db);
psql(["-f", "supabase/pending/20261102000000_v94_observation_sync.sql"], db);
psql(["-f", "tests/integration-pg/fv01-setup.sql"], db);
const out = psql(["-t", "-A", "-f", "tests/integration-pg/v94-observation-sync.sql"], db);
const passes = out.split("\n").filter((l) => l.startsWith("PASS"));
if (!out.includes("V94 OBSERVATION SYNC DONE")) throw new Error("v9.4 scenarios incomplete");
let refused = false;
try {
  psql(["-f", "supabase/pending/20261102000000_v94_observation_sync.rollback.sql"], db);
} catch {
  refused = true;
}
if (!refused) throw new Error("rollback must refuse while observation rows exist");
execFileSync("psql", [...base, "-d", db, "-f", "-"], {
  env,
  encoding: "utf8",
  cwd: root,
  input: "begin;\nset local observation_sync.allow_destructive_rollback = 'on';\n\\i supabase/pending/20261102000000_v94_observation_sync.rollback.sql\ncommit;\n",
});
const left = psql(["-t", "-A", "-c", "select count(*) from pg_class where relname like 'observation_sync_%'"], db).trim();
if (left !== "0") throw new Error(`rollback left ${left} objects`);
const v9 = psql(["-t", "-A", "-c", "select count(*) from pg_class where relname in ('review_sync_attestation_events','review_sync_correction_events')"], db).trim();
if (v9 !== "2") throw new Error("v9.4 rollback must not touch v9 review-sync tables");
for (const p of passes) console.log(p);
console.log(`v9.4 observation sync PostgreSQL verification: ${passes.length} PASS + rollback refusal, clean rollback, v9 tables untouched`);
