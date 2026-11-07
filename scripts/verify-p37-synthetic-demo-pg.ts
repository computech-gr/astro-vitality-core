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

