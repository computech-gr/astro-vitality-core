// FV-01.2 PostgreSQL integration runner.
// Requires a DISPOSABLE local PostgreSQL 17 reachable through FV01_PG_SOCKET_DIR
// (and optional FV01_PG_PORT). It refuses to run when any managed PG* connection
// variable would be used, so it cannot touch the project database.
// Steps: recreate database -> Supabase-like stubs -> every migration in supabase/migrations (FV-01 included once) ->
// fixtures -> sequential and concurrent scenarios.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket) {
  console.log(
    "FV-01 PostgreSQL integration: SKIPPED (set FV01_PG_SOCKET_DIR to a disposable local server)",
  );
  process.exit(0);
}
const port = process.env.FV01_PG_PORT ?? "55432";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const base = ["-h", socket, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-X"];
const psql = (args, db = "postgres") =>
  execFileSync("psql", [...base, "-d", db, ...args], { env, encoding: "utf8" });

psql(["-c", "drop database if exists fv01_it", "-c", "create database fv01_it"]);
psql(["-c", "alter database fv01_it set search_path = public, extensions"]);
psql(["-f", "tests/integration-pg/stub.sql"], "fv01_it");
const migrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const f of migrations) psql(["-f", join("supabase/migrations", f)], "fv01_it");
// FV-01.4.3: staged (NOT applied in production) hardening migrations are exercised only when explicitly requested.
// FV-01.4.3 is governed migration 12 (applied above for every run). Optional extra
// staged files in supabase/pending are still only applied with the flag.
const FV0143 = "20261015000000_fv0143_multirole_hardening.sql";
const includePending = process.env.FV0143_INCLUDE_PENDING === "1" || migrations.includes(FV0143);
const pending =
  includePending && existsSync("supabase/pending")
    ? readdirSync("supabase/pending")
        .filter((f) => f.endsWith(".sql") && !f.includes("rollback"))
        .sort()
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
const as = (uid) =>
  `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`;
const RES = "00000000-0000-0000-0000-0000000000a3";
const OP = "00000000-0000-0000-0000-0000000000a1";
const C1 = "00000000-0000-0000-0000-0000000000b1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const passes = [...seqPasses];

// C1: concurrent exports by the same researcher on a closed mission.
psql(
  ["-c", `${as(OP)} select public.update_mission_operation('m3', null, 'completed');`],
  "fv01_it",
);
const a = session(
  `${as(RES)} begin; select public.export_research_mission('m3'); select pg_sleep(2); commit;`,
);
await sleep(500);
const b = session(`${as(RES)} begin; select public.export_research_mission('m3'); commit;`);
const [ra, rb] = await Promise.all([a, b]);
if (ra.code !== 0) throw new Error("C1 first export failed: " + ra.out);
if (rb.code === 0 || !/rate limit/.test(rb.out))
  throw new Error("C1 concurrent export not refused: " + rb.out);
passes.push("PASS: concurrent duplicate export blocked by lock and refused by 24h limit");

// C2: ingestion in flight while the mission closes -> snapshot includes it (close waits).
const ing = session(
  `${as(C1)} begin; select public.ingest_mission_event(fvtest.ev('m4','c1','e-m4-1', now()), 'key-e-m4-1-aaaaaaaaaa'); select pg_sleep(2); commit;`,
);
await sleep(500);
const close = session(`${as(OP)} select public.update_mission_operation('m4', null, 'completed');`);
const [ri, rc] = await Promise.all([ing, close]);
if (ri.code !== 0 || rc.code !== 0) throw new Error("C2 failed: " + ri.out + rc.out);
const snap = psql(
  [
    "-t",
    "-A",
    "-c",
    "select event_count from public.mission_research_snapshots where mission_id='m4'",
  ],
  "fv01_it",
).trim();
if (snap !== "1") throw new Error("C2 snapshot did not capture in-flight committed event: " + snap);
passes.push("PASS: close waits for in-flight ingestion; snapshot captures it consistently");

