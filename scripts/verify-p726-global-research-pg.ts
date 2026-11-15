/**
 * Disposable socket-only verification of the pending P72.6 global Researcher
 * read SQL. Never uses managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-p726 bun scripts/verify-p726-global-research-pg.ts
 *
 * Baseline = the rollback file (exact pre-P72.6 bodies of the four read RPCs, byte-
 * identical to the live definitions) over faithful copies of the gating helpers.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket")) throw Error("Explicit isolated socket required; live database prohibited.");
const DB = "p726_global_research_it";
const base = ["-h", socket, "-p", "55439", "-U", "lovable", "-v", "ON_ERROR_STOP=1", "-X", "-At"];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
function run(q: string, db = DB) { return spawnSync("psql", [...base, "-d", db], { input: q, encoding: "utf8", cwd: root, env }); }
function sql(q: string, db = DB) { const r = run(q, db); if (r.status !== 0) throw Error(`Unexpected SQL failure: ${r.stderr}`); return r.stdout.trim(); }
function sqlErr(q: string) { const r = run(q); if (r.status === 0) throw Error(`Expected SQL failure: ${q.slice(0, 200)}`); return r.stderr; }
const pending = (f: string) => readFileSync(resolve(root, "supabase/pending", f), "utf8");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const as = (n: number) => `set role authenticated; set request.jwt.claim.sub='${uid(n)}';`;
const last = (s: string) => s.split("\n").at(-1) ?? "";
const json = <T = unknown>(s: string): T => JSON.parse(last(s)) as T;
let count = 0;
const check = (yes: boolean, label: string) => { if (!yes) throw Error(`assertion failed: ${label}`); count++; };

// Users: 1 crew_self (M1/C1) · 2 ground_medical (M1, mission-level) · 3 mission researcher (M2)
//        4 global research reader (no membership) · 5 authenticated, no role · 6 revoked reader
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
create table crew_members(id text primary key, display_name text, external_ref text);
create table mission_crew_assignments(mission_id text, crew_member_id text, status text);
create table mission_memberships(mission_id text, user_id uuid, crew_member_id text, role text, active boolean);
create table observation_sync_events(mission_id text, crew_member_id text, provenance text, event_id text, observation_id text, event_kind text, cipher_alg text, key_version int, iv text, ciphertext text, fingerprint text, uploaded_by uuid, received_at timestamptz default now(), received_seq bigserial);
create table review_sync_attestation_events(mission_id text, crew_member_id text, provenance text, event_id text, action text, received_seq bigserial);
create table review_sync_correction_events(mission_id text, crew_member_id text, provenance text, intent_id text, received_seq bigserial);
create table p37_demo_catalog_events(id uuid primary key default gen_random_uuid(), seq bigserial, event_type text, demo_id text, mission_id text, entry jsonb, entry_sha256 text, decision_event_id uuid, activation_event_id uuid, reason text, recorded_at timestamptz default now());
create table p615_demo_alias_events(id uuid primary key default gen_random_uuid(), seq bigserial, event_type text, alias_id text, mission_id text, entry jsonb, entry_sha256 text, decision_event_id uuid, activation_event_id uuid, reason text, recorded_at timestamptz default now());
create table p36_global_scientific_reviewers(user_id uuid primary key, authorization_ref text, granted_at timestamptz default now(), revoked_at timestamptz);
create table p36_mission_scientific_sharing(mission_id text primary key, permitted_provenance text[], policy_ref text, changed_at timestamptz default now());
-- Faithful copies of the live gating helpers.
create function has_mission_role(p_mission_id text, p_roles text[]) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.mission_memberships m where m.mission_id=p_mission_id and m.user_id=auth.uid() and m.active and m.role=any(p_roles)); $$;
create function observation_sync_can_access(p_mission_id text, p_crew_member_id text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
    and exists (select 1 from public.mission_crew_assignments a where a.mission_id = p_mission_id and a.crew_member_id = p_crew_member_id and a.status = 'active')
    and exists (select 1 from public.mission_memberships m where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active
        and ((m.role = 'crew_self' and m.crew_member_id = p_crew_member_id) or (m.role = 'ground_medical' and (m.crew_member_id is null or m.crew_member_id = p_crew_member_id)))) $$;
create function review_sync_is_ground_medical(p_mission_id text, p_crew_member_id text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
    and exists (select 1 from public.mission_memberships m where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active
        and m.role = 'ground_medical' and (m.crew_member_id is null or m.crew_member_id = p_crew_member_id))
    and exists (select 1 from public.mission_crew_assignments a where a.mission_id = p_mission_id and a.crew_member_id = p_crew_member_id and a.status = 'active') $$;
create function review_sync_can_read(p_mission_id text, p_crew_member_id text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.review_sync_is_ground_medical(p_mission_id, p_crew_member_id)
    or (auth.uid() is not null and exists (select 1 from public.mission_memberships m where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active
        and m.role = 'crew_self' and m.crew_member_id = p_crew_member_id)) $$;
create function p36_global_review_basis(p_mission text, p_provenance text) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when exists (select 1 from public.mission_memberships m where m.mission_id = p_mission and m.user_id = auth.uid() and m.active and m.role = 'researcher' and m.crew_member_id is null) then 'mission_researcher'
    when exists (select 1 from public.p36_global_scientific_reviewers r where r.user_id = auth.uid() and r.revoked_at is null)
      and exists (select 1 from public.p36_mission_scientific_sharing s where s.mission_id = p_mission and p_provenance = any(s.permitted_provenance)) then 'global_scientific_review'
  end $$;
revoke all on function has_mission_role(text,text[]) from public, anon; grant execute on function has_mission_role(text,text[]) to authenticated;
revoke all on function observation_sync_can_access(text,text) from public, anon; grant execute on function observation_sync_can_access(text,text) to authenticated;
revoke all on function review_sync_is_ground_medical(text,text) from public, anon; grant execute on function review_sync_is_ground_medical(text,text) to authenticated;
`);
// Baseline (pre-P72.6) bodies of the four read RPCs, exactly as live.
sql(`BEGIN;\n${pending("20261115000000_p726_global_researcher_read.rollback.sql")}\nCOMMIT;`);
for (const f of ["observation_sync_list_v1(text,text,text,bigint,integer)", "review_sync_list_v1(text,text,text,text,bigint,integer)", "p37_demo_catalog_snapshot_v1(text)", "p615_demo_alias_snapshot_v1(text)"])
  sql(`revoke all on function ${f} from public, anon; grant execute on function ${f} to authenticated;`);

sql(`insert into missions values('M1','MITO_DEMO_2026','Synthetic Demonstration','planning'),('M2','FV01-TEST-B','Security Test B','planning'),('M3','VALIDATION','Validation mission','active');
insert into crew_members values('C1','Alex Morgan','DEMO-ASTRO-001'),('C2','Crew Two','X-2'),('C3','Crew Three','X-3');
insert into mission_crew_assignments values('M1','C1','active'),('M2','C2','active'),('M3','C3','active'),('M3','C2','ended');
insert into mission_memberships values
 ('M1','${uid(1)}','C1','crew_self',true),
 ('M1','${uid(2)}',null,'ground_medical',true),
 ('M2','${uid(3)}',null,'researcher',true);
insert into observation_sync_events(mission_id,crew_member_id,provenance,event_id,observation_id,event_kind,cipher_alg,key_version,iv,ciphertext,fingerprint,uploaded_by)
 select 'M1','C1','synthetic','ev-'||g,'obs-'||g,'entry','A256GCM',1,'iv','ct-'||g,'ofp-'||g,'${uid(2)}' from generate_series(1,5) g;
insert into observation_sync_events(mission_id,crew_member_id,provenance,event_id,observation_id,event_kind,cipher_alg,key_version,iv,ciphertext,fingerprint,uploaded_by)
 values ('M1','C1','real','ev-real','obs-real','entry','A256GCM',1,'iv','ct-real','ofp-real','${uid(2)}'),
        ('M2','C2','synthetic','ev-m2','obs-m2','entry','A256GCM',1,'iv','ct-m2','ofp-m2','${uid(2)}');
insert into review_sync_attestation_events(mission_id,crew_member_id,provenance,event_id,action) select 'M1','C1','synthetic','att-'||g,'attest' from generate_series(1,4) g;
insert into review_sync_attestation_events(mission_id,crew_member_id,provenance,event_id,action) values ('M1','C1','real','att-real','attest');
with d as (insert into p37_demo_catalog_events(event_type,demo_id,mission_id,entry,entry_sha256) values ('DEMO_DECIDE','demo:vitd','M2','{"demoId":"demo:vitd"}','e'.repeat(1)) returning id)
 insert into p37_demo_catalog_events(event_type,demo_id,mission_id,decision_event_id) select 'DEMO_ACTIVATE','demo:vitd','M2',id from d;
with d as (insert into p615_demo_alias_events(event_type,alias_id,mission_id,entry,entry_sha256) values ('ALIAS_DECIDE','alias:1','M2','{"aliasId":"alias:1","rationale":"x"}','a') returning id)
 insert into p615_demo_alias_events(event_type,alias_id,mission_id,decision_event_id) select 'ALIAS_ACTIVATE','alias:1','M2',id from d;
insert into p36_global_scientific_reviewers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:disposable');
insert into p36_mission_scientific_sharing values ('M1', array['synthetic'], 'owner-policy:disposable', now());`.replace("'e'.repeat(1)", "'e'"));

const fingerprint = () => sql(`select md5(coalesce(string_agg(event_id||fingerprint||ciphertext, ',' order by received_seq),'')) || ':' || (select count(*) from observation_sync_events) || ':' ||
  (select md5(string_agg(event_id||action, ',' order by received_seq)) from review_sync_attestation_events) || ':' || (select count(*) from mission_memberships) || ':' ||
  (select count(*) from p37_demo_catalog_events) || ':' || (select count(*) from p615_demo_alias_events) from observation_sync_events;`);
const defs = () => sql(`select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('observation_sync_list_v1','review_sync_list_v1','p37_demo_catalog_snapshot_v1','p615_demo_alias_snapshot_v1');`);
const gates = () => sql(`select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('has_mission_role','observation_sync_can_access','review_sync_is_ground_medical','review_sync_can_read','p36_global_review_basis');`);
const dataBefore = fingerprint();
const defsBefore = defs();
const gatesBefore = gates();
const list = (n: number, m: string, c: string, p = "synthetic") => as(n) + `select jsonb_array_length(observation_sync_list_v1('${m}','${c}','${p}',0,100));`;
const rlist = (n: number, m: string, c: string, p = "synthetic") => as(n) + `select jsonb_array_length(review_sync_list_v1('${m}','${c}','${p}','attestation',0,100));`;

// --- Baseline: the reader has no access before the candidate is installed ---------
check(sqlErr(list(4, "M1", "C1")).includes("access denied"), "baseline: reader denied observations");
check(sqlErr(rlist(4, "M1", "C1")).includes("access denied"), "baseline: reader denied reviews");
check(sqlErr(as(4) + "select p37_demo_catalog_snapshot_v1('M2');").includes("scope denied"), "baseline: reader denied unshared demo catalog");

// --- Install the candidate exactly as prepared (managed transaction) -------------
sql(`BEGIN;\n${pending("20261115000000_p726_global_researcher_read.sql")}\nCOMMIT;`);
check(sql("select count(*) from p726_global_research_readers;") === "0", "install grants nobody");
check(sqlErr(list(4, "M1", "C1")).includes("access denied"), "installed but ungranted: denied");
check(json<{ granted: boolean }>(sql(as(4) + "select p726_global_research_scope_v1();")).granted === false, "ungranted: scope not granted");

// --- Privilege boundaries ---------------------------------------------------------
for (const t of ["p726_global_research_readers", "p726_global_research_audit"]) {
  check(sqlErr(`set role anon; select * from ${t};`).includes("permission denied"), `anon select ${t}`);
  check(sqlErr(as(4) + `select * from ${t};`).includes("permission denied"), `authenticated select ${t}`);
  check(sqlErr(as(4) + `insert into ${t} default values;`).includes("permission denied"), `authenticated insert ${t}`);
  check(sql(`select relrowsecurity::text from pg_class where relname='${t}';`) === "true", `RLS ${t}`);
  for (const r of ["anon", "authenticated"]) check(sql(`select has_table_privilege('${r}','${t}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')::text;`) === "false", `${r} no table access ${t}`);
  for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) check(sql(`select has_table_privilege('sandbox_exec','${t}','${p}')::text;`) === "false", `executor ${p} ${t}`);
}
for (const f of ["p726_global_research_scope_v1()", "p726_global_research_can_read(text,text,text)", "p726_is_global_research_reader()"]) {
  check(sql(`select has_function_privilege('anon','${f}','EXECUTE')::text;`) === "false", `anon no execute ${f}`);
  check(sql(`select has_function_privilege('authenticated','${f}','EXECUTE')::text;`) === "true", `authenticated execute ${f}`);
}
check(sqlErr("set role anon; select p726_global_research_scope_v1();").includes("permission denied"), "anonymous cannot obtain Researcher access");
check(sqlErr("set role anon; select observation_sync_list_v1('M1','C1','synthetic',0,10);").includes("permission denied"), "anonymous cannot list observations");
check(sqlErr("set role authenticated; reset request.jwt.claim.sub; select p726_global_research_scope_v1();").includes("authentication required"), "no JWT subject: refused");

// --- Owner provisioning (SQL only; same statement shape as the authorize file) ----
const authorize = pending("20261115000001_p726_global_researcher_read.authorize.sql");
check(/^insert into public\.p726_global_research_readers\(user_id, authorization_ref\)/m.test(authorize) && !/mission_memberships/.test(authorize.replace(/^--.*$/gm, "")), "authorize file only provisions the reader row");
sql(authorize.replace("33c9c6d0-3404-40e2-8aba-4e251db1be0e", uid(4)));
sql(authorize.replace("33c9c6d0-3404-40e2-8aba-4e251db1be0e", uid(4)));
check(sql("select count(*) from p726_global_research_readers;") === "1", "authorize idempotent");
sql(`insert into p726_global_research_readers(user_id, authorization_ref, revoked_at) values ('${uid(6)}','owner-authorization:revoked', now());`);
check(sqlErr(`insert into p726_global_research_readers(user_id, authorization_ref) values ('${uid(9)}','short');`).includes("check"), "authorization ref required");

// --- Global reader: list all missions without membership ---------------------------
type Scope = { granted: boolean; provenance: string[]; missions: { mission_id: string; code: string; crew: { crew_member_id: string; display_name: string }[] }[] };
const scope = json<Scope>(sql(as(4) + "select p726_global_research_scope_v1();"));
check(scope.granted && scope.provenance.join() === "synthetic", "granted, synthetic only");
check(scope.missions.map((m) => m.code).join() === "FV01-TEST-B,MITO_DEMO_2026,VALIDATION", "lists all missions");
check(scope.missions.find((m) => m.mission_id === "M1")?.crew.map((c) => c.display_name).join() === "Alex Morgan", "MITO_DEMO_2026 crew Alex Morgan");
check(scope.missions.find((m) => m.mission_id === "M3")?.crew.map((c) => c.crew_member_id).join() === "C3", "ended assignment excluded");
check(sql(`select count(*) from mission_memberships where user_id='${uid(4)}';`) === "0", "no membership created");
check(sql(`select count(*)::text || ':' || max(mission_count) from p726_global_research_audit where actor_id='${uid(4)}';`) === "1:3", "scope listing audited");
sql("insert into missions values('M4','FUTURE','Future mission','planning'); insert into mission_crew_assignments values('M4','C2','active');");
check(json<Scope>(sql(as(4) + "select p726_global_research_scope_v1();")).missions.some((m) => m.mission_id === "M4"), "future mission included automatically");

// --- Global reader: synthetic read paths ------------------------------------------
check(last(sql(list(4, "M1", "C1"))) === "5", "reader reads MITO_DEMO_2026 / Alex Morgan observations");
check(last(sql(list(4, "M2", "C2"))) === "1", "reader reads another mission");
check(last(sql(rlist(4, "M1", "C1"))) === "4", "reader reads review metadata");
check(sqlErr(list(4, "M1", "C1", "real")).includes("access denied"), "reader denied REAL observations");
check(sqlErr(rlist(4, "M1", "C1", "real")).includes("access denied"), "reader denied REAL reviews");
check(sqlErr(list(4, "M1", "C2")).includes("access denied"), "reader denied unassigned crew");
check(sqlErr(list(4, "M3", "C2")).includes("access denied"), "reader denied ended assignment");
check(sqlErr(list(4, "NOPE", "C1")).includes("access denied"), "reader denied unknown mission");
check(last(sql(as(4) + "select p37_demo_catalog_snapshot_v1('M2')->'entries'->0->>'status';")) === "ACTIVE", "reader reads demo catalog of unshared mission");
check(!last(sql(as(4) + "select p615_demo_alias_snapshot_v1('M2');")).includes("rationale"), "alias snapshot still strips rationale");
check(last(sql(as(4) + "select jsonb_array_length(p615_demo_alias_snapshot_v1('M2')->'aliases');")) === "1", "reader reads alias snapshot");
check(last(sql(as(4) + "select p726_global_research_can_read('M1','C1','synthetic')::text;")) === "true", "can_read true synthetic");
check(last(sql(as(4) + "select p726_global_research_can_read('M1','C1','real')::text;")) === "false", "can_read false real");
check(last(sql(as(4) + "select p726_global_research_can_read('M1','C1',null)::text;")) === "false", "can_read false null provenance");

// --- Global reader gains NO Medical, write, operator or crew authority --------------
check(last(sql(as(4) + "select observation_sync_can_access('M1','C1')::text;")) === "false", "no observation write gate");
check(last(sql(as(4) + "select review_sync_is_ground_medical('M1','C1')::text;")) === "false", "no Ground Medical attestation gate");
for (const r of ["ground_medical", "mission_operator", "crew_self", "researcher"])
  check(last(sql(as(4) + `select has_mission_role('M1', array['${r}'])::text;`)) === "false", `no ${r} mission role`);
const candidate = pending("20261115000000_p726_global_researcher_read.sql").replace(/^--.*$/gm, "");
const replaced = [...candidate.matchAll(/create or replace function public\.([a-z0-9_]+)/gi)].map((m) => m[1]).sort().join();
check(replaced === "observation_sync_list_v1,p37_demo_catalog_snapshot_v1,p615_demo_alias_snapshot_v1,review_sync_list_v1", "only the four read RPCs are replaced");
check(!/(append|decide|activate|attest|approve|revoke_v1|create policy|alter policy|disable row level|insert into public\.mission_memberships)/i.test(candidate.replace(/p726_reject_audit_mutation|revoke all on|revoke insert/gi, "")), "no write RPC, policy or membership change");
check(gates() === gatesBefore, "gating helpers unchanged");

// --- Revocation and other roles ---------------------------------------------------
check(sqlErr(list(6, "M1", "C1")).includes("access denied"), "revoked reader denied");
check(json<Scope>(sql(as(6) + "select p726_global_research_scope_v1();")).granted === false, "revoked reader not granted");
check(sqlErr(list(5, "M1", "C1")).includes("access denied"), "no-role user denied");
check(json<Scope>(sql(as(5) + "select p726_global_research_scope_v1();")).granted === false, "no-role user not granted");
check(sqlErr(list(3, "M1", "C1")).includes("access denied"), "mission researcher without grant stays mission-scoped");
check(last(sql(list(1, "M1", "C1"))) === "5", "crew_self keeps own scope");
check(sqlErr(list(1, "M2", "C2")).includes("access denied"), "Astronaut remains mission-scoped");
check(json<Scope>(sql(as(1) + "select p726_global_research_scope_v1();")).granted === false, "Astronaut not granted global read");
check(last(sql(list(2, "M1", "C1"))) === "5" && last(sql(list(2, "M1", "C1", "real"))) === "1", "Ground Medical unchanged (synthetic and real)");
check(last(sql(rlist(2, "M1", "C1", "real"))) === "1", "Ground Medical reviews unchanged");
check(sqlErr(list(2, "M2", "C2")).includes("access denied"), "Ground Medical still mission-scoped");
check(last(sql(as(3) + "select p37_demo_catalog_snapshot_v1('M2')->>'mission_id';")) === "M2", "member demo catalog unchanged");

// --- Audit append-only and data preserved -----------------------------------------
check(sqlErr("update p726_global_research_audit set mission_count = 0;").includes("append-only"), "audit update rejected");
check(sqlErr("delete from p726_global_research_audit;").includes("append-only"), "audit delete rejected");
check(sqlErr("truncate p726_global_research_audit;").includes("append-only"), "audit truncate rejected");
sql("delete from mission_crew_assignments where mission_id='M4'; delete from missions where id='M4';");
check(fingerprint() === dataBefore, "no existing records, reviews, memberships or catalog events modified");

// --- Rollback restores the exact baseline -----------------------------------------
sql(`BEGIN;\n${pending("20261115000000_p726_global_researcher_read.rollback.sql")}\nCOMMIT;`);
check(defs() === defsBefore, "rollback restores the four read RPC bodies exactly");
check(sqlErr(list(4, "M1", "C1")).includes("access denied"), "after rollback reader denied");
check(sql("select count(*) from pg_class where relname like 'p726_%';") === "0", "rollback removes P72.6 tables");
check(fingerprint() === dataBefore, "rollback preserves data");

sql(`drop database if exists ${DB} with (force);`, "postgres");
console.log(`P72.6 global Researcher read: ${count} assertions PASS`);
