// Destructive tests ONLY in the explicitly opted-in disposable local socket.
import { execFileSync, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket?.startsWith("/tmp/") || process.env.FV0143_INCLUDE_PENDING !== "1") {
  console.log("Medical v3: SKIPPED — disposable /tmp socket and FV0143_INCLUDE_PENDING=1 required");
  process.exit(0);
}
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
const base = ["-h", socket, "-p", process.env.FV01_PG_PORT ?? "55432", "-U", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-t", "-A"];
const db = "medical_v3_it";
const run = (sql, database = db) => execFileSync("psql", [...base, "-d", database, "-c", sql], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const file = (path) => execFileSync("psql", [...base, "-d", db, "-f", path], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
run(`drop database if exists ${db}`, "postgres"); run(`create database ${db}`, "postgres");
file("tests/integration-pg/stub.sql");
for (const name of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) file(`supabase/migrations/${name}`);
const migration = "supabase/pending/20261024000000_medical_governance_v3.sql";
file(migration); file(migration); file("tests/integration-pg/fv01-setup.sql");
const gm = "00000000-0000-0000-0000-0000000000a2";
const crew = "00000000-0000-0000-0000-0000000000b1";
run(`update mission_memberships set crew_member_id='c1' where user_id='${gm}' and role='ground_medical'`);
const as = (uid) => `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`;
let passes = 0;
const check = (ok, name) => { if (!ok) throw new Error(name); passes++; console.log(`PASS: ${name}`); };
const deny = (sql, pattern, name) => {
  try { run(sql); } catch (error) { check(pattern.test(String(error.stderr)), name); return; }
  throw new Error(`Unexpected success: ${name}`);
};
const append = (type = "draft_created", previous = "null", sha = `sha256-${"a".repeat(64)}`, request = "10000000-0000-0000-0000-000000000001") =>
 `select medical_v3_append_review('m1','c1','${type}',${previous},'${request}','${sha}','cv.hr 62 bpm','reviewed','synthetic test')`;
check(run("select count(*) from medical_advisor_review_events") === "0", "migration reapplication leaves history empty");
deny(as(crew) + append(), /authorization/, "crew self cannot append medical reviews");
deny(as(gm) + append().replace("'c1'", "'c2'"), /authorization/, "cross-crew denied");
deny(as(gm) + append().replace("'m1'", "'m2'"), /authorization/, "cross-mission denied");
deny(as(gm) + append(), /authoritative evidence unavailable/, "production resolver fails closed without evidence");
check(run("select medical_v3_ai_evidence('m1','c1') is null") === "t" ? false : true, "placeholder");