// C3: ingestion arriving during/after close -> excluded from frozen snapshot.
const late = await session(
  `${as(C1)} select public.ingest_mission_event(fvtest.ev('m4','c1','e-m4-2', now() - interval '1 minute'), 'key-e-m4-2-aaaaaaaaaa');`,
);
const snap2 = psql(
  [
    "-t",
    "-A",
    "-c",
    "select event_count from public.mission_research_snapshots where mission_id='m4'",
  ],
  "fv01_it",
).trim();
if (snap2 !== "1") throw new Error("C3 snapshot changed after close: " + snap2 + " " + late.out);
passes.push("PASS: post-close ingestion never changes the frozen snapshot");

psql(["-c", "drop database fv01_it"]);

// FV-01.4.3 multi-role scenarios in a fresh disposable database:
// migrations -> fixtures -> pre-existing invites -> staged hardening -> scenarios.
if (includePending) {
  psql(["-c", "drop database if exists fv0143_it", "-c", "create database fv0143_it"]);
  psql(["-c", "alter database fv0143_it set search_path = public, extensions"]);
  psql(["-f", "tests/integration-pg/stub.sql"], "fv0143_it");
  // Pre-existing invites must be created BEFORE migration 12 to prove they cannot bypass approval.
  for (const f of migrations.filter((m) => m !== FV0143))
    psql(["-f", join("supabase/migrations", f)], "fv0143_it");
  psql(["-f", "tests/integration-pg/fv01-setup.sql"], "fv0143_it");
  psql(["-f", "tests/integration-pg/fv0143-pre-existing.sql"], "fv0143_it");
  if (migrations.includes(FV0143)) psql(["-f", join("supabase/migrations", FV0143)], "fv0143_it");
  for (const f of pending) psql(["-f", join("supabase/pending", f)], "fv0143_it");
  const mr = psql(["-t", "-A", "-f", "tests/integration-pg/fv0143-multirole.sql"], "fv0143_it");
  if (!mr.includes("FV0143 DONE")) throw new Error("FV-01.4.3 scenarios incomplete");
  passes.push(
    ...mr
      .split("\n")
      .filter((l) => l.startsWith("PASS"))
      .map((l) => l.replace("PASS: ", "PASS: [FV-01.4.3] ")),
  );
  // FV-01.4.6: audit-viewer reader scenarios (governed migration 13, or a staged copy).
  if (migrations.some((f) => f.includes("fv0146")) || pending.some((f) => f.includes("fv0146"))) {
    const av = psql(
      ["-t", "-A", "-f", "tests/integration-pg/fv0146-audit-viewer.sql"],
      "fv0143_it",
    );
    if (!av.includes("FV0146 DONE")) throw new Error("FV-01.4.6 scenarios incomplete");
    passes.push(
      ...av
        .split("\n")
        .filter((l) => l.startsWith("PASS"))
        .map((l) => l.replace("PASS: ", "PASS: [FV-01.4.6] ")),
    );
  }
  psql(["-c", "drop database fv0143_it"]);
}

