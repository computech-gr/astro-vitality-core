/**
 * Disposable socket-only verification of the pending P61.5 Researcher SYNTHETIC
 * DEMO scope authorization and alias mappings, on top of the installed
 * P36/P37/P38 chain, using the actual MITO_DEMO_2026 submitted-term metadata
 * (read-only fixture copy, synthetic) plus the 11 Bone Health terms of
 * submission cb1ce04f… already in the owner scope (197 terms in total).
 * Covers Researcher success, non-Researcher / cross-mission / real-provenance /
 * submitter / unit / triage rejections, idempotency, batch bounds and
 * all-or-nothing failure, immutability of the 197 existing scope rows, the
 * continuing decision/activation workflow, alias decisions to existing active
 * entries (same exact unit only), Researcher/Ground Medical separation, the
 * identity guard, signed snapshot recognition online/offline with aliases,
 * unknown observations staying held, revocation, ACLs and rollback.
 * Never uses managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-... bun scripts/verify-p615-researcher-scope-pg.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import { generateTestSigningKey } from "../src/domain/health-intelligence/catalog-snapshot-signing";
import type { SnapshotStorage } from "../src/domain/health-intelligence/active-catalog-runtime";
import {
  SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
  SYNTHETIC_DEMO_ALIAS_ACKNOWLEDGEMENT,
  demoSnapshotFromRpc,
  recognizeSyntheticDemo,
  signSyntheticDemoSnapshot,
  type DemoAliasSnapshotRpc,
  type DemoSnapshotRpc,
} from "../src/domain/health-intelligence/synthetic-demo-catalog";
import {
  getSyntheticDemoCatalogs,
  installOfferedDemoCatalog,
  loadInstalledDemoCatalogs,
  resetSyntheticDemoCatalogsForTests,
} from "../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { fixture } from "./p38-bulk-demo-scope";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket"))
  throw Error("Explicit isolated socket required; live database prohibited.");
const DB = "p615_scope_it";
const base = ["-h", socket, "-p", "55439", "-U", "lovable", "-v", "ON_ERROR_STOP=1", "-X", "-At"];
const run = (q: string, db = DB) =>
  spawnSync("psql", [...base, "-d", db], { input: q, encoding: "utf8", cwd: root, maxBuffer: 64 << 20 });
function sql(q: string, db = DB) {
  const r = run(q, db);
  if (r.status !== 0) throw Error(`Unexpected SQL failure: ${r.stderr.slice(0, 2000)}`);
  return r.stdout.trim();
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
const key = () => `61500000-0000-4000-8000-${String(++k).padStart(12, "0")}`;
const M = fixture.missionId,
  C = fixture.crewMemberId;
const SUB_A = fixture.submissions.find((s) => s.terms.some((t) => t.termId === "ubt-7b25ce69"))!.submissionId;
const SUB_B = fixture.submissions.find((s) => s.submissionId !== SUB_A)!.submissionId;
const SUB_BONE = "cb1ce04f-c6f8-46de-872a-3dd7d0d36423";
const SUB_REAL = "61500000-0000-4000-8000-0000000000a1";
const SUB_OTHER = "61500000-0000-4000-8000-0000000000a2";
const SUB_SELF = "61500000-0000-4000-8000-0000000000a3";
const BONE: [string, string, string][] = [
  ["ubt-029b5e6a", "25-hydroxyvitamin D [25(OH)D]", "ng/mL"],
  ["ubt-14b13347", "Bone-specific alkaline phosphatase", "μg/L"],
  ["ubt-3123fa82", "Serum P1NP", "μg/L"],
  ["ubt-60942680", "Serum phosphate", "mg/dL"],
  ["ubt-6516236a", "Total serum calcium", "mg/dL"],
  ["ubt-66673245", "DXA lumbar spine (L1–L4), T-score", "SD"],
  ["ubt-7419a93b", "Serum albumin", "g/dL"],
  ["ubt-7d69892a", "Serum CTX (β-CTX)", "ng/mL"],
  ["ubt-978daa39", "DXA total hip, T-score", "SD"],
  ["ubt-b4ce4929", "DXA femoral neck, T-score", "SD"],
  ["ubt-bebe05b5", "Intact parathyroid hormone (PTH)", "pg/mL"],
];
const meta = (termId: string, label: string, unit: string) =>
  JSON.stringify({ termId, originalLabels: [label], exactUnit: unit, classification: "unclassified", candidateMetricIds: [], sourceDocumentSha256: [] });

// Roles: 1 crew_self · 2 GM mission-wide (submitter) · 3 GM crew-scoped C (activator) ·
// 6 Researcher (reviewer + triage + approver, no membership) · 9 mission_operator (admin, no grants) ·
// 12 global reviewer without approver grant · 5 GM of another mission.
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
insert into missions(id, code, name) values('${M}','MITO_DEMO_2026','Synthetic Demonstration'),('M2','TEST-B','Security Test B');
insert into mission_research_keys(mission_id) values('${M}'),('M2');
insert into crew_members values('${C}','Synthetic Astronaut'),('C2','Synthetic Crew Two');
insert into mission_crew_assignments values('${M}','${C}','active'),('M2','C2','active');
insert into mission_memberships(mission_id, user_id, crew_member_id, role, active) values
 ('${M}','${uid(1)}','${C}','crew_self',true),('${M}','${uid(2)}',null,'ground_medical',true),
 ('${M}','${uid(3)}','${C}','ground_medical',true),('${M}','${uid(9)}',null,'mission_operator',true),
 ('M2','${uid(5)}',null,'ground_medical',true);`);
sql(`BEGIN;\n${pending("20261107000000_p36_dynamic_handoff.tool.sql")}\nCOMMIT;`);
sql(pending("20261107000001_p36_closed_admission.initialize.sql"));
sql(`BEGIN;\n${pending("20261107000002_p36_handoff_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010000_p36_dynamic_authorization.tool.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010001_p36_authorization_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107020000_p36_authorized_crew_roster.tool.sql")}\nCOMMIT;`);

const insertSubmission = (sub: string, mission: string, crew: string, provenance: string, by: number, terms: [string, string, string][] | { termId: string; metadata: unknown }[], n: number) => {
  const payload = canonicalJson({ fixture: "p615-synthetic-term-metadata", submissionId: sub });
  const rows = terms.map((t) =>
    Array.isArray(t) ? `('${sub}','${t[0]}',${literal(meta(t[0], t[1], t[2]))}::jsonb)` : `('${sub}','${t.termId}',${literal(JSON.stringify(t.metadata))}::jsonb)`,
  );
  sql(`insert into p36_dynamic_handoff_submissions(submission_id, mission_id, crew_member_id, provenance, request_id, submitted_by, submitted_role, payload_canonical, payload_sha256)
values ('${sub}','${mission}','${crew}','${provenance}','ubr-${String(n).padStart(8, "0")}','${uid(by)}','ground_medical',${literal(payload)},encode(sha256(convert_to(${literal(payload)},'UTF8')),'hex'));
insert into p36_dynamic_handoff_terms(submission_id, term_id, metadata) values ${rows.join(",\n")};`);
};
for (const [i, s] of fixture.submissions.entries()) insertSubmission(s.submissionId, M, C, "synthetic", 2, s.terms, 30 + i);
insertSubmission(SUB_BONE, M, C, "synthetic", 2, BONE, 40);
insertSubmission(SUB_REAL, M, C, "real", 2, [["ubt-a0000001", "Real hemoglobin", "g/dL"]], 41);
insertSubmission(SUB_OTHER, "M2", "C2", "synthetic", 5, [["ubt-a0000002", "Other mission hemoglobin", "g/dL"]], 42);
insertSubmission(SUB_SELF, M, C, "synthetic", 6, [["ubt-a0000003", "Self submitted marker", "g/dL"]], 43);
check(sql("select count(*) from p36_dynamic_handoff_terms;") === "223", "209 actual + 11 Bone + 3 test terms loaded");

sql(`BEGIN;\n${pending("20261107030000_p36_global_scientific_review.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107040000_p36_global_triage.sql")}\nCOMMIT;`);
sql(`insert into p36_global_scientific_reviewers(user_id, authorization_ref) values ('${uid(6)}','owner-authorization:disposable'),('${uid(12)}','owner-authorization:disposable');
insert into p36_mission_scientific_sharing(mission_id, permitted_provenance, policy_ref) values ('${M}', array['synthetic'], 'owner-policy:disposable');
insert into p36_global_triage_writers(user_id, authorization_ref) values ('${uid(6)}','owner-authorization:triage-disposable');`);
sql(`BEGIN;\n${pending("20261108000000_p37_catalog_activation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261108010000_p37_ground_medical_activation.sql")}\nCOMMIT;`);
sql(`insert into p37_scientific_approvers(user_id, authorization_ref) values ('${uid(6)}','owner-authorization:p37-disposable');`);
sql(`BEGIN;\n${pending("20261108020000_p37_synthetic_demo_catalog.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261108030000_p38_bulk_synthetic_demo.sql")}\nCOMMIT;`);
// Reproduce the live owner scope: 1 + 185 (P37/P38) + 11 Bone Health terms = 197.
sql(pending("20261108020001_p37_synthetic_demo_scope.authorize.sql"));
sql(pending("20261108030001_p38_bulk_demo_scope.authorize.sql"));
sql(`insert into p37_demo_scope(submission_id, term_id, authorization_ref) select '${SUB_BONE}', term_id, 'owner-authorization:p614-bone-health-synthetic-demo-2026-11-12' from p36_dynamic_handoff_terms where submission_id='${SUB_BONE}';`);
check(sql("select count(*) from p37_demo_scope;") === "197", "baseline: 197 owner-authorized scope terms");

const triage = (u: number, sub: string, term: string, mission = M) =>
  json<{ status: string }>(sql(as(u) + `select public.p36_global_triage_append_v1('${mission}','synthetic','${sub}','${term}','ACCEPT_FOR_REVIEW',null,'{}'::text[],null,'${key()}');`));
// Accept the alias targets, the Bone terms and a set of out-of-scope terms (as the live state has 23).
const OUT = ["ubt-6811a69f", "ubt-abb8d451", "ubt-75f23568", "ubt-0bb3175d"]; // Hemoglobin g/dL, HbA1c %, Pulse pressure mmHg, Sclerostin ambiguous
for (const t of [...OUT, "ubt-37f541f8"]) check(triage(6, SUB_B, t).status === "recorded", `triage ${t}`);
for (const t of ["ubt-7b25ce69", "ubt-d9870fc7", "ubt-6c8bad01"]) check(triage(6, SUB_A, t).status === "recorded", `triage ${t}`);
for (const [t] of BONE) check(triage(6, SUB_BONE, t).status === "recorded", `triage Bone ${t}`);
check(triage(6, SUB_SELF, "ubt-a0000003").status === "recorded", "triage self-submitted");

// Activate the existing targets (Researcher decides, Ground Medical activates).
const decide = (sub: string, term: string, name: string, u = 6) =>
  json<{ status: string; event_id: string; entry_sha256: string; detail?: string }>(
    sql(as(u) + `select public.p37_demo_decide_v1('${M}','${sub}','${term}',${literal(name)},'bone',${literal(SYNTHETIC_DEMO_ACKNOWLEDGEMENT)},'${key()}');`),
  );
const activate = (id: string, sha: string, u = 3) =>
  json<{ status: string; detail?: string }>(sql(as(u) + `select public.p37_demo_activate_v1('${id}','${sha}','${key()}');`));
for (const [sub, term, name] of [
  [SUB_A, "ubt-7b25ce69", "25-Hydroxyvitamin D"],
  [SUB_B, "ubt-37f541f8", "P1NP / PINP"],
  [SUB_A, "ubt-d9870fc7", "CTX"],
  [SUB_A, "ubt-6c8bad01", "P1NP"],
] as const) {
  const d = decide(sub, term, name);
  check(d.status === "recorded" && activate(d.event_id, d.entry_sha256).status === "recorded", `active target ${name}`);
}

const scopeFingerprint = "select md5(string_agg(submission_id::text || term_id || authorization_ref || granted_at::text, ',' order by submission_id, term_id)) from p37_demo_scope;";
const fp197 = sql(scopeFingerprint);
const prodCounts = "select (select count(*) from p37_catalog_events) || ':' || (select count(*) from p36_dynamic_source_validation) || ':' || (select count(*) from p36_dynamic_authorization_events) || ':' || (select count(*) from p36_metric_unit_catalog);";
const prod0 = sql(prodCounts);
check(prod0 === "0:0:0:1", "baseline: no production catalog entries, receipts or authorizations");

// --- Install the pending P61.5 change ----------------------------------------------------
sql(`BEGIN;\n${pending("20261112000000_p615_researcher_demo_scope.sql")}\nCOMMIT;`);
check(
  sql(`BEGIN;\n${pending("20261112000000_p615_researcher_demo_scope.rollback.sql")}
select (not exists (select 1 from pg_proc where proname like 'p615_%') and not exists (select 1 from pg_tables where tablename like 'p615_%') and not exists (select 1 from pg_trigger where tgname = 'p615_demo_identity_guard'))::text;
ROLLBACK;`).split("\n").includes("true"),
  "rollback removes every P61.5 function, table and trigger",
);
const FNS: [string, boolean][] = [
  ["p615_demo_scope_authorize_v1(text,jsonb)", true],
  ["p615_demo_alias_decide_v1(text,uuid,text,text,text,text,uuid)", true],
  ["p615_demo_alias_activate_v1(uuid,text,uuid)", true],
  ["p615_demo_alias_revoke_v1(uuid,text,uuid)", true],
  ["p615_demo_governance_v1(text)", true],
  ["p615_demo_alias_snapshot_v1(text)", true],
  ["p615_unit_problem(text)", false],
  ["p615_latest_triage(uuid,text)", false],
  ["p615_active_keys(text)", false],
];
for (const [f, callable] of FNS) {
  for (const [role, want] of [["authenticated", callable], ["anon", false], ["service_role", false], ["sandbox_exec", false]] as const)
    check(sql(`select has_function_privilege('${role}','${f}','EXECUTE')::text;`) === String(want), `${role} execute ${f} = ${want}`);
}
for (const f of FNS.filter(([, c]) => c).map(([f]) => f.slice(0, f.indexOf("("))))
  check(
    sql(`select (prosecdef and proconfig::text like '%search_path=public, pg_temp%' and pg_get_userbyid(proowner) = current_user)::text from pg_proc where proname='${f}';`) === "true",
    `${f} definer, pinned search_path, trusted owner`,
  );
for (const t of ["p615_demo_scope_grants", "p615_demo_alias_events", "p37_demo_scope"])
  for (const role of ["authenticated", "anon", "sandbox_exec"])
    check(
      sql(`select (has_table_privilege('${role}','${t}','INSERT') or has_table_privilege('${role}','${t}','UPDATE') or has_table_privilege('${role}','${t}','DELETE'))::text;`) === "false",
      `${role} has no direct write on ${t}`,
    );

type Res = { status: string; detail?: string; event_id?: string; term_id?: string; authorization_ref?: string };
type Out = { ok: true; results: Res[] } | { ok: false; err: string };
const authorize = (u: number, items: Record<string, unknown>[], mission = M): Out => {
  const r = run(as(u) + `select public.p615_demo_scope_authorize_v1('${mission}',${literal(JSON.stringify(items))}::jsonb);`);
  return r.status === 0 ? { ok: true, results: json<{ results: Res[] }>(r.stdout).results } : { ok: false, err: r.stderr };
};
const item = (sub: string, term: string, unit: string, kk = key()) => ({ submission_id: sub, term_id: term, exact_unit: unit, idempotency_key: kk });
const scopeCount = () => sql("select count(*) from p37_demo_scope;");
const grantCount = () => sql("select count(*) from p615_demo_scope_grants;");

// --- Authorization separation (whole call refused, nothing written) -----------------------
const hb = item(SUB_B, "ubt-6811a69f", "g/dL");
for (const u of [1, 2, 3, 5, 9, 12]) {
  const r = authorize(u, [hb]);
  check(!r.ok && /authorization required|scope denied/.test(r.err), `non-Researcher ${u} refused`);
}
check(scopeCount() === "197" && grantCount() === "0", "refused calls wrote nothing");
check(!authorize(6, [item(SUB_OTHER, "ubt-a0000002", "g/dL")], "M2").ok, "Researcher refused for a mission without a review basis");
sql(`update p36_global_scientific_reviewers set revoked_at = now() where user_id = '${uid(6)}';`);
check(!authorize(6, [hb]).ok, "revoked reviewer basis refused");
sql(`update p36_global_scientific_reviewers set revoked_at = null where user_id = '${uid(6)}';`);

// --- Batch bounds and malformed requests -------------------------------------------------
check(!authorize(6, []).ok, "empty batch refused");
check(!authorize(6, Array.from({ length: 51 }, (_, i) => item(SUB_B, `ubt-${String(i).padStart(8, "0")}`, "g/dL"))).ok, "51-item batch refused");
const dupKey = key();
check(!authorize(6, [item(SUB_B, "ubt-6811a69f", "g/dL", dupKey), item(SUB_B, "ubt-abb8d451", "%", dupKey)]).ok, "repeated idempotency key in a batch refused");
check(!authorize(6, [item(SUB_B, "ubt-6811a69f", "g/dL"), item(SUB_B, "ubt-6811a69f", "g/dL")]).ok, "same term twice refused");
check(!authorize(6, [item(SUB_B, "not-a-term", "g/dL")]).ok, "invalid term identifier refused");
check(scopeCount() === "197" && grantCount() === "0", "malformed batches wrote nothing");

// --- Per-term rejections (written nothing) -------------------------------------------------
const one = (it: Record<string, unknown>) => {
  const r = authorize(6, [it]);
  return r.ok ? r.results[0]! : { status: "error", detail: r.err };
};
check(one(item(SUB_B, "ubt-6811a69f", "g/L")).detail === "the unit does not match the exact submitted unit", "mismatched unit rejected");
check((one(item(SUB_B, "ubt-0bb3175d", "pmol/L ή ng/mL")).detail ?? "").includes("alternative units"), "ambiguous unit rejected");
check(one(item(SUB_B, "ubt-e9557d40", "L/min")).detail === "the term must be accepted for scientific review first", "term not accepted for review rejected");
check(one(item(SUB_A, "ubt-6811a69f", "g/dL")).detail === "this term does not belong to the selected submission", "term from another submission rejected");
check(one(item(SUB_REAL, "ubt-a0000001", "g/dL")).detail === "only synthetic submissions may enter the synthetic demo scope", "real provenance rejected");
check(one(item(SUB_OTHER, "ubt-a0000002", "g/dL")).detail === "synthetic submission not found in this mission", "cross-mission submission rejected");
check(one(item(SUB_SELF, "ubt-a0000003", "g/dL")).detail === "the submitter cannot authorize their own request", "submitter cannot authorize own term");
check(scopeCount() === "197" && grantCount() === "0", "rejections wrote nothing");

// --- The 11 Bone Health terms are never inserted again ------------------------------------
const bone = authorize(6, BONE.map(([t, , u]) => item(SUB_BONE, t, u)));
check(bone.ok && bone.results.length === 11 && bone.results.every((r) => r.status === "skipped" && r.detail === "already in the synthetic demo scope"), "11 Bone terms reported already in scope");
check(scopeCount() === "197" && sql(scopeFingerprint) === fp197, "197 existing scope rows unchanged");

// --- Researcher authorization succeeds; idempotent -----------------------------------------
const hbKey = key();
const ok1 = authorize(6, [item(SUB_B, "ubt-6811a69f", "g/dL", hbKey), item(SUB_B, "ubt-abb8d451", "%"), item(SUB_B, "ubt-0bb3175d", "pmol/L ή ng/mL")]);
check(ok1.ok && ok1.results.map((r) => r.status).join(",") === "recorded,recorded,rejected", "eligible terms recorded, ambiguous one rejected in the same batch");
check(scopeCount() === "199" && grantCount() === "2", "exactly two scope rows added");
check(
  sql(`select string_agg(g.actor_user_id::text || '|' || g.access_basis || '|' || g.mission_id || '|' || (d.authorization_ref = g.authorization_ref)::text || '|' || (g.authorization_ref like 'researcher-authorization:%')::text, ',' order by g.term_id) from p615_demo_scope_grants g join p37_demo_scope d using (submission_id, term_id);`) ===
    [1, 2].map(() => `${uid(6)}|global_scientific_review|${M}|true|true`).join(","),
  "grant records actor, basis, mission and matching authorization reference",
);
const again = authorize(6, [item(SUB_B, "ubt-6811a69f", "g/dL", hbKey)]);
check(again.ok && ok1.ok && again.results[0]!.status === "duplicate" && again.results[0]!.event_id === ok1.results[0]!.event_id, "same idempotency key returns duplicate");
const again2 = authorize(6, [item(SUB_B, "ubt-6811a69f", "g/dL")]);
check(again2.ok && again2.results[0]!.status === "skipped", "new key for the same term is skipped (no duplicate scope entry)");
const reuse = authorize(6, [item(SUB_B, "ubt-75f23568", "mmHg"), item(SUB_B, "ubt-6811a69f", "g/L", hbKey)]);
check(!reuse.ok && scopeCount() === "199", "idempotency key reused with a different request rolls back the whole batch");
check(sql(scopeFingerprint.replace("from p37_demo_scope", "from p37_demo_scope where authorization_ref like 'owner-authorization:%'")) === fp197, "owner scope rows still byte-identical");
check(run(`update p37_demo_scope set authorization_ref = 'xxxxxxxxx' where term_id = 'ubt-6811a69f';`).status !== 0, "scope rows immutable");
check(run(`delete from p615_demo_scope_grants;`).status !== 0, "grant records immutable");

// --- Continuing workflow: decision then Ground Medical activation -------------------------
const hbDecision = decide(SUB_B, "ubt-6811a69f", "Hemoglobin");
check(hbDecision.status === "recorded", "Researcher records the synthetic demo decision after authorization");
check(run(as(6) + `select public.p37_demo_activate_v1('${hbDecision.event_id}','${hbDecision.entry_sha256}','${key()}');`).status !== 0, "Researcher cannot activate as Ground Medical");
check(activate(hbDecision.event_id, hbDecision.entry_sha256).status === "recorded", "Ground Medical activates the decision");

// --- Alias decisions ------------------------------------------------------------------------
const aliasDecide = (u: number, sub: string, term: string, target: string, rationale = "Same analyte (procollagen type 1 N-terminal propeptide), serum, identical exact unit μg/L.", ack: string = SYNTHETIC_DEMO_ALIAS_ACKNOWLEDGEMENT) => {
  const r = run(as(u) + `select public.p615_demo_alias_decide_v1('${M}','${sub}','${term}','${target}',${literal(rationale)},${literal(ack)},'${key()}');`);
  return r.status === 0 ? json<{ status: string; event_id?: string; entry_sha256?: string; detail?: string }>(r.stdout) : { status: "error", detail: r.stderr };
};
check(aliasDecide(3, SUB_BONE, "ubt-3123fa82", "demo:ubt-37f541f8").status === "error", "Ground Medical cannot record an alias decision");
check(aliasDecide(12, SUB_BONE, "ubt-3123fa82", "demo:ubt-37f541f8").status === "error", "reviewer without approver grant cannot record an alias decision");
check(aliasDecide(6, SUB_BONE, "ubt-3123fa82", "demo:ubt-6c8bad01").detail === "the target unit differs from the exact submitted unit; units are never converted", "alias to a different-unit entry rejected (μg/L vs ng/mL)");
check(aliasDecide(6, SUB_BONE, "ubt-3123fa82", "demo:ubt-14b13347").detail === "the target must be exactly one active synthetic demo entry of this mission", "alias to a non-active target rejected");
check(aliasDecide(6, SUB_BONE, "ubt-3123fa82", "demo:ubt-37f541f8", "short").detail === "a documented identity rationale (8 to 2000 characters) is required", "alias without rationale rejected");
check(aliasDecide(6, SUB_BONE, "ubt-3123fa82", "demo:ubt-37f541f8", undefined, SYNTHETIC_DEMO_ACKNOWLEDGEMENT).detail === "the synthetic demo alias acknowledgement is required", "alias without alias acknowledgement rejected");
check(aliasDecide(6, SUB_B, "ubt-75f23568", "demo:ubt-6811a69f").detail === "this term is not in the synthetic demo scope", "alias outside scope rejected");
check(aliasDecide(6, SUB_B, "ubt-6811a69f", "demo:ubt-7b25ce69").detail === "this term already has an independent synthetic demo decision", "alias for an independently decided term rejected");
const p1np = aliasDecide(6, SUB_BONE, "ubt-3123fa82", "demo:ubt-37f541f8");
check(p1np.status === "recorded", "Researcher records Serum P1NP → P1NP / PINP alias (same exact unit)");
check(sql("select count(*) from p615_demo_alias_events;") === "1", "one alias decision recorded");
check(aliasDecide(6, SUB_BONE, "ubt-3123fa82", "demo:ubt-37f541f8", "Another rationale for the same alias term.").detail === "this submitted term already has a synthetic demo alias decision", "one alias decision per term");
check(decide(SUB_BONE, "ubt-3123fa82", "Serum P1NP").detail === "this submitted term already has a synthetic demo decision", "identity guard: no independent decision after an alias decision");
const bulkDecide = json<{ results: Res[] }>(sql(as(6) + `select public.p38_demo_bulk_decide_v1('${M}',${literal(SYNTHETIC_DEMO_ACKNOWLEDGEMENT)},${literal(JSON.stringify([{ submission_id: SUB_BONE, term_id: "ubt-3123fa82", display_name: "Serum P1NP", domain: "bone", idempotency_key: key() }]))}::jsonb);`));
check(bulkDecide.results[0]!.status === "rejected", "identity guard also applies to bulk decisions");
check(sql("select count(*) from p37_demo_catalog_events where term_id='ubt-3123fa82';") === "0", "no independent entry for the aliased term");

// --- Alias activation is Ground Medical only -------------------------------------------------
const aliasActivate = (u: number, id: string, sha: string, kk = key()) => {
  const r = run(as(u) + `select public.p615_demo_alias_activate_v1('${id}','${sha}','${kk}');`);
  return r.status === 0 ? json<{ status: string; detail?: string; demo_catalog_version?: number }>(r.stdout) : { status: "error", detail: r.stderr };
};
check(aliasActivate(6, p1np.event_id!, p1np.entry_sha256!).status === "error", "Researcher cannot activate an alias as Ground Medical");
check(aliasActivate(5, p1np.event_id!, p1np.entry_sha256!).status === "error", "other-mission Ground Medical cannot activate");
check(aliasActivate(3, p1np.event_id!, "0".repeat(64)).detail === "proposal digest does not match the synthetic demo alias decision", "digest mismatch rejected");
const actKey = key();
const act = aliasActivate(3, p1np.event_id!, p1np.entry_sha256!, actKey);
check(act.status === "recorded", "Ground Medical activates the alias");
check(aliasActivate(3, p1np.event_id!, p1np.entry_sha256!, actKey).status === "duplicate", "alias activation idempotent");

// --- Signed snapshot with aliases: recognition online and offline --------------------------
const snap = (u: number) => json<DemoSnapshotRpc>(sql(as(u) + `select public.p37_demo_catalog_snapshot_v1('${M}');`));
const aliasSnap = (u: number) => json<DemoAliasSnapshotRpc>(sql(as(u) + `select public.p615_demo_alias_snapshot_v1('${M}');`));
const a1 = aliasSnap(3);
check(a1.aliases.length === 1 && a1.aliases[0]!.status === "ACTIVE" && a1.alias_catalog_version > snap(3).demo_catalog_version, "alias snapshot: one active alias, version above the entry version");
check(!JSON.stringify(a1).includes(uid(6)) && !JSON.stringify(a1).includes("rationale"), "alias snapshot carries no identities or rationale");
const { privateKey, publicKeySpkiBase64 } = await generateTestSigningKey();
const trustedKeys = [{ keyId: "p615-test", environment: "synthetic_demo" as const, publicKeySpkiBase64 }];
const store = new Map<string, string>();
const storage: SnapshotStorage = { get: (kk) => store.get(kk) ?? null, set: (kk, v) => void store.set(kk, v) };
resetSyntheticDemoCatalogsForTests();
const install = async () =>
  installOfferedDemoCatalog(await signSyntheticDemoSnapshot(demoSnapshotFromRpc(snap(3), new Date().toISOString(), aliasSnap(3)), "p615-test", privateKey), M, { storage, trustedKeys });
check((await install()).installed, "signed snapshot with alias installs");
const recognize = (label: string, unit: string, provenance: "synthetic" | "real" = "synthetic", missionId = M) =>
  recognizeSyntheticDemo({ label, unit, provenance, missionId }, getSyntheticDemoCatalogs());
const r1 = recognize("Serum P1NP", "μg/L");
check(r1.status === "SYNTHETIC_DEMO_RECOGNIZED" && r1.demoId === "demo:ubt-37f541f8" && r1.approvedAlias?.aliasId === "alias:ubt-3123fa82", "Serum P1NP μg/L recognized as P1NP / PINP through the approved alias");
check(recognize("Hemoglobin", "g/dL").status === "SYNTHETIC_DEMO_RECOGNIZED", "newly authorized, decided and activated Hemoglobin recognized automatically");
check(recognize("Serum P1NP", "ng/mL").status === "UNKNOWN", "alias never converts units");
check(recognize("Serum CTX (β-CTX)", "ng/mL").status === "UNKNOWN", "unreviewed possible match stays held");
check(recognize("Serum osteocalcin", "ng/mL").status === "UNKNOWN", "unknown observation stays held");
check(recognize("Serum P1NP", "μg/L", "real").status === "UNKNOWN", "real data never recognized");
check(recognize("Serum P1NP", "μg/L", "synthetic", "M2").status === "UNKNOWN", "other mission never recognized");
resetSyntheticDemoCatalogsForTests();
await loadInstalledDemoCatalogs({ storage, trustedKeys });
check(recognize("Serum P1NP", "μg/L").status === "SYNTHETIC_DEMO_RECOGNIZED", "offline: alias recognized from the stored signed snapshot");
check(!(await install()).installed, "same version and content not reinstalled");

// --- Revocation stops future recognition; history kept ---------------------------------------
const actId = sql("select id from p615_demo_alias_events where event_type='ALIAS_ACTIVATE';");
check(run(as(6) + `select public.p615_demo_alias_revoke_v1('${actId}','Researcher cannot revoke.','${key()}');`).status !== 0, "Researcher cannot revoke an alias");
const rv = json<{ status: string }>(sql(as(3) + `select public.p615_demo_alias_revoke_v1('${actId}','Identity re-review requested by the Researcher.','${key()}');`));
check(rv.status === "recorded", "Ground Medical revokes the alias");
check((await install()).installed, "newer snapshot after revocation installs");
check(recognize("Serum P1NP", "μg/L").status === "UNKNOWN", "revoked alias no longer recognizes");
check(sql("select count(*) from p615_demo_alias_events;") === "3", "alias history append-only (decide, activate, revoke)");

// --- Governance read model ---------------------------------------------------------------------
const gov = json<{ can_authorize: boolean; can_activate: boolean; grants: unknown[]; aliases: unknown[] }>(sql(as(6) + `select public.p615_demo_governance_v1('${M}');`));
check(gov.can_authorize && !gov.can_activate && gov.grants.length === 2 && gov.aliases.length === 1, "Researcher governance view");
const govGm = json<{ can_authorize: boolean; can_activate: boolean }>(sql(as(3) + `select public.p615_demo_governance_v1('${M}');`));
check(!govGm.can_authorize && govGm.can_activate, "Ground Medical governance view");
check(run(as(9) + `select public.p615_demo_governance_v1('${M}');`).status !== 0, "operator without review basis cannot read governance");

// --- Untouched production tables -------------------------------------------------------------
check(sql(prodCounts) === prod0, "production catalog, receipts, authorization ledger and unit catalog unchanged");
check(sql(`select count(*) from p37_demo_scope where authorization_ref like 'owner-authorization:%';`) === "197", "197 owner-authorized rows intact");

console.log(`P61.5 Researcher synthetic demo scope disposable verification: ${count} assertions passed`);
sql(`drop database if exists ${DB} with (force);`, "postgres");
