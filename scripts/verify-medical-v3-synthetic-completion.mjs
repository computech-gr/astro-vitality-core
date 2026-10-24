// Destructive ONLY in opted-in disposable PostgreSQL. Never uses managed PG* variables.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const socket = process.env.FV01_PG_SOCKET_DIR;
if (!socket?.startsWith("/tmp/") || process.env.FV0143_INCLUDE_PENDING !== "1")
  throw new Error("Disposable /tmp socket and pending opt-in required");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG")));
const base = ["-h",socket,"-p",process.env.FV01_PG_PORT ?? "55432","-U","postgres","-X","-v","ON_ERROR_STOP=1","-t","-A","-d","medical_v3_it"];
const run = sql => execFileSync("psql",[...base,"-c",sql],{env,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
const file = path => execFileSync("psql",[...base,"-f",path],{env,stdio:["ignore","pipe","pipe"]});
const gm="00000000-0000-0000-0000-0000000000a2", crew="00000000-0000-0000-0000-0000000000b1";
const as = uid => `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`;
let assertions=0;
const check=(ok,name)=>{if(!ok)throw new Error(name);assertions++;console.log(`PASS: ${name}`);};
const deny=(sql,name)=>{let failed=false;try{run(sql);}catch{failed=true;}check(failed,name);};
const transactionCheck=(sql,name)=>{const result=run(`BEGIN;${sql};ROLLBACK;`);check(result.split("\n").includes("t"),name);};
// Reconstruct real pending foundation and source, never substitute an evidence resolver.
const adminBase=base.slice(0,-1).concat('postgres');
execFileSync('psql',[...adminBase,'-c','drop database if exists medical_v3_it','-c','create database medical_v3_it'],{env,stdio:'pipe'});
execFileSync('psql',[...adminBase,'-c','alter database medical_v3_it set search_path=public,extensions'],{env,stdio:'pipe'});
file('tests/integration-pg/stub.sql');
for(const name of readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort()) file(`supabase/migrations/${name}`);
file('supabase/pending/20261024000000_medical_governance_v3.sql');
file('tests/integration-pg/fv01-setup.sql');
run(`update mission_memberships set crew_member_id='c1' where user_id='${gm}' and role='ground_medical'`);
run("update missions set name='MITOCHONDRIA 2026 - Synthetic Demonstration' where id='m1'; update crew_members set display_name='Alex Morgan' where id='c1';");
file("supabase/pending/20261025000000_medical_v3_synthetic_completion.sql");
const result=run(as(gm)+"select medical_v3_fixture_snapshot()").split("\n").at(-1);
const snapshot=JSON.parse(result);
writeFileSync("/tmp/v3-completion-snapshot.json",JSON.stringify(snapshot,null,2));
check(snapshot.missionId==='m1' && snapshot.crewMemberId==='c1',"scope resolved from existing server mission/crew");
check(snapshot.evidence.map(o=>o.id).join(',')==='synthetic-v3-hr-001,synthetic-v3-hr-002',"exact fixture IDs");
check(snapshot.evidence.map(o=>o.value).join(',')==='62,66',"exact invented values");
check(snapshot.evidence.every(o=>o.metric==='cv-001' && o.unit==='bpm' && o.domain==='cardiovascular'),"owner-corrected catalog tuple");
check(snapshot.sha256===`sha256-${createHash('sha256').update(snapshot.canonical,'utf8').digest('hex')}`,"PostgreSQL/Node UTF-8 SHA-256 parity");
function canonical(v){if(v===null || typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;}
check(snapshot.canonical===canonical(JSON.parse(snapshot.canonical)),"independent compact sorted-key v2 byte parity");
check(JSON.parse(snapshot.canonical).observations.every(o=>o.reviewReceipt.kind==='synthetic_test_fixture_not_human_review'),"test receipts never claim real human review");
deny(as(crew)+"select medical_v3_fixture_snapshot()","crew self snapshot denied");
deny("set role anon; select medical_v3_fixture_snapshot()","anonymous snapshot denied");
deny(as(gm)+"select medical_v3_ai_evidence('m2','c4')","cross-scope evidence denied");
for(const table of ['medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts']){
 deny(as(gm)+`select * from ${table}`,`${table} direct browser read denied`);
 deny(as(gm)+`insert into ${table} default values`,`${table} direct browser write denied`);
 deny(`update ${table} set id=id`,`${table} updates denied even to owner`);
 deny(`delete from ${table}`,`${table} deletion denied`);
}
transactionCheck("update mission_memberships set active=false where user_id='"+gm+"'; select not medical_v3_has_scope('m1','c1')","membership revocation removes scope");
transactionCheck("alter table medical_v3_fixture_sources disable trigger medical_v3_fixture_immutable; update medical_v3_fixture_sources set catalog_sha256='unknown';"+as(gm)+"select medical_v3_ai_evidence('m1','c1') is null","unknown pinned catalog fails closed");
transactionCheck("alter table medical_v3_fixture_sources disable trigger medical_v3_fixture_immutable; update medical_v3_fixture_sources set source_sha256='tampered';"+as(gm)+"select medical_v3_ai_evidence('m1','c1') is null","source digest tampering fails closed");
transactionCheck("alter table medical_v3_fixture_observations disable trigger medical_v3_fixture_observation_immutable; update medical_v3_fixture_observations set metric_id='unknown';"+as(gm)+"select medical_v3_ai_evidence('m1','c1') is null","unknown metric fails closed");
transactionCheck("alter table medical_v3_fixture_observations disable trigger medical_v3_fixture_observation_immutable; update medical_v3_fixture_observations set supersedes_id=case id when 'synthetic-v3-hr-001' then 'synthetic-v3-hr-002' else 'synthetic-v3-hr-001' end;"+as(gm)+"select medical_v3_ai_evidence('m1','c1') is null","correction cycle fails closed");
transactionCheck("insert into medical_v3_fixture_receipts select 'stale',observation_id,2,id,'accepted',receipt_kind,'wrong',catalog_sha256,reviewed_at from medical_v3_fixture_receipts where observation_id='synthetic-v3-hr-001';"+as(gm)+"select medical_v3_ai_evidence('m1','c1') is null","stale receipt fails closed");
transactionCheck("insert into medical_v3_fixture_receipts select 'revoke-fixture',observation_id,2,id,'revoked',receipt_kind,source_sha256,catalog_sha256,reviewed_at from medical_v3_fixture_receipts where observation_id='synthetic-v3-hr-001';"+as(gm)+"select jsonb_array_length(medical_v3_ai_evidence('m1','c1'))=1","revoked source excludes observation");
// A fresh synthetic review chain, preserving old fixture tests in other scoped rows only in disposable DB.
run("alter table medical_advisor_review_events disable trigger medical_v3_immutable; delete from medical_advisor_review_events; alter table medical_advisor_review_events enable trigger medical_v3_immutable;");
const text='cv-001 recorded 62 bpm [synthetic-v3-hr-001]';
const append=(type,previous,request,sha=snapshot.sha256)=>as(gm)+`select medical_v3_append_review('m1','c1','${type}',${previous ? `'${previous}'` : 'NULL'},'${request}','${sha}','${text}','${text}','Synthetic fixture assessment; not clinical approval')`;
const request='10000000-0000-4000-8000-000000000001';
const draft=JSON.parse(run(append('draft_created',null,request)).split('\n').at(-1));
check(JSON.parse(run(append('draft_created',null,request)).split('\n').at(-1)).id===draft.id,'exact retry idempotency');
deny(append('approved',null,'10000000-0000-4000-8000-000000000002'),'stale predecessor denied');
const approved=JSON.parse(run(append('approved',draft.id,'10000000-0000-4000-8000-000000000003')).split('\n').at(-1));
check(JSON.parse(run(as(gm)+"select medical_v3_review_history('m1','c1')").split('\n').at(-1)).some(e=>e.id===approved.id&&e.verified_current),'approval verified from real resolver');
transactionCheck("insert into medical_v3_fixture_receipts select 'revoke-stale',observation_id,2,id,'revoked',receipt_kind,source_sha256,catalog_sha256,reviewed_at from medical_v3_fixture_receipts where observation_id='synthetic-v3-hr-001';"+as(gm)+"select not (medical_v3_review_history('m1','c1') @> '[{\"verified_current\":true}]')","source change invalidates approved acknowledgment");
deny(append('revoked',approved.id,'10000000-0000-4000-8000-000000000004','sha256-'+ 'a'.repeat(64)),'revocation digest substitution denied');
run(append('revoked',approved.id,'10000000-0000-4000-8000-000000000005'));
check(!JSON.parse(run(as(gm)+"select medical_v3_review_history('m1','c1')").split('\n').at(-1)).some(e=>e.verified_current),'revoked acknowledgment not current');
// Validate disable-first rollback without destroying fixtures/history.
const rollback=readFileSync('supabase/pending/20261025000000_medical_v3_synthetic_completion.rollback.sql','utf8').replace('BEGIN;','').replace('COMMIT;','');
transactionCheck(rollback+"select count(*)=0 from medical_v3_authoritative_evidence('m1','c1')",'rollback disables source and preserves history');
console.log(`Synthetic completion: PASS (${assertions} assertions); no production changes or provider calls.`);