/**
 * Disposable socket-only verification of the pending P36 Global Scientific
 * Review SQL. Never uses managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-... bun scripts/verify-p36-global-review-pg.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import { termIdFor } from "../src/domain/health-intelligence/unknown-biomarker-review";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket")) throw Error("Explicit isolated socket required; live database prohibited.");
const DB = "p36_global_review_it";
const base = ["-h", socket, "-p", "55439", "-U", "lovable", "-v", "ON_ERROR_STOP=1", "-X", "-At"];
function run(q: string, db = DB) { return spawnSync("psql", [...base, "-d", db], { input: q, encoding: "utf8", cwd: root }); }
function sql(q: string, db = DB) { const r = run(q, db); if (r.status !== 0) throw Error(`Unexpected SQL failure: ${r.stderr}`); return r.stdout.trim(); }
function sqlErr(q: string) { const r = run(q); if (r.status === 0) throw Error(`Expected SQL failure: ${q.slice(0, 200)}`); return r.stderr; }
const pending = (f: string) => readFileSync(resolve(root, "supabase/pending", f), "utf8");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const as = (n: number) => `set role authenticated; set request.jwt.claim.sub='${uid(n)}';`;
const last = (s: string) => s.split("\n").at(-1) ?? "";
const json = <T = unknown>(s: string): T => JSON.parse(last(s)) as T;
let count = 0;
const check = (yes: boolean, label: string) => { if (!yes) throw Error(`assertion failed: ${label}`); count++; };

sql(`drop database if exists ${DB} with (force);`, "postgres");
sql(`create database ${DB};`, "postgres");
sql(`do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$;
do $r$ begin create role anon; exception when duplicate_object then null; end $r$;
do $r$ begin create role service_role; exception when duplicate_object then null; end $r$;
do $r$ begin create role sandbox_exec login bypassrls; exception when duplicate_object then null; end $r$;
alter default privileges in schema public grant select, insert on tables to sandbox_exec;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
create table missions(id text primary key, code text not null, name text not null);
create table crew_members(id text primary key, display_name text);
create table mission_crew_assignments(mission_id text, crew_member_id text, status text);
create table mission_memberships(mission_id text, user_id uuid, crew_member_id text, role text, active boolean);
create table mission_research_keys(mission_id text primary key, pseudonym_salt bytea not null default gen_random_bytes_compat());
`.replace("default gen_random_bytes_compat()", "default decode(md5(random()::text) || md5(random()::text), 'hex')"));
sql(`insert into missions values('M1','DEMO','Synthetic Demonstration'),('M2','TEST-B','Security Test B'),('M3','REAL-ONLY','Real policy mission');
insert into mission_research_keys(mission_id) values('M1'),('M2'),('M3');
insert into crew_members values('C1','Synthetic Crew One'),('C2','Synthetic Crew Two');
insert into mission_crew_assignments values('M1','C1','active'),('M1','C2','active'),('M2','C2','active'),('M3','C1','active');
insert into mission_memberships values
 ('M1','${uid(1)}','C1','crew_self',true),
 ('M1','${uid(2)}',null,'ground_medical',true),('M2','${uid(2)}',null,'ground_medical',true),('M3','${uid(2)}',null,'ground_medical',true),
 ('M1','${uid(3)}',null,'researcher',true),
 ('M1','${uid(7)}','C1','researcher',true);`);

for (const f of ["20261107000000_p36_dynamic_handoff.tool.sql"]) sql(`BEGIN;\n${pending(f)}\nCOMMIT;`);
sql(pending("20261107000001_p36_closed_admission.initialize.sql"));
sql(`BEGIN;\n${pending("20261107000002_p36_handoff_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010000_p36_dynamic_authorization.tool.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010001_p36_authorization_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107020000_p36_authorized_crew_roster.tool.sql")}\nCOMMIT;`);
sql("update p36_dynamic_admission set handoff_open=true, change_note='disposable harness only';");

const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function submit(mission: string, crew: string, provenance: "synthetic" | "real", requestId: string, n: number, prefix: string) {
  const payload = { schema: "mitochondria.p36-cloud-handoff.v1", scope: { missionId: mission, crewMemberId: crew, provenance }, requestId, scientificStatus: "PENDING_NIKOLAS_REVIEW", catalogChangeApplied: false,
    terms: Array.from({ length: n }, (_, i) => ({ termId: termIdFor(`${prefix} ${i}`, "ng/mL"), originalLabels: [`${prefix} ${i}`], exactUnit: "ng/mL", classification: "unclassified", candidateMetricIds: [], sourceDocumentSha256: ["b".repeat(64)], evidencePointers: ["c".repeat(64)], method: null, specimen: null })) };
  const c = canonicalJson(payload);
  return sql(as(2) + `select public.p36_dynamic_handoff_append_v1('${mission}','${crew}','${provenance}','${requestId}',${literal(c)},encode(sha256(convert_to(${literal(c)},'UTF8')),'hex'))->>'status';`);
}
check(submit("M1", "C1", "synthetic", "ubr-19aa5a1e", 12, "Dossier") .endsWith("inserted"), "12-term submission");
check(submit("M1", "C1", "synthetic", "ubr-8b1514d8", 197, "Registered") .endsWith("inserted"), "197-term submission");
check(submit("M2", "C2", "synthetic", "ubr-0000aaaa", 3, "Other mission").endsWith("inserted"), "unshared mission submission");
check(submit("M3", "C1", "synthetic", "ubr-0000bbbb", 2, "Real policy").endsWith("inserted"), "real-only mission synthetic submission");
const before = sql("select count(*) || ':' || (select count(*) from p36_dynamic_handoff_terms) from p36_dynamic_handoff_submissions;");
check(before === "4:214", "seeded handoff counts");

// Install the candidate exactly as prepared, inside a managed transaction.
sql(`BEGIN;\n${pending("20261107030000_p36_global_scientific_review.sql")}\nCOMMIT;`);

// --- Privilege boundaries ---------------------------------------------------
for (const t of ["p36_global_scientific_reviewers", "p36_mission_scientific_sharing", "p36_global_review_audit"]) {
  check(sqlErr(`set role anon; select * from ${t};`).includes("permission denied"), `anon select ${t}`);
  check(sqlErr(as(4) + `select * from ${t};`).includes("permission denied"), `authenticated select ${t}`);
  check(sqlErr(as(4) + `insert into ${t} default values;`).includes("permission denied"), `authenticated insert ${t}`);
  check(sql(`select has_table_privilege('sandbox_exec','${t}','SELECT')::text;`) === "true", `executor read ${t}`);
  for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) check(sql(`select has_table_privilege('sandbox_exec','${t}','${p}')::text;`) === "false", `executor ${p} ${t}`);
  for (const r of ["anon", "authenticated"]) check(sql(`select has_table_privilege('${r}','${t}','INSERT,UPDATE,DELETE,TRUNCATE')::text;`) === "false", `${r} no writes ${t}`);
  check(sql(`select relrowsecurity::text from pg_class where relname='${t}';`) === "true", `RLS ${t}`);
}
check(sqlErr("set role anon; select p36_global_review_missions_v1('synthetic');").includes("permission denied"), "anon missions");
check(sqlErr("set role anon; select p36_global_review_list_v1('M1','synthetic',0,25);").includes("permission denied"), "anon list");
check(sqlErr(as(4) + "select p36_global_review_basis('M1','synthetic');").includes("permission denied"), "basis internal only");
check(sql("select has_function_privilege('anon','p36_global_review_missions_v1(text)','EXECUTE')::text;") === "false", "anon no execute");
check(sql("select has_function_privilege('service_role','p36_global_review_list_v1(text,text,bigint,integer)','EXECUTE')::text;") === "false", "service_role no execute");
check(sql("select count(*) from p36_global_scientific_reviewers;") === "0", "no reviewer granted by install");
check(sql("select count(*) from p36_mission_scientific_sharing;") === "0", "no mission shared by install");

// --- Default deny -------------------------------------------------------------
check(sqlErr("set role authenticated; reset request.jwt.claim.sub; select p36_global_review_missions_v1('synthetic');").includes("authentication required"), "unauthenticated");
check(last(sql(as(5) + "select p36_global_review_missions_v1('synthetic');")) === "[]", "no basis: empty list");
check(sqlErr(as(5) + "select p36_global_review_list_v1('M1','synthetic',0,25);").includes("scope denied"), "no basis: denied");
check(last(sql(as(4) + "select p36_global_review_missions_v1('synthetic');")) === "[]", "ungranted global: empty");
check(sqlErr(as(4) + "select p36_global_review_list_v1('M1','synthetic',0,25);").includes("scope denied"), "ungranted global: denied");
check(sqlErr(as(4) + "select p36_global_review_missions_v1('other');").includes("invalid provenance"), "provenance validated");
check(last(sql(as(7) + "select p36_global_review_missions_v1('synthetic');")) === "[]", "crew-bound researcher not mission-wide");

// --- Mission-scoped Researcher keeps own-mission access ----------------------
type MissionRow = { mission_id: string; mission_code: string; access_basis: string; submission_count: number; term_count: number; pending_term_count: number };
const own = json<MissionRow[]>(sql(as(3) + "select p36_global_review_missions_v1('synthetic');"));
check(own.length === 1 && own[0]?.mission_id === "M1" && own[0].access_basis === "mission_researcher", "researcher own mission");
check(sqlErr(as(3) + "select p36_global_review_list_v1('M2','synthetic',0,25);").includes("scope denied"), "researcher other mission denied");

// --- Owner provisioning (SQL only) -----------------------------------------
sql(`insert into p36_global_scientific_reviewers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:disposable'),('${uid(6)}','owner-authorization:disposable');
insert into p36_mission_scientific_sharing(mission_id, permitted_provenance, policy_ref) values ('M1', array['synthetic'], 'owner-policy:disposable-m1'), ('M3', array['real'], 'owner-policy:disposable-m3');`);
check(sqlErr("insert into p36_mission_scientific_sharing values ('M2', array['clinical'], 'owner-policy:x');").includes("check"), "provenance array constrained");
check(sqlErr("insert into p36_global_scientific_reviewers(user_id, authorization_ref) values (gen_random_uuid(),'short');").includes("check"), "authorization ref required");

const missions = json<MissionRow[]>(sql(as(4) + "select p36_global_review_missions_v1('synthetic');"));
check(missions.length === 1 && missions[0]?.mission_id === "M1" && missions[0].mission_code === "DEMO", "global sees only permitted mission");
check(missions[0]?.access_basis === "global_scientific_review", "global basis");
check(missions[0]?.submission_count === 2 && missions[0].term_count === 209 && missions[0].pending_term_count === 209, "209 pending terms");
check(last(sql(as(4) + "select p36_global_review_missions_v1('real');")).includes("\"M3\""), "real policy separate");
check(!last(sql(as(4) + "select p36_global_review_missions_v1('real');")).includes("\"M1\""), "M1 not shared for real");
check(sqlErr(as(4) + "select p36_global_review_list_v1('M2','synthetic',0,25);").includes("scope denied"), "unshared mission denied");
check(sqlErr(as(4) + "select p36_global_review_list_v1('M3','synthetic',0,25);").includes("scope denied"), "provenance not permitted denied");

type Sub = { submission_id: string; mission_id: string; crew_pseudonym: string; request_id: string; received_seq: number; payload_sha256: string; access_basis: string; terms: Record<string, unknown>[] };
const listRaw = last(sql(as(4) + "select p36_global_review_list_v1('M1','synthetic',0,25);"));
const subs = JSON.parse(listRaw) as Sub[];
check(subs.length === 2, "two submissions");
check(subs.map((s) => s.request_id).join(",") === "ubr-19aa5a1e,ubr-8b1514d8", "both request IDs in order");
check(subs[0]?.terms.length === 12 && subs[1]?.terms.length === 197, "12 + 197 terms returned");
check(subs.every((s) => /^crew-p-[0-9a-f]{16}$/.test(s.crew_pseudonym)), "pseudonym format");
check(subs[0]?.crew_pseudonym === subs[1]?.crew_pseudonym, "same crew same pseudonym");
for (const forbidden of ["\"C1\"", "\"C2\"", "Synthetic Crew", "payload_canonical", "submitted_by", uid(2), "crewMemberId", "crew_member_id"]) check(!listRaw.includes(forbidden), `no ${forbidden}`);
const allowedTermKeys = "candidateMetricIds,classification,decision,evidencePointers,exactUnit,method,originalLabels,sourceDocumentSha256,specimen,termId";
check(subs.every((s) => s.terms.every((t) => Object.keys(t).sort().join(",") === allowedTermKeys)), "term whitelist");
check(subs.every((s) => Object.keys(s).sort().join(",") === "access_basis,crew_pseudonym,mission_code,mission_id,mission_name,payload_sha256,provenance,received_at,received_seq,request_id,submission_id,submitted_role,terms"), "submission whitelist");
check(sql("select string_agg(payload_sha256, ',' order by received_seq) from p36_dynamic_handoff_submissions where mission_id='M1';") === subs.map((s) => s.payload_sha256).join(","), "receipts preserved");
const page1 = json<Sub[]>(sql(as(4) + "select p36_global_review_list_v1('M1','synthetic',0,1);"));
const page2 = json<Sub[]>(sql(as(4) + `select p36_global_review_list_v1('M1','synthetic',${page1[0]?.received_seq ?? 0},1);`));
check(page1.length === 1 && page2.length === 1 && page2[0]?.request_id === "ubr-8b1514d8", "pagination");
const researcherView = json<Sub[]>(sql(as(3) + "select p36_global_review_list_v1('M1','synthetic',0,25);"));
check(researcherView[0]?.crew_pseudonym === subs[0]?.crew_pseudonym && researcherView[0]?.access_basis === "mission_researcher", "consistent pseudonym across bases");

// Same crew in another mission gets a different pseudonym (per-mission salt).
sql("insert into p36_mission_scientific_sharing values ('M2', array['synthetic'], 'owner-policy:disposable-m2');");
const m2 = json<Sub[]>(sql(as(4) + "select p36_global_review_list_v1('M2','synthetic',0,25);"));
check(m2.length === 1 && m2[0]?.crew_pseudonym !== subs[0]?.crew_pseudonym, "per-mission pseudonyms");

// Future missions are excluded until their own policy permits.
sql("insert into missions values ('M4','FUTURE','Future mission'); insert into mission_research_keys(mission_id) values ('M4');");
check(!last(sql(as(4) + "select p36_global_review_missions_v1('synthetic');")).includes("\"M4\""), "future mission excluded");

// Policy withdrawal and grant revocation take effect immediately.
sql("update p36_mission_scientific_sharing set permitted_provenance='{}', policy_ref='owner-policy:withdrawn-m2' where mission_id='M2';");
check(sqlErr(as(4) + "select p36_global_review_list_v1('M2','synthetic',0,25);").includes("scope denied"), "withdrawn policy denied");
sql(`update p36_global_scientific_reviewers set revoked_at=now() where user_id='${uid(6)}';`);
check(last(sql(as(6) + "select p36_global_review_missions_v1('synthetic');")) === "[]", "revoked reviewer empty");
check(sqlErr(as(6) + "select p36_global_review_list_v1('M1','synthetic',0,25);").includes("scope denied"), "revoked reviewer denied");
check(sqlErr(`delete from p36_global_scientific_reviewers where user_id='${uid(6)}';`).includes("append-only"), "reviewer rows never deleted");
check(sqlErr("delete from p36_mission_scientific_sharing where mission_id='M2';").includes("append-only"), "sharing rows never deleted");

// --- Read-only and immutable audit ---------------------------------------------
check(sql("select count(*) || ':' || (select count(*) from p36_dynamic_handoff_terms) from p36_dynamic_handoff_submissions;") === before, "reads write nothing to handoff");
check(sql("select count(*) from p36_dynamic_authorization_events;") === "0", "no decision recorded");
check(sqlErr(as(4) + "select p36_dynamic_handoff_list_v1('M1','C1','synthetic',0,100);").includes("scope denied"), "global grant does not widen existing RPCs");
check(Number(sql(`select count(*) from p36_global_review_audit where actor_id='${uid(4)}' and action='list_submissions' and mission_id='M1' and access_basis='global_scientific_review';`)) >= 3, "list reads audited");
check(Number(sql(`select count(*) from p36_global_review_audit where actor_id='${uid(4)}' and action='list_missions';`)) >= 4, "mission reads audited");
check(sql("select count(*) from p36_global_review_audit where action='reviewer_change';") === "3", "reviewer changes audited");
check(sql("select count(*) from p36_global_review_audit where action='sharing_change';") === "4", "sharing changes audited");
check(sqlErr("update p36_global_review_audit set row_count=0;").includes("append-only"), "audit update rejected");
check(sqlErr("delete from p36_global_review_audit;").includes("append-only"), "audit delete rejected");
check(sqlErr("truncate p36_global_review_audit;").includes("append-only"), "audit truncate rejected");

// --- Demo authorization statement shape (applied to disposable copies only) -----
const demo = pending("20261107030001_p36_global_review_demo.authorize.sql");
check((demo.match(/;/g) ?? []).length === 1, "demo authorization is a single statement");
check(!/mission_memberships|p36_dynamic_admission|update |delete /i.test(demo.replace(/--.*$/gm, "")), "demo authorization touches no memberships/admission");

// --- Rollback ---------------------------------------------------------------
sql(`BEGIN;\n${pending("20261107030000_p36_global_scientific_review.rollback.sql")}\nCOMMIT;`);
check(sql("select count(*) from pg_class where relname like 'p36_global_%' or relname='p36_mission_scientific_sharing';") === "0", "rollback removes tables");
check(sql("select count(*) from pg_proc where proname like 'p36_global_review%';") === "0", "rollback removes functions");
check(sql("select count(*) || ':' || (select count(*) from p36_dynamic_handoff_terms) from p36_dynamic_handoff_submissions;") === before, "rollback preserves handoff");
check(last(sql(as(3) + "select jsonb_array_length(p36_dynamic_handoff_list_v1('M1','C1','synthetic',0,100));")) === "2", "existing researcher path intact");
// Re-install after rollback succeeds (idempotent preparation).
sql(`BEGIN;\n${pending("20261107030000_p36_global_scientific_review.sql")}\nCOMMIT;`);
check(sql("select count(*) from pg_proc where proname like 'p36_global_review%';") === "5", "reinstall");

sql(`drop database if exists ${DB} with (force);`, "postgres");
console.log(`P36 global scientific review disposable verification: ${count} assertions passed`);
