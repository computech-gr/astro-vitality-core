// Destructive ONLY in opted-in disposable PostgreSQL. Never uses managed PG* variables.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket?.startsWith("/tmp/") || process.env.FV0143_INCLUDE_PENDING !== "1")
  throw new Error("Disposable /tmp socket and pending opt-in required");
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
);
const base = [
  "-h",
  socket,
  "-p",
  process.env.FV01_PG_PORT ?? "55432",
  "-U",
  "postgres",
  "-X",
  "-v",
  "ON_ERROR_STOP=1",
  "-t",
  "-A",
  "-d",
  "medical_v3_it",
];
const run = (sql) =>
  execFileSync("psql", [...base, "-c", sql], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const file = (path) =>
  execFileSync("psql", [...base, "-f", path], { env, stdio: ["ignore", "pipe", "pipe"] });
const gm = "00000000-0000-0000-0000-0000000000a2",
  crew = "00000000-0000-0000-0000-0000000000b1";
const as = (uid) =>
  `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`;
let assertions = 0;
const check = (ok, name) => {
  if (!ok) throw new Error(name);
  assertions++;
  console.log(`PASS: ${name}`);
};
const deny = (sql, name) => {
  let failed = false;
  try {
    run(sql);
  } catch {
    failed = true;
  }
  check(failed, name);
};
const transactionCheck = (sql, name) => {
  const result = run(`BEGIN;${sql};ROLLBACK;`);
  check(result.split("\n").includes("t"), name);
};
// Independently local disposable SQL only; never shared services.
const adminBase = base.slice(0, -1).concat("postgres");
execFileSync(
  "psql",
  [
    ...adminBase,
    "-c",
    "drop database if exists medical_v3_it",
    "-c",
    "create database medical_v3_it",
  ],
  { env, stdio: "pipe" },
);
execFileSync(
  "psql",
  [...adminBase, "-c", "alter database medical_v3_it set search_path=public,extensions"],
  { env, stdio: "pipe" },
);
file("tests/integration-pg/stub.sql");
for (const name of readdirSync("supabase/migrations")
  .filter((n) => n.endsWith(".sql"))
  .sort())
  file(`supabase/migrations/${name}`);
file("tests/integration-pg/fv01-setup.sql");
const mission = "mission-9d8ce8f3e5554509a0885461f9ad2e1c",
  astronaut = "crew-9806e7e611f44dc38dac5e23f7740f1a";
run(`insert into missions(id,code,name,status) values('${mission}','MITO_DEMO_2026','MITOCHONDRIA 2026 - Synthetic Demonstration','planning');
insert into crew_members(id,display_name,status) values('${astronaut}','Alex Morgan — Synthetic Astronaut','active');
insert into mission_crew_assignments(mission_id,crew_member_id,status) values('${mission}','${astronaut}','active');
insert into mission_memberships(id,mission_id,user_id,crew_member_id,role,active) values('63470171-3a22-4075-b197-ac85b90cb0ef','${mission}','${gm}','${astronaut}','ground_medical',true)`);
const migration = "supabase/pending/20261026000000_medical_v3_production_synthetic_demo.sql";
// Atomic prerequisite failure must leave no v3 namespace.
run(`update missions set status='active' where id='${mission}'`);
let failed = false;
try {
  file(migration);
} catch {
  failed = true;
}
check(failed, "wrong current mission status aborts migration");
check(
  run("select to_regclass('public.medical_ai_quota_reservations') is null") === "t",
  "failed migration creates no tables",
);
run(`update missions set status='planning' where id='${mission}'`);
file(migration);
const snapshot = JSON.parse(
  run(as(gm) + "select medical_v3_fixture_snapshot()")
    .split("\n")
    .at(-1),
);
writeFileSync("/tmp/production-synthetic/snapshot.json", JSON.stringify(snapshot));
check(
  snapshot.missionId === mission && snapshot.crewMemberId === astronaut,
  "exact planning/suffixed-name scope",
);
check(snapshot.evidence.map((o) => o.value).join(",") === "62,66", "exact invented 62 and 66 bpm");
check(
  snapshot.evidence.map((o) => o.id).join(",") === "synthetic-v3-hr-001,synthetic-v3-hr-002",
  "exact IDs",
);
check(
  snapshot.sha256 === `sha256-${createHash("sha256").update(snapshot.canonical).digest("hex")}`,
  "independent server hash parity",
);
check(
  JSON.parse(snapshot.canonical).observations.every(
    (o) => o.reviewReceipt.kind === "synthetic_test_fixture_not_human_review",
  ),
  "non-human test receipts only",
);
for (const table of [
  "medical_advisor_review_events",
  "medical_ai_quota_reservations",
  "medical_v3_fixture_sources",
  "medical_v3_fixture_observations",
  "medical_v3_fixture_receipts",
]) {
  check(
    run(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`) === "t",
    `${table} RLS enabled`,
  );
  deny(as(gm) + `select * from ${table}`, `${table} direct read denied`);
  deny(as(gm) + `insert into ${table} default values`, `${table} direct insert denied`);
}
deny(as(crew) + "select medical_v3_fixture_snapshot()", "crew self denied");
deny("set role anon;select medical_v3_fixture_snapshot()", "anonymous denied");
deny(as(gm) + "select medical_v3_ai_evidence('m1','c1')", "other mission denied");
deny(
  as(gm) +
    `select medical_v3_append_review('${mission}','${astronaut}','draft_created',null,gen_random_uuid(),'${snapshot.sha256}','draft','','rationale')`,
  "direct persistent RPC denied",
);
check(
  run(
    "select not has_function_privilege('service_role','public.medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text)','EXECUTE')",
  ) === "t",
  "service role persistent RPC denied",
);
for (const change of [
  `update mission_memberships set active=false where id='63470171-3a22-4075-b197-ac85b90cb0ef'`,
  `update missions set status='active' where id='${mission}'`,
  `update crew_members set display_name='Alex Morgan' where id='${astronaut}'`,
  `update mission_crew_assignments set status='candidate' where mission_id='${mission}'`,
]) {
  let rejected = false;
  try {
    run(`BEGIN;${change};${as(gm)}select medical_v3_fixture_snapshot();ROLLBACK;`);
  } catch {
    rejected = true;
  }
  check(rejected, `changed prerequisite denied: ${change}`);
}
transactionCheck(
  `alter table medical_v3_fixture_sources disable trigger medical_v3_fixture_immutable;update medical_v3_fixture_sources set source_sha256='tampered';${as(gm)}select medical_v3_ai_evidence('${mission}','${astronaut}') is null`,
  "tampered hash fails closed",
);
console.log(execFileSync("bun", ["scripts/test-production-synthetic-server.ts"], { env, encoding: "utf8" }));
check(run("select count(*)=1 and bool_and(released_at is not null) from medical_ai_quota_reservations") === "t", "server integration released its genuine quota");
// Reset only the disposable quota test rows before testing the full minute boundary.
run("delete from medical_ai_quota_reservations");
const lease = JSON.parse(
  run(as(gm) + `select medical_v3_reserve_ai('${mission}','${astronaut}')`)
    .split("\n")
    .at(-1),
);
check(lease.allowed, "atomic quota grants one lease");
check(
  JSON.parse(
    run(as(gm) + `select medical_v3_reserve_ai('${mission}','${astronaut}')`)
      .split("\n")
      .at(-1),
  ).allowed === false,
  "active concurrent lease denied",
);
run(as(gm) + `select medical_v3_release_ai('${lease.reservationId}')`);
for (let i = 0; i < 4; i++) {
  const r = JSON.parse(
    run(as(gm) + `select medical_v3_reserve_ai('${mission}','${astronaut}')`)
      .split("\n")
      .at(-1),
  );
  check(r.allowed, `minute request ${i + 2} allowed`);
  run(as(gm) + `select medical_v3_release_ai('${r.reservationId}')`);
}
check(
  JSON.parse(
    run(as(gm) + `select medical_v3_reserve_ai('${mission}','${astronaut}')`)
      .split("\n")
      .at(-1),
  ).allowed === false,
  "sixth request denied without refund",
);
check(
  run("select count(*) from medical_advisor_review_events") === "0",
  "persistent review table remains empty",
);
failed = false;
try {
  file(migration);
} catch {
  failed = true;
}
check(failed, "reapplication refuses existing namespace");
file("supabase/pending/20261026000000_medical_v3_production_synthetic_demo.rollback.sql");
for (const call of [
  "medical_v3_fixture_snapshot()",
  `medical_v3_ai_evidence('${mission}','${astronaut}')`,
  `medical_v3_reserve_ai('${mission}','${astronaut}')`,
])
  deny(as(gm) + `select ${call}`, `rollback revokes ${call}`);
check(
  run(`select count(*)=0 from medical_v3_authoritative_evidence('${mission}','${astronaut}')`) ===
    "t",
  "rollback resolver empty",
);
check(
  run(
    "select (select count(*) from medical_v3_fixture_sources)=1 and (select count(*) from medical_v3_fixture_observations)=2 and (select count(*) from medical_v3_fixture_receipts)=2 and (select count(*) from medical_ai_quota_reservations)=5",
  ) === "t",
  "rollback retains all fixtures and quota records",
);
run(as(gm) + `select medical_v3_release_ai('${lease.reservationId}')`);
check(true, "caller cleanup release retained");
console.log(
  `Production synthetic disposable assertions: ${assertions} passed. No production execution or AI activation.`,
);
