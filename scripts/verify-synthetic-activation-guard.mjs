// Disposable ONLY; never consumes managed PG environment or production credentials.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket?.startsWith("/tmp/") || process.env.FV0143_INCLUDE_PENDING !== "1")
  throw Error("Disposable socket opt-in required");
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = [
  "-h",
  socket,
  "-p",
  process.env.FV01_PG_PORT ?? "55432",
  "-U",
  "postgres",
  "-X",
  "-At",
  "-v",
  "ON_ERROR_STOP=1",
  "-d",
  "medical_v3_it",
];
const run = (s) =>
  execFileSync("psql", [...base, "-c", s], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
let n = 0;
const check = (v, label) => {
  if (!v) throw Error(label);
  n++;
  console.log("PASS:", label);
};
const deny = (s, label) => {
  let rejected = false;
  try {
    run(s);
  } catch {
    rejected = true;
  }
  check(rejected, label);
};
const actor = "22a72429-1674-4174-9b27-ba63db3c0279";
const caller = `set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false);`;
const migration = readFileSync(
  "supabase/pending/20261028000000_medical_demo_activation_guard.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/pending/20261028000000_medical_demo_activation_guard.rollback.sql",
  "utf8",
);
// Existing verifier leaves retaining-disabled schema; restore only inside this disposable DB.
// Restore exact committed functions/ACL by extracting CREATE definitions from the immutable migration.
const schema = readFileSync("drizzle/migrations/0011_medical_v3_synthetic_schema_only.sql", "utf8");
const scopeDef = schema.match(
  /CREATE OR REPLACE FUNCTION public\.medical_v3_fixture_scope\(\)[\s\S]*?END \$\$;/,
)?.[0];
if (!scopeDef) throw Error("scope definition unavailable");
const authorityDef = schema
  .slice(schema.lastIndexOf("CREATE OR REPLACE FUNCTION public.medical_v3_authoritative_evidence"))
  .match(/^CREATE OR REPLACE FUNCTION[\s\S]*?END \$\$;/)?.[0];
if (!authorityDef) throw Error("authority definition unavailable");
run(scopeDef + ";" + authorityDef);
run(
  "ALTER FUNCTION medical_v3_authoritative_evidence(text,text) SET search_path=pg_catalog,public,extensions,pg_temp",
);
run(`ALTER FUNCTION medical_v3_fixture_scope() OWNER TO postgres;ALTER FUNCTION medical_v3_fixture_scope() SET search_path=pg_catalog,public,extensions,pg_temp;
 GRANT EXECUTE ON FUNCTION medical_v3_fixture_snapshot(),medical_v3_ai_evidence(text,text),medical_v3_reserve_ai(text,text) TO authenticated;
 INSERT INTO auth.users(id) VALUES('${actor}') ON CONFLICT DO NOTHING;
 UPDATE mission_memberships SET user_id='${actor}' WHERE id='63470171-3a22-4075-b197-ac85b90cb0ef';
 DELETE FROM medical_ai_quota_reservations;`);
run("GRANT EXECUTE ON FUNCTION medical_v3_reserve_ai(text,text) TO service_role");
deny(`BEGIN;${migration}COMMIT;`, "guard refuses weakened existing function ACL dependencies");
run("REVOKE EXECUTE ON FUNCTION medical_v3_reserve_ai(text,text) FROM service_role");
check(
  run("select to_regclass('medical_demo_authorization') is null") === "t",
  "dependency failure creates no guard objects",
);
deny(
  `BEGIN;${migration}DO $$BEGIN RAISE EXCEPTION 'late fail';END$$;COMMIT;`,
  "late schema failure rolls back all guard objects",
);
check(
  run("select to_regclass('medical_demo_authorization') is null") === "t",
  "atomic failure leaves no guard",
);
run(`BEGIN;${migration}COMMIT;`);
for (const t of [
  "medical_demo_authorization",
  "medical_demo_attempts",
  "medical_demo_control_audit",
]) {
  check(
    run(
      `select relrowsecurity and relowner='postgres'::regrole from pg_class where oid='${t}'::regclass`,
    ) === "t",
    t + " RLS and trusted owner",
  );
  for (const role of ["anon", "authenticated", "service_role"])
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"])
      check(
        run(`select not has_table_privilege('${role}','${t}','${privilege}')`) === "t",
        role + " " + t + " " + privilege + " denied",
      );
}
const sha = JSON.parse(
  run(caller + "select medical_v3_fixture_snapshot()")
    .split("\n")
    .at(-1),
).sha256;
const nonce = "a".repeat(64);
const reserve = () =>
  JSON.parse(
    run(caller + `select medical_demo_reserve('${sha}','${nonce}')`)
      .split("\n")
      .at(-1),
  );
deny(
  `set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);select medical_demo_reserve('${sha}','${nonce}')`,
  "other authenticated account cannot reserve",
);
check(reserve().allowed === false, "default-off empty authorization denies");
deny(
  caller +
    `select medical_demo_authorize(now(),now()+interval '30 minutes','${actor}','owner-approval-ref','${sha}')`,
  "authenticated cannot activate",
);
run(
  `with x as (select clock_timestamp()+interval '0.1 seconds' t) select medical_demo_authorize(t,t+interval '30 minutes','${actor}','owner-approval-ref','${sha}') from x`,
);
run("select pg_sleep(0.15)");
deny(
  caller + `select medical_demo_reserve('sha256-changed','${nonce}')`,
  "altered evidence digest cannot reserve",
);
run("update mission_memberships set active=false where id='63470171-3a22-4075-b197-ac85b90cb0ef'");
deny(
  caller + `select medical_demo_reserve('${sha}','${nonce}')`,
  "revoked membership cannot reserve",
);
run("update mission_memberships set active=true where id='63470171-3a22-4075-b197-ac85b90cb0ef'");
const quotaMission = "mission-9d8ce8f3e5554509a0885461f9ad2e1c";
const quotaCrew = "crew-9806e7e611f44dc38dac5e23f7740f1a";
run(
  `insert into medical_ai_quota_reservations(actor_user_id,mission_id,crew_member_id,released_at) select '${actor}','${quotaMission}','${quotaCrew}',clock_timestamp() from generate_series(1,5)`,
);
check(
  reserve().allowed === false,
  "five user requests per minute block guard without consuming lifetime holds",
);
run("delete from medical_ai_quota_reservations");
run(
  `insert into medical_ai_quota_reservations(actor_user_id,mission_id,crew_member_id,released_at) select '00000000-0000-0000-0000-0000000000b1','${quotaMission}','${quotaCrew}',clock_timestamp() from generate_series(1,20)`,
);
check(reserve().allowed === false, "twenty mission requests per minute block guard");
check(
  run("select attempts=0 and held_microusd=0 from medical_demo_authorization") === "t",
  "quota denials have no provider attempt or cost hold",
);
run("delete from medical_ai_quota_reservations");
console.log(
  execFileSync("bun", ["scripts/test-synthetic-activation-server.ts"], { env, encoding: "utf8" }),
);
check(
  run(
    "select attempts=0 and held_microusd=0 and active_attempt is null from medical_demo_authorization",
  ) === "t",
  "production hard block consumes no provider attempt or cost hold",
);
run(
  "update medical_demo_authorization set attempts=0,held_microusd=0;delete from medical_demo_attempts;delete from medical_ai_quota_reservations;",
);
deny(
  `select medical_demo_authorize(now()+interval '1 minute',now()+interval '31 minutes','${actor}','second-window','${sha}')`,
  "authorization cannot reset lifetime counters",
);
const parallel = (sql) =>
  new Promise((resolve) => {
    const p = spawn("psql", [...base, "-c", sql], { env });
    let out = "";
    p.stdout.on("data", (v) => (out += v));
    p.on("close", (code) => resolve({ code, out }));
  });
const race = await Promise.all(
  Array.from({ length: 8 }, () =>
    parallel(caller + `select medical_demo_reserve('${sha}','${nonce}')`),
  ),
);
check(
  race.filter((r) => r.code === 0 && r.out.includes('"allowed": true')).length === 1,
  "eight concurrent reserve callers yield exactly one attempt",
);
const id = run("select active_attempt from medical_demo_authorization");
check(
  run(caller + `select medical_demo_finish('${id}',0,'${nonce}')`)
    .split("\n")
    .at(-1) === "f",
  "early completion cannot release an undispatched hold",
);
check(
  run(caller + `select medical_demo_dispatch(NULL,'${sha}',NULL)`)
    .split("\n")
    .at(-1) === "f",
  "NULL dispatch rejected",
);
check(
  run(caller + `select medical_demo_finish(NULL,0,NULL)`)
    .split("\n")
    .at(-1) === "f",
  "NULL completion rejected",
);
deny(caller + `select medical_demo_reserve('${sha}',NULL)`, "NULL nonce reserve denied");
check(
  run(caller + `select medical_demo_dispatch('${id}','${sha}','${"b".repeat(64)}')`)
    .split("\n")
    .at(-1) === "f",
  "wrong nonce denies transmission",
);
check(
  run(caller + `select medical_demo_dispatch('${id}','${sha}','${nonce}')`)
    .split("\n")
    .at(-1) === "t",
  "dispatch verifies live window evidence nonce",
);
check(
  run(caller + `select medical_demo_dispatch('${id}','${sha}','${nonce}')`)
    .split("\n")
    .at(-1) === "f",
  "dispatch cannot replay",
);
run(`update medical_ai_quota_reservations set lease_until=clock_timestamp()-interval '1 hour'`);
check(reserve().allowed === false, "lease expiry never bypasses concurrency");
run(caller + `select medical_demo_finish('${id}',NULL,'${nonce}')`);
check(reserve().allowed === false, "unknown outcome blocks forever and retains hold");
check(
  run("select attempts=1 and held_microusd=100000 from medical_demo_authorization") === "t",
  "failure never refunds attempts/budget",
);
// Controlled resets are exclusively disposable adversarial test setup, never recovery instructions.
check(
  run("select not enabled and active_attempt is not null from medical_demo_authorization") === "t",
  "unknown accounting disables and retains active hold",
);
run("update medical_demo_authorization set enabled=true,active_attempt=NULL;");
for (let i = 1; i < 10; i++) {
  run(
    "update medical_ai_quota_reservations set reserved_at=clock_timestamp()-interval '2 minutes'",
  );
  const r = reserve();
  check(r.allowed === true, "lifetime attempt " + (i + 1));
  run(
    caller +
      `select medical_demo_dispatch('${r.attemptId}','${sha}','${nonce}'); select medical_demo_finish('${r.attemptId}',76440,'${nonce}')`,
  );
}
check(reserve().allowed === false, "eleventh attempt denied");
check(
  run("select attempts=10 and held_microusd=1000000 from medical_demo_authorization") === "t",
  "USD1 holds exhausted without refunds",
);
run("update medical_demo_authorization set attempts=0,active_attempt=NULL;");
check(reserve().allowed === false, "budget denies independently of attempts");
run(
  "update medical_demo_authorization set held_microusd=0, ends_at=clock_timestamp()-interval '1 second'",
);
check(reserve().allowed === false, "expired UTC window denies");
run(
  "update medical_demo_authorization set ends_at=clock_timestamp()+interval '30 minutes';update medical_ai_quota_reservations set reserved_at=clock_timestamp()-interval '2 minutes'",
);
const pending = reserve();
check(pending.allowed === true, "reserved before disable");
run("update medical_demo_authorization set ends_at=clock_timestamp()-interval '1 second'");
check(
  run(caller + `select medical_demo_dispatch('${pending.attemptId}','${sha}','${nonce}')`)
    .split("\n")
    .at(-1) === "f",
  "expiry between reserve and dispatch denies provider permit",
);
run("update medical_demo_authorization set ends_at=clock_timestamp()+interval '30 minutes'");
deny(
  `set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);select medical_demo_disable('unauthorized')`,
  "unauthorized operator denied",
);
// Deterministic interleaving: wait until the disabling transaction holds the row and sleeps.
const disabling = parallel(
  `BEGIN;${caller}select medical_demo_disable('race-disable-first');select pg_sleep(0.5);COMMIT;`,
);
let lockObserved = false;
for (let i = 0; i < 100; i++) {
  if (
    run(
      "select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%race-disable-first%' and wait_event='PgSleep')",
    ) === "t"
  ) {
    lockObserved = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
}
check(lockObserved, "disable transaction holds lock before racing dispatch");
const racedDispatch = await parallel(
  caller + `select medical_demo_dispatch('${pending.attemptId}','${sha}','${nonce}')`,
);
check(
  (await disabling).code === 0 &&
    racedDispatch.code === 0 &&
    racedDispatch.out.trim().endsWith("f"),
  "disable-first transaction serializes and denies racing dispatch",
);
check(
  run(caller + `select medical_demo_dispatch('${pending.attemptId}','${sha}','${nonce}')`)
    .split("\n")
    .at(-1) === "f",
  "operator disable prevents pending dispatch",
);
check(reserve().allowed === false, "operator disable immediately denies without deployment");
// Dispatch-first is an authorized permit, NOT proof of an outbound send; demonstrate the limitation.
run(
  "update medical_demo_authorization set enabled=true,active_attempt=NULL;update medical_ai_quota_reservations set released_at=clock_timestamp(),reserved_at=clock_timestamp()-interval '2 minutes'",
);
const permitted = reserve();
const dispatching = parallel(
  `BEGIN;${caller}select medical_demo_dispatch('${permitted.attemptId}','${sha}','${nonce}');select pg_sleep(0.5);COMMIT; -- race-dispatch-first`,
);
let permitObserved = false;
for (let i = 0; i < 100; i++) {
  if (
    run(
      "select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%race-dispatch-first%' and wait_event='PgSleep')",
    ) === "t"
  ) {
    permitObserved = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
}
check(permitObserved, "dispatch-first transaction holds lock before disable");
const laterDisable = parallel(caller + "select medical_demo_disable('race-after-permit')");
check(
  (await dispatching).code === 0 && (await laterDisable).code === 0,
  "dispatch-first permit and later disable serialize without deadlock",
);
check(
  run(caller + `select medical_demo_dispatch('${permitted.attemptId}','${sha}','${nonce}')`)
    .trim()
    .endsWith("f"),
  "no second permit after disable takes effect",
);
run(caller + `select medical_demo_finish('${permitted.attemptId}',76441,'${nonce}')`);
check(
  run("select not enabled and active_attempt is not null from medical_demo_authorization") === "t",
  "over-bound accounting fails closed even after disable",
);
check(
  run(
    `select outcome='unknown' and usage_microusd is null from medical_demo_attempts where id='${permitted.attemptId}'`,
  ) === "t",
  "unverifiable cost is never recorded as bounded usage",
);
run(`BEGIN;${rollback}COMMIT;`);
run(`BEGIN;${rollback}COMMIT;`);
deny(
  caller + `select medical_demo_reserve('${sha}','${nonce}')`,
  "retaining disable revokes reserve",
);
check(
  run("select count(*)>0 from medical_demo_attempts") === "t",
  "rollback retains audit attempts",
);
check(
  run("select count(*)=0 from medical_advisor_review_events") === "t",
  "persistent reviews remain empty",
);
check(
  run(
    "select (select count(*) from medical_v3_fixture_sources)=1 and (select count(*) from medical_v3_fixture_observations)=2 and (select count(*) from medical_v3_fixture_receipts)=2",
  ) === "t",
  "fixtures byte-source scope unchanged",
);
console.log(
  `Synthetic activation guard: ${n} disposable SQL assertions passed; no production execution.`,
);