// P36.4: staged synthetic submission path (only when the staged file is present).
if (pending.some((f) => f.includes("p364_synthetic_submission"))) {
  const DB = "p364_it";
  const run = (args) => {
    const r = spawnSync("psql", [...base, "-d", DB, "-t", "-A", ...args], {
      env,
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error("P36.4 psql failed: " + r.stderr + r.stdout);
    return (r.stdout + "\n" + r.stderr).replace(/^psql:[^\n]*?NOTICE:\s+/gm, "");
  };
  const q = (sql) => run(["-c", sql]).split("\n")[0].trim();
  psql(["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
  psql(["-c", `alter database ${DB} set search_path = public, extensions`]);
  psql(["-f", "tests/integration-pg/stub.sql"], DB);
  for (const f of migrations) psql(["-f", join("supabase/migrations", f)], DB);
  for (const f of pending) psql(["-f", join("supabase/pending", f)], DB);
  for (const f of pending) psql(["-f", join("supabase/pending", f)], DB); // re-apply: idempotent
  passes.push("PASS: [P36.4] staged B10 + P36.4 SQL applies twice without error (idempotent)");
  psql(["-f", "tests/integration-pg/fv01-setup.sql"], DB);
  const out = run(["-f", "tests/integration-pg/p364-submission.sql"]);
  if (!out.includes("P364 DONE")) throw new Error("P36.4 scenarios incomplete: " + out);
  passes.push(
    ...out
      .split("\n")
      .filter((l) => l.startsWith("PASS"))
      .map((l) => l.replace("PASS: ", "PASS: [P36.4] ")),
  );

  const s = (sql) =>
    new Promise((resolve) => {
      const child = spawn("psql", [...base, "-d", DB, "-t", "-A", "-c", sql], { env });
      let o = "";
      child.stdout.on("data", (d) => (o += d));
      child.stderr.on("data", (d) => (o += d));
      child.on("close", (code) => resolve({ code, out: o }));
    });
  const B2 = "00000000-0000-0000-0000-0000000000b2";
  const sub = (sha, key, v = "70", m = "cv-003") =>
    `select p364t.sub('${B2}','m1','c2',repeat('${sha}',64),'${key}',p364t.it('${m}','bpm','${v}'),'2026-10-02')`;
  const asB2 = "set role authenticated;";
  const count = (where) => q(`select count(*) from p36_biomarker_review_batches where ${where}`);

  // K1: identical concurrent retries (same key) -> one submitted, one replayed, one batch.
  const k1a = s(`${asB2} begin; ${sub("1", "key-k1-aaaaaaaaaaaa")}; select pg_sleep(2); commit;`);
  await sleep(500);
  const k1b = s(`${asB2} ${sub("1", "key-k1-aaaaaaaaaaaa")};`);
  const [r1a, r1b] = await Promise.all([k1a, k1b]);
  if (
    r1a.code !== 0 ||
    r1b.code !== 0 ||
    !/submitted/.test(r1a.out) ||
    !/replayed/.test(r1b.out) ||
    count("idempotency_key='key-k1-aaaaaaaaaaaa'") !== "1"
  )
    throw new Error("K1 failed: " + r1a.out + r1b.out);
  passes.push(
    "PASS: [P36.4] K1 concurrent identical retries: one submitted, one replayed, exactly one batch",
  );

  // K2: concurrent different keys, same source+date -> one wins, other duplicate.
  const k2a = s(`${asB2} begin; ${sub("2", "key-k2a-aaaaaaaaaaa")}; select pg_sleep(2); commit;`);
  await sleep(500);
  const k2b = s(`${asB2} ${sub("2", "key-k2b-aaaaaaaaaaa", "71")};`);
  const [r2a, r2b] = await Promise.all([k2a, k2b]);
  if (
    r2a.code !== 0 ||
    r2b.code === 0 ||
    !/duplicate synthetic submission/.test(r2b.out) ||
    count(`source_fingerprint=repeat('2',64)`) !== "1"
  )
    throw new Error("K2 failed: " + r2a.out + r2b.out);
  passes.push(
    "PASS: [P36.4] K2 concurrent duplicate source/date under different keys: one batch, other refused",
  );

  const revoke = `update mission_memberships set active=false where user_id='${B2}' and mission_id='m1'`;
  const restore = `update mission_memberships set active=true where user_id='${B2}' and mission_id='m1'`;
  // K3: revocation holds first then commits -> submission waits and is refused.
  const k3a = s(`begin; ${revoke}; select pg_sleep(2); commit;`);
  await sleep(500);
  const k3b = s(`${asB2} ${sub("3", "key-k3-aaaaaaaaaaaa")};`);
  const [r3a, r3b] = await Promise.all([k3a, k3b]);
  if (
    r3a.code !== 0 ||
    r3b.code === 0 ||
    !/active crew_self membership/.test(r3b.out) ||
    count(`source_fingerprint=repeat('3',64)`) !== "0"
  )
    throw new Error("K3 failed: " + r3a.out + r3b.out);
  passes.push(
    "PASS: [P36.4] K3 revocation-first: concurrent submission waits on membership lock and is refused",
  );
  q(restore);

  // K4: submission holds first then commits -> revocation waits; batch exists, membership then inactive.
  const k4a = s(`${asB2} begin; ${sub("4", "key-k4-aaaaaaaaaaaa")}; select pg_sleep(2); commit;`);
  await sleep(500);
  const t0 = Date.now();
  const k4b = s(`${revoke};`);
  const [r4a, r4b] = await Promise.all([k4a, k4b]);
  if (
    r4a.code !== 0 ||
    r4b.code !== 0 ||
    Date.now() - t0 < 1000 ||
    count(`source_fingerprint=repeat('4',64)`) !== "1" ||
    q(
      `select bool_and(not active) from mission_memberships where user_id='${B2}' and mission_id='m1'`,
    ) !== "t"
  )
    throw new Error("K4 failed: " + r4a.out + r4b.out);
  passes.push(
    "PASS: [P36.4] K4 submission-first: revocation waits for commit; batch kept, membership then revoked",
  );
  q(restore);

  // K5: submission rolls back while revocation waits -> no batch, no audit, revocation completes.
  const auditBefore = q(
    "select count(*) from audit_events where action='p36_synthetic_batch_submitted'",
  );
  const k5a = s(`${asB2} begin; ${sub("5", "key-k5-aaaaaaaaaaaa")}; select pg_sleep(2); rollback;`);
  await sleep(500);
  const k5b = s(`${revoke};`);
  const [r5a, r5b] = await Promise.all([k5a, k5b]);
  if (
    r5a.code !== 0 ||
    r5b.code !== 0 ||
    count(`source_fingerprint=repeat('5',64)`) !== "0" ||
    q("select count(*) from audit_events where action='p36_synthetic_batch_submitted'") !==
      auditBefore
  )
    throw new Error("K5 failed: " + r5a.out + r5b.out);
  passes.push(
    "PASS: [P36.4] K5 rolled-back submission leaves no batch or audit; revocation completes",
  );
  q(restore);

  // R1: rollback script removes the P36.4 write path; B10 schema and audit rows remain.
  psql(["-f", "supabase/pending/20261018000000_p364_synthetic_submission.rollback.sql"], DB);
  if (
    q("select count(*) from pg_proc where proname='p36_submit_synthetic_review_batch'") !== "0" ||
    q("select to_regclass('public.p36_metric_unit_catalog') is null") !== "t" ||
    q("select to_regclass('public.p36_biomarker_review_batches') is not null") !== "t" ||
    q("select count(*) > 0 from audit_events where action='p36_synthetic_batch_submitted'") !== "t"
  )
    throw new Error("R1 rollback verification failed");
  passes.push(
    "PASS: [P36.4] R1 rollback removes function/catalog/columns; B10 schema and append-only audit retained",
  );
  psql(["-f", "supabase/pending/20261018000000_p364_synthetic_submission.sql"], DB);
  passes.push("PASS: [P36.4] R2 P36.4 SQL re-applies cleanly after rollback");
  psql(["-c", `drop database ${DB}`]);
}

// P36.5: staged saved-review history RPC on a fresh B10 -> P36.4 -> P36.5 chain.
if (pending.some((f) => f.includes("p365_synthetic_review_history"))) {
  const DB = "p365_it";
  psql(["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
  psql(["-c", `alter database ${DB} set search_path = public, extensions`]);
  psql(["-f", "tests/integration-pg/stub.sql"], DB);
  for (const f of migrations) psql(["-f", join("supabase/migrations", f)], DB);
  for (const f of pending) psql(["-f", join("supabase/pending", f)], DB);
  for (const f of pending) psql(["-f", join("supabase/pending", f)], DB);
  passes.push("PASS: [P36.5] staged B10 -> P36.4 -> P36.5 chain applies twice without error");
  psql(["-f", "tests/integration-pg/fv01-setup.sql"], DB);
  const r = spawnSync(
    "psql",
    [...base, "-d", DB, "-t", "-A", "-f", "tests/integration-pg/p365-history.sql"],
    { env, encoding: "utf8" },
  );
  const out = (r.stdout + "\n" + r.stderr).replace(/^psql:[^\n]*?NOTICE:\s+/gm, "");
  if (r.status !== 0 || !out.includes("P365 DONE"))
    throw new Error("P36.5 scenarios failed: " + out);
  passes.push(
    ...out
      .split("\n")
      .filter((l) => l.startsWith("PASS"))
      .map((l) => l.replace("PASS: ", "PASS: [P36.5] ")),
  );
  psql(["-f", "supabase/pending/20261019000000_p365_synthetic_review_history.rollback.sql"], DB);
  if (
    psql(
      [
        "-t",
        "-A",
        "-c",
        "select count(*) from pg_proc where proname='p36_list_synthetic_review_history'",
      ],
      DB,
    ).trim() !== "0"
  )
    throw new Error("P36.5 rollback failed");
  passes.push("PASS: [P36.5] rollback removes the history function only");
  psql(["-c", `drop database ${DB}`]);
}
// P36.8A: Ground Medical read-only RPCs on a fresh staged chain (governed migration 0009 in Cloud).
if (pending.some((f) => f.includes("p368a_ground_medical_readonly"))) {
  const DB = "p368a_it";
  psql(["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
  psql(["-c", `alter database ${DB} set search_path = public, extensions`]);
  psql(["-f", "tests/integration-pg/stub.sql"], DB);
  for (const f of migrations) psql(["-f", join("supabase/migrations", f)], DB);
  for (const f of pending) psql(["-f", join("supabase/pending", f)], DB);
  for (const f of pending) psql(["-f", join("supabase/pending", f)], DB);
  passes.push("PASS: [P36.8A] staged chain including P36.8A applies twice without error");
  psql(["-f", "tests/integration-pg/fv01-setup.sql"], DB);
  const r = spawnSync(
    "psql",
    [...base, "-d", DB, "-t", "-A", "-f", "tests/integration-pg/p368a-readonly.sql"],
    { env, encoding: "utf8" },
  );
  const out = (r.stdout + "\n" + r.stderr).replace(/^psql:[^\n]*?NOTICE:\s+/gm, "");
  if (r.status !== 0 || !out.includes("P368A DONE"))
    throw new Error("P36.8A scenarios failed: " + out);
  passes.push(
    ...out
      .split("\n")
      .filter((l) => l.startsWith("PASS"))
      .map((l) => l.replace("PASS: ", "PASS: [P36.8A] ")),
  );
  psql(["-c", `drop database ${DB}`]);
}
// P36.8C: staged governed research decisions (proposed migration 0010) on a fresh staged chain.
if (pending.some((f) => f.includes("p368c_research_decisions"))) {
  const DB = "p368c_it";
  psql(["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
  psql(["-c", `alter database ${DB} set search_path = public, extensions`]);
  psql(["-f", "tests/integration-pg/stub.sql"], DB);
  for (const f of migrations) psql(["-f", join("supabase/migrations", f)], DB);
  for (const f of pending) psql(["-f", join("supabase/pending", f)], DB);
  for (const f of pending) psql(["-f", join("supabase/pending", f)], DB);
  passes.push("PASS: [P36.8C] staged chain including P36.8C applies twice without error");
  psql(["-f", "tests/integration-pg/fv01-setup.sql"], DB);
  const r = spawnSync(
    "psql",
    [...base, "-d", DB, "-t", "-A", "-f", "tests/integration-pg/p368c-decisions.sql"],
    { env, encoding: "utf8" },
  );
  const out = (r.stdout + "\n" + r.stderr).replace(/^psql:[^\n]*?NOTICE:\s+/gm, "");
  if (r.status !== 0 || !out.includes("P368C DONE"))
    throw new Error("P36.8C scenarios failed: " + out);
  passes.push(
    ...out
      .split("\n")
      .filter((l) => l.startsWith("PASS"))
      .map((l) => l.replace("PASS: ", "PASS: [P36.8C] ")),
  );
  const q = (sql) => psql(["-t", "-A", "-c", sql], DB).trim();
  const ctx = (k) => q(`select v from p368ct.ctx where k='${k}'`);
  const s = (sql) =>
    new Promise((resolve) => {
      const child = spawn("psql", [...base, "-d", DB, "-t", "-A", "-c", sql], { env });
      let o = "";
      child.stdout.on("data", (d) => (o += d));
      child.stderr.on("data", (d) => (o += d));
      child.on("close", (code) => resolve({ code, out: o }));
    });
  const GM1 = "00000000-0000-0000-0000-0000000000a2";
  const GM2 = "00000000-0000-0000-0000-0000000000a4";
  const dec = (uid, b, d, k) =>
    `set role authenticated; select p368ct.decide('${uid}','m1','${b}','${d}',null,'${k}',2)`;

  // CC1: two reviewers decide the same batch concurrently -> exactly one terminal decision.
  const cc = ctx("cc");
  const c1 = s(`begin; ${dec(GM1, cc, "accepted_for_research", "key-cc1-aaaaaaaaaaaa")}; select pg_sleep(2); commit;`);
  await sleep(500);
  const c2 = s(`${dec(GM2, cc, "rejected_for_research", "key-cc2-aaaaaaaaaaaa")};`);
  const [rc1, rc2] = await Promise.all([c1, c2]);
  if (rc1.code !== 0 || rc2.code === 0 || !/already_decided/.test(rc2.out))
    throw new Error("P36.8C CC1 failed: " + rc1.out + rc2.out);
  if (q(`select status||':'||(select count(*) from p36_biomarker_review_events where batch_id='${cc}') from p36_biomarker_review_batches where id='${cc}'`) !== "accepted_for_research:1")
    throw new Error("P36.8C CC1 state wrong");
  passes.push("PASS: [P36.8C] CC1 concurrent conflicting decisions: exactly one succeeds, loser gets already_decided, one event");

  // CC2: same reviewer, same key, concurrent retries -> one decision, one replay.
  const rv0 = ctx("rv2");
  const k1 = s(`begin; ${dec(GM1, rv0, "rejected_for_research", "key-cc3-aaaaaaaaaaaa")}; select pg_sleep(2); commit;`);
  await sleep(500);
  const k2 = s(`${dec(GM1, rv0, "rejected_for_research", "key-cc3-aaaaaaaaaaaa")};`);
  const [rk1, rk2] = await Promise.all([k1, k2]);
  if (rk1.code !== 0 || rk2.code !== 0 || !/"replay": true/.test(rk2.out))
    throw new Error("P36.8C CC2 failed: " + rk1.out + rk2.out);
  passes.push("PASS: [P36.8C] CC2 concurrent identical retries: one decision, second returns replay of the same receipt");

  // RV1: reviewer revocation commits first (held) -> decision waits, then is denied.
  const rv1 = ctx("rv1");
  const rvA = s(`begin; update mission_memberships set active=false where user_id='${GM2}' and mission_id='m1' and role='ground_medical'; select pg_sleep(2); commit;`);
  await sleep(500);
  const rvB = s(`${dec(GM2, rv1, "accepted_for_research", "key-rv1-aaaaaaaaaaaa")};`);
  const [ra1, rb1] = await Promise.all([rvA, rvB]);
  if (ra1.code !== 0 || rb1.code === 0 || !/access denied/.test(rb1.out))
    throw new Error("P36.8C RV1 failed: " + ra1.out + rb1.out);
  if (q(`select status from p36_biomarker_review_batches where id='${rv1}'`) !== "pending_review")
    throw new Error("P36.8C RV1 batch changed");
  passes.push("PASS: [P36.8C] RV1 revocation-first: decision waits on the membership lock, then is denied; batch stays pending");

  // RV2: decision first (held) -> revocation waits; decision commits with the then-valid reviewer.
  psql(["-c", `update mission_memberships set active=true where user_id='${GM2}' and mission_id='m1' and role='ground_medical'`], DB);
  const dA = s(`begin; ${dec(GM2, rv1, "accepted_for_research", "key-rv2-aaaaaaaaaaaa")}; select pg_sleep(2); commit;`);
  await sleep(500);
  const t0 = Date.now();
  const dB = s(`update mission_memberships set active=false where user_id='${GM2}' and mission_id='m1' and role='ground_medical';`);
  const [rdA, rdB] = await Promise.all([dA, dB]);
  if (rdA.code !== 0 || rdB.code !== 0 || Date.now() - t0 < 1000)
    throw new Error("P36.8C RV2 failed: " + rdA.out + rdB.out);
  if (q(`select status from p36_biomarker_review_batches where id='${rv1}'`) !== "accepted_for_research")
    throw new Error("P36.8C RV2 batch not decided");
  passes.push("PASS: [P36.8C] RV2 decision-first: revocation waits for the decision commit; one consistent decision recorded");
  psql(["-c", `drop database ${DB}`]);
}
for (const p of passes) console.log(p);
console.log(
  `FV-01 PostgreSQL integration: PASS (${passes.length} assertions, disposable PostgreSQL ${psql(["-t", "-A", "-c", "show server_version"]).trim()})`,
);
