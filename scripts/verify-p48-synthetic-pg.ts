// P48 FINAL disposable PostgreSQL acceptance for Crew Self synthetic intake.
// Requires a DISPOSABLE local PostgreSQL reachable through FV01_PG_SOCKET_DIR (optional
// FV01_PG_PORT). Refuses managed PG* variables, so it cannot touch the project database.
// Applies every production migration (no pending files), then feeds events built by the
// real `buildSyntheticBatch` into the real `ingest_mission_event` as authenticated users.
// Run: FV01_PG_SOCKET_DIR=/tmp/pg bun scripts/verify-p48-synthetic-pg.ts
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { buildSyntheticBatch, syntheticScenario } from "../src/domain/companion/synthetic-intake";

const socket = process.env["FV01_PG_SOCKET_DIR"];
if (!socket) {
  console.log("P48 synthetic PG acceptance: SKIPPED (set FV01_PG_SOCKET_DIR)");
  process.exit(0);
}
const port = process.env["FV01_PG_PORT"] ?? "55432";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = ["-h", socket, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X", "-t", "-A"];
const psql = (args: string[], db = "postgres") =>
  execFileSync("psql", [...base, "-d", db, ...args], { env, encoding: "utf8" });
const DB = "p48_it";
psql(["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
psql(["-c", `alter database ${DB} set search_path = public, extensions`]);
psql(["-f", "tests/integration-pg/stub.sql"], DB);
for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort())
  psql(["-f", join("supabase/migrations", f)], DB);

const OP = "00000000-0000-0000-0000-00000000p0a1".replace("p0", "00");
const A = "00000000-0000-0000-0000-0000000000a2";
const B = "00000000-0000-0000-0000-0000000000a3";
const M = "mission-p48disposable";
psql(
  [
    "-c",
    `insert into auth.users(id) values ('${OP}'),('${A}'),('${B}');
     insert into public.missions(id, code, name, status) values ('${M}','P48_SYNTHETIC_DEMO','P48 disposable','planning');
     insert into public.crew_members(id, display_name, status) values ('crew-a','Synthetic Crew A','active'),('crew-b','Synthetic Crew B','active');
     insert into public.mission_crew_assignments(mission_id, crew_member_id, status) values ('${M}','crew-a','active'),('${M}','crew-b','active');
     insert into public.mission_memberships(mission_id, user_id, crew_member_id, role, active) values
       ('${M}','${OP}',null,'mission_operator',true),('${M}','${A}','crew-a','crew_self',true),('${M}','${B}','crew-b','crew_self',true);`,
  ],
  DB,
);

const now = new Date();
const batchA = buildSyntheticBatch({ missionId: M, crewMemberId: "crew-a" }, syntheticScenario("A", now), now);
const batchB = buildSyntheticBatch({ missionId: M, crewMemberId: "crew-b" }, syntheticScenario("B", now), now);
if (!batchA.ok || !batchB.ok) throw new Error("scenario batches invalid");
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const as = (uid: string) => `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`;
const ingest = (uid: string, ev: (typeof batchA.events)[number]) => {
  try {
    return psql(["-c", `${as(uid)} select public.ingest_mission_event(${lit(JSON.stringify(ev.event))}::jsonb, ${lit(ev.idempotencyKey)})->>'status';`], DB).trim().split("\n").pop();
  } catch (e) {
    return `error:${String((e as { stderr?: string }).stderr ?? e).match(/ERROR:\s+([^\n]+)/)?.[1] ?? "unknown"}`;
  }
};
const q = (uid: string, sql: string) => psql(["-c", `${as(uid)} ${sql}`], DB).trim().split("\n").pop();
const results: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);

check("crew A: 6 synthetic readings accepted", batchA.events.every((e) => ingest(A, e) === "accepted"));
check("crew B: 6 synthetic readings accepted", batchB.events.every((e) => ingest(B, e) === "accepted"));
check("retry of the same reading is a duplicate", ingest(A, batchA.events[0]!) === "duplicate");
check("crew A cannot write crew B readings", ingest(A, batchB.events[0]!)!.startsWith("error:mission access denied") || ingest(A, { ...batchB.events[1]!, idempotencyKey: batchB.events[1]!.idempotencyKey + "-x" })!.startsWith("error:"));
check("operator cannot write synthetic observations", ingest(OP, { event: { ...batchA.events[1]!.event, id: "p48syn:op-attempt" }, idempotencyKey: "p48-idem:op-attempt-0001" })!.startsWith("error:mission operator event scope denied"));
check("crew A reads only own 6 events", q(A, "select count(*) from public.mission_events;") === "6" && q(A, "select count(*) from public.mission_events where crew_member_id='crew-b';") === "0");
check("crew B reads only own 6 events", q(B, "select count(*) from public.mission_events where crew_member_id='crew-b';") === "6" && q(B, "select count(*) from public.mission_events where crew_member_id='crew-a';") === "0");
check("operator reads no crew events", q(OP, "select count(*) from public.mission_events;") === "0");
check("all stored rows are classified synthetic", psql(["-c", "select count(*) from public.mission_events where classification<>'synthetic';"], DB).trim() === "0");
check("index carries canonical metric codes", psql(["-c", "select count(*) from public.crew_health_record_index where metric_code in ('phys.heart_rate','phys.hrv_rmssd','sleep.duration');"], DB).trim() === "12");
check("rows are append-only", (() => { try { psql(["-c", "update public.mission_events set source_id='x';"], DB); return false; } catch { return true; } })());
const membershipA = psql(["-c", `select id from public.mission_memberships where user_id='${A}';`], DB).trim();
q(OP, `select public.set_mission_membership_active('${M}','${membershipA}'::uuid,false);`);
check("revoked crew A reads 0 events", q(A, "select count(*) from public.mission_events;") === "0");
check("revoked crew A cannot write", ingest(A, { event: { ...batchA.events[2]!.event, id: batchA.events[2]!.event.id + ":r" }, idempotencyKey: "p48-idem:revoked-attempt-01" })!.startsWith("error:"));
check("crew B unaffected by A's revocation", q(B, "select count(*) from public.mission_events;") === "6");

for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
const failed = results.filter(([, ok]) => !ok).length;
console.log(`P48 synthetic PG acceptance: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
