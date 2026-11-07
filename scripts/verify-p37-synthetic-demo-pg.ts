/**
 * Disposable socket-only verification of the pending P37 SYNTHETIC DEMO catalog
 * SQL on top of the installed P37 lifecycle and role-based Ground Medical
 * activation: owner scope allow-list, explicit demo acknowledgement, Researcher
 * decision without any source receipt, Ground Medical activation (role, mission,
 * crew, inactive, self and concurrency denials), mission-scoped snapshot,
 * signed online/offline recognition, revocation, immutability, preservation of
 * every production P37/P36 table and rollback. Synthetic fixtures only; never
 * uses managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-... bun scripts/verify-p37-synthetic-demo-pg.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import {
  buildUnknownBiomarkerTerms,
  classifyWithGovernedExtensions,
  syntheticDemoCoverage,
  termIdFor,
} from "../src/domain/health-intelligence/unknown-biomarker-review";
import { generateTestSigningKey } from "../src/domain/health-intelligence/catalog-snapshot-signing";
import type { SnapshotStorage } from "../src/domain/health-intelligence/active-catalog-runtime";
import {
  SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
  demoSnapshotFromRpc,
  signSyntheticDemoSnapshot,
  type DemoSnapshotRpc,
} from "../src/domain/health-intelligence/synthetic-demo-catalog";
import {
  installOfferedDemoCatalog,
  loadInstalledDemoCatalogs,
  resetSyntheticDemoCatalogsForTests,
} from "../src/domain/health-intelligence/synthetic-demo-catalog-runtime";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket"))
  throw Error("Explicit isolated socket required; live database prohibited.");
const DB = "p37_demo_it";
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
  UNIT = "pmol/L";
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


sql(`BEGIN;\n${pending("20261108010000_p37_ground_medical_activation.sql")}\nCOMMIT;`);
sql(`insert into p37_scientific_approvers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:p37-disposable');`);
sql(
  as(4) +
    `select public.p36_global_triage_append_v1('M1','synthetic','${SUB}','${TERM}','ACCEPT_FOR_REVIEW',null,'{}'::text[],null,'${key()}');`,
);
const counts =
  "select (select count(*) from p37_catalog_events) || ':' || (select count(*) from p36_dynamic_source_validation) || ':' || (select count(*) from p36_global_triage_events) || ':' || (select count(*) from p36_dynamic_authorization_events) || ':' || (select count(*) from p36_metric_unit_catalog) || ':' || (select count(*) from p37_scientific_approvers);";
const countsBefore = sql(counts);
check(countsBefore === "0:0:1:0:1:1", "baseline: no production approvals, no receipts, one triage acceptance");

// --- Apply the pending synthetic demo change ---------------------------------------
sql(`BEGIN;\n${pending("20261108020000_p37_synthetic_demo_catalog.sql")}\nCOMMIT;`);
check(
  sql(`BEGIN;\n${pending("20261108020000_p37_synthetic_demo_catalog.rollback.sql")}
select (not exists (select 1 from pg_proc where proname like 'p37_demo_%') and to_regclass('public.p37_demo_catalog_events') is null)::text;
ROLLBACK;`)
    .split("\n")
    .includes("true"),
  "rollback removes every demo object while no demo event exists",
);
check(sql("select count(*) from pg_proc where proname like 'p37_demo_%';") === "6", "rollback test left the change intact");

const FNS = [
  "p37_demo_decide_v1(text,uuid,text,text,text,text,uuid)",
  "p37_demo_activate_v1(uuid,text,uuid)",
  "p37_demo_revoke_v1(uuid,text,uuid)",
  "p37_demo_lifecycle_v1(text)",
  "p37_demo_catalog_snapshot_v1(text)",
];
for (const f of FNS) {
  for (const [role, want] of [["authenticated", "true"], ["anon", "false"], ["service_role", "false"], ["sandbox_exec", "false"]] as const)
    check(sql(`select has_function_privilege('${role}','${f}','EXECUTE')::text;`) === want, `${role} execute ${f} = ${want}`);
  const name = f.slice(0, f.indexOf("("));
  check(
    sql(`select (prosecdef and proconfig::text like '%search_path=public, pg_temp%' and pg_get_userbyid(proowner) = current_user)::text from pg_proc where proname='${name}';`) === "true",
    `${name} definer, pinned search_path, trusted owner`,
  );
}
check(sql("select has_function_privilege('authenticated','p37_demo_keys(jsonb)','EXECUTE')::text;") === "false", "helper not callable");
for (const t of ["p37_demo_scope", "p37_demo_catalog_events"]) {
  for (const role of ["anon", "authenticated", "sandbox_exec"])
    for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"])
      check(sql(`select has_table_privilege('${role}','public.${t}','${priv}')::text;`) === "false", `${role} has no ${priv} on ${t}`);
  for (const role of ["anon", "authenticated"])
    check(sql(`select has_table_privilege('${role}','public.${t}','SELECT')::text;`) === "false", `${role} cannot read ${t}`);
  check(sql(`select relrowsecurity::text from pg_class where oid='public.${t}'::regclass;`) === "true", `${t} RLS enabled`);
}
check(sqlErr(as(1) + "select * from p37_demo_catalog_events;").includes("permission denied"), "direct API read denied");
check(sqlErr(as(4) + `insert into p37_demo_scope(submission_id, term_id, authorization_ref) values ('${SUB}','${TERM}','self-granted scope');`).includes("permission denied"), "approver cannot self-grant demo scope");

type R = { status: string; detail?: string; event_id?: string; entry_sha256?: string };
const res = (r: { status: number | null; stdout: string; stderr: string }): R =>
  r.status === 0 ? json<R>(r.stdout) : { status: "error", detail: r.stderr };
const ACK = SYNTHETIC_DEMO_ACKNOWLEDGEMENT;
const decide = (user: number, term: string, ack: string = ACK, k2 = key(), mission = "M1", sub = SUB) =>
  res(run(as(user) + `select public.p37_demo_decide_v1('${mission}','${sub}',${literal(term)},'Synthetic marker demo','bone',${literal(ack)},'${k2}');`));
const activate = (user: number, dec: string, sha: string, k2 = key()) =>
  res(run(as(user) + `select public.p37_demo_activate_v1('${dec}',${literal(sha)},'${k2}');`));
const revoke = (user: number, act: string, reason: string, k2 = key()) =>
  res(run(as(user) + `select public.p37_demo_revoke_v1('${act}',${literal(reason)},'${k2}');`));
const DENY = "synthetic demo activation requires active Ground Medical membership in the decision mission";

// --- Owner scope ----------------------------------------------------------------------
check(sql(pending("20261108020001_p37_synthetic_demo_scope.authorize.sql") + "select count(*) from p37_demo_scope;") === "INSERT 0 0\n0", "live-ID scope statement inserts nothing in a database without those exact IDs");
check((decide(4, TERM).detail ?? "").includes("not in the owner-authorized synthetic demo scope"), "no decision without owner scope");
sql(`insert into p37_demo_scope(submission_id, term_id, authorization_ref) values ('${SUB}','${TERM}','owner-authorization:disposable-demo');`);
check(sqlErr(`delete from p37_demo_scope;`).length > 0, "scope rows cannot be deleted");
check(sqlErr(`update p37_demo_scope set term_id='${TERM_OTHER}';`).length > 0, "scope rows cannot be changed");

// --- Researcher demo decision --------------------------------------------------------
check((decide(2, TERM).detail ?? "").includes("scientific approval authorization required"), "Ground Medical cannot record a demo decision");
check((decide(12, TERM).detail ?? "").includes("scientific approval authorization required"), "global reviewer without approver grant cannot decide");
check(decide(4, TERM, "I approve").detail === "the synthetic demo acknowledgement is required", "explicit acknowledgement required");
check((decide(4, TERM_OTHER).detail ?? "").includes("not in the owner-authorized synthetic demo scope"), "other term of the same submission refused");
check((decide(4, TERM, ACK, key(), "M2").detail ?? "").includes("scope denied"), "mission without sharing refused");
const dk = key();
const dec = decide(4, TERM, ACK, dk);
check(dec.status === "recorded", "Researcher records the SYNTHETIC DEMO decision without any source receipt");
check(decide(4, TERM, ACK, dk).status === "duplicate", "idempotent decision retry");
check((decide(4, TERM).detail ?? "").includes("already has a synthetic demo decision"), "one decision per term");
const entry = json<Record<string, unknown>>(sql(`select entry::text from p37_demo_catalog_events where id='${dec.event_id}';`));
check(entry["classification"] === "SYNTHETIC_DEMO_NOT_SCIENTIFICALLY_VALIDATED" && entry["provenance"] === "synthetic" && entry["demoId"] === `demo:${TERM}`, "demo entry is labelled synthetic and not validated");
check(!("specimen" in entry) && !("method" in entry) && !("protocol" in entry), "no specimen, method or protocol is invented");
check(entry["unit"] === UNIT && JSON.stringify(entry["aliases"]) === JSON.stringify([LABEL]), "exact submitted unit and label carried");
check(sql(counts) === countsBefore, "decision wrote nothing to the production P37 ledger, receipts, triage or catalogs");

// --- Ground Medical demo activation ----------------------------------------------------
for (const [u, label] of [[6, "mission operator"], [5, "Ground Medical of another mission"], [7, "Ground Medical scoped to another crew member"], [8, "inactive Ground Medical"], [1, "crew self"], [12, "global reviewer"]] as const)
  check((activate(u, dec.event_id!, dec.entry_sha256!).detail ?? "").includes(DENY), `deny ${label}`);
check((activate(2, "40000000-0000-4000-8000-000000000001", dec.entry_sha256!).detail ?? "").includes(DENY), "unknown decision gives the same denial");
check(activate(4, dec.event_id!, dec.entry_sha256!).detail === "the decider cannot activate their own synthetic demo decision", "decider cannot activate even with Ground Medical role");
check(activate(2, dec.event_id!, "0".repeat(64)).detail === "proposal digest does not match the synthetic demo decision", "digest must match");
type Life = { can_decide: boolean; can_activate: boolean; terms: { caller_may_activate: boolean; triage_action: string }[]; events: unknown[] };
const l3 = json<Life>(sql(as(3) + "select p37_demo_lifecycle_v1('M1');"));
check(l3.can_activate && !l3.can_decide && l3.terms.length === 1 && l3.terms[0]!.caller_may_activate && l3.events.length === 1, "Ground Medical sees the demo proposal");
check(!JSON.stringify(l3).includes(uid(4)), "lifecycle exposes no identities");
const l4 = json<Life>(sql(as(4) + "select p37_demo_lifecycle_v1('M1');"));
check(l4.can_decide && l4.terms[0]!.triage_action === "ACCEPT_FOR_REVIEW", "Researcher sees scope and triage state");
for (const u of [5, 6, 1]) check(sqlErr(as(u) + "select p37_demo_lifecycle_v1('M1');").includes("scope denied"), `lifecycle denied for user ${u}`);
const [c2, c3] = await Promise.all([
  runAsync(as(2) + `select public.p37_demo_activate_v1('${dec.event_id}','${dec.entry_sha256}','${key()}');`),
  runAsync(as(3) + `select public.p37_demo_activate_v1('${dec.event_id}','${dec.entry_sha256}','${key()}');`),
]);
const outcomes = [res(c2), res(c3)];
check(outcomes.filter((o) => o.status === "recorded").length === 1 && outcomes.filter((o) => (o.detail ?? "").includes("already activated")).length === 1, "concurrent demo activation: exactly one recorded");
const act = outcomes.find((o) => o.status === "recorded")!;
check(sql(counts) === countsBefore, "activation wrote nothing to the production P37 ledger, receipts, triage or catalogs");

// --- Snapshot -> signed -> online and offline recognition -------------------------
check(sqlErr(as(5) + "select p37_demo_catalog_snapshot_v1('M1');").includes("scope denied"), "other-mission member cannot read the demo snapshot");
const snap = json<DemoSnapshotRpc>(sql(as(1) + "select p37_demo_catalog_snapshot_v1('M1');"));
check(snap.mission_id === "M1" && snap.entries.length === 1 && snap.entries[0]!.status === "ACTIVE", "mission member reads the active demo entry");
check(![uid(2), uid(3), uid(4)].some((u) => JSON.stringify(snap).includes(u)), "snapshot carries no identities");
check(json<DemoSnapshotRpc>(sql(as(5) + "select p37_demo_catalog_snapshot_v1('M2');")).entries.length === 0, "other mission snapshot is empty");
check(json<{ entries: unknown[] }>(sql(as(1) + "select p37_catalog_snapshot_v1();")).entries.length === 0, "production catalog snapshot stays empty");
const k0 = await generateTestSigningKey("disposable-demo-key");
const demoTrusted = { ...k0.trusted, environment: "synthetic_demo" as const };
const store = new Map<string, string>();
const storage: SnapshotStorage = { get: (x) => store.get(x) ?? null, set: (x, v) => void store.set(x, v) };
const device = { storage, trustedKeys: [demoTrusted] };
const sign = (r: DemoSnapshotRpc) => signSyntheticDemoSnapshot(demoSnapshotFromRpc(r, new Date().toISOString()), demoTrusted.keyId, k0.privateKey);
resetSyntheticDemoCatalogsForTests();
const exam = { label: LABEL, unit: UNIT, provenance: "synthetic" as const, missionId: "M1" };
check(syntheticDemoCoverage(exam) === null, "before device sync: not recognized");
check((await installOfferedDemoCatalog(await sign(snap), "M1", device)).installed, "verified demo snapshot installed");
const online = syntheticDemoCoverage(exam);
check(online?.demoId === `demo:${TERM}`, "later synthetic examination recognized automatically");
check(classifyWithGovernedExtensions(exam).classification.status === "unclassified", "catalog classification unchanged (review-only)");
const row = { label: LABEL, unit: UNIT, value: "1", observedAt: "", classification: classifyWithGovernedExtensions(exam).classification, sourceKind: "manual", sourceLabel: "Synthetic" };
check(buildUnknownBiomarkerTerms([{ ...row, syntheticDemo: { demoId: online!.demoId } }]).length === 0 && buildUnknownBiomarkerTerms([row]).length === 1, "no duplicate unknown-biomarker request");
check(syntheticDemoCoverage({ ...exam, unit: "nmol/L" }) === null && syntheticDemoCoverage({ ...exam, provenance: "real" }) === null && syntheticDemoCoverage({ ...exam, missionId: "M2" }) === null, "unit, provenance and mission boundaries hold");
resetSyntheticDemoCatalogsForTests();
const realFetch = globalThis.fetch;
globalThis.fetch = (() => { throw new Error("network disabled"); }) as unknown as typeof fetch;
check((await loadInstalledDemoCatalogs(device)).loaded === 1 && syntheticDemoCoverage(exam)?.demoId === `demo:${TERM}`, "offline reload recognizes from the stored signed demo snapshot");
globalThis.fetch = realFetch;
const tampered = await sign(snap);
tampered.snapshot.entries[0]!.unit = "nmol/L";
tampered.snapshot.demoCatalogVersion += 5;
check(!(await installOfferedDemoCatalog(tampered, "M1", device)).installed, "tampered demo snapshot rejected");

// --- Revocation -------------------------------------------------------------------
for (const u of [5, 6, 4, 1])
  check((revoke(u, act.event_id!, "Synthetic demo test complete").detail ?? "").length > 0 && revoke(u, act.event_id!, "Synthetic demo test complete").status !== "recorded", `revocation denied for user ${u}`);
check(revoke(3, act.event_id!, "short").status === "rejected", "revocation needs a reason");
const rv = revoke(3, act.event_id!, "Synthetic demo test complete");
check(rv.status === "recorded", "Ground Medical revokes the demo entry");
check(revoke(2, act.event_id!, "Synthetic demo revoke again").detail === "already revoked", "no double revocation");
const snap2 = json<DemoSnapshotRpc>(sql(as(3) + "select p37_demo_catalog_snapshot_v1('M1');"));
check(snap2.demo_catalog_version > snap.demo_catalog_version && snap2.entries[0]!.status === "REVOKED", "snapshot reflects revocation with newer version");
check((await installOfferedDemoCatalog(await sign(snap2), "M1", device)).installed && syntheticDemoCoverage(exam) === null, "revoked demo entry no longer recognized");
resetSyntheticDemoCatalogsForTests();

// --- Immutability, preservation, rollback guard -------------------------------------
check(sqlErr(`update p37_demo_catalog_events set reason='tampered reason' where id='${rv.event_id}';`).length > 0, "demo events immutable");
check(sqlErr(`delete from p37_demo_catalog_events where id='${act.event_id}';`).length > 0, "demo events undeletable");
check(sqlErr(`truncate p37_demo_catalog_events;`).length > 0, "demo events cannot be truncated");
check(sql(fingerprint) === before, "submissions and terms unchanged");
check(sql(counts) === countsBefore, "production P37 ledger, receipts, triage, authorization ledger, unit catalog and approver grants unchanged");
check(sqlErr(`BEGIN;\n${pending("20261108020000_p37_synthetic_demo_catalog.rollback.sql")}\nROLLBACK;`).includes("rollback refused"), "rollback refuses once demo history exists");
sql(`drop database if exists ${DB} with (force);`, "postgres");
console.log(`P37 synthetic demo disposable verification: ${count} assertions passed`);
