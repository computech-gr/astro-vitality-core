// Disposable PostgreSQL ONLY, never managed PG environment or provider requests.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket?.startsWith("/tmp/") || process.env.FV0143_INCLUDE_PENDING !== "1")
  throw Error("Disposable opt-in required");
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const args = [
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
  execFileSync("psql", [...args, "-c", s], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
let n = 0;
const check = (v, l) => {
  if (!v) throw Error(l);
  n++;
  console.log("PASS:", l);
};
const deny = (s, l) => {
  let rejected = false;
  try {
    run(s);
  } catch {
    rejected = true;
  }
  check(rejected, l);
};
const actor = "22a72429-1674-4174-9b27-ba63db3c0279";
const caller = `set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false);`;
const value = (s) =>
  run(caller + s)
    .split("\n")
    .at(-1);
// Restore immutable prerequisites revoked by earlier disposable retaining-disable tests.
const schema = readFileSync("drizzle/migrations/0011_medical_v3_synthetic_schema_only.sql", "utf8");
for (const name of ["medical_v3_fixture_scope", "medical_v3_authoritative_evidence"]) {
  const part = schema.slice(schema.lastIndexOf("CREATE OR REPLACE FUNCTION public." + name));
  const definition = part.match(/^CREATE OR REPLACE FUNCTION[\s\S]*?END \$\$;/)?.[0];
  if (!definition) throw Error(name);
  run(definition);
}
run(
  "ALTER FUNCTION medical_v3_fixture_scope() SET search_path=pg_catalog,public,extensions,pg_temp;ALTER FUNCTION medical_v3_authoritative_evidence(text,text) SET search_path=pg_catalog,public,extensions,pg_temp;GRANT EXECUTE ON FUNCTION medical_v3_fixture_snapshot(),medical_v3_ai_evidence(text,text),medical_v3_reserve_ai(text,text) TO authenticated;",
);
const guard = readFileSync("drizzle/migrations/0012_medical_demo_activation_guard.sql", "utf8");
for (const name of ["medical_demo_scope", "medical_demo_reserve", "medical_demo_dispatch"]) {
  const definition = guard
    .slice(guard.indexOf("CREATE FUNCTION public." + name))
    .match(/^CREATE FUNCTION[\s\S]*?\$\$;/)?.[0];
  if (!definition) throw Error(name);
  run(definition.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
}
run(
  "GRANT EXECUTE ON FUNCTION medical_demo_reserve(text,text),medical_demo_dispatch(uuid,text,text) TO authenticated;UPDATE medical_demo_authorization SET enabled=false,active_attempt=NULL;DELETE FROM medical_ai_quota_reservations;",
);
const migration = readFileSync(
  "supabase/pending/20261029000000_medical_research_policy.sql",
  "utf8",
);
deny(
  `BEGIN;${migration}DO $$BEGIN RAISE EXCEPTION 'late';END$$;COMMIT;`,
  "late DDL failure rolls back policy and legacy revocations",
);
check(
  run("select to_regclass('medical_research_policy') is null") === "t",
  "no partial installation",
);
run("UPDATE medical_demo_authorization SET enabled=true");
deny(`BEGIN;${migration}COMMIT;`, "active legacy policy cannot transition");
run("UPDATE medical_demo_authorization SET enabled=false");
run(`BEGIN;${migration}COMMIT;`);
for (const table of ["owners", "policy", "attempts", "provider_sync", "audit"]) {
  check(
    run(
      `select relrowsecurity and relowner='postgres'::regrole from pg_class where oid='medical_research_${table}'::regclass`,
    ) === "t",
    table + " RLS and trusted owner",
  );
  for (const role of ["anon", "authenticated", "service_role"])
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"])
      check(
        run(
          `select not has_table_privilege('${role}','medical_research_${table}','${privilege}')`,
        ) === "t",
        role + " " + table + " " + privilege + " denied",
      );
}
for (const fn of JSON.parse(
  run(
    "select json_agg(json_build_object('sig',oid::regprocedure::text,'name',proname,'owner',proowner='postgres'::regrole,'path',proconfig @> ARRAY['search_path=pg_catalog, public, extensions, pg_temp'])) from pg_proc where pronamespace='public'::regnamespace and proname like 'medical_research_%'",
  ),
)) {
  check(fn.owner && fn.path, fn.name + " hardened");
  check(
    run(`select not has_function_privilege('anon','${fn.sig}','EXECUTE')`) === "t",
    fn.name + " anonymous denied",
  );
  check(
    run(`select has_function_privilege('service_role','${fn.sig}','EXECUTE')`) ===
      (fn.name === "medical_research_record_sync" ? "t" : "f"),
    fn.name + " service allowlist",
  );
}
check(
  run(
    "select not has_function_privilege('authenticated','medical_demo_reserve(text,text)','EXECUTE') and not has_function_privilege('authenticated','medical_demo_dispatch(uuid,text,text)','EXECUTE')",
  ) === "t",
  "legacy cannot bypass permanent admission",
);
const sha = JSON.parse(value("select medical_v3_fixture_snapshot()")).sha256;
check(
  JSON.parse(value("select medical_research_status()")).eligible === false,
  "unprovisioned policy default off",
);
deny(
  caller + `select medical_research_provision('${actor}','${sha}')`,
  "authenticated cannot provision owner",
);
run(`select medical_research_provision('${actor}','${sha}')`);
check(value("select medical_research_is_owner()") === "t", "explicit provisioned owner");
const config = (enabled = true, budget = 1000000, limit = 10, seconds = 1800) =>
  value(
    `select medical_research_configure(${enabled},${budget},${limit},${seconds},NULL,false,(select (medical_research_status()->>'revision')::bigint),'test-owner-ref')`,
  );
config();
const state = () => JSON.parse(value("select medical_research_status()"));
const nonce = () => run("select encode(extensions.gen_random_bytes(32),'hex')");
const reserve = (key = nonce()) =>
  JSON.parse(value(`select medical_research_reserve('${sha}','${key}')`));
deny(
  `set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);select medical_research_pause('bad')`,
  "nonowner cannot pause",
);
const parallel = (s) =>
  new Promise((resolve) => {
    const p = spawn("psql", [...args, "-c", s], { env });
    let out = "";
    p.stdout.on("data", (v) => (out += v));
    p.on("close", (code) => resolve({ code, out }));
  });
const races = await Promise.all(
  Array.from({ length: 8 }, () =>
    parallel(caller + `select medical_research_reserve('${sha}','${nonce()}')`),
  ),
);
check(
  races.filter((r) => r.code === 0 && r.out.includes('"allowed": true')).length === 1,
  "eight reserve callers yield one atomic hold",
);
let id = state().activeAttempt;
let key = nonce();
value("select medical_research_pause('pause-test')");
check(
  value(`select medical_research_dispatch('${id}','${sha}','${key}')`) === "f",
  "pause stops subsequent dispatch",
);
run(
  `update medical_research_attempts set reserved_at=clock_timestamp()-interval '3 minutes' where id='${id}'`,
);
value(`select medical_research_resolve('${id}','recover-retain-test')`);
check(state().heldMicrousd === 100000, "recovery never refunds hold");
config(true, 200000, 10);
check(reserve().allowed, "second budget hold allowed");
id = state().activeAttempt;
check(reserve().allowed === false, "active concurrency cannot bypass cap");
value("select medical_research_pause('budget-pause')");
run(
  `update medical_research_attempts set reserved_at=clock_timestamp()-interval '3 minutes' where id='${id}'`,
);
value(`select medical_research_resolve('${id}','budget-recovery-test')`);
config(true, 200000);
check(reserve().allowed === false, "monthly budget independently exhausted");
// Disposable resets are adversarial fixtures ONLY, never recovery instructions.
run("delete from medical_research_attempts;delete from medical_ai_quota_reservations;");
config(true, 10000000, 2, 60);
for (let i = 0; i < 2; i++) {
  key = nonce();
  const r = reserve(key);
  check(r.allowed, "rolling request " + i);
  check(
    value(`select medical_research_dispatch('${r.attemptId}','${sha}','${key}')`) === "t",
    "nonce dispatch",
  );
  check(
    value(`select medical_research_dispatch('${r.attemptId}','${sha}','${key}')`) === "f",
    "no replay",
  );
  check(
    value(
      `select medical_research_finish('${r.attemptId}',2000,100,100,'success','mock-request','${key}')`,
    ) === "t",
    "bounded token accounting",
  );
}
check(reserve().allowed === false, "configurable rolling limit blocks third");
run(
  "update medical_research_attempts set reserved_at=clock_timestamp()-interval '2 minutes';update medical_ai_quota_reservations set reserved_at=clock_timestamp()-interval '2 minutes'",
);
check(reserve().allowed, "rolling replenishment works without lifetime expiry");
id = state().activeAttempt;
value("select medical_research_pause('unknown-pause')");
run(
  `update medical_research_attempts set reserved_at=clock_timestamp()-interval '3 minutes' where id='${id}'`,
);
value(`select medical_research_resolve('${id}','unknown-recovery-test')`);
config();
// Independently exercise current per-minute quotas, rollback, stale admission and both pause orderings.
run(
  "delete from medical_research_attempts;delete from medical_ai_quota_reservations;update medical_research_policy set active_attempt=NULL;",
);
run(
  `insert into medical_ai_quota_reservations(actor_user_id,mission_id,crew_member_id,released_at) select '${actor}','mission-9d8ce8f3e5554509a0885461f9ad2e1c','crew-9806e7e611f44dc38dac5e23f7740f1a',clock_timestamp() from generate_series(1,5)`,
);
check(!reserve().allowed, "five user requests per minute retained");
run("delete from medical_ai_quota_reservations;");
run(
  "insert into medical_ai_quota_reservations(actor_user_id,mission_id,crew_member_id,released_at) select '00000000-0000-0000-0000-0000000000b1','mission-9d8ce8f3e5554509a0885461f9ad2e1c','crew-9806e7e611f44dc38dac5e23f7740f1a',clock_timestamp() from generate_series(1,20)",
);
check(!reserve().allowed, "twenty mission requests per minute retained");
run("delete from medical_ai_quota_reservations;");
key = nonce();
deny(
  `BEGIN;${caller}select medical_research_reserve('${sha}','${key}');DO $$BEGIN RAISE EXCEPTION 'late reserve';END$$;COMMIT;`,
  "late reservation failure atomically rolls back quota and hold",
);
check(state().heldMicrousd === 0, "partial reserve consumes no hold");
let expired = reserve(key);
run(
  `update medical_research_attempts set reserved_at=clock_timestamp()-interval '31 seconds' where id='${expired.attemptId}'`,
);
check(
  value(`select medical_research_dispatch('${expired.attemptId}','${sha}','${key}')`) === "f",
  "stale reservation permit expires without lifetime expiry",
);
value("select medical_research_pause('expired-permit')");
run(
  `update medical_research_attempts set reserved_at=clock_timestamp()-interval '3 minutes' where id='${expired.attemptId}'`,
);
value(`select medical_research_resolve('${expired.attemptId}','expired-permit-recovery')`);
config();
run("delete from medical_ai_quota_reservations;");
key = nonce();
let racing = reserve(key);
const waitLock = async (marker) => {
  for (let i = 0; i < 100; i++) {
    if (
      run(
        `select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%${marker}%' and wait_event='PgSleep')`,
      ) === "t"
    )
      return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("race lock unavailable");
};
const pausing = parallel(
  `BEGIN;${caller}select medical_research_pause('v2-pause-first');select pg_sleep(0.4);COMMIT;`,
);
await waitLock("v2-pause-first");
const blocked = await parallel(
  caller + `select medical_research_dispatch('${racing.attemptId}','${sha}','${key}')`,
);
check(
  (await pausing).code === 0 && blocked.out.trim().endsWith("f"),
  "pause-first serializes and denies racing dispatch",
);
run(
  `update medical_research_attempts set reserved_at=clock_timestamp()-interval '3 minutes' where id='${racing.attemptId}'`,
);
value(`select medical_research_resolve('${racing.attemptId}','race-recovery-retained')`);
config();
run("delete from medical_ai_quota_reservations;");
key = nonce();
racing = reserve(key);
const permitting = parallel(
  `BEGIN;${caller}select medical_research_dispatch('${racing.attemptId}','${sha}','${key}');select pg_sleep(0.4);COMMIT; -- v2-permit-first`,
);
await waitLock("v2-permit-first");
const afterPermit = parallel(caller + "select medical_research_pause('v2-after-permit')");
check(
  (await permitting).code === 0 && (await afterPermit).code === 0,
  "permit-first and pause serialize with documented residual risk",
);
check(
  value(`select medical_research_dispatch('${racing.attemptId}','${sha}','${key}')`) === "f",
  "no new permit after pause",
);
value(
  `select medical_research_finish('${racing.attemptId}',2000,100,100,'success','mock','${key}')`,
);
config();
run(
  "update medical_research_attempts set month=(date_trunc('month',clock_timestamp() at time zone 'UTC')-interval '1 month')::date,reserved_at=clock_timestamp()-interval '1 month';delete from medical_ai_quota_reservations;",
);
check(state().heldMicrousd === 0, "UTC monthly rollover retains history but starts fresh budget");
run("delete from medical_ai_quota_reservations;");
key = nonce();
let r = reserve(key);
value(`select medical_research_dispatch('${r.attemptId}','${sha}','${key}')`);
value(
  `select medical_research_finish('${r.attemptId}',NULL,NULL,NULL,'credit_exhausted',NULL,'${key}')`,
);
check(
  !state().enabled && state().activeAttempt === r.attemptId,
  "billing failure pauses with active hold retained",
);
deny(
  caller +
    `select medical_research_configure(true,1000000,10,1800,NULL,false,${state().revision},'resume')`,
  "resume cannot hide unresolved billing failure",
);
run(
  `update medical_research_attempts set reserved_at=clock_timestamp()-interval '3 minutes' where id='${r.attemptId}'`,
);
value(`select medical_research_resolve('${r.attemptId}','confirmed-provider-recovery')`);
value(
  `select medical_research_configure(true,1000000,10,1800,'proj_test',true,${state().revision},'report-test')`,
);
check(!state().eligible, "required reporting stale fails closed");
deny(
  caller +
    "select medical_research_record_sync(date_trunc('month',now() at time zone 'UTC')::date,'proj_test',0,0,0,0,clock_timestamp(),'22a72429-1674-4174-9b27-ba63db3c0279')",
  "browser cannot fabricate provider recorded cost",
);
run(
  "set role service_role;select set_config('request.jwt.claim.role','service_role',false);select medical_research_record_sync(date_trunc('month',now() at time zone 'UTC')::date,'proj_test',1000000,100,20,1,clock_timestamp(),'22a72429-1674-4174-9b27-ba63db3c0279')",
);
deny(
  "set role service_role;select set_config('request.jwt.claim.role','service_role',false);select medical_research_record_sync(date_trunc('month',now() at time zone 'UTC')::date,'proj_test',1,1,1,1,clock_timestamp(),'22a72429-1674-4174-9b27-ba63db3c0279')",
  "regressing provider snapshot cannot refresh timestamp",
);
check(state().recordedMicrousd === 1000000, "privileged recorded costs separated");
check(state().remainingMicrousd === 0, "recorded costs plus holds fail closed");
run(
  "BEGIN;" +
    readFileSync("supabase/pending/20261029000000_medical_research_policy.rollback.sql", "utf8") +
    "COMMIT;",
);
check(!state().enabled, "retaining pause recovery");
check(
  run("select count(*)=0 from medical_advisor_review_events") === "t",
  "persistent clinical reviews still denied",
);
check(
  run("select count(*)=2 from medical_v3_fixture_observations") === "t",
  "exact fixtures preserved",
);
console.log(
  `Permanent synthetic policy: ${n} disposable SQL assertions passed; no production or provider writes.`,
);
