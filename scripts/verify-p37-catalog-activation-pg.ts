/**
 * Disposable socket-only verification of the pending P37 catalog activation SQL,
 * including a full synthetic end-to-end run: submission -> triage accept ->
 * provisioned (disposable) validation receipt -> scientific approval -> separate
 * activation -> server snapshot -> signed with a per-run TEST key -> installed on a
 * simulated device -> later examination RECOGNIZED -> offline reload -> revocation.
 * Never uses managed PG* configuration or the live backend.
 * Run: P36_DISPOSABLE_SOCKET=/tmp/p36-unified/socket-... bun scripts/verify-p37-catalog-activation-pg.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import { buildUnknownBiomarkerTerms, classifyWithGovernedExtensions, termIdFor } from "../src/domain/health-intelligence/unknown-biomarker-review";
import { snapshotFromLedgerRpc, type LedgerSnapshotRpc } from "../src/domain/health-intelligence/catalog-lifecycle";
import { generateTestSigningKey, signCatalogSnapshot } from "../src/domain/health-intelligence/catalog-snapshot-signing";
import { installOfferedCatalog, loadInstalledCatalog, resetActiveCatalogForTests, type SnapshotStorage } from "../src/domain/health-intelligence/active-catalog-runtime";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket")) throw Error("Explicit isolated socket required; live database prohibited.");
const DB = "p37_catalog_it";
const base = ["-h", socket, "-p", "55439", "-U", "lovable", "-v", "ON_ERROR_STOP=1", "-X", "-At"];
function run(q: string, db = DB) { return spawnSync("psql", [...base, "-d", db], { input: q, encoding: "utf8", cwd: root }); }
function sql(q: string, db = DB) { const r = run(q, db); if (r.status !== 0) throw Error(`Unexpected SQL failure: ${r.stderr}`); return r.stdout.trim(); }
function sqlErr(q: string) { const r = run(q); if (r.status === 0) throw Error(`Expected SQL failure: ${q.slice(0, 200)}`); return r.stderr; }
const pending = (f: string) => readFileSync(resolve(root, "supabase/pending", f), "utf8");
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const as = (n: number) => `set role authenticated; set request.jwt.claim.sub='${uid(n)}';`;
const last = (s: string) => s.split("\n").at(-1) ?? "";
const json = <T = Record<string, unknown>>(s: string): T => JSON.parse(last(s)) as T;
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
let count = 0;
const check = (yes: boolean, label: string) => { if (!yes) throw Error(`assertion failed: ${label}`); count++; };
let k = 0;
const key = () => `20000000-0000-4000-8000-${String(++k).padStart(12, "0")}`;

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
create table mission_research_keys(mission_id text primary key, pseudonym_salt bytea not null default decode(md5(random()::text) || md5(random()::text), 'hex'));
create table p36_metric_unit_catalog(metric_id text not null, unit text not null);
insert into p36_metric_unit_catalog values ('cv-001','bpm');
insert into missions values('M1','DEMO','Synthetic Demonstration'),('M2','TEST-B','Security Test B');
insert into mission_research_keys(mission_id) values('M1'),('M2');
insert into crew_members values('C1','Synthetic Crew One');
insert into mission_crew_assignments values('M1','C1','active'),('M2','C1','active');
insert into mission_memberships values ('M1','${uid(1)}','C1','crew_self',true),('M1','${uid(2)}',null,'ground_medical',true),('M2','${uid(2)}',null,'ground_medical',true);`);
sql(`BEGIN;\n${pending("20261107000000_p36_dynamic_handoff.tool.sql")}\nCOMMIT;`);
sql(pending("20261107000001_p36_closed_admission.initialize.sql"));
sql(`BEGIN;\n${pending("20261107000002_p36_handoff_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010000_p36_dynamic_authorization.tool.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107010001_p36_authorization_executor_insert_remediation.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107020000_p36_authorized_crew_roster.tool.sql")}\nCOMMIT;`);
sql("update p36_dynamic_admission set handoff_open=true, change_note='disposable harness only';");

const LABEL = "Synthetic Marker P37", UNIT = "pmol/L", SPECIMEN = "Synthetic serum", METHOD = "Synthetic immunoassay", ID = "ext:synthetic-marker-p37";
function submit(mission: string, requestId: string, labels: string[]) {
  const payload = { schema: "mitochondria.p36-cloud-handoff.v1", scope: { missionId: mission, crewMemberId: "C1", provenance: "synthetic" }, requestId, scientificStatus: "PENDING_NIKOLAS_REVIEW", catalogChangeApplied: false,
    terms: labels.map((l) => ({ termId: termIdFor(l, UNIT), originalLabels: [l], exactUnit: UNIT, classification: "unclassified", candidateMetricIds: [], sourceDocumentSha256: ["b".repeat(64)], evidencePointers: ["c".repeat(64)], method: null, specimen: null })) };
  const c = canonicalJson(payload);
  return sql(as(2) + `select public.p36_dynamic_handoff_append_v1('${mission}','C1','synthetic','${requestId}',${literal(c)},encode(sha256(convert_to(${literal(c)},'UTF8')),'hex'))->>'status';`);
}
check(submit("M1", "ubr-00000037", [LABEL, "Synthetic Other Term"]).endsWith("inserted"), "synthetic submission");
check(submit("M2", "ubr-00000038", ["Unshared Term"]).endsWith("inserted"), "unshared submission");
sql(`BEGIN;\n${pending("20261107030000_p36_global_scientific_review.sql")}\nCOMMIT;`);
sql(`BEGIN;\n${pending("20261107040000_p36_global_triage.sql")}\nCOMMIT;`);
sql(`insert into p36_global_scientific_reviewers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:disposable'),('${uid(6)}','owner-authorization:disposable');
insert into p36_mission_scientific_sharing(mission_id, permitted_provenance, policy_ref) values ('M1', array['synthetic'], 'owner-policy:disposable-m1');
insert into p36_global_triage_writers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:triage-disposable');`);
const SUB = sql("select submission_id from p36_dynamic_handoff_submissions where request_id='ubr-00000037';");
const SUB2 = sql("select submission_id from p36_dynamic_handoff_submissions where request_id='ubr-00000038';");
const TERM = termIdFor(LABEL, UNIT), TERM_OTHER = termIdFor("Synthetic Other Term", UNIT), TERM2 = termIdFor("Unshared Term", UNIT);
const fingerprint = "select md5(string_agg(submission_id::text || payload_sha256, ',' order by received_seq)) || ':' || (select md5(string_agg(submission_id::text || term_id || metadata::text, ',' order by submission_id, term_id)) from p36_dynamic_handoff_terms) || ':' || (select count(*) from p36_global_triage_events) || ':' || (select count(*) from p36_dynamic_authorization_events) || ':' || (select md5(string_agg(metric_id||unit, ',')) from p36_metric_unit_catalog) from p36_dynamic_handoff_submissions;";

sql(`BEGIN;\n${pending("20261108000000_p37_catalog_activation.sql")}\nCOMMIT;`);
const before = sql(fingerprint);

// --- Privilege boundaries ----------------------------------------------------
for (const t of ["p37_scientific_approvers", "p37_catalog_activators", "p37_catalog_events"]) {
  check(sqlErr(`set role anon; select * from ${t};`).includes("permission denied"), `anon select ${t}`);
  check(sqlErr(as(4) + `select * from ${t};`).includes("permission denied"), `authenticated select ${t}`);
  check(sqlErr(as(4) + `insert into ${t} default values;`).includes("permission denied"), `authenticated insert ${t}`);
  for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) check(sql(`select has_table_privilege('sandbox_exec','${t}','${p}')::text;`) === "false", `executor ${p} ${t}`);
  check(sql(`select relrowsecurity::text from pg_class where relname='${t}';`) === "true", `RLS ${t}`);
}
for (const f of ["p37_catalog_approve_v1(text,text,uuid,text,text,text,text,uuid)", "p37_catalog_activate_v1(uuid,text,uuid)", "p37_catalog_revoke_v1(uuid,text,uuid)", "p37_catalog_snapshot_v1()"]) {
  check(sql(`select has_function_privilege('anon','${f}','EXECUTE')::text;`) === "false", `anon no ${f}`);
  check(sql(`select has_function_privilege('service_role','${f}','EXECUTE')::text;`) === "false", `service_role no ${f}`);
}
check(sql("select (select count(*) from p37_scientific_approvers) + (select count(*) from p37_catalog_activators);") === "0", "install grants nobody");

type R = { status: string; detail?: string; event_id?: string; entry_sha256?: string; catalog_version?: number };
const approve = (user: number, o: { mission?: string; sub?: string; term?: string; ref?: string; name?: string; domain?: string; key?: string } = {}) => {
  const r = run(as(user) + `select public.p37_catalog_approve_v1(${literal(o.mission ?? "M1")},'synthetic','${o.sub ?? SUB}',${literal(o.term ?? TERM)},${literal(o.ref ?? "synthetic-disposable-receipt:p37")},${literal(o.name ?? "Synthetic marker P37")},${literal(o.domain ?? "immune")},'${o.key ?? key()}');`);
  return r.status === 0 ? json<R>(r.stdout.trim()) : { status: "error", detail: r.stderr };
};
const activate = (user: number, approval: string, sha: string, k2 = key()) => {
  const r = run(as(user) + `select public.p37_catalog_activate_v1('${approval}',${literal(sha)},'${k2}');`);
  return r.status === 0 ? json<R>(r.stdout.trim()) : { status: "error", detail: r.stderr };
};
const revoke = (user: number, act: string, reason: string, k2 = key()) => {
  const r = run(as(user) + `select public.p37_catalog_revoke_v1('${act}',${literal(reason)},'${k2}');`);
  return r.status === 0 ? json<R>(r.stdout.trim()) : { status: "error", detail: r.stderr };
};

// --- Approval gates ----------------------------------------------------------
check((approve(4).detail ?? "").includes("scientific approval authorization required"), "approval needs explicit grant");
sql(`insert into p37_scientific_approvers(user_id, authorization_ref) values ('${uid(4)}','owner-authorization:p37-disposable'),('${uid(9)}','owner-authorization:p37-no-read'),('${uid(2)}','owner-authorization:p37-submitter');
insert into p37_catalog_activators(user_id, authorization_ref) values ('${uid(6)}','owner-authorization:p37-disposable'),('${uid(4)}','owner-authorization:p37-same-person');`);
check(sql("select count(*) from p36_global_review_audit where details->>'grant' in ('scientific_approval','catalog_activation');") === "5", "grants audited");
check((approve(9).detail ?? "").includes("scope denied"), "approver grant without read basis denied");
check((approve(4, { mission: "M2", sub: SUB2, term: TERM2 }).detail ?? "").includes("scope denied"), "unshared mission denied");
check(approve(4).detail === "the term must be accepted for scientific review first", "triage acceptance required");
sql(as(4) + `select public.p36_global_triage_append_v1('M1','synthetic','${SUB}','${TERM}','ACCEPT_FOR_REVIEW',null,'{}'::text[],null,'${key()}');`);
sql(as(4) + `select public.p36_global_triage_append_v1('M1','synthetic','${SUB}','${TERM_OTHER}','ACCEPT_FOR_REVIEW',null,'{}'::text[],null,'${key()}');`);
check(approve(4).detail === "exactly one independently provisioned source-validation receipt is required", "receipt required");
// Disposable stand-in for the independent, SQL-provisioned source validation (never created by the app).
sql(`insert into p36_dynamic_source_validation values
 ('M1','C1','synthetic','${TERM}','${"d".repeat(64)}','${ID}','${UNIT}','${SPECIMEN}','${METHOD}','SYNTHETIC-DISPOSABLE-PROTOCOL','0','synthetic-disposable-receipt:p37','independent-validator:disposable',now()),
 ('M1','C1','synthetic','${TERM}','${"e".repeat(64)}','ext:synthetic-marker-p37','nmol/L','${SPECIMEN}','${METHOD}','P','0','synthetic-disposable-receipt:wrong-unit','independent-validator:disposable',now()),
 ('M1','C1','synthetic','${TERM}','${"f".repeat(64)}','cv-001','${UNIT}','${SPECIMEN}','${METHOD}','P','0','synthetic-disposable-receipt:base-id','independent-validator:disposable',now()),
 ('M1','C1','synthetic','${TERM}','${"1".repeat(64)}','ext:synthetic-marker-self','${UNIT}','${SPECIMEN}','${METHOD}','P','0','synthetic-disposable-receipt:self','${uid(4)}',now()),
 ('M1','C1','synthetic','${TERM_OTHER}','${"2".repeat(64)}','ext:synthetic-marker-p37b','${UNIT}','${SPECIMEN}','${METHOD}','P','0','synthetic-disposable-receipt:other','independent-validator:disposable',now());`);
check(approve(4, { ref: "synthetic-disposable-receipt:wrong-unit" }).status === "rejected", "unit mismatch rejected");
check(approve(4, { ref: "synthetic-disposable-receipt:base-id" }).status === "rejected", "base catalog ID rejected");
check(approve(4, { ref: "synthetic-disposable-receipt:self" }).detail === "source validation and scientific approval must be independent", "self-validation rejected");
check(approve(2).detail === "the submitter cannot approve their own request" || (approve(2).detail ?? "").includes("scope denied"), "submitter cannot approve");
check(approve(4, { name: "x" }).status === "rejected", "canonical name required");
check(approve(4, { domain: "cardiac" }).status === "rejected", "domain whitelisted");
const approvalKey = key();
const ap = approve(4, { key: approvalKey });
check(ap.status === "recorded" && /^[0-9a-f]{64}$/.test(ap.entry_sha256 ?? ""), "scientific approval recorded with proposal digest");
check(approve(4, { key: approvalKey }).status === "duplicate", "idempotent approval retry");
check(approve(4).detail === "this submitted term already has a scientific approval", "one approval per submitted term");
const entry = json<{ canonicalId: string; aliases: string[]; unit: string; specimen: string; method: string }>(sql(`select entry::text from p37_catalog_events where id='${ap.event_id}';`));
check(entry.canonicalId === ID && entry.unit === UNIT && entry.specimen === SPECIMEN && entry.method === METHOD && entry.aliases.join() === LABEL, "proposal derived from receipt and submitted label");

// --- Activation gates --------------------------------------------------------
check((activate(9, ap.event_id!, ap.entry_sha256!).detail ?? "").includes("catalog activation authorization required"), "activation needs activator grant");
check(activate(4, ap.event_id!, ap.entry_sha256!).detail === "the scientific approver cannot activate their own approval", "approver cannot activate");
check(activate(6, ap.event_id!, "0".repeat(64)).detail === "proposal digest does not match the approved proposal", "digest must match");
const actKey = key();
const act = activate(6, ap.event_id!, ap.entry_sha256!, actKey);
check(act.status === "recorded" && typeof act.catalog_version === "number", "separate activator activates");
check(activate(6, ap.event_id!, ap.entry_sha256!, actKey).status === "duplicate", "idempotent activation retry");
check((activate(6, ap.event_id!, ap.entry_sha256!).detail ?? "").includes("already activated"), "no double activation");
// Conflicting definition: same label/unit/specimen/method under a different canonical ID.
sql(`insert into p36_dynamic_source_validation values ('M1','C1','synthetic','${TERM_OTHER}','${"3".repeat(64)}','ext:synthetic-marker-p37c','${UNIT}','${SPECIMEN}','${METHOD}','P','0','synthetic-disposable-receipt:other-c','independent-validator:disposable',now());`);
const ap2 = approve(4, { term: TERM_OTHER, ref: "synthetic-disposable-receipt:other", name: "Synthetic marker P37" });
check(ap2.status === "recorded", "second approval recorded");
check((activate(6, ap2.event_id!, ap2.entry_sha256!).detail ?? "").startsWith("conflicts with active entry"), "conflicting definition rejected");

// --- Immutability ------------------------------------------------------------
check(sqlErr(`update p37_catalog_events set reason='tampered reason' where id='${act.event_id}';`).length > 0, "events immutable");
check(sqlErr(`delete from p37_catalog_events where id='${act.event_id}';`).length > 0, "events undeletable");
check(sqlErr("truncate p37_catalog_events;").length > 0, "events untruncatable");
check(sqlErr(`delete from p37_catalog_activators where user_id='${uid(6)}';`).length > 0, "grants never deleted");

// --- Snapshot -> signed -> device recognition ----------------------------------
check(sqlErr("set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000077'; select p37_catalog_snapshot_v1();").includes("scope denied"), "snapshot needs membership or grant");
const rpc = json<LedgerSnapshotRpc>(sql(as(1) + "select p37_catalog_snapshot_v1();"));
check(rpc.entries.length === 1 && rpc.entries[0]!.status === "ACTIVE" && !JSON.stringify(rpc).includes(uid(4)) && !JSON.stringify(rpc).includes(uid(6)), "snapshot has the active entry and no identities");
const testKey = await generateTestSigningKey("disposable-test-key");
const store = new Map<string, string>();
const storage: SnapshotStorage = { get: (x) => store.get(x) ?? null, set: (x, v) => { store.set(x, v); } };
const device = { storage, trustedKeys: [testKey.trusted], environments: ["test"] as const };
resetActiveCatalogForTests();
const firstExam = { label: LABEL, unit: UNIT, specimen: SPECIMEN, method: METHOD, provenance: "synthetic" as const };
check(classifyWithGovernedExtensions(firstExam).classification.status === "unclassified", "before sync: UNKNOWN");
const signed = await signCatalogSnapshot(snapshotFromLedgerRpc(rpc, "test", new Date().toISOString()), testKey.trusted.keyId, testKey.privateKey);
check((await installOfferedCatalog(signed, device)).installed, "verified snapshot installed");
const second = classifyWithGovernedExtensions(firstExam);
check(second.classification.status === "matched" && second.classification.metricId === ID && second.recognition?.catalogVersion === act.catalog_version, "second examination RECOGNIZED with canonical ID and version");
check(buildUnknownBiomarkerTerms([{ label: LABEL, unit: UNIT, value: "1", observedAt: "2026-11-08", classification: second.classification, sourceKind: "manual", sourceLabel: "x" }]).length === 0, "no duplicate unknown request");
check(classifyWithGovernedExtensions({ ...firstExam, method: "Other assay" }).classification.status === "unclassified", "method mismatch stays unknown");
resetActiveCatalogForTests();
const realFetch = globalThis.fetch;
globalThis.fetch = (() => { throw new Error("network disabled"); }) as unknown as typeof fetch;
check((await loadInstalledCatalog(device)).loaded && classifyWithGovernedExtensions(firstExam).classification.status === "matched", "offline reload recognizes");
globalThis.fetch = realFetch;

// --- Revocation ----------------------------------------------------------------
check(revoke(6, act.event_id!, "short").status === "rejected", "revocation needs reason");
check((revoke(4 + 5, act.event_id!, "Synthetic revocation test").detail ?? "").includes("authorization required"), "revocation needs activator grant");
check(revoke(6, act.event_id!, "Synthetic revocation test").status === "recorded", "revocation recorded");
const rpc2 = json<LedgerSnapshotRpc>(sql(as(1) + "select p37_catalog_snapshot_v1();"));
check(rpc2.entries[0]!.status === "REVOKED" && rpc2.catalog_version > rpc.catalog_version, "snapshot reflects revocation with newer version");
check((await installOfferedCatalog(await signCatalogSnapshot(snapshotFromLedgerRpc(rpc2, "test", new Date().toISOString()), testKey.trusted.keyId, testKey.privateKey), device)).installed, "revoked snapshot installed");
check(classifyWithGovernedExtensions(firstExam).classification.status === "unclassified", "revoked entry no longer recognized");
check(activate(6, ap2.event_id!, ap2.entry_sha256!).status === "recorded", "after revocation the other definition can be activated");
resetActiveCatalogForTests();

// --- Lifecycle read + preservation ----------------------------------------------
const life = json<{ can_approve: boolean; can_activate: boolean; events: unknown[]; receipts: unknown[] }>(sql(as(4) + "select p37_catalog_lifecycle_v1('M1','synthetic');"));
check(life.can_approve && life.can_activate && life.events.length === 2 && life.receipts.length === 6, "lifecycle read for authorized reviewer");
check(sqlErr(as(4) + "select p37_catalog_lifecycle_v1('M2','synthetic');").includes("scope denied"), "lifecycle unshared mission denied");
check(sql(fingerprint).split(":").slice(0, 2).join(":") === before.split(":").slice(0, 2).join(":"), "submissions and terms unchanged");
check(sql("select count(*) from p36_dynamic_authorization_events;") === "0", "P36 scientific authorization ledger untouched");
check(sql("select count(*) from p36_metric_unit_catalog;") === "1", "base unit catalog untouched");

// --- Rollback ------------------------------------------------------------------
check(sqlErr(`BEGIN;\n${pending("20261108000000_p37_catalog_activation.rollback.sql")}\nCOMMIT;`).includes("Rollback refused"), "rollback refuses with history");
sql("drop database if exists p37_catalog_rb with (force);", "postgres");
console.log(`P37 catalog activation disposable verification: ${count} assertions passed`);
