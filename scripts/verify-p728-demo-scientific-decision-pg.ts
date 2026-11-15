/**
 * Disposable socket-only verification of P72.8 (direct Researcher DEMO SCIENTIFIC
 * APPROVAL for explicitly classified synthetic demonstration missions) on top of
 * the installed P36/P37/P38/P61.5 chain, with an isolated synthetic fixture.
 * Part A replays the workflow already installed on the shared backend (no
 * P72.8): Ground Medical submission → Researcher demo decision without any
 * source-validation receipt → independent Ground Medical activation, while
 * production approval still demands a receipt. Part B installs the pending
 * P72.8 SQL and checks rationale/evidence records, Researcher reject, Medical
 * activate/decline, separation of duties, classification and mixed-provenance
 * gates, legacy-path blocking in classified missions, ACLs, immutability and
 * rollback refusal. Never uses managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-p728 bun scripts/verify-p728-demo-scientific-decision-pg.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import { SYNTHETIC_DEMO_ACKNOWLEDGEMENT } from "../src/domain/health-intelligence/synthetic-demo-catalog";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket")) throw Error("Explicit isolated socket required; live database prohibited.");
const DB = "p728_demo_decision_it";
const base = ["-h", socket, "-p", "55439", "-U", "lovable", "-v", "ON_ERROR_STOP=1", "-X", "-At"];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
const run = (q: string, db = DB) => spawnSync("psql", [...base, "-d", db], { input: q, encoding: "utf8", cwd: root, env, maxBuffer: 64 << 20 });
function sql(q: string, db = DB) { const r = run(q, db); if (r.status !== 0) throw Error(`Unexpected SQL failure: ${r.stderr.slice(0, 2000)}`); return r.stdout.trim(); }
function sqlErr(q: string) { const r = run(q); if (r.status === 0) throw Error(`Expected SQL failure: ${q.slice(0, 300)}`); return r.stderr; }
const pending = (f: string) => readFileSync(resolve(root, "supabase/pending", f), "utf8");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const as = (n: number) => `set role authenticated; set request.jwt.claim.sub='${uid(n)}';`;
const last = (s: string) => s.trim().split("\n").at(-1) ?? "";
const json = <T = Record<string, unknown>>(s: string): T => JSON.parse(last(s)) as T;
const lit = (s: string) => "'" + s.replaceAll("'", "''") + "'";
let count = 0;
const check = (yes: boolean, label: string) => { if (!yes) throw Error(`assertion failed: ${label}`); count++; };
let k = 0;
const key = () => `72800000-0000-4000-8000-${String(++k).padStart(12, "0")}`;

const M = "mission-demo", C = "crew-demo", M2 = "mission-other", C2 = "crew-other", M3 = "mission-mixed", C3 = "crew-mixed";
const SUB_A = "72800000-0000-4000-8000-0000000000a1"; // Part A fixture (existing workflow)
const SUB_FIX = "72800000-0000-4000-8000-0000000000b1"; // Part B fixture, like ubr-6a205852
const SUB_SELF = "72800000-0000-4000-8000-0000000000b2"; // submitted by the Researcher
const SUB_M2 = "72800000-0000-4000-8000-0000000000c1";
const SUB_MIX_S = "72800000-0000-4000-8000-0000000000d1";
const SUB_MIX_R = "72800000-0000-4000-8000-0000000000d2";
type T = [string, string, string];
const A_TERMS: T[] = [["ubt-a0000001", "Fixture marker alpha", "mmol/L"], ["ubt-a0000002", "Fixture marker beta", "mg/dL"]];
const FIX: T[] = [
  ["ubt-b0000001", "Bicarbonate", "mmol/L"], ["ubt-b0000002", "Chloride", "mmol/L"], ["ubt-b0000003", "Creatinine", "mg/dL"],
  ["ubt-b0000004", "HRV SDNN", "ms"], ["ubt-b0000005", "Platelets", "10^9/L"], ["ubt-b0000006", "Sleep duration", "h"],
  ["ubt-b0000007", "Urea nitrogen (BUN)", "mg/dL"], ["ubt-b0000008", "Ambiguous marker", "pmol/L ή ng/mL"],
  ["ubt-b0000009", "Untriaged marker", "U/L"],
];
const meta = (t: T) => JSON.stringify({ termId: t[0], originalLabels: [t[1]], exactUnit: t[2], classification: "unclassified", candidateMetricIds: [], sourceDocumentSha256: ["5".repeat(64)] });

// Users: 1 crew_self · 2 GM mission-wide (submitter) · 3 GM crew-scoped (activator) · 7 second GM (decliner)
// 6 Researcher (global reviewer + triage + approver, no membership in M; researcher member of M2)
// 8 GM who also holds approver/reviewer grants (separation of duties) · 9 mission_operator · 12 reviewer w/o approver
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
insert into missions(id, code, name) values ('${M}','MITO_DEMO_2026','Synthetic Demonstration'),('${M2}','TEST-B','Other'),('${M3}','MIXED','Mixed provenance');
insert into mission_research_keys(mission_id) values ('${M}'),('${M2}'),('${M3}');
insert into crew_members values ('${C}','Synthetic Astronaut'),('${C2}','Other'),('${C3}','Mixed');
insert into mission_crew_assignments values ('${M}','${C}','active'),('${M2}','${C2}','active'),('${M3}','${C3}','active');
insert into mission_memberships(mission_id, user_id, crew_member_id, role, active) values
 ('${M}','${uid(1)}','${C}','crew_self',true),('${M}','${uid(2)}',null,'ground_medical',true),
 ('${M}','${uid(3)}','${C}','ground_medical',true),('${M}','${uid(7)}',null,'ground_medical',true),
 ('${M}','${uid(8)}',null,'ground_medical',true),('${M}','${uid(9)}',null,'mission_operator',true),
 ('${M2}','${uid(6)}',null,'researcher',true),('${M2}','${uid(5)}',null,'ground_medical',true),
 ('${M3}','${uid(2)}',null,'ground_medical',true),('${M3}','${uid(3)}',null,'ground_medical',true);`);
sql(`BEGIN;\n${pending("20261107000000_p36_dynamic_handoff.tool.sql")}\nCOMMIT;`);
sql(pending("20261107000001_p36_closed_admission.initialize.sql"));
sql(`BEGIN;\n${pending("20261107000002_p36_handoff_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010000_p36_dynamic_authorization.tool.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010001_p36_authorization_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107020000_p36_authorized_crew_roster.tool.sql")}\nCOMMIT;`);
let n = 0;
const submit = (sub: string, mission: string, crew: string, provenance: string, by: number, terms: T[]) => {
  const payload = canonicalJson({ fixture: "p728-synthetic", submissionId: sub });
  sql(`insert into p36_dynamic_handoff_submissions(submission_id, mission_id, crew_member_id, provenance, request_id, submitted_by, submitted_role, payload_canonical, payload_sha256)
values ('${sub}','${mission}','${crew}','${provenance}','ubr-${String(++n).padStart(8, "0")}','${uid(by)}','ground_medical',${lit(payload)},encode(sha256(convert_to(${lit(payload)},'UTF8')),'hex'));
insert into p36_dynamic_handoff_terms(submission_id, term_id, metadata) values ${terms.map((t) => `('${sub}','${t[0]}',${lit(meta(t))}::jsonb)`).join(",")};`);
};
submit(SUB_A, M, C, "synthetic", 2, A_TERMS);
submit(SUB_FIX, M, C, "synthetic", 2, FIX);
submit(SUB_SELF, M, C, "synthetic", 6, [["ubt-c0000001", "Self submitted marker", "g/dL"]]);
submit(SUB_M2, M2, C2, "synthetic", 5, [["ubt-c0000002", "Other mission marker", "g/dL"]]);
submit(SUB_MIX_S, M3, C3, "synthetic", 2, [["ubt-d0000001", "Mixed synthetic marker", "g/dL"]]);
submit(SUB_MIX_R, M3, C3, "real", 2, [["ubt-d0000002", "Mixed real marker", "g/dL"]]);

sql(`BEGIN;\n${pending("20261107030000_p36_global_scientific_review.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107040000_p36_global_triage.sql")}\nCOMMIT;`);
sql(`insert into p36_global_scientific_reviewers(user_id, authorization_ref) values ('${uid(6)}','owner-authorization:disposable'),('${uid(12)}','owner-authorization:disposable'),('${uid(8)}','owner-authorization:disposable');
insert into p36_mission_scientific_sharing(mission_id, permitted_provenance, policy_ref) values ('${M}', array['synthetic'], 'owner-policy:disposable'),('${M3}', array['synthetic'], 'owner-policy:disposable-mixed');
insert into p36_global_triage_writers(user_id, authorization_ref) values ('${uid(6)}','owner-authorization:triage-disposable');`);
sql(`BEGIN;\n${pending("20261108000000_p37_catalog_activation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261108010000_p37_ground_medical_activation.sql")}\nCOMMIT;`);
sql(`insert into p37_scientific_approvers(user_id, authorization_ref) values ('${uid(6)}','owner-authorization:p37-disposable'),('${uid(8)}','owner-authorization:p37-disposable-gm');`);
sql(`BEGIN;\n${pending("20261108020000_p37_synthetic_demo_catalog.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261108030000_p38_bulk_synthetic_demo.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261112000000_p615_researcher_demo_scope.sql")}\nCOMMIT;`);

const triage = (sub: string, term: string, mission = M, action = "ACCEPT_FOR_REVIEW") =>
  json<{ status: string }>(sql(as(6) + `select public.p36_global_triage_append_v1('${mission}','synthetic','${sub}','${term}','${action}',null,'{}'::text[],null,'${key()}');`));
for (const [t] of A_TERMS) check(triage(SUB_A, t).status === "recorded", `triage A ${t}`);
for (const [t] of FIX.filter(([t]) => t !== "ubt-b0000009")) check(triage(SUB_FIX, t).status === "recorded", `triage ${t}`);
check(triage(SUB_SELF, "ubt-c0000001").status === "recorded", "triage self-submitted");
check(triage(SUB_MIX_S, "ubt-d0000001", M3).status === "recorded", "triage mixed synthetic");
const prodCounts = "select (select count(*) from p37_catalog_events) || ':' || (select count(*) from p36_dynamic_source_validation) || ':' || (select count(*) from p36_dynamic_authorization_events);";
check(sql(prodCounts) === "0:0:0", "baseline: no production approvals, receipts or authorizations");

// ---------------- Part A: the installed workflow (no P72.8) ----------------
const prod = json<{ status: string; detail: string }>(sql(as(6) + `select public.p37_catalog_approve_v1('${M}','synthetic','${SUB_A}','ubt-a0000001','validation:none','Fixture marker alpha','bone','${key()}');`));
check(prod.status === "rejected" && prod.detail === "exactly one independently provisioned source-validation receipt is required", "A: production approval still requires a source-validation receipt");
const auth615 = json<{ results: { status: string }[] }>(sql(as(6) + `select public.p615_demo_scope_authorize_v1('${M}',${lit(JSON.stringify([{ submission_id: SUB_A, term_id: "ubt-a0000001", exact_unit: "mmol/L", idempotency_key: key() }]))}::jsonb);`));
check(auth615.results[0]!.status === "recorded", "A: Researcher authorizes the accepted synthetic term for the demo scope");
const decA = json<{ status: string; event_id: string; entry_sha256: string }>(sql(as(6) + `select public.p37_demo_decide_v1('${M}','${SUB_A}','ubt-a0000001','Fixture marker alpha','bone',${lit(SYNTHETIC_DEMO_ACKNOWLEDGEMENT)},'${key()}');`));
check(decA.status === "recorded", "A: Researcher demo decision recorded without any source-validation receipt");
check(sql(prodCounts) === "0:0:0", "A: no receipt, production approval or authorization was created");
for (const u of [1, 2, 9, 12]) {
  const r = run(as(u) + `select public.p37_demo_decide_v1('${M}','${SUB_A}','ubt-a0000002','Fixture marker beta','bone',${lit(SYNTHETIC_DEMO_ACKNOWLEDGEMENT)},'${key()}');`);
  check(r.status !== 0 && /authorization required|scope denied/.test(r.stderr), `A: user ${u} cannot record a demo decision`);
}
const selfAct = run(as(6) + `select public.p37_demo_activate_v1('${decA.event_id}','${decA.entry_sha256}','${key()}');`);
check(selfAct.status !== 0 && /Ground Medical membership/.test(selfAct.stderr), "A: the Researcher cannot perform Medical activation");
const actA = json<{ status: string }>(sql(as(3) + `select public.p37_demo_activate_v1('${decA.event_id}','${decA.entry_sha256}','${key()}');`));
check(actA.status === "recorded", "A: Ground Medical independently activates");
check(sql(`select count(distinct actor_user_id) || ':' || string_agg(event_type, ',' order by seq) from p37_demo_catalog_events where term_id='ubt-a0000001';`) === "2:DEMO_DECIDE,DEMO_ACTIVATE", "A: decision and activation by separate actors");
check(sql(`select count(*) from p37_demo_catalog_events where submission_id='${SUB_FIX}';`) === "0", "A: no pending fixture request was decided automatically");

// ---------------- Part B: install pending P72.8 ----------------
check(sql(`BEGIN;\n${pending("20261115020000_p728_demo_scientific_decision.sql")}\n${pending("20261115020000_p728_demo_scientific_decision.rollback.sql")}
select (not exists (select 1 from pg_proc where proname like 'p728_%') and not exists (select 1 from pg_tables where tablename like 'p728_%') and not exists (select 1 from pg_trigger where tgname like 'p728_%'))::text;
ROLLBACK;`).split("\n").includes("true"), "rollback removes every P72.8 object while no record exists");
sql(`BEGIN;\n${pending("20261115020000_p728_demo_scientific_decision.sql")}\nCOMMIT;`);
const FNS: [string, boolean][] = [
  ["p728_demo_researcher_decide_v1(text,text,text,jsonb,jsonb)", true],
  ["p728_demo_medical_decide_v1(text,text,text,jsonb)", true],
  ["p728_demo_review_records_v1(text)", true],
  ["p728_demo_mission_problem(text)", false],
  ["p728_demo_event_guard()", false],
  ["p728_evidence_refs(jsonb)", false],
];
for (const [f, callable] of FNS)
  for (const [role, want] of [["authenticated", callable], ["anon", false], ["service_role", false], ["sandbox_exec", false]] as const)
    check(sql(`select has_function_privilege('${role}','${f}','EXECUTE')::text;`) === String(want), `${role} execute ${f} = ${want}`);
for (const f of ["p728_demo_researcher_decide_v1", "p728_demo_medical_decide_v1", "p728_demo_review_records_v1", "p728_demo_mission_problem"])
  check(sql(`select (prosecdef and proconfig::text like '%search_path=public, pg_temp%' and pg_get_userbyid(proowner) = current_user)::text from pg_proc where proname='${f}';`) === "true", `${f} definer, pinned search_path, trusted owner`);
for (const t of ["p728_demo_missions", "p728_demo_review_records"]) {
  for (const role of ["authenticated", "anon", "sandbox_exec"])
    check(sql(`select (has_table_privilege('${role}','${t}','SELECT') and '${role}' <> 'sandbox_exec' or has_table_privilege('${role}','${t}','INSERT') or has_table_privilege('${role}','${t}','UPDATE') or has_table_privilege('${role}','${t}','DELETE'))::text;`) === "false", `${role} has no direct access to ${t}`);
  check(sql(`select relrowsecurity::text from pg_class where relname='${t}';`) === "true", `RLS enabled on ${t}`);
}

type Res = { status: string; detail?: string; record_id?: string; demo_event_id?: string; entry_sha256?: string };
type Out = { ok: true; results: Res[] } | { ok: false; err: string };
const item = (sub: string, t: T, extra: Record<string, unknown> = {}, kk = key()) =>
  ({ submission_id: sub, term_id: t[0], exact_unit: t[2], display_name: t[1], domain: "immune", idempotency_key: kk, ...extra });
const RAT = "Synthetic demonstration: label and exact unit match the cited source table.";
const decide = (u: number, decision: string, items: Record<string, unknown>[], mission = M, rationale: string | null = RAT, refs: unknown = ["source:5555 p.3", "request:ubr-00000002"]): Out => {
  const r = run(as(u) + `select public.p728_demo_researcher_decide_v1('${mission}','${decision}',${rationale === null ? "null" : lit(rationale)},${lit(JSON.stringify(refs))}::jsonb,${lit(JSON.stringify(items))}::jsonb);`);
  return r.status === 0 ? { ok: true, results: json<{ results: Res[] }>(r.stdout).results } : { ok: false, err: r.stderr };
};
const medical = (u: number, decision: string, items: Record<string, unknown>[], rationale: string | null = "Ground Medical reviewed the demo proposal for this synthetic mission.", mission = M): Out => {
  const r = run(as(u) + `select public.p728_demo_medical_decide_v1('${mission}','${decision}',${rationale === null ? "null" : lit(rationale)},${lit(JSON.stringify(items))}::jsonb);`);
  return r.status === 0 ? { ok: true, results: json<{ results: Res[] }>(r.stdout).results } : { ok: false, err: r.stderr };
};
const records = () => sql("select count(*) from p728_demo_review_records;");

// Not classified yet: refused, nothing written.
let r = decide(6, "APPROVE", [item(SUB_FIX, FIX[0]!)]);
check(!r.ok && /not classified as a synthetic demonstration mission/.test(r.err), "unclassified mission refused");
const legacyBefore = json<{ status: string }>(sql(as(6) + `select public.p37_demo_decide_v1('${M}','${SUB_A}','ubt-a0000002','Fixture marker beta','bone',${lit(SYNTHETIC_DEMO_ACKNOWLEDGEMENT)},'${key()}');`));
check(legacyBefore.status === "rejected", "unclassified: legacy path unchanged (still needs demo scope)");
sql(pending("20261115020001_p728_demo_mission.authorize.sql"));
check(sql("select count(*) from p728_demo_missions;") === "1", "owner classification row installed for MITO_DEMO_2026 only");
sql(`insert into p728_demo_missions(mission_id, authorization_ref) values ('${M3}','owner-authorization:disposable-mixed');`);

// Authorization separation.
for (const u of [1, 2, 3, 7, 9, 12]) {
  const x = decide(u, "APPROVE", [item(SUB_FIX, FIX[0]!)]);
  check(!x.ok && /authorization required|scope denied/.test(x.err), `user ${u} cannot record a demo scientific decision`);
}
r = decide(6, "APPROVE", [item(SUB_M2, ["ubt-c0000002", "Other mission marker", "g/dL"])], M2);
check(!r.ok && /not classified/.test(r.err), "mission-researcher basis on an unclassified mission refused");
r = decide(6, "APPROVE", [item(SUB_MIX_S, ["ubt-d0000001", "Mixed synthetic marker", "g/dL"])], M3);
check(!r.ok && /mixed provenance/.test(r.err), "mixed-provenance mission refused even when classified");
const mixLegacy = run(as(6) + `select public.p615_demo_scope_authorize_v1('${M3}',${lit(JSON.stringify([{ submission_id: SUB_MIX_S, term_id: "ubt-d0000001", exact_unit: "g/dL", idempotency_key: key() }]))}::jsonb);
select public.p37_demo_decide_v1('${M3}','${SUB_MIX_S}','ubt-d0000001','Mixed synthetic marker','bone',${lit(SYNTHETIC_DEMO_ACKNOWLEDGEMENT)},'${key()}');`);
check(mixLegacy.status !== 0 && /mixed-provenance/.test(mixLegacy.stderr), "legacy demo decision blocked in a mixed-provenance mission");
r = decide(6, "APPROVE", [item(SUB_FIX, FIX[0]!)], M, null);
check(!r.ok && /rationale/.test(r.err), "rationale required");
r = decide(6, "APPROVE", [item(SUB_FIX, FIX[0]!)], M, "short");
check(!r.ok && /rationale/.test(r.err), "short rationale refused");
r = decide(6, "APPROVE", [item(SUB_FIX, FIX[0]!)], M, RAT, [1, 2]);
check(!r.ok && /evidence references/.test(r.err), "malformed evidence references refused");
r = decide(6, "MAYBE", [item(SUB_FIX, FIX[0]!)]);
check(!r.ok && /unknown decision/.test(r.err), "unknown decision refused");
check(records() === "0" && sql(`select count(*) from p37_demo_catalog_events where submission_id='${SUB_FIX}';`) === "0", "refused calls wrote nothing");

// Legacy direct paths are blocked in the classified mission (rationale always recorded).
const legacy = run(as(6) + `select public.p615_demo_scope_authorize_v1('${M}',${lit(JSON.stringify([{ submission_id: SUB_A, term_id: "ubt-a0000002", exact_unit: "mg/dL", idempotency_key: key() }]))}::jsonb);
select public.p37_demo_decide_v1('${M}','${SUB_A}','ubt-a0000002','Fixture marker beta','bone',${lit(SYNTHETIC_DEMO_ACKNOWLEDGEMENT)},'${key()}');`);
check(legacy.status !== 0 && /must record a rationale/.test(legacy.stderr), "legacy demo decision without rationale blocked in a classified mission");

// Researcher APPROVE (outside the scope → existing P61.5 authorization inside the same call).
const scope0 = sql("select count(*) from p37_demo_scope;");
const k1 = key();
r = decide(6, "APPROVE", [item(SUB_FIX, FIX[0]!, {}, k1), item(SUB_FIX, FIX[1]!), item(SUB_FIX, FIX[7]!), item(SUB_FIX, FIX[8]!), item(SUB_SELF, ["ubt-c0000001", "Self submitted marker", "g/dL"])]);
check(r.ok, "batch approve call succeeds");
const res = r.ok ? r.results : [];
check(res[0]!.status === "recorded" && !!res[0]!.demo_event_id && res[1]!.status === "recorded", "two eligible terms approved without any receipt");
check(res[2]!.status === "rejected" && /alternative units/.test(res[2]!.detail ?? ""), "ambiguous unit term rejected (never chosen or converted)");
check(res[3]!.status === "rejected" && /accepted for scientific review/.test(res[3]!.detail ?? ""), "untriaged term rejected");
check(res[4]!.status === "rejected" && /submitter/.test(res[4]!.detail ?? ""), "submitter cannot decide own request");
check(sql("select count(*) from p37_demo_scope;") === String(Number(scope0) + 2), "only the two approved terms entered the demo scope (failed items rolled back)");
check(sql(`select count(*) from p615_demo_scope_grants where submission_id='${SUB_FIX}' and actor_user_id='${uid(6)}';`) === "2", "Researcher scope authorization recorded for each approved term");
check(sql(`select string_agg(record_type || '|' || actor_role || '|' || label || '|' || rationale || '|' || evidence_refs::text, ';' order by seq) from p728_demo_review_records;`) ===
  [0, 1].map(() => `RESEARCHER_DEMO_APPROVE|researcher|DEMO SCIENTIFIC APPROVAL — NOT CLINICALLY VALIDATED|${RAT}|["request:ubr-00000002", "source:5555 p.3"]`).join(";"), "records hold actor role, label, rationale and evidence references");
check(sql(`select count(*) from p728_demo_review_records r join p37_demo_catalog_events e on e.id = r.demo_event_id and e.event_type='DEMO_DECIDE' and e.submission_id = r.submission_id and e.term_id = r.term_id where r.actor_user_id='${uid(6)}';`) === "2", "records link the original submission/term to the demo decision event");
check(sql(`select entry->>'classification' from p37_demo_catalog_events where id='${res[0]!.demo_event_id}';`) === "SYNTHETIC_DEMO_NOT_SCIENTIFICALLY_VALIDATED", "demo entry stays labelled not scientifically validated");
check(sql(prodCounts) === "0:0:0", "still no receipt, production approval or authorization");

// Idempotency.
r = decide(6, "APPROVE", [item(SUB_FIX, FIX[0]!, {}, k1)]);
check(r.ok && r.results[0]!.status === "duplicate", "exact replay is a duplicate");
r = decide(6, "APPROVE", [item(SUB_FIX, FIX[0]!, { display_name: "Other name" }, k1)]);
check(!r.ok && /idempotency key reused/.test(r.err), "key reuse with a different request refused");
r = decide(6, "REJECT", [item(SUB_FIX, FIX[0]!)]);
check(r.ok && r.results[0]!.status === "rejected" && /already has a demo scientific decision/.test(r.results[0]!.detail ?? ""), "approved term cannot be rejected afterwards");

// Researcher REJECT.
r = decide(6, "REJECT", [item(SUB_FIX, FIX[2]!)], M, "Identity overlaps an existing demo biomarker; needs alias review.", ["request:ubr-00000002"]);
check(r.ok && r.results[0]!.status === "recorded" && !r.results[0]!.demo_event_id, "Researcher rejection recorded with rationale, no demo entry");
r = decide(6, "APPROVE", [item(SUB_FIX, FIX[2]!)]);
check(r.ok && r.results[0]!.status === "rejected", "rejected term cannot be approved");
check(sql(`select count(*) from p37_demo_catalog_events where term_id='${FIX[2]![0]}';`) === "0", "rejected term has no demo decision");

// Medical decisions.
const decOf = (t: string) => sql(`select id || '|' || entry_sha256 from p37_demo_catalog_events where event_type='DEMO_DECIDE' and term_id='${t}';`).split("|");
const [d1, s1] = decOf(FIX[0]![0]); const [d2, s2] = decOf(FIX[1]![0]);
const mi = (id: string, sha: string, kk = key()) => ({ decision_event_id: id, expected_entry_sha256: sha, idempotency_key: kk });
for (const u of [6, 1, 9, 12]) {
  const x = medical(u, "ACTIVATE", [mi(d1!, s1!)]);
  check(!x.ok && /Ground Medical membership/.test(x.err), `user ${u} cannot perform Medical activation`);
}
let x = medical(3, "ACTIVATE", [mi(d1!, s1!)], null);
check(!x.ok && /rationale/.test(x.err), "Medical rationale required");
x = medical(3, "ACTIVATE", [mi(d1!, "0".repeat(64))]);
check(x.ok && x.results[0]!.status === "rejected" && /digest/.test(x.results[0]!.detail ?? ""), "digest mismatch rejected");
const legacyAct = run(as(3) + `select public.p37_demo_activate_v1('${d1}','${s1}','${key()}');`);
check(legacyAct.status !== 0 && /must record a rationale/.test(legacyAct.stderr), "legacy activation without rationale blocked in a classified mission");
x = medical(3, "ACTIVATE", [mi(d1!, s1!)]);
check(x.ok && x.results[0]!.status === "recorded", "Ground Medical activation recorded with rationale");
check(sql(`select count(*) from p37_demo_catalog_events where event_type='DEMO_ACTIVATE' and decision_event_id='${d1}' and actor_user_id='${uid(3)}';`) === "1", "activation event by the Ground Medical actor");
x = medical(7, "DECLINE", [mi(d1!, s1!)]);
check(x.ok && x.results[0]!.status === "rejected", "an activated decision cannot be declined");
x = medical(7, "DECLINE", [mi(d2!, s2!)]);
check(x.ok && x.results[0]!.status === "recorded", "second Ground Medical declines the other proposal");
x = medical(3, "ACTIVATE", [mi(d2!, s2!)]);
check(x.ok && x.results[0]!.status === "rejected", "declined proposal cannot be activated");
check(sql(`select count(*) from p37_demo_catalog_events where event_type='DEMO_ACTIVATE' and decision_event_id='${d2}';`) === "0", "no activation for the declined proposal");

// Separation of duties: a Ground Medical member who also holds approver grants.
r = decide(8, "APPROVE", [item(SUB_FIX, FIX[3]!)]);
check(r.ok && r.results[0]!.status === "recorded", "user 8 records a demo decision as approver");
const [d8, s8] = decOf(FIX[3]![0]);
x = medical(8, "ACTIVATE", [mi(d8!, s8!)]);
check(x.ok && x.results[0]!.status === "rejected" && /decider cannot/.test(x.results[0]!.detail ?? ""), "the decider cannot activate their own approval");
x = medical(8, "DECLINE", [mi(d8!, s8!)]);
check(x.ok && x.results[0]!.status === "rejected" && /decider cannot/.test(x.results[0]!.detail ?? ""), "the decider cannot decline their own approval");

// Read model.
const view = json<{ classified: boolean; problem: string | null; can_decide: boolean; can_activate: boolean; records: Record<string, unknown>[] }>(sql(as(6) + `select public.p728_demo_review_records_v1('${M}');`));
check(view.classified && view.problem === null && view.can_decide && !view.can_activate, "Researcher view: classified, may decide, may not activate");
check(view.records.length === 6 && view.records.every((x) => !("actor_user_id" in x)), "Researcher view lists every record without actor IDs");
const gmView = json<{ can_decide: boolean; can_activate: boolean }>(sql(as(3) + `select public.p728_demo_review_records_v1('${M}');`));
check(!gmView.can_decide && gmView.can_activate, "Ground Medical view: may activate, may not decide");
for (const u of [1, 9]) check(run(as(u) + `select public.p728_demo_review_records_v1('${M}');`).status !== 0, `user ${u} cannot read decision records`);
check(run(`set role anon; select public.p728_demo_review_records_v1('${M}');`).status !== 0, "anonymous callers cannot read records");

// Immutability and rollback refusal.
check(/append-only/.test(sqlErr(`update p728_demo_review_records set rationale = 'changed rationale text';`)), "records cannot be updated");
check(/append-only/.test(sqlErr(`delete from p728_demo_review_records;`)), "records cannot be deleted");
check(/append-only/.test(sqlErr(`delete from p728_demo_missions;`)), "classification cannot be deleted");
check(/rollback refused/.test(sqlErr(`BEGIN;\n${pending("20261115020000_p728_demo_scientific_decision.rollback.sql")}\nCOMMIT;`)), "rollback refused once records exist");
check(sql(prodCounts) === "0:0:0", "end: production approvals, receipts and authorizations untouched");
check(sql(`select count(*) from p37_demo_catalog_events where submission_id='${SUB_FIX}' and event_type='DEMO_DECIDE';`) === "3", "end: only the three explicitly approved fixture terms were decided");

sql(`drop database if exists ${DB} with (force);`, "postgres");
console.log(`P72.8 demo scientific decision disposable verification: ${count} assertions passed`);
