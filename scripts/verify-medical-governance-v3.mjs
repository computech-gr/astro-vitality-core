// Destructive tests ONLY in the explicitly opted-in disposable local socket.
import { execFileSync, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket?.startsWith("/tmp/") || process.env.FV0143_INCLUDE_PENDING !== "1") {
  console.log("Medical v3: SKIPPED — disposable /tmp socket and FV0143_INCLUDE_PENDING=1 required");
  process.exit(0);
}
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
];
const db = "medical_v3_it";
const run = (sql, database = db) =>
  execFileSync("psql", [...base, "-d", database, "-c", sql], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const file = (path) =>
  execFileSync("psql", [...base, "-d", db, "-f", path], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
run(`drop database if exists ${db}`, "postgres");
run(`create database ${db}`, "postgres");
run(`alter database ${db} set search_path=public,extensions`, "postgres");
file("tests/integration-pg/stub.sql");
for (const name of readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort())
  file(`supabase/migrations/${name}`);
const migration = "supabase/pending/20261024000000_medical_governance_v3.sql";
file(migration);
file(migration);
file("tests/integration-pg/fv01-setup.sql");
const gm = "00000000-0000-0000-0000-0000000000a2";
const crew = "00000000-0000-0000-0000-0000000000b1";
run(
  `update mission_memberships set crew_member_id='c1' where user_id='${gm}' and role='ground_medical'`,
);
const as = (uid) =>
  `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`;
let passes = 0;
const check = (ok, name) => {
  if (!ok) throw new Error(name);
  passes++;
  console.log(`PASS: ${name}`);
};
const deny = (sql, pattern, name) => {
  try {
    run(sql);
  } catch (error) {
    check(pattern.test(String(error.stderr)), name);
    return;
  }
  throw new Error(`Unexpected success: ${name}`);
};
const append = (
  type = "draft_created",
  previous = "null",
  sha = `sha256-${"a".repeat(64)}`,
  request = "10000000-0000-0000-0000-000000000001",
) =>
  `select medical_v3_append_review('m1','c1','${type}',${previous},'${request}','${sha}','cv.hr 62 bpm','reviewed','synthetic test')`;
check(
  run("select count(*) from medical_advisor_review_events") === "0",
  "migration reapplication leaves history empty",
);
deny(as(crew) + append(), /authorization/, "crew self cannot append medical reviews");
deny(as(gm) + append().replace("'c1'", "'c2'"), /authorization/, "cross-crew denied");
deny(as(gm) + append().replace("'m1'", "'m2'"), /authorization/, "cross-mission denied");
deny(
  as(gm) + append(),
  /authoritative evidence unavailable/,
  "production resolver fails closed without evidence",
);
check(
  run(as(gm) + "select medical_v3_ai_evidence('m1','c1') is null").endsWith("t"),
  "AI source unavailable rather than trusting browser provenance",
);
// TEST ONLY authoritative fixture. Never copied to migrations or the production database.
run(`create table fvtest.medical_evidence(canonical text); insert into fvtest.medical_evidence values ('{"synthetic":true,"observations":[{"id":"obs-a","value":"62"}]}');
 create or replace function medical_v3_authoritative_evidence(p_mission text,p_crew text) returns table(canonical_text text,source_ids text[])
 language sql stable security definer set search_path=public as $$ select canonical,array['obs-a'] from fvtest.medical_evidence $$;`);
const sha = run(
  "select 'sha256-'||encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex') from fvtest.medical_evidence",
);
const draft = JSON.parse(
  run(as(gm) + append("draft_created", "null", sha))
    .split("\n")
    .at(-1),
);
check(
  draft.actor_user_id === gm && draft.revision === 1,
  "actor derived from auth.uid and revision server assigned",
);
check(
  JSON.parse(
    run(as(gm) + append("draft_created", "null", sha))
      .split("\n")
      .at(-1),
  ).id === draft.id,
  "idempotent replay creates no duplicate",
);
deny(
  as(gm) + append("draft_created", "null", sha).replace("'reviewed'", "'tampered'"),
  /idempotency conflict/,
  "conflicting idempotency payload denied",
);
deny(
  as(gm) +
    append(
      "approved",
      `'${draft.id}'`,
      `sha256-${"b".repeat(64)}`,
      "10000000-0000-0000-0000-000000000002",
    ),
  /tampered/,
  "SHA-256 tampering denied",
);
const concurrent = (sql) =>
  new Promise((resolve) => {
    const child = spawn("psql", [...base, "-d", db, "-c", sql], { env });
    let out = "";
    child.stdout.on("data", (data) => (out += data));
    child.stderr.on("data", (data) => (out += data));
    child.on("close", (code) => resolve({ code, out }));
  });
const approval = append("approved", `'${draft.id}'`, sha, "10000000-0000-0000-0000-000000000003");
const conflicts = await Promise.all([
  concurrent(as(gm) + "begin; " + approval + ";select pg_sleep(0.3);commit;"),
  concurrent(as(gm) + approval.replace("000000000003", "000000000004")),
]);
check(
  conflicts.filter((r) => r.code === 0).length === 1 &&
    conflicts.some((r) => /stale revision/.test(r.out)),
  "concurrent approvals yield exactly one terminal revision",
);
check(
  run("select count(*) from medical_advisor_review_events where event_type='approved'") === "1",
  "only one approval stored",
);
const latest = run("select id from medical_advisor_review_events order by revision desc limit 1");
const history = () =>
  JSON.parse(
    run(as(gm) + "select medical_v3_review_history('m1','c1')")
      .split("\n")
      .at(-1),
  );
check(
  history().some((r) => r.event_type === "approved" && r.verified_current),
  "server source and current role verify acknowledgment",
);
run("update fvtest.medical_evidence set canonical=canonical||' '");
check(
  history().every((r) => !r.verified_current),
  "changed evidence marks history stale at read time",
);
run("update fvtest.medical_evidence set canonical=rtrim(canonical)");
run(`update mission_memberships set active=false where user_id='${gm}' and role='ground_medical'`);
deny(
  as(gm) + "select medical_v3_review_history('m1','c1')",
  /denied/,
  "revoked role cannot read history",
);
check(
  run(as(gm) + "select count(*) from medical_advisor_review_events").endsWith("0"),
  "RLS hides all rows after membership revocation",
);
run(`update mission_memberships set active=true where user_id='${gm}' and role='ground_medical'`);
deny(
  as(gm) + "insert into medical_advisor_review_events default values",
  /permission denied/,
  "direct client inserts denied",
);
deny(
  "update medical_advisor_review_events set rationale='changed'",
  /append-only/,
  "even privileged updates cannot rewrite history",
);
deny(
  "delete from medical_advisor_review_events",
  /append-only/,
  "even privileged deletes cannot erase history",
);
deny(
  "insert into medical_advisor_review_events(mission_id,crew_member_id,provenance,actor_user_id,event_type,revision,request_id,request_sha256,evidence_sha256,draft_text,final_text,rationale) values('m1','c1','real','00000000-0000-0000-0000-0000000000a2','draft_created',3,gen_random_uuid(),'x','" +
    sha +
    "','draft','','reason')",
  /check constraint/,
  "real provenance cannot enter synthetic history",
);
run(as(gm) + append("revoked", `'${latest}'`, sha, "10000000-0000-0000-0000-000000000005"));
check(
  history().every((r) => !r.verified_current) && history().some((r) => r.event_type === "revoked"),
  "revocation appends and invalidates acknowledgment",
);
const reserve = as(gm) + "select medical_v3_reserve_ai('m1','c1')";
const races = await Promise.all(Array.from({ length: 10 }, () => concurrent(reserve)));
check(
  races.filter((r) => /"allowed": true/.test(r.out)).length === 1,
  "atomic concurrent reservations allow one in-flight request per user",
);
run("update medical_ai_quota_reservations set released_at=clock_timestamp()");
for (let i = 0; i < 4; i++) {
  check(
    run(reserve).includes('"allowed": true'),
    "quota reservation within per-user window " + (i + 2),
  );
  run("update medical_ai_quota_reservations set released_at=clock_timestamp()");
}
check(
  run(reserve).includes('"allowed": false'),
  "sixth user request is denied with retry interval",
);
run("delete from medical_ai_quota_reservations");
run(`insert into medical_ai_quota_reservations(actor_user_id,mission_id,crew_member_id,released_at)
 select gen_random_uuid(),'m1','c1',clock_timestamp() from generate_series(1,20)`);
check(run(reserve).includes('"allowed": false'), "mission-wide quota blocks request 21");
deny(
  as(crew) + "select medical_v3_reserve_ai('m1','c1')",
  /denied/,
  "unauthorized quota reservations denied",
);
check(
  run(as(crew) + "select count(*) from medical_advisor_review_events").endsWith("0"),
  "crew self RLS cannot read advisor history",
);
run(`drop database ${db}`, "postgres");
console.log(
  `Medical governance v3: PASS (${passes} isolated assertions); authoritative fixture ONLY in disposable test; production remains blocked.`,
);
