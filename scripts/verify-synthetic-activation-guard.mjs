// Disposable ONLY; never consumes managed PG environment or production credentials.
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const socket=process.env.FV01_PG_SOCKET_DIR;
if(!socket?.startsWith('/tmp/') || process.env.FV0143_INCLUDE_PENDING!=='1') throw Error('Disposable socket opt-in required');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const base=['-h',socket,'-p',process.env.FV01_PG_PORT??'55432','-U','postgres','-X','-At','-v','ON_ERROR_STOP=1','-d','medical_v3_it'];
const run=s=>execFileSync('psql',[...base,'-c',s],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
let n=0; const check=(v,label)=>{if(!v)throw Error(label);n++;console.log('PASS:',label);};
const deny=(s,label)=>{let rejected=false;try{run(s);}catch{rejected=true;}check(rejected,label);};
const actor='22a72429-1674-4174-9b27-ba63db3c0279';
const caller=`set role authenticated;select set_config('request.jwt.claim.sub','${actor}',false);`;
const migration=readFileSync('supabase/pending/20261028000000_medical_demo_activation_guard.sql','utf8');
const rollback=readFileSync('supabase/pending/20261028000000_medical_demo_activation_guard.rollback.sql','utf8');
// Existing verifier leaves retaining-disabled schema; restore only inside this disposable DB.
run(readFileSync('drizzle/migrations/0011_medical_v3_synthetic_schema_only.sql','utf8').split('CREATE OR REPLACE FUNCTION public.medical_v3_fixture_scope()')[1] ? "select 1" : "select 1");
// Restore exact committed functions/ACL by extracting CREATE definitions from the immutable migration.
const schema=readFileSync('drizzle/migrations/0011_medical_v3_synthetic_schema_only.sql','utf8');
const scopeDef=schema.match(/CREATE OR REPLACE FUNCTION public\.medical_v3_fixture_scope\(\)[\s\S]*?END \$\$;/)?.[0];
if(!scopeDef)throw Error('scope definition unavailable');
run(scopeDef);
run(`ALTER FUNCTION medical_v3_fixture_scope() OWNER TO postgres;ALTER FUNCTION medical_v3_fixture_scope() SET search_path=pg_catalog,public,extensions,pg_temp;
 GRANT EXECUTE ON FUNCTION medical_v3_fixture_snapshot(),medical_v3_ai_evidence(text,text),medical_v3_reserve_ai(text,text) TO authenticated;
 INSERT INTO auth.users(id) VALUES('${actor}') ON CONFLICT DO NOTHING;
 UPDATE mission_memberships SET user_id='${actor}' WHERE id='63470171-3a22-4075-b197-ac85b90cb0ef';
 DELETE FROM medical_ai_quota_reservations;`);
deny(`BEGIN;${migration}DO $$BEGIN RAISE EXCEPTION 'late fail';END$$;COMMIT;`,'late schema failure rolls back all guard objects');
check(run("select to_regclass('medical_demo_authorization') is null")==='t','atomic failure leaves no guard');
run(`BEGIN;${migration}COMMIT;`);
for(const t of ['medical_demo_authorization','medical_demo_attempts','medical_demo_control_audit']){
 check(run(`select relrowsecurity and relowner='postgres'::regrole from pg_class where oid='${t}'::regclass`)==='t',t+' RLS and trusted owner');
 for(const role of ['anon','authenticated','service_role'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])
 check(run(`select not has_table_privilege('${role}','${t}','${privilege}')`)==='t',role+' '+t+' '+privilege+' denied');
}
const sha=JSON.parse(run(caller+'select medical_v3_fixture_snapshot()').split('\n').at(-1)).sha256;
const nonce='a'.repeat(64);
const reserve=()=>JSON.parse(run(caller+`select medical_demo_reserve('${sha}','${nonce}')`).split('\n').at(-1));
check(reserve().allowed===false,'default-off empty authorization denies');
deny(caller+`select medical_demo_authorize(now(),now()+interval '30 minutes','${actor}','owner-approval-ref','${sha}')`,'authenticated cannot activate');
run(`select medical_demo_authorize(clock_timestamp()+interval '0.1 seconds',clock_timestamp()+interval '30 minutes 0.1 seconds','${actor}','owner-approval-ref','${sha}')` .replace("clock_timestamp()+interval '30 minutes 0.1 seconds'","t+interval '30 minutes'").replace("clock_timestamp()+interval '0.1 seconds'","t") .replace('select medical_demo_authorize','with x as (select clock_timestamp()+interval \'0.1 seconds\' t) select medical_demo_authorize')+' from x');
run('select pg_sleep(0.15)');
deny(`select medical_demo_authorize(now()+interval '1 minute',now()+interval '31 minutes','${actor}','second-window','${sha}')`,'authorization cannot reset lifetime counters');
const parallel=sql=>new Promise(resolve=>{const p=spawn('psql',[...base,'-c',sql],{env});let out='';p.stdout.on('data',v=>out+=v);p.on('close',code=>resolve({code,out}));});
const race=await Promise.all(Array.from({length:8},()=>parallel(caller+`select medical_demo_reserve('${sha}','${nonce}')`)));
check(race.filter(r=>r.code===0&&r.out.includes('"allowed": true')).length===1,'eight concurrent reserve callers yield exactly one attempt');
const id=run('select active_attempt from medical_demo_authorization');
check(run(caller+`select medical_demo_dispatch('${id}','${sha}','${nonce}')`).split('\n').at(-1)==='t','dispatch verifies live window evidence nonce');
check(run(caller+`select medical_demo_dispatch('${id}','${sha}','${nonce}')`).split('\n').at(-1)==='f','dispatch cannot replay');
run(`update medical_ai_quota_reservations set lease_until=clock_timestamp()-interval '1 hour'`);
check(reserve().allowed===false,'lease expiry never bypasses concurrency');
run(caller+`select medical_demo_finish('${id}',NULL,'${nonce}')`);
check(reserve().allowed===false,'unknown outcome blocks forever and retains hold');
check(run('select attempts=1 and held_microusd=100000 from medical_demo_authorization')==='t','failure never refunds attempts/budget');
// Controlled resets are exclusively disposable adversarial test setup, never recovery instructions.
run('update medical_demo_authorization set active_attempt=NULL;');
for(let i=1;i<10;i++){
 run("update medical_ai_quota_reservations set reserved_at=clock_timestamp()-interval '2 minutes'");
 const r=reserve();check(r.allowed===true,'lifetime attempt '+(i+1));
 run(caller+`select medical_demo_dispatch('${r.attemptId}','${sha}','${nonce}'); select medical_demo_finish('${r.attemptId}',76440,'${nonce}')`);
}
check(reserve().allowed===false,'eleventh attempt denied');
check(run('select attempts=10 and held_microusd=1000000 from medical_demo_authorization')==='t','USD1 holds exhausted without refunds');
run('update medical_demo_authorization set attempts=0,active_attempt=NULL;');
check(reserve().allowed===false,'budget denies independently of attempts');
run("update medical_demo_authorization set held_microusd=0, ends_at=clock_timestamp()-interval '1 second'");
check(reserve().allowed===false,'expired UTC window denies');
run("update medical_demo_authorization set ends_at=clock_timestamp()+interval '30 minutes';update medical_ai_quota_reservations set reserved_at=clock_timestamp()-interval '2 minutes'");
const pending=reserve();check(pending.allowed===true,'reserved before disable');
deny(`set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);select medical_demo_disable('unauthorized')`,'unauthorized operator denied');
run(caller+"select medical_demo_disable('operator-test-disable')");
check(run(caller+`select medical_demo_dispatch('${pending.attemptId}','${sha}','${nonce}')`).split('\n').at(-1)==='f','operator disable prevents pending dispatch');
check(reserve().allowed===false,'operator disable immediately denies without deployment');
run(`BEGIN;${rollback}COMMIT;`);run(`BEGIN;${rollback}COMMIT;`);
deny(caller+`select medical_demo_reserve('${sha}','${nonce}')`,'retaining disable revokes reserve');
check(run('select count(*)>0 from medical_demo_attempts')==='t','rollback retains audit attempts');
check(run('select count(*)=0 from medical_advisor_review_events')==='t','persistent reviews remain empty');
check(run('select (select count(*) from medical_v3_fixture_sources)=1 and (select count(*) from medical_v3_fixture_observations)=2 and (select count(*) from medical_v3_fixture_receipts)=2')==='t','fixtures byte-source scope unchanged');
console.log(`Synthetic activation guard: ${n} disposable SQL assertions passed; no production execution.`);
