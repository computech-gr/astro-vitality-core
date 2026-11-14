// P69/P71 public demo workspace verifier (DISPOSABLE PostgreSQL only).
// Requires FV01_PG_SOCKET_DIR (and optional FV01_PG_PORT) pointing at a local
// throwaway server; refuses managed PG* variables so it cannot touch the project
// database. Applies Supabase-like stubs + the staged P69 SQL (twice, to prove
// idempotency), runs the scenarios, then proves the rollback and re-apply.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket) {
  console.log("P69 public demo PostgreSQL verification: SKIPPED (set FV01_PG_SOCKET_DIR to a disposable local server)");
  process.exit(0);
}
const port = process.env.FV01_PG_PORT ?? "55432";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = ["-h", socket, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X"];
const DB = "p69_it";
const SQL = join(root, "supabase/pending/20261114000000_p69_public_demo_workspaces.sql");
const ROLLBACK = join(root, "supabase/pending/20261114000000_p69_public_demo_workspaces.rollback.sql");
function psql(args, db = DB) {
  const r = spawnSync("psql", [...base, "-d", db, "-t", "-A", ...args], { env, encoding: "utf8", cwd: root });
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}\n${r.stdout}`);
  return `${r.stdout}\n${r.stderr}`.replace(/^psql:[^\n]*?NOTICE:\s+/gm, "");
}
psql(["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`], "postgres");
psql(["-c", `alter database ${DB} set search_path = public, extensions`], "postgres");
psql(["-f", join(root, "tests/integration-pg/stub.sql")]);
psql(["-f", SQL]);
psql(["-f", SQL]);
const passes = ["PASS: staged P69 SQL applies twice without error (idempotent)"];
const out = psql(["-f", join(root, "tests/integration-pg/p69-public-demo.sql")]);
if (!out.includes("P69 DONE")) throw new Error(`P69 scenarios incomplete:\n${out}`);
passes.push(...out.split("\n").filter((l) => l.startsWith("PASS")));
psql(["-f", ROLLBACK]);
const left = psql(["-c", "select count(*) from pg_class where relname like 'p69_demo_%' and relkind = 'r'"]).trim().split("\n")[0];
if (left !== "0") throw new Error(`rollback left ${left} P69 tables`);
passes.push("PASS: rollback removes every P69 table and function");
psql(["-f", SQL]);
passes.push("PASS: staged P69 SQL re-applies cleanly after rollback");
psql(["-c", `drop database ${DB}`], "postgres");
for (const p of passes) console.log(p);
console.log(`P69 public demo PostgreSQL verification PASS (${passes.length} checks)`);
