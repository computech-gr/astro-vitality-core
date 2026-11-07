/**
 * Disposable socket-only verification of the pending P36 Global Scientific
 * Review + Triage SQL. Never uses managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-... bun scripts/verify-p36-global-triage-pg.ts
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
const DB = "p36_global_triage_it";
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
sql(`insert into p36_global_scientific_reviewers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:disposable'),('${uid(6)}','owner-authorization:disposable');
insert into p36_mission_scientific_sharing(mission_id, permitted_provenance, policy_ref) values ('M1', array['synthetic'], 'owner-policy:disposable-m1');`);
const handoffFingerprint = "select md5(string_agg(submission_id::text || payload_sha256 || payload_canonical, ',' order by received_seq)) || ':' || (select md5(string_agg(submission_id::text || term_id || metadata::text, ',' order by submission_id, term_id)) from p36_dynamic_handoff_terms) from p36_dynamic_handoff_submissions;";
const handoffBefore = sql(handoffFingerprint);

// Install the triage candidate exactly as prepared, inside a managed transaction.
sql(`BEGIN;\n${pending("20261107040000_p36_global_triage.sql")}\nCOMMIT;`);

// --- Privilege boundaries ---------------------------------------------------
for (const t of ["p36_global_triage_writers", "p36_global_triage_events"]) {
  check(sqlErr(`set role anon; select * from ${t};`).includes("permission denied"), `anon select ${t}`);
  check(sqlErr(as(4) + `select * from ${t};`).includes("permission denied"), `authenticated select ${t}`);
  check(sqlErr(as(4) + `insert into ${t} default values;`).includes("permission denied"), `authenticated insert ${t}`);
  check(sql(`select has_table_privilege('sandbox_exec','${t}','SELECT')::text;`) === "true", `executor read ${t}`);
  for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) check(sql(`select has_table_privilege('sandbox_exec','${t}','${p}')::text;`) === "false", `executor ${p} ${t}`);
  for (const r of ["anon", "authenticated"]) check(sql(`select has_table_privilege('${r}','${t}','INSERT,UPDATE,DELETE,TRUNCATE')::text;`) === "false", `${r} no writes ${t}`);
  check(sql(`select relrowsecurity::text from pg_class where relname='${t}';`) === "true", `RLS ${t}`);
}
const APPEND = "p36_global_triage_append_v1(text,text,uuid,text,text,text,text[],uuid,uuid)";
check(sql(`select has_function_privilege('anon','${APPEND}','EXECUTE')::text;`) === "false", "anon no append");
check(sql(`select has_function_privilege('service_role','${APPEND}','EXECUTE')::text;`) === "false", "service_role no append");
check(sql("select has_function_privilege('authenticated','p36_global_triage_record_grant()','EXECUTE')::text;") === "false", "grant trigger internal");
check(sql("select count(*) from p36_global_triage_writers;") === "0", "no triage writer granted by install");

const subId = (req: string) => sql(`select submission_id from p36_dynamic_handoff_submissions where request_id='${req}';`);
const termOf = (req: string, n = 0) => sql(`select term_id from p36_dynamic_handoff_terms where submission_id='${subId(req)}' order by term_id offset ${n} limit 1;`);
const S12 = subId("ubr-19aa5a1e"), S197 = subId("ubr-8b1514d8"), SM2 = subId("ubr-0000aaaa");
const T12 = termOf("ubr-19aa5a1e"), T197 = termOf("ubr-8b1514d8"), TM2 = termOf("ubr-0000aaaa");
let k = 0;
const key = () => `10000000-0000-4000-8000-${String(++k).padStart(12, "0")}`;
const q = (v: string | null) => (v === null ? "null" : literal(v));
const arr = (a: string[]) => `array[${a.map(literal).join(",")}]::text[]`;
function call(user: number, o: { mission?: string; prov?: string; sub: string; term: string; action: string; reason?: string | null; reqs?: string[]; prev?: string | null; key?: string }) {
  const r = run(as(user) + `select public.p36_global_triage_append_v1(${literal(o.mission ?? "M1")},${literal(o.prov ?? "synthetic")},'${o.sub}',${literal(o.term)},${literal(o.action)},${q(o.reason ?? null)},${arr(o.reqs ?? [])},${o.prev ? `'${o.prev}'` : "null"},'${o.key ?? key()}');`);
  return r.status === 0 ? { ok: true as const, v: JSON.parse(last(r.stdout.trim())) as { status: string; event_id?: string; detail?: string; latest_event_id?: string } } : { ok: false as const, err: r.stderr };
}
const ok = (r: ReturnType<typeof call>) => (r.ok ? r.v : { status: "error", detail: r.err });

// --- Read permission does not imply write permission ---------------------------
let r = call(4, { sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW" });
check(!r.ok && r.err.includes("triage authorization required"), "global reader without triage grant denied");
r = call(3, { sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW" });
check(!r.ok && r.err.includes("triage authorization required"), "mission researcher without triage grant denied");
check(sqlErr("set role authenticated; reset request.jwt.claim.sub; " + `select public.p36_global_triage_append_v1('M1','synthetic','${S12}','${T12}','ACCEPT_FOR_REVIEW',null,'{}'::text[],null,'${key()}');`).includes("authentication required"), "unauthenticated denied");
type ListOut = { can_triage: boolean; events: { event_id: string; action: string; term_id: string; reason: string | null; evidence_requirements: string[]; previous_event_id: string | null; recorded_by_caller: boolean }[] };
check(json<ListOut>(sql(as(4) + "select p36_global_triage_list_v1('M1','synthetic');")).can_triage === false, "capability false before grant");

// --- Owner provisioning of triage grants (SQL only) ---------------------------
sql(`insert into p36_global_triage_writers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:triage-disposable'),('${uid(8)}','owner-authorization:triage-no-read');`);
check(sql("select count(*) from p36_global_review_audit where details->>'grant'='triage_write';") === "2", "triage grants audited");
check(json<ListOut>(sql(as(4) + "select p36_global_triage_list_v1('M1','synthetic');")).can_triage === true, "capability true after grant");

// A write grant never widens reading scope.
r = call(8, { sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW" });
check(!r.ok && r.err.includes("scope denied"), "triage grant without read basis denied");
r = call(4, { mission: "M2", sub: SM2, term: TM2, action: "ACCEPT_FOR_REVIEW" });
check(!r.ok && r.err.includes("scope denied"), "unshared mission denied");
r = call(4, { prov: "real", sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW" });
check(!r.ok && r.err.includes("scope denied"), "unshared provenance denied");
check(sqlErr(as(4) + "select p36_global_triage_list_v1('M2','synthetic');").includes("scope denied"), "unshared mission history denied");
check(ok(call(4, { mission: "M1", sub: SM2, term: TM2, action: "ACCEPT_FOR_REVIEW" })).status === "rejected", "other mission's submission not addressable");
check(ok(call(4, { sub: S12, term: "ubt-00000000", action: "ACCEPT_FOR_REVIEW" })).status === "rejected", "unknown term rejected");
r = call(4, { sub: S12, term: T12, action: "APPROVE" });
check(!r.ok && r.err.includes("invalid triage action"), "approval is not a triage action");

// --- Mandatory reasons and evidence requirements ------------------------------
check(ok(call(4, { sub: S12, term: T12, action: "REJECT_REVIEW_REQUEST" })).detail === "a documented reason is required", "reject needs reason");
check(ok(call(4, { sub: S12, term: T12, action: "REQUEST_MORE_EVIDENCE", reason: "   " })).detail === "a documented reason is required", "blank reason rejected");
check(ok(call(4, { sub: S12, term: T12, action: "REQUEST_MORE_EVIDENCE", reason: "Method and protocol not documented." })).detail === "name at least one missing evidence requirement", "evidence request needs requirements");
check(ok(call(4, { sub: S12, term: T12, action: "REQUEST_MORE_EVIDENCE", reason: "Method and protocol not documented.", reqs: ["dosage"] })).detail === "unknown evidence requirement", "requirements whitelisted");
check(ok(call(4, { sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW", reqs: ["unit"] })).detail === "evidence requirements apply only to evidence requests", "requirements only on evidence requests");
check(ok(call(4, { sub: S12, term: T12, action: "REJECT_REVIEW_REQUEST", reason: "short" })).detail === "reason must be 8 to 2000 characters", "reason length");

// --- Recording, idempotency and concurrency -----------------------------------
const k1 = key();
const a1 = ok(call(4, { sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW", key: k1 }));
check(a1.status === "recorded" && !!a1.event_id, "accept recorded");
const dup = ok(call(4, { sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW", key: k1 }));
check(dup.status === "duplicate" && dup.event_id === a1.event_id, "idempotent retry returns same event");
r = call(4, { sub: S12, term: T12, action: "REJECT_REVIEW_REQUEST", reason: "Different request with reused key.", key: k1 });
check(!r.ok && r.err.includes("idempotency key reused"), "key reuse with different request refused");
const stale = ok(call(4, { sub: S12, term: T12, action: "REQUEST_MORE_EVIDENCE", reason: "Unit basis is not documented.", reqs: ["unit"], prev: null }));
check(stale.status === "stale" && stale.latest_event_id === a1.event_id, "stale writer told about latest event");
check(ok(call(4, { sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW", prev: a1.event_id ?? null })).detail === "already accepted for scientific review", "no double accept");
const m1 = ok(call(4, { sub: S12, term: T12, action: "REQUEST_MORE_EVIDENCE", reason: "Unit basis and method are not documented.", reqs: ["unit", "method", "unit"], prev: a1.event_id ?? null }));
check(m1.status === "recorded", "evidence request after accept");
check(sql(`select array_to_string(evidence_requirements, ',') from p36_global_triage_events where id='${m1.event_id}';`) === "method,unit", "requirements normalized");
const j1 = ok(call(4, { sub: S12, term: T12, action: "REJECT_REVIEW_REQUEST", reason: "Insufficient provenance for scientific evaluation.", prev: m1.event_id ?? null }));
check(j1.status === "recorded", "reject recorded");
check(ok(call(4, { sub: S12, term: T12, action: "ACCEPT_FOR_REVIEW", prev: j1.event_id ?? null })).detail === "review request already rejected; a new submission is required", "reject is terminal");

// Two concurrent first decisions on the same term: exactly one wins.
const conc = [0, 1].map(() => spawnSync("psql", [...base, "-d", DB], { input: as(4) + `select public.p36_global_triage_append_v1('M1','synthetic','${S197}','${T197}','ACCEPT_FOR_REVIEW',null,'{}'::text[],null,'${key()}')->>'status';`, encoding: "utf8" }));
check(sql(`select count(*) from p36_global_triage_events where submission_id='${S197}' and term_id='${T197}';`) === "1", "concurrent first writes produce one event");
check(conc.every((c) => c.status === 0) && conc.map((c) => last(c.stdout.trim())).sort().join(",") === "recorded,stale", "loser sees stale");

// --- Identity, timestamps, history and immutability ----------------------------
const hist = json<ListOut>(sql(as(4) + "select p36_global_triage_list_v1('M1','synthetic');"));
check(hist.events.length === 4, "history has all events");
check(hist.events.filter((e) => e.term_id === T12).map((e) => e.action).join(",") === "ACCEPT_FOR_REVIEW,REQUEST_MORE_EVIDENCE,REJECT_REVIEW_REQUEST", "ordered chain");
check(hist.events.every((e) => e.recorded_by_caller), "caller identity flagged");
check(!JSON.stringify(hist).includes(uid(4)) && !JSON.stringify(hist).includes("C1"), "history exposes no user or crew IDs");
check(sql(`select count(*) from p36_global_triage_events where actor_user_id='${uid(4)}' and recorded_at is not null and access_basis='global_scientific_review';`) === "4", "reviewer identity and time stored");
const researcherHist = json<ListOut>(sql(as(3) + "select p36_global_triage_list_v1('M1','synthetic');"));
check(researcherHist.can_triage === false && researcherHist.events.length === 4 && researcherHist.events.every((e) => !e.recorded_by_caller), "mission researcher reads history, cannot write");
check(sqlErr(`update p36_global_triage_events set reason='tampered reason text' where id='${a1.event_id}';`).includes("append-only"), "events immutable");
check(sqlErr(`delete from p36_global_triage_events where id='${a1.event_id}';`).includes("append-only"), "events undeletable");
check(sqlErr("truncate p36_global_triage_events;").includes("append-only"), "events untruncatable");
check(sqlErr(`delete from p36_global_triage_writers where user_id='${uid(4)}';`).includes("append-only"), "grants never deleted");
check(Number(sql("select count(*) from p36_global_review_audit where details->>'view'='triage_history';")) >= 4, "history reads audited");

// --- No approval, no catalog, original metadata unchanged ---------------------
check(sql("select count(*) from p36_dynamic_authorization_events;") === "0", "triage records no scientific decision");
check(sql(handoffFingerprint) === handoffBefore, "submitted metadata unchanged");
check(sql("select authorization_open::text from p36_dynamic_admission;") === "false", "scientific authorization stays closed");
const missionsAfter = json<{ pending_term_count: number }[]>(sql(as(4) + "select p36_global_review_missions_v1('synthetic');"));
check(missionsAfter[0]?.pending_term_count === 209, "all 209 remain pending scientific review");

// --- Revocation takes effect immediately ---------------------------------------
sql(`update p36_global_triage_writers set revoked_at=now() where user_id='${uid(4)}';`);
r = call(4, { sub: S197, term: termOf("ubr-8b1514d8", 1), action: "ACCEPT_FOR_REVIEW" });
check(!r.ok && r.err.includes("triage authorization required"), "revoked writer denied");
check(json<ListOut>(sql(as(4) + "select p36_global_triage_list_v1('M1','synthetic');")).can_triage === false, "capability false after revoke");
sql(`update p36_global_triage_writers set revoked_at=null where user_id='${uid(4)}';`);
sql("update p36_mission_scientific_sharing set permitted_provenance='{}', policy_ref='owner-policy:withdrawn-m1' where mission_id='M1';");
r = call(4, { sub: S197, term: termOf("ubr-8b1514d8", 1), action: "ACCEPT_FOR_REVIEW" });
check(!r.ok && r.err.includes("scope denied"), "withdrawn sharing denies triage");

// --- Demo grant statement and rollback -----------------------------------------
const demo = pending("20261107040001_p36_global_triage_demo.authorize.sql");
check((demo.match(/;\s*$/gm) ?? []).length === 1 && /insert into public\.p36_global_triage_writers/.test(demo) && !/mission_memberships|catalog|admission/i.test(demo.replace(/^--.*$/gm, "")), "demo grant is one triage-writer insert");
sql(demo);
check(sql("select count(*) from p36_global_triage_writers where user_id='33c9c6d0-3404-40e2-8aba-4e251db1be0e' and revoked_at is null;") === "1", "demo grant applies");
sql(`BEGIN;\n${pending("20261107040000_p36_global_triage.rollback.sql")}\nCOMMIT;`);
check(sql("select count(*) from pg_tables where tablename like 'p36_global_triage%';") === "0", "rollback removes triage tables");
check(sql("select count(*) from pg_tables where tablename in ('p36_global_scientific_reviewers','p36_mission_scientific_sharing','p36_global_review_audit');") === "3", "rollback keeps global review");
check(sql(handoffFingerprint) === handoffBefore, "rollback keeps submissions");
console.log(`P36 global triage disposable verification: ${count} assertions passed`);
