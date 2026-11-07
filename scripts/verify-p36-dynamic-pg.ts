/** Disposable socket-only SQL verification. Never uses managed PG* configuration. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { canonicalJson } from "../src/domain/health-intelligence/observation-envelope";
import { termIdFor } from "../src/domain/health-intelligence/unknown-biomarker-review";
import { cloudAuthorizationContext } from "../src/domain/health-intelligence/p36-cloud-handoff";
import { buildAuthorizationPayload, type SubmissionInput } from "../src/domain/health-intelligence/p36-scientific-authorization";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const socket = process.env["P36_DISPOSABLE_SOCKET"];
if (!socket?.startsWith("/tmp/p36-unified/socket")) throw Error("Explicit isolated socket required; live database prohibited.");
const base = ["-h", socket, "-p", "55439", "-U", "lovable", "-v", "ON_ERROR_STOP=1", "-X", "-At"];
function sql(q: string, db = "p36_dynamic_it", fail = false) { const r = spawnSync("psql", [...base, "-d", db], { input: q, encoding: "utf8", cwd: root }); if (fail ? r.status === 0 : r.status !== 0) throw Error(`Unexpected SQL result: ${r.stderr}`); return r.stdout.trim(); }
sql("drop database if exists p36_dynamic_it with (force);", "postgres");
sql("create database p36_dynamic_it;", "postgres");
sql(`do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$; do $r$ begin create role anon; exception when duplicate_object then null; end $r$; do $r$ begin create role service_role; exception when duplicate_object then null; end $r$; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create table missions(id text primary key); create table crew_members(id text primary key,display_name text); create table mission_crew_assignments(mission_id text,crew_member_id text,status text); create table mission_memberships(mission_id text,user_id uuid,crew_member_id text,role text,active boolean);
insert into missions values('M1'),('M2'); insert into crew_members values('C1','Synthetic Crew One'),('C2','Synthetic Crew Two'); insert into mission_crew_assignments values('M1','C1','active'),('M1','C2','active'),('M2','C2','active');
insert into mission_memberships values('M1','00000000-0000-0000-0000-000000000001','C1','crew_self',true),('M1','00000000-0000-0000-0000-000000000002',null,'ground_medical',true),('M1','00000000-0000-0000-0000-000000000003',null,'researcher',true);`);
for (const f of ["20261107000000_p36_dynamic_handoff.sql", "20261107010000_p36_dynamic_authorization.sql", "20261107020000_p36_authorized_crew_roster.sql"]) sql(readFileSync(resolve(root, "supabase/pending", f), "utf8"));
const payload = { schema: "mitochondria.p36-cloud-handoff.v1", scope: { missionId: "M1", crewMemberId: "C1", provenance: "synthetic" }, requestId: "ubr-12345678", scientificStatus: "PENDING_NIKOLAS_REVIEW", catalogChangeApplied: false, terms: Array.from({ length: 197 }, (_, i) => ({ termId: termIdFor(`Test term ${i}`, "bpm"), originalLabels: [`Test term ${i}`], exactUnit: "bpm", classification: "unclassified", candidateMetricIds: ["cv-001"], sourceDocumentSha256: ["a".repeat(64)], evidencePointers: [], method: null, specimen: null })) };
const canonical = canonicalJson(payload);
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const auth = (id: number) => `set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-${String(id).padStart(12,"0")}';`;
const append = (c = canonical) => `select public.p36_dynamic_handoff_append_v1('M1','C1','synthetic','ubr-12345678',${literal(c)},encode(sha256(convert_to(${literal(c)},'UTF8')),'hex'))->>'status';`;
let count = 0;
const check = (yes: boolean) => { if (!yes) throw Error("assertion failed"); count++; };
const sqlErr = (q: string) => { const r = spawnSync("psql", [...base, "-d", "p36_dynamic_it"], { input: q, encoding: "utf8", cwd: root }); if (r.status === 0) throw Error("expected SQL failure"); return r.stderr; };
check(sql(auth(3)+"select count(*) from p36_dynamic_crew_roster_v1('M1');").endsWith("2"));
check(sql(auth(1)+"select string_agg(crew_member_id,',') from p36_dynamic_crew_roster_v1('M1');").endsWith("C1"));
check(sqlErr(auth(3)+"select * from p36_dynamic_crew_roster_v1('M2');").includes("scope denied"));
check(sqlErr("set role anon; select * from p36_dynamic_crew_roster_v1('M1');").includes("permission denied"));
sql("update mission_crew_assignments set status='inactive' where mission_id='M1' and crew_member_id='C2';");
check(sql(auth(3)+"select count(*) from p36_dynamic_crew_roster_v1('M1');").endsWith("1"));
sql("update mission_crew_assignments set status='active' where mission_id='M1' and crew_member_id='C2';");
// Database admission is closed by default: EXECUTE grants alone never admit writes.
check(sqlErr(auth(1)+append()).includes("admission is closed"));
check(sql("select count(*) from p36_dynamic_handoff_submissions;") === "0");
check(sqlErr(auth(1)+"update p36_dynamic_admission set handoff_open=true;").includes("permission denied"));
check(sqlErr("delete from p36_dynamic_admission;").includes("cannot be removed"));
sql("update p36_dynamic_admission set handoff_open=true, authorization_open=true, change_note='disposable harness only';");
check(sql(auth(1)+append()).endsWith("inserted"));
check(sql("select count(*) from p36_dynamic_handoff_terms;") === "197");
const ctx = await cloudAuthorizationContext(payload.terms.map((t) => ({ ...t, classification: "unclassified" as const })));
const term = payload.terms[0]; if (!term) throw Error();
const input: SubmissionInput = { termId: term.termId, kind: "recommendation", action: "RECOMMEND", authorityMissionId: "M1", submissionId: crypto.randomUUID(), canonicalCatalogId: "cv-001", domain: "cardiovascular_health", specimenOrAcquisitionContext: "synthetic ECG acquisition", methodOrInstrument: "synthetic ECG device", protocol: "synthetic test protocol", protocolVersion: "v1.0", validatedUnit: "bpm", sourceRefs: ["doc:"+"a".repeat(64)], validationEvidenceRefs: [], rationale: "Synthetic disposable recommendation evidence only", reviewerName: "Synthetic Ground", reviewerQualification: "Synthetic qualification", conflictOfInterestDeclaration: "", independenceConfirmed: false, recommendationEventId: null, supersedesEventId: null };
const makeEvent = (i: SubmissionInput, id: number) => ({ ...buildAuthorizationPayload(i, { userId: `00000000-0000-0000-0000-${String(id).padStart(12,"0")}`, role: id===2 ? "ground_medical" as const : "researcher" as const, now: new Date().toISOString() },ctx), crewMemberId:"C1",provenance:"synthetic" });
const appendEvent = (p: ReturnType<typeof makeEvent>) => { const c=canonicalJson(p); return `select p36_dynamic_auth_append_v1('M1','C1','synthetic','${p.submissionId}',${literal(c)},encode(sha256(convert_to(${literal(c)},'UTF8')),'hex'));`; };
const rec = makeEvent(input,2);
check(sql(auth(2)+appendEvent(rec)).includes("independently verified source receipt required"));
// Invented receipts exist ONLY in this disposable test DB. Never seed production validation.
sql(`insert into p36_dynamic_source_validation values('M1','C1','synthetic','${term.termId}','${"a".repeat(64)}','cv-001','bpm','synthetic ECG acquisition','synthetic ECG device','synthetic test protocol','v1.0','doi:10.0000/synthetic','disposable test harness',now());`);
const recResult=JSON.parse(sql(auth(2)+appendEvent(rec)).split('\n').at(-1)??'{}'); check(recResult.status==="inserted");
// An approval citing a DOI that is not the receipt's own validation reference is refused.
const unbound = makeEvent({ ...input, kind:"decision",action:"APPROVE",submissionId:crypto.randomUUID(),reviewerName:"Synthetic Researcher", conflictOfInterestDeclaration:"No conflict, synthetic only",independenceConfirmed:true,validationEvidenceRefs:["doi:10.0000/unrelated"],recommendationEventId:recResult.event_id },3);
check(sql(auth(3)+appendEvent(unbound)).includes("independently verified source receipt required"));
const decision = makeEvent({ ...input, kind:"decision",action:"APPROVE",submissionId:crypto.randomUUID(),reviewerName:"Synthetic Researcher", conflictOfInterestDeclaration:"No conflict, synthetic only",independenceConfirmed:true,validationEvidenceRefs:["doi:10.0000/synthetic"],recommendationEventId:recResult.event_id },3);
const decisionResult=JSON.parse(sql(auth(3)+appendEvent(decision)).split('\n').at(-1)??'{}'); if(decisionResult.status!=="inserted") throw Error(JSON.stringify(decisionResult)); check(true);
check(sql(auth(3)+appendEvent(decision)).includes("duplicate"));
const self={...decision,actorUserId:rec.actorUserId,submissionId:crypto.randomUUID()};
sql(auth(2)+appendEvent(self),undefined,true);count++;
check(sql(auth(3)+"select jsonb_array_length(p36_dynamic_auth_list_v1('M1','C1','synthetic',0,500));").endsWith("2"));
sql(readFileSync(resolve(root,"supabase/pending/20261107010000_p36_dynamic_authorization.rollback.sql"),"utf8"),undefined,true);count++;
check(sql(auth(1)+append()).endsWith("duplicate"));
const changed = structuredClone(payload); const first = changed.terms[0]; if (!first) throw Error(); first.classification = "source_unvalidated";
check(sql(auth(1)+append(canonicalJson(changed))).endsWith("conflict"));
check(sql(auth(3)+"select jsonb_array_length(p36_dynamic_handoff_list_v1('M1','C1','synthetic',0,100));").endsWith("1"));
check(sql(auth(3)+"select jsonb_array_length(p36_dynamic_handoff_list_v1('M1','C1','real',0,100));").endsWith("0"));
sql(auth(1)+"select p36_dynamic_handoff_list_v1('M1','C2','synthetic',0,100);",undefined,true); count++;
sql(auth(3)+"select p36_dynamic_handoff_list_v1('M2','C2','synthetic',0,100);",undefined,true); count++;
for (const q of ["select * from p36_dynamic_handoff_submissions", "delete from p36_dynamic_handoff_terms", "truncate p36_dynamic_handoff_submissions", "select p36_dynamic_scope('M1','C1',false)"]) { sql(auth(1)+q,undefined,true); count++; }
sql(readFileSync(resolve(root,"supabase/pending/20261107000000_p36_dynamic_handoff.rollback.sql"),"utf8"),undefined,true); count++;
check(sql("select count(*) from p36_dynamic_handoff_terms;") === "197");
// Revocation serialization: while a concurrent transaction holds the authorizing membership row
// (as an in-flight revocation would), the append waits on the row lock instead of reading stale state.
const holder = spawn("psql", [...base, "-d", "p36_dynamic_it"], { cwd: root });
holder.stdin.write("begin; select 1 from mission_memberships where role='crew_self' for update; select pg_sleep(4); rollback;\n"); holder.stdin.end();
await new Promise((r) => setTimeout(r, 800));
check(sqlErr(auth(1)+"set lock_timeout='700ms';"+append()).includes("lock timeout"));
await new Promise((r) => holder.on("close", r));
// A revocation committed while the append waited is honored after the lock is released.
const revoker = spawn("psql", [...base, "-d", "p36_dynamic_it"], { cwd: root });
revoker.stdin.write("begin; update mission_memberships set active=false where role='crew_self'; select pg_sleep(1.5); commit;\n"); revoker.stdin.end();
await new Promise((r) => setTimeout(r, 500));
const changedReq = structuredClone(payload); changedReq.requestId = "ubr-87654321";
const raced = canonicalJson(changedReq);
check(sqlErr(auth(1)+`select public.p36_dynamic_handoff_append_v1('M1','C1','synthetic','ubr-87654321',${literal(raced)},encode(sha256(convert_to(${literal(raced)},'UTF8')),'hex'));`).includes("scope denied"));
await new Promise((r) => revoker.on("close", r));
check(sql("select count(*) from p36_dynamic_handoff_submissions where request_id='ubr-87654321';") === "0");
// Retaining disable: closing admission keeps every record and reads stay available.
sql("update p36_dynamic_admission set handoff_open=false, authorization_open=false, change_note='disposable retaining disable';");
check(sql("select count(*) from p36_dynamic_handoff_terms;") === "197");
check(sql(auth(3)+"select jsonb_array_length(p36_dynamic_handoff_list_v1('M1','C1','synthetic',0,100));").endsWith("1"));
check(sqlErr(auth(2)+appendEvent({ ...rec, submissionId: crypto.randomUUID() })).includes("admission is closed"));
sql("update p36_dynamic_admission set handoff_open=true, authorization_open=true;");
sql("update mission_memberships set active=false where role='crew_self';");
sql(auth(1)+append(),undefined,true);count++;
console.log(`PASS: ${count} disposable SQL checks; closed-by-default admission + retaining disable, revocation row-lock serialization, approval bound to receipt validation reference, 197-term insert, replay, conflicts, two-account readback, Ground Medical recommendation, independent Researcher decision, source-receipt absence, scope/RLS/ACL/rollback/revocation. Synthetic metadata only; not browser authentication acceptance.`);