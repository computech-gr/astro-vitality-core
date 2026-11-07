/**
 * Disposable socket-only verification of the pending P37 role-based (Ground
 * Medical) catalog activation SQL on top of the installed P37 lifecycle:
 * approval by the Researcher's scientific approver grant, activation by any
 * active Ground Medical member of the approval's mission, cross-mission / role /
 * crew-scope / inactive / closed-mission denials, self-activation and
 * source-validator separation, concurrency, signed snapshot recognition online
 * and offline, revocation and rollback. Synthetic fixtures only; never uses
 * managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-... bun scripts/verify-p37-ground-medical-activation-pg.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import {
  classifyWithGovernedExtensions,
  termIdFor,
} from "../src/domain/health-intelligence/unknown-biomarker-review";
import {
  snapshotFromLedgerRpc,
  type LedgerSnapshotRpc,
} from "../src/domain/health-intelligence/catalog-lifecycle";
import {
  generateTestSigningKey,
  signCatalogSnapshot,
} from "../src/domain/health-intelligence/catalog-snapshot-signing";
import {
  installOfferedCatalog,
  loadInstalledCatalog,
  resetActiveCatalogForTests,
  type SnapshotStorage,
} from "../src/domain/health-intelligence/active-catalog-runtime";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket"))
  throw Error("Explicit isolated socket required; live database prohibited.");
const DB = "p37_gm_it";
const base = ["-h", socket, "-p", "55439", "-U", "lovable", "-v", "ON_ERROR_STOP=1", "-X", "-At"];
function run(q: string, db = DB) {
  return spawnSync("psql", [...base, "-d", db], { input: q, encoding: "utf8", cwd: root });
}
function runAsync(q: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((res) => {
    const p = spawn("psql", [...base, "-d", DB], { cwd: root });
    let stdout = "",
      stderr = "";
    p.stdout.on("data", (d) => (stdout += String(d)));
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("close", (status) => res({ status, stdout, stderr }));
    p.stdin.end(q);
  });
}
function sql(q: string, db = DB) {
  const r = run(q, db);
  if (r.status !== 0) throw Error(`Unexpected SQL failure: ${r.stderr}`);
  return r.stdout.trim();
}
function sqlErr(q: string) {
  const r = run(q);
  if (r.status === 0) throw Error(`Expected SQL failure: ${q.slice(0, 200)}`);
  return r.stderr;
}
const pending = (f: string) => readFileSync(resolve(root, "supabase/pending", f), "utf8");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const as = (n: number) => `set role authenticated; set request.jwt.claim.sub='${uid(n)}';`;
const last = (s: string) => s.trim().split("\n").at(-1) ?? "";
const json = <T = Record<string, unknown>>(s: string): T => JSON.parse(last(s)) as T;
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
let count = 0;
const check = (yes: boolean, label: string) => {
  if (!yes) throw Error(`assertion failed: ${label}`);
  count++;
};
let k = 0;
const key = () => `30000000-0000-4000-8000-${String(++k).padStart(12, "0")}`;

// Roles: 1 crew_self M1/C1 · 2 GM M1 (mission-wide, submitter) + GM M2 · 3 GM M1 crew-scoped C1
// 4 scientific approver (global reviewer) + GM M1 · 5 GM M2 only · 6 mission_operator M1
// 7 GM M1 crew-scoped C2 · 8 GM M1 inactive · 11 deprecated activator-table row only
// 12 global reviewer without GM membership.
sql(`drop database if exists ${DB} with (force);`, "postgres");
sql(`create database ${DB};`, "postgres");
sql(`do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$;
do $r$ begin create role anon; exception when duplicate_object then null; end $r$;
do $r$ begin create role service_role; exception when duplicate_object then null; end $r$;
do $r$ begin create role sandbox_exec login bypassrls; exception when duplicate_object then null; end $r$;
alter default privileges in schema public grant select, insert on tables to sandbox_exec;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
create table missions(id text primary key, code text not null, name text not null, status text not null default 'planning');
create table crew_members(id text primary key, display_name text);
create table mission_crew_assignments(mission_id text, crew_member_id text, status text);
create table mission_memberships(id uuid primary key default gen_random_uuid(), mission_id text, user_id uuid, crew_member_id text, role text, active boolean);
create table mission_research_keys(mission_id text primary key, pseudonym_salt bytea not null default decode(md5(random()::text) || md5(random()::text), 'hex'));
create table p36_metric_unit_catalog(metric_id text not null, unit text not null);
insert into p36_metric_unit_catalog values ('cv-001','bpm');
insert into missions(id, code, name) values('M1','DEMO','Synthetic Demonstration'),('M2','TEST-B','Security Test B');
insert into mission_research_keys(mission_id) values('M1'),('M2');
insert into crew_members values('C1','Synthetic Crew One'),('C2','Synthetic Crew Two');
insert into mission_crew_assignments values('M1','C1','active'),('M2','C1','active'),('M1','C2','active');
insert into mission_memberships(mission_id, user_id, crew_member_id, role, active) values
 ('M1','${uid(1)}','C1','crew_self',true),('M1','${uid(2)}',null,'ground_medical',true),('M2','${uid(2)}',null,'ground_medical',true),
 ('M1','${uid(3)}','C1','ground_medical',true),('M1','${uid(4)}',null,'ground_medical',true),('M2','${uid(5)}',null,'ground_medical',true),
 ('M1','${uid(6)}',null,'mission_operator',true),('M1','${uid(7)}','C2','ground_medical',true),('M1','${uid(8)}',null,'ground_medical',false);`);
sql(`BEGIN;\n${pending("20261107000000_p36_dynamic_handoff.tool.sql")}\nCOMMIT;`);
sql(pending("20261107000001_p36_closed_admission.initialize.sql"));
sql(`BEGIN;\n${pending("20261107000002_p36_handoff_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010000_p36_dynamic_authorization.tool.sql")}\nCOMMIT;`);
sql(
  `BEGIN;\n${pending("20261107010001_p36_authorization_executor_insert_remediation.sql")}\nCOMMIT;`,
);
sql(`BEGIN;\n${pending("20261107020000_p36_authorized_crew_roster.tool.sql")}\nCOMMIT;`);
sql("update p36_dynamic_admission set handoff_open=true, change_note='disposable harness only';");

const LABEL = "Synthetic Marker GM",
  OTHER = "Synthetic Other GM",
  UNIT = "pmol/L",
  SPECIMEN = "Synthetic serum",
  METHOD = "Synthetic immunoassay",
  ID = "ext:synthetic-marker-gm",
  ID2 = "ext:synthetic-other-gm";
function submit(user: number, mission: string, requestId: string, labels: string[]) {
  const payload = {
    schema: "mitochondria.p36-cloud-handoff.v1",
    scope: { missionId: mission, crewMemberId: "C1", provenance: "synthetic" },
    requestId,
    scientificStatus: "PENDING_NIKOLAS_REVIEW",
    catalogChangeApplied: false,
    terms: labels.map((l) => ({
      termId: termIdFor(l, UNIT),
      originalLabels: [l],
      exactUnit: UNIT,
      classification: "unclassified",
      candidateMetricIds: [],
      sourceDocumentSha256: ["b".repeat(64)],
      evidencePointers: ["c".repeat(64)],
      method: null,
      specimen: null,
    })),
  };
  const c = canonicalJson(payload);
  return sql(
    as(user) +
      `select public.p36_dynamic_handoff_append_v1('${mission}','C1','synthetic','${requestId}',${literal(c)},encode(sha256(convert_to(${literal(c)},'UTF8')),'hex'))->>'status';`,
  );
}
check(submit(2, "M1", "ubr-00000047", [LABEL, OTHER]).endsWith("inserted"), "M1 submission");
check(submit(2, "M2", "ubr-00000048", ["Unshared GM Term"]).endsWith("inserted"), "M2 submission");
sql(`BEGIN;\n${pending("20261107030000_p36_global_scientific_review.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107040000_p36_global_triage.sql")}\nCOMMIT;`);
sql(`insert into p36_global_scientific_reviewers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:disposable'),('${uid(12)}','owner-authorization:disposable');
insert into p36_mission_scientific_sharing(mission_id, permitted_provenance, policy_ref) values ('M1', array['synthetic'], 'owner-policy:disposable-m1');
insert into p36_global_triage_writers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:triage-disposable');`);
sql(`BEGIN;\n${pending("20261108000000_p37_catalog_activation.sql")}\nCOMMIT;`);
const SUB = sql(
  "select submission_id from p36_dynamic_handoff_submissions where request_id='ubr-00000047';",
);
const TERM = termIdFor(LABEL, UNIT),
  TERM_OTHER = termIdFor(OTHER, UNIT);
const fingerprint =
  "select md5(string_agg(submission_id::text || payload_sha256, ',' order by received_seq)) || ':' || (select md5(string_agg(submission_id::text || term_id || metadata::text, ',' order by submission_id, term_id)) from p36_dynamic_handoff_terms) from p36_dynamic_handoff_submissions;";
const before = sql(fingerprint);

// --- Apply the pending role-based change ------------------------------------------
sql(`BEGIN;\n${pending("20261108010000_p37_ground_medical_activation.sql")}\nCOMMIT;`);
for (const [role, f, want] of [
  ["anon", "p37_catalog_activation_queue_v1(text)", "false"],
  ["service_role", "p37_catalog_activation_queue_v1(text)", "false"],
  ["authenticated", "p37_catalog_activation_queue_v1(text)", "true"],
  ["authenticated", "p37_catalog_activator_membership(text,uuid)", "false"],
  ["anon", "p37_catalog_activator_membership(text,uuid)", "false"],
  ["sandbox_exec", "p37_catalog_activator_membership(text,uuid)", "false"],
  ["anon", "p37_catalog_activate_v1(uuid,text,uuid)", "false"],
  ["service_role", "p37_catalog_activate_v1(uuid,text,uuid)", "false"],
  ["authenticated", "p37_catalog_activate_v1(uuid,text,uuid)", "true"],
  ["anon", "p37_catalog_revoke_v1(uuid,text,uuid)", "false"],
] as const)
  check(
    sql(`select has_function_privilege('${role}','${f}','EXECUTE')::text;`) === want,
    `${role} execute ${f} = ${want}`,
  );
for (const f of [
  "p37_catalog_activate_v1",
  "p37_catalog_revoke_v1",
  "p37_catalog_activation_queue_v1",
  "p37_catalog_activator_membership",
])
  check(
    sql(
      `select (prosecdef and proconfig::text like '%search_path=public, pg_temp%')::text from pg_proc where proname='${f}';`,
    ) === "true",
    `${f} definer with pinned search_path`,
  );
check(
  sql(
    "select (count(*) = 0)::text from pg_proc where proname in ('p37_catalog_activate_v1','p37_catalog_revoke_v1') and prosrc like '%p37_catalog_activators%';",
  ) === "true",
  "activator table no longer authorizes",
);

type R = { status: string; detail?: string; event_id?: string; entry_sha256?: string };
const res = (r: { status: number | null; stdout: string; stderr: string }): R =>
  r.status === 0 ? json<R>(r.stdout) : { status: "error", detail: r.stderr };
const approve = (user: number, term: string, ref: string, name: string) =>
  res(
    run(
      as(user) +
        `select public.p37_catalog_approve_v1('M1','synthetic','${SUB}',${literal(term)},${literal(ref)},${literal(name)},'immune','${key()}');`,
    ),
  );
const activate = (user: number, approval: string, sha: string, k2 = key()) =>
  res(
    run(as(user) + `select public.p37_catalog_activate_v1('${approval}',${literal(sha)},'${k2}');`),
  );
const revoke = (user: number, act: string, reason: string, k2 = key()) =>
  res(run(as(user) + `select public.p37_catalog_revoke_v1('${act}',${literal(reason)},'${k2}');`));
const DENY = "catalog activation requires active Ground Medical membership in the approval mission";

// --- Researcher final scientific approval (existing rules unchanged) -----------------
sql(`insert into p37_scientific_approvers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:p37-disposable');
insert into p37_catalog_activators(user_id, authorization_ref) values ('${uid(11)}','owner-authorization:deprecated-email-grant');`);
for (const t of [TERM, TERM_OTHER])
  sql(
    as(4) +
      `select public.p36_global_triage_append_v1('M1','synthetic','${SUB}','${t}','ACCEPT_FOR_REVIEW',null,'{}'::text[],null,'${key()}');`,
  );
sql(`insert into p36_dynamic_source_validation values
 ('M1','C1','synthetic','${TERM}','${"d".repeat(64)}','${ID}','${UNIT}','${SPECIMEN}','${METHOD}','SYNTHETIC-DISPOSABLE-PROTOCOL','0','synthetic-disposable-receipt:gm','independent-validator:disposable',now()),
 ('M1','C1','synthetic','${TERM_OTHER}','${"2".repeat(64)}','${ID2}','${UNIT}','${SPECIMEN}','${METHOD}','P','0','synthetic-disposable-receipt:gm-other','${uid(3)}',now());`);
check(
  (approve(2, TERM, "synthetic-disposable-receipt:gm", "Synthetic marker GM").detail ?? "").includes(
    "scientific approval authorization required",
  ),
  "Ground Medical cannot scientifically approve",
);
const ap = approve(4, TERM, "synthetic-disposable-receipt:gm", "Synthetic marker GM");
check(ap.status === "recorded", "Researcher's single scientific approval is final and recorded");

// --- Role-based activation denials ------------------------------------------------
for (const [u, label] of [
  [6, "mission operator (no Ground Medical role)"],
  [11, "deprecated email-specific activator grant"],
  [5, "Ground Medical of another mission"],
  [7, "Ground Medical scoped to a different crew member"],
  [8, "inactive Ground Medical membership"],
  [1, "crew self"],
  [12, "global reviewer without Ground Medical role"],
] as const)
  check((activate(u, ap.event_id!, ap.entry_sha256!).detail ?? "").includes(DENY), `deny ${label}`);
check(
  (activate(2, "40000000-0000-4000-8000-000000000001", ap.entry_sha256!).detail ?? "").includes(
    DENY,
  ),
  "unknown approval gives the same denial (no oracle)",
);
check(
  activate(4, ap.event_id!, ap.entry_sha256!).detail ===
    "the scientific approver cannot activate their own approval",
  "scientific approver cannot activate own approval even with Ground Medical role",
);
sql("update missions set status='completed' where id='M1';");
check(
  (activate(2, ap.event_id!, ap.entry_sha256!).detail ?? "").includes(DENY),
  "closed mission denies activation",
);
sql("update missions set status='planning' where id='M1';");
check(
  activate(2, ap.event_id!, "0".repeat(64)).detail ===
    "proposal digest does not match the approved proposal",
  "digest must match",
);

// --- Ground Medical activation queue ------------------------------------------------
type Q = { can_activate: boolean; events: { caller_may_activate: boolean; entry: unknown }[] };
const q3 = json<Q>(sql(as(3) + "select p37_catalog_activation_queue_v1('M1');"));
check(
  q3.events.length === 1 &&
    q3.events[0]!.caller_may_activate &&
    !JSON.stringify(q3).includes(uid(4)),
  "crew-scoped Ground Medical sees the approved proposal without identities",
);
check(
  json<Q>(sql(as(7) + "select p37_catalog_activation_queue_v1('M1');")).events[0]!
    .caller_may_activate === false,
  "crew mismatch shown as not activatable",
);
for (const u of [5, 6, 12, 8])
  check(
    sqlErr(as(u) + "select p37_catalog_activation_queue_v1('M1');").includes("scope denied"),
    `queue denied for user ${u}`,
  );
check(
  json<Q>(sql(as(5) + "select p37_catalog_activation_queue_v1('M2');")).events.length === 0,
  "other mission queue contains no M1 proposals",
);

// --- Concurrent activation by two eligible Ground Medical users -------------------
const [c2, c3] = await Promise.all([
  runAsync(
    as(2) + `select public.p37_catalog_activate_v1('${ap.event_id}','${ap.entry_sha256}','${key()}');`,
  ),
  runAsync(
    as(3) + `select public.p37_catalog_activate_v1('${ap.event_id}','${ap.entry_sha256}','${key()}');`,
  ),
]);
const outcomes = [res(c2), res(c3)];
check(
  outcomes.filter((o) => o.status === "recorded").length === 1 &&
    outcomes.filter((o) => (o.detail ?? "").includes("already activated")).length === 1,
  "concurrent activation: exactly one recorded",
);
const act = outcomes.find((o) => o.status === "recorded")!;
check(
  sql(
    `select mission_id || '|' || provenance from p37_catalog_events where id='${act.event_id}';`,
  ) === "M1|synthetic",
  "activation records the authorizing mission",
);
check(
  sql("select count(*) from p37_catalog_events where event_type='ACTIVATE';") === "1",
  "single activation row",
);
const winner = res(c2).status === "recorded" ? 2 : 3;
const retryKey = key();
const first = activate(winner === 2 ? 3 : 2, ap.event_id!, ap.entry_sha256!, retryKey);
check((first.detail ?? "").includes("already activated"), "late activation rejected");

// --- Source validator separation + membership revocation race ---------------------
const ap2 = approve(4, TERM_OTHER, "synthetic-disposable-receipt:gm-other", "Synthetic other GM");
check(ap2.status === "recorded", "second approval recorded");
check(
  activate(3, ap2.event_id!, ap2.entry_sha256!).detail ===
    "the source validator cannot activate the entry they validated",
  "source validator cannot activate",
);
sql(`update mission_memberships set active=false where user_id='${uid(2)}' and mission_id='M1';`);
check(
  (activate(2, ap2.event_id!, ap2.entry_sha256!).detail ?? "").includes(DENY),
  "deactivated Ground Medical immediately loses activation",
);
sql(`update mission_memberships set active=true where user_id='${uid(2)}' and mission_id='M1';`);
const lockHolder = runAsync(
  `begin; update mission_memberships set active=false where user_id='${uid(2)}' and mission_id='M1'; select pg_sleep(1.5); commit;`,
);
await new Promise((r) => setTimeout(r, 300));
const raced = res(
  await runAsync(
    as(2) +
      `select public.p37_catalog_activate_v1('${ap2.event_id}','${ap2.entry_sha256}','${key()}');`,
  ),
);
await lockHolder;
check(
  (raced.detail ?? "").includes(DENY),
  "activation waiting on concurrent deactivation is denied",
);
sql(`update mission_memberships set active=true where user_id='${uid(2)}' and mission_id='M1';`);
const actKey = key();
const act2 = activate(2, ap2.event_id!, ap2.entry_sha256!, actKey);
check(act2.status === "recorded", "other Ground Medical user activates second entry");
check(
  activate(2, ap2.event_id!, ap2.entry_sha256!, actKey).status === "duplicate",
  "idempotent activation retry",
);

// --- Lifecycle capability for Researcher view -------------------------------------
const life = (u: number) =>
  json<{ can_activate: boolean; can_approve: boolean }>(
    sql(as(u) + "select p37_catalog_lifecycle_v1('M1','synthetic');"),
  );
check(life(12).can_activate === false, "reviewer without Ground Medical: can_activate false");
check(life(4).can_approve === true, "approver can_approve true");

// --- Snapshot -> signed -> online and offline recognition -------------------------
const rpc = json<LedgerSnapshotRpc>(sql(as(3) + "select p37_catalog_snapshot_v1();"));
check(
  rpc.entries.filter((e) => e.status === "ACTIVE").length === 2 &&
    ![uid(2), uid(3), uid(4)].some((u) => JSON.stringify(rpc).includes(u)),
  "snapshot has both active entries and no identities",
);
const testKey = await generateTestSigningKey("disposable-gm-test-key");
const store = new Map<string, string>();
const storage: SnapshotStorage = {
  get: (x) => store.get(x) ?? null,
  set: (x, v) => {
    store.set(x, v);
  },
};
const device = { storage, trustedKeys: [testKey.trusted], environments: ["test"] as const };
resetActiveCatalogForTests();
const exam = {
  label: LABEL,
  unit: UNIT,
  specimen: SPECIMEN,
  method: METHOD,
  provenance: "synthetic" as const,
};
check(
  classifyWithGovernedExtensions(exam).classification.status === "unclassified",
  "before sync: UNKNOWN",
);
const sign = async (r: LedgerSnapshotRpc) =>
  signCatalogSnapshot(
    snapshotFromLedgerRpc(r, "test", new Date().toISOString()),
    testKey.trusted.keyId,
    testKey.privateKey,
  );
check((await installOfferedCatalog(await sign(rpc), device)).installed, "verified snapshot installed");
const online = classifyWithGovernedExtensions(exam);
check(
  online.classification.status === "matched" && online.classification.metricId === ID,
  "future compatible examination automatically RECOGNIZED (no new Researcher decision)",
);
check(
  classifyWithGovernedExtensions({ ...exam, unit: "nmol/L" }).classification.status ===
    "unclassified",
  "different unit not recognized (no conversion)",
);
resetActiveCatalogForTests();
const realFetch = globalThis.fetch;
globalThis.fetch = (() => {
  throw new Error("network disabled");
}) as unknown as typeof fetch;
check(
  (await loadInstalledCatalog(device)).loaded &&
    classifyWithGovernedExtensions(exam).classification.status === "matched",
  "offline reload recognizes from verified snapshot",
);
globalThis.fetch = realFetch;
const tampered = await sign(rpc);
tampered.snapshot.entries[0]!.unit = "nmol/L";
check(
  !(await installOfferedCatalog(tampered, device)).installed,
  "tampered snapshot rejected",
);

// --- Revocation ------------------------------------------------------------------
for (const u of [5, 6, 11])
  check(
    (revoke(u, act.event_id!, "Synthetic revocation test").detail ?? "").includes(
      "catalog revocation requires active Ground Medical membership",
    ),
    `revocation denied for user ${u}`,
  );
check(revoke(3, act.event_id!, "short").status === "rejected", "revocation needs reason");
const rv = revoke(3, act.event_id!, "Synthetic revocation test");
check(rv.status === "recorded", "Ground Medical revocation recorded");
check(
  (revoke(2, act.event_id!, "Synthetic revocation again").detail ?? "") === "already revoked",
  "no double revocation",
);
const rpc2 = json<LedgerSnapshotRpc>(sql(as(1) + "select p37_catalog_snapshot_v1();"));
check(
  rpc2.catalog_version > rpc.catalog_version &&
    rpc2.entries.find((e) => e.canonicalId === ID)?.status === "REVOKED",
  "snapshot reflects revocation with newer version",
);
check((await installOfferedCatalog(await sign(rpc2), device)).installed, "revoked snapshot installed");
check(
  classifyWithGovernedExtensions(exam).classification.status === "unclassified",
  "revoked biomarker no longer recognized after verified sync",
);
check(
  classifyWithGovernedExtensions({ ...exam, label: OTHER }).classification.status === "matched",
  "other active biomarker still recognized",
);
resetActiveCatalogForTests();

// --- Immutability + preservation ----------------------------------------------------
check(
  sqlErr(`update p37_catalog_events set reason='tampered reason' where id='${rv.event_id}';`)
    .length > 0,
  "events immutable",
);
check(
  sqlErr(`delete from p37_catalog_events where id='${act.event_id}';`).length > 0,
  "events undeletable",
);
check(sql(fingerprint) === before, "submissions and terms unchanged");
check(
  sql("select count(*) from p36_dynamic_authorization_events;") === "0",
  "P36 scientific authorization ledger untouched",
);
check(sql("select count(*) from p36_metric_unit_catalog;") === "1", "base unit catalog untouched");

// --- Rollback restores the original grant-based bodies ------------------------------
check(
  sql(`BEGIN;\n${pending("20261108010000_p37_ground_medical_activation.rollback.sql")}
select (exists (select 1 from pg_proc where proname='p37_catalog_activate_v1' and prosrc like '%p37_catalog_activators%')
  and not exists (select 1 from pg_proc where proname in ('p37_catalog_activation_queue_v1','p37_catalog_activator_membership')))::text;
ROLLBACK;`)
    .split("\n")
    .includes("true"),
  "rollback restores original activator-grant functions",
);
check(
  sql("select count(*) from pg_proc where proname='p37_catalog_activation_queue_v1';") === "1",
  "rollback test left role-based change intact",
);
sql(`drop database if exists ${DB} with (force);`, "postgres");
console.log(`P37 Ground Medical activation disposable verification: ${count} assertions passed`);
