// v9 review sync PostgreSQL verifier. DISPOSABLE local server only (FV01_PG_SOCKET_DIR);
// refuses managed PG* variables so it can never touch the project database.
// Applies: stubs -> every committed migration -> ONLY the pending v9 review-sync file -> fixtures
// -> v9 scenarios -> the v9 rollback (proving it refuses with data, then succeeds when allowed).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket) {
  console.log("v9 review sync PostgreSQL verification: SKIPPED (set FV01_PG_SOCKET_DIR to a disposable local server)");
  process.exit(0);
}
const port = process.env.FV01_PG_PORT ?? "55432";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = ["-h", socket, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X"];
const psql = (args, db = "postgres") => execFileSync("psql", [...base, "-d", db, ...args], { env, encoding: "utf8", cwd: root });

psql(["-c", "drop database if exists v9_review_sync_it", "-c", "create database v9_review_sync_it"]);
psql(["-c", "alter database v9_review_sync_it set search_path = public, extensions"]);
psql(["-f", "tests/integration-pg/stub.sql"], "v9_review_sync_it");
for (const f of readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort())
  psql(["-f", join("supabase/migrations", f)], "v9_review_sync_it");
psql(["-f", "supabase/pending/20261101000000_v9_review_sync.sql"], "v9_review_sync_it");
psql(["-f", "tests/integration-pg/fv01-setup.sql"], "v9_review_sync_it");
const out = psql(["-t", "-A", "-f", "tests/integration-pg/v9-review-sync.sql"], "v9_review_sync_it");
const passes = out.split("\n").filter((l) => l.startsWith("PASS"));
if (!out.includes("V9 REVIEW SYNC DONE")) throw new Error("v9 scenarios incomplete");
let refused = false;
try {
  psql(["-f", "supabase/pending/20261101000000_v9_review_sync.rollback.sql"], "v9_review_sync_it");
} catch {
  refused = true;
}
if (!refused) throw new Error("rollback must refuse while audit rows exist");
execFileSync("psql", [...base, "-d", "v9_review_sync_it", "-f", "-"], {
  env,
  encoding: "utf8",
  cwd: root,
  input: "begin;\nset local review_sync.allow_destructive_rollback = 'on';\n\\i supabase/pending/20261101000000_v9_review_sync.rollback.sql\ncommit;\n",
});
const left = psql(["-t", "-A", "-c", "select count(*) from pg_class where relname like 'review_sync_%'"], "v9_review_sync_it").trim();
if (left !== "0") throw new Error(`rollback left ${left} objects`);
for (const p of passes) console.log(p);
console.log(`v9 review sync PostgreSQL verification: ${passes.length} PASS + rollback refusal and clean rollback`);
