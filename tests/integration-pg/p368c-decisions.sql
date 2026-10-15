-- P36.8C governed research-decision scenarios (disposable PostgreSQL only; synthetic identities from fv01-setup.sql).
\set ON_ERROR_STOP 1
create schema p368ct;
grant usage on schema p368ct to authenticated, anon;
create function p368ct.as_uid(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid,''), true) $$;
create function p368ct.decide(uid text, mission text, b uuid, decision text, note text, k text, n int) returns jsonb
language plpgsql as $$ begin perform p368ct.as_uid(uid);
  return public.p368_decide_ground_medical_batch(mission, b, decision, note, k, n); end $$;
create function p368ct.sub(uid text, crew text, sha text, k text, d date) returns uuid language plpgsql as $$
declare r jsonb; begin perform p368ct.as_uid(uid);
  r := public.p36_submit_synthetic_review_batch('m1', crew, d, 'synthetic.pdf', repeat(sha,64),
    jsonb_build_array(
      jsonb_build_object('metricId','cv-001','value','72','unit','bpm','sourceExcerpt','Synthetic cv-001: 72 bpm'),
      jsonb_build_object('metricId','cv-003','value','70','unit','bpm','sourceExcerpt','Synthetic cv-003: 70 bpm')),
    k, true);
  return (r->>'batch_id')::uuid; end $$;
create function p368ct.expect_fail(label text, stmt text, pat text) returns void language plpgsql as $$
begin begin execute stmt; exception when others then
  if sqlerrm ~* pat then raise notice 'PASS: % (%)', label, sqlerrm; return; end if;
  raise exception 'FAIL: % wrong error: %', label, sqlerrm; end;
  raise exception 'FAIL: % unexpectedly succeeded', label; end $$;
create function p368ct.ok(label text, cond boolean) returns void language plpgsql as $$
begin if cond then raise notice 'PASS: %', label; else raise exception 'FAIL: %', label; end if; end $$;
create table p368ct.ctx(k text primary key, v text);
grant all on p368ct.ctx to authenticated, anon;
grant execute on all functions in schema p368ct to authenticated, anon;

-- Second independent Ground Medical reviewer in m1 (disposable fixture only).
insert into public.mission_memberships(mission_id, user_id, crew_member_id, role, active)
  values ('m1','00000000-0000-0000-0000-0000000000a4',null,'ground_medical',true);

set role authenticated;
do $$ begin
  insert into p368ct.ctx values
    ('acc', p368ct.sub('00000000-0000-0000-0000-0000000000b1','c1','1','key-p368c-acc-aaaaaa','2026-10-01')::text),
    ('rej', p368ct.sub('00000000-0000-0000-0000-0000000000b1','c1','2','key-p368c-rej-aaaaaa','2026-10-01')::text),
    ('rev', p368ct.sub('00000000-0000-0000-0000-0000000000b2','c2','3','key-p368c-rev-aaaaaa','2026-10-01')::text),
    ('cc',  p368ct.sub('00000000-0000-0000-0000-0000000000b1','c1','4','key-p368c-cc0-aaaaaa','2026-10-01')::text),
    ('rv1', p368ct.sub('00000000-0000-0000-0000-0000000000b1','c1','5','key-p368c-rv1-aaaaaa','2026-10-01')::text),
    ('rv2', p368ct.sub('00000000-0000-0000-0000-0000000000b1','c1','6','key-p368c-rv2-aaaaaa','2026-10-01')::text),
    ('misc', p368ct.sub('00000000-0000-0000-0000-0000000000b1','c1','7','key-p368c-msc-aaaaaa','2026-10-01')::text);
end $$;
reset role;
create table p368ct.items_before as
  select batch_id, metric_id, measured_value, unit, source_excerpt, disposition from public.p36_biomarker_review_items;
create table p368ct.clinical_before as select
  (select count(*) from public.mission_events) me, (select count(*) from public.crew_health_record_index) hi;

set role authenticated;
do $$
declare gm text := '00000000-0000-0000-0000-0000000000a2';
  acc uuid := (select v::uuid from p368ct.ctx where k='acc');
  rej uuid := (select v::uuid from p368ct.ctx where k='rej');
  r jsonb; r2 jsonb;
begin
  r := p368ct.decide(gm,'m1',acc,'accepted_for_research','Synthetic demo looks consistent','key-dec-acc-aaaaaaaa',2);
  insert into p368ct.ctx values ('acc_receipt', r->>'decision_request_id');
  perform p368ct.ok('D1 independent Ground Medical accepts for research; receipt returned, replay=false',
    r->>'decision' = 'accepted_for_research' and (r->>'replay')::boolean = false and r ? 'decision_request_id'
    and (select array_agg(k order by k) from jsonb_object_keys(r) k) = array['batch_id','decided_at','decision','decision_request_id','replay']);
  r2 := p368ct.decide(gm,'m1',acc,'accepted_for_research','Synthetic demo looks consistent','key-dec-acc-aaaaaaaa',2);
  perform p368ct.ok('D2 idempotent replay returns the identical receipt with replay=true',
    (r2->>'replay')::boolean and r2->>'decision_request_id' = r->>'decision_request_id' and r2->>'decided_at' = r->>'decided_at');
  perform p368ct.expect_fail('D3 same key with a different payload refused',
    format($s$select p368ct.decide(%L,'m1',%L,'rejected_for_research',null,'key-dec-acc-aaaaaaaa',2)$s$, gm, acc), 'reused with a different decision');
  perform p368ct.expect_fail('D4 already decided batch refused with a new key',
    format($s$select p368ct.decide(%L,'m1',%L,'rejected_for_research',null,'key-dec-acc-bbbbbbbb',2)$s$, gm, acc), 'already_decided');
  perform p368ct.expect_fail('D5 second reviewer cannot overturn a terminal decision',
    format($s$select p368ct.decide('00000000-0000-0000-0000-0000000000a4','m1',%L,'rejected_for_research',null,'key-dec-acc-cccccccc',2)$s$, acc), 'already_decided');
  r := p368ct.decide(gm,'m1',rej,'rejected_for_research',null,'key-dec-rej-aaaaaaaa',2);
  perform p368ct.ok('D6 independent Ground Medical rejects for research', r->>'decision' = 'rejected_for_research');
end $$;
reset role;

do $$ declare acc uuid := (select v::uuid from p368ct.ctx where k='acc');
  rej uuid := (select v::uuid from p368ct.ctx where k='rej');
begin
  perform p368ct.ok('D7 exactly one event per decided batch, event matches batch receipt/reviewer/status',
    (select count(*) from public.p36_biomarker_review_events where batch_id in (acc,rej)) = 2
    and (select bool_and(e.event_type = b.status and e.resulting_status = b.status and e.previous_status='pending_review'
          and e.decision_request_id = b.decision_request_id and e.reviewer_membership_id = b.reviewed_by_membership_id
          and e.server_received_at = b.decision_received_at and e.authorization_basis='locked_independent_ground_medical_membership')
         from public.p36_biomarker_review_events e join public.p36_biomarker_review_batches b on b.id=e.batch_id
         where b.id in (acc,rej)));
  perform p368ct.ok('D8 receipt in batch equals receipt returned to the caller',
    (select decision_request_id::text from public.p36_biomarker_review_batches where id=acc) = (select v from p368ct.ctx where k='acc_receipt'));
  perform p368ct.ok('D9 one privacy-safe audit row per decision (no note, values, excerpts or filename)',
    (select count(*) from public.audit_events where action='p36.review_decision' and target_id in (acc::text,rej::text)) = 2
    and not exists (select 1 from public.audit_events where action='p36.review_decision'
      and (metadata::text ~* 'consistent|cv-00|bpm|synthetic\.pdf|excerpt|note|measured')));
  perform p368ct.ok('D10 replay and refusals created no extra events or audit rows',
    (select count(*) from public.p36_biomarker_review_events) = 2
    and (select count(*) from public.audit_events where action='p36.review_decision') = 2);
  perform p368ct.ok('D11 decided batches leave the P36.8A pending queue', true);
end $$;

set role authenticated;
do $$ begin
  perform p368ct.as_uid('00000000-0000-0000-0000-0000000000a2');
  perform p368ct.ok('D12 P36.8A queue no longer lists decided batches',
    not exists (select 1 from public.p368_list_ground_medical_pending('m1') q
      where q.batch_id in (select v::uuid from p368ct.ctx where k in ('acc','rej'))));
end $$;
reset role;

-- Role, scope and input refusals.
set role authenticated;
do $$ declare b uuid := (select v::uuid from p368ct.ctx where k='misc');
  gm text := '00000000-0000-0000-0000-0000000000a2';
begin
  perform p368ct.expect_fail('D13 unauthenticated identity denied', format($s$select p368ct.decide(null,'m1',%L,'accepted_for_research',null,'key-dec-x01-aaaaaaaa',2)$s$, b), 'access denied');
  perform p368ct.expect_fail('D14 Crew Self submitter denied', format($s$select p368ct.decide('00000000-0000-0000-0000-0000000000b1','m1',%L,'accepted_for_research',null,'key-dec-x02-aaaaaaaa',2)$s$, b), 'access denied');
  perform p368ct.expect_fail('D15 Mission Operator denied', format($s$select p368ct.decide('00000000-0000-0000-0000-0000000000a1','m1',%L,'accepted_for_research',null,'key-dec-x03-aaaaaaaa',2)$s$, b), 'access denied');
  perform p368ct.expect_fail('D16 Researcher denied', format($s$select p368ct.decide('00000000-0000-0000-0000-0000000000a3','m1',%L,'accepted_for_research',null,'key-dec-x04-aaaaaaaa',2)$s$, b), 'access denied');
  perform p368ct.expect_fail('D17 cross-mission (no Ground Medical role in m2) denied', format($s$select p368ct.decide(%L,'m2',%L,'accepted_for_research',null,'key-dec-x05-aaaaaaaa',2)$s$, gm, b), 'access denied');
  perform p368ct.expect_fail('D18 clinical-style decision value refused', format($s$select p368ct.decide(%L,'m1',%L,'approved',null,'key-dec-x06-aaaaaaaa',2)$s$, gm, b), 'invalid decision');
  perform p368ct.expect_fail('D19 oversize note refused', format($s$select p368ct.decide(%L,'m1',%L,'accepted_for_research',repeat('x',501),'key-dec-x07-aaaaaaaa',2)$s$, gm, b), 'at most 500');
  perform p368ct.expect_fail('D20 control characters in note refused', format($s$select p368ct.decide(%L,'m1',%L,'accepted_for_research',E'a\x01b','key-dec-x08-aaaaaaaa',2)$s$, gm, b), 'plain text');
  perform p368ct.expect_fail('D21 stale item count refused', format($s$select p368ct.decide(%L,'m1',%L,'accepted_for_research',null,'key-dec-x09-aaaaaaaa',3)$s$, gm, b), 'stale view');
  perform p368ct.expect_fail('D22 malformed idempotency key refused', format($s$select p368ct.decide(%L,'m1',%L,'accepted_for_research',null,'short',2)$s$, gm, b), 'idempotency key');
  perform p368ct.expect_fail('D23 unknown batch refused', format($s$select p368ct.decide(%L,'m1','00000000-0000-0000-0000-000000000000','accepted_for_research',null,'key-dec-x10-aaaaaaaa',2)$s$, gm), 'not available');
  perform p368ct.ok('D24 refusals left the batch pending with no receipt',
    true);
end $$;
reset role;
do $$ begin
  perform p368ct.ok('D24b refused batch still pending, unreviewed, no event',
    (select status='pending_review' and reviewed_by_membership_id is null and decision_request_id is null
       from public.p36_biomarker_review_batches where id=(select v::uuid from p368ct.ctx where k='misc'))
    and not exists (select 1 from public.p36_biomarker_review_events where batch_id=(select v::uuid from p368ct.ctx where k='misc')));
end $$;

set role anon;
do $$ begin
  perform p368ct.expect_fail('D25 anon cannot execute decision RPC',
    $s$select public.p368_decide_ground_medical_batch('m1','00000000-0000-0000-0000-000000000000','accepted_for_research',null,'key-dec-x11-aaaaaaaa',2)$s$, 'permission denied');
end $$;
reset role;

-- Self-review via a second membership of the same user (role trigger bypassed in disposable DB only).
set session_replication_role = replica;
insert into public.mission_memberships(mission_id, user_id, crew_member_id, role, active)
  values ('m1','00000000-0000-0000-0000-0000000000a2','c3','crew_self',true);
insert into public.p36_biomarker_review_batches(mission_id, crew_member_id, submitted_by_membership_id, submitted_by_user_snapshot,
  source_fingerprint, source_filename, observation_date)
select 'm1','c3', mm.id, mm.user_id, repeat('9',64), 'self.pdf', '2026-10-01'
from public.mission_memberships mm where mm.mission_id='m1' and mm.role='crew_self' and mm.user_id='00000000-0000-0000-0000-0000000000a2';
insert into public.p36_biomarker_review_items(batch_id, metric_id, measured_value, unit, source_excerpt)
  select id, 'cv-001', 72, 'bpm', 'Synthetic' from public.p36_biomarker_review_batches where source_fingerprint=repeat('9',64);
insert into p368ct.ctx select 'self', id::text from public.p36_biomarker_review_batches where source_fingerprint=repeat('9',64);
set session_replication_role = origin;
set role authenticated;
do $$ begin
  perform p368ct.expect_fail('D26 self-review via another membership of the same user refused',
    format($s$select p368ct.decide('00000000-0000-0000-0000-0000000000a2','m1',%L,'accepted_for_research',null,'key-dec-slf-aaaaaaaa',1)$s$, (select v from p368ct.ctx where k='self')), 'self-review');
end $$;
reset role;

-- Revoked submitter: research decision refused; existing quarantine path still works; then terminal.
update public.mission_memberships set active=false where mission_id='m1' and role='crew_self' and user_id='00000000-0000-0000-0000-0000000000b2';
set role authenticated;
do $$ begin
  perform p368ct.expect_fail('D27 decision on a revoked submitter''s batch refused (quarantine path applies)',
    format($s$select p368ct.decide('00000000-0000-0000-0000-0000000000a2','m1',%L,'accepted_for_research',null,'key-dec-rvk-aaaaaaaa',2)$s$, (select v from p368ct.ctx where k='rev')), 'active crew_self submitter');
end $$;
reset role;
update public.p36_biomarker_review_batches set status='quarantined',
  reviewed_by_membership_id=(select id from public.mission_memberships where mission_id='m1' and role='ground_medical' and user_id='00000000-0000-0000-0000-0000000000a2'),
  reviewed_by_user_snapshot='00000000-0000-0000-0000-0000000000a2', reviewed_at=now()
  where id=(select v::uuid from p368ct.ctx where k='rev');
do $$ begin
  perform p368ct.ok('D28 existing B10 quarantine path still works and records one quarantine event',
    (select count(*) from public.p36_biomarker_review_events where batch_id=(select v::uuid from p368ct.ctx where k='rev') and event_type='quarantined') = 1);
end $$;
set role authenticated;
do $$ begin
  perform p368ct.expect_fail('D29 quarantined batch cannot receive a research decision',
    format($s$select p368ct.decide('00000000-0000-0000-0000-0000000000a2','m1',%L,'accepted_for_research',null,'key-dec-qtn-aaaaaaaa',2)$s$, (select v from p368ct.ctx where k='rev')), 'already_decided');
end $$;
reset role;

-- Direct-write denials (privileged writer without the RPC, then browser roles).
do $$ declare b uuid := (select v::uuid from p368ct.ctx where k='misc');
  gmm uuid := (select id from public.mission_memberships where mission_id='m1' and role='ground_medical' and user_id='00000000-0000-0000-0000-0000000000a2');
begin
  perform p368ct.expect_fail('D30 privileged direct decision UPDATE without the RPC refused',
    format($s$update public.p36_biomarker_review_batches set status='accepted_for_research', reviewed_by_membership_id=%L,
      reviewed_by_user_snapshot='00000000-0000-0000-0000-0000000000a2', reviewed_at=now(),
      decision_idempotency_key='key-direct-aaaaaaaaaa', decision_payload_hash=repeat('a',64) where id=%L$s$, gmm, b), 'governed decision RPC');
  perform set_config('p36.decision_rpc','on',true);
  perform p368ct.expect_fail('D31 legacy approved status unreachable even with the session flag',
    format($s$update public.p36_biomarker_review_batches set status='approved', reviewed_by_membership_id=%L,
      reviewed_by_user_snapshot='00000000-0000-0000-0000-0000000000a2', reviewed_at=now() where id=%L$s$, gmm, b), 'provenance is immutable');
  perform p368ct.expect_fail('D32 decision without idempotency evidence refused even with the flag',
    format($s$update public.p36_biomarker_review_batches set status='rejected_for_research', reviewed_by_membership_id=%L,
      reviewed_by_user_snapshot='00000000-0000-0000-0000-0000000000a2', reviewed_at=now() where id=%L$s$, gmm, b), 'idempotency evidence|p36_decision');
  perform set_config('p36.decision_rpc','off',true);
  perform p368ct.expect_fail('D33 terminal decision cannot be changed', format($s$update public.p36_biomarker_review_batches set review_note='edit' where id=%L$s$,
    (select v from p368ct.ctx where k='acc')), 'immutable');
  perform p368ct.expect_fail('D34 direct forged event insert refused',
    format($s$insert into public.p36_biomarker_review_events(batch_id,mission_id,event_type,previous_status,resulting_status,reviewer_membership_id,reviewer_user_snapshot,
      submitter_membership_id,submitter_user_snapshot,source_fingerprint,decision_request_id,server_received_at,authorization_basis)
      select id,mission_id,'accepted_for_research','pending_review','accepted_for_research',%L,'00000000-0000-0000-0000-0000000000a2',submitted_by_membership_id,
      submitted_by_user_snapshot,source_fingerprint,gen_random_uuid(),now(),'locked_independent_ground_medical_membership'
      from public.p36_biomarker_review_batches where id=%L$s$, gmm, b), 'originate from batch transition|one_per_batch');
  perform p368ct.expect_fail('D35 decision event update refused', 'update public.p36_biomarker_review_events set decision_note=''x''', 'append-only');
  perform p368ct.expect_fail('D36 decision event delete refused', 'delete from public.p36_biomarker_review_events', 'append-only');
  perform p368ct.expect_fail('D37 submitted item update refused', 'update public.p36_biomarker_review_items set measured_value = measured_value + 1', 'immutable');
  perform p368ct.expect_fail('D38 submitted item delete refused (new 0010 trigger)', 'delete from public.p36_biomarker_review_items', 'immutable');
end $$;
set role authenticated;
do $$ begin
  perform p368ct.expect_fail('D39 browser role cannot read batches', 'select count(*) from public.p36_biomarker_review_batches', 'permission denied');
  perform p368ct.expect_fail('D40 browser role cannot update batches', 'update public.p36_biomarker_review_batches set status=''accepted_for_research''', 'permission denied');
  perform p368ct.expect_fail('D41 browser role cannot read events', 'select count(*) from public.p36_biomarker_review_events', 'permission denied');
  perform p368ct.expect_fail('D42 browser role cannot insert events', 'insert into public.p36_biomarker_review_events(batch_id) values (gen_random_uuid())', 'permission denied');
  perform p368ct.expect_fail('D43 browser role cannot delete items', 'delete from public.p36_biomarker_review_items', 'permission denied');
end $$;
reset role;

do $$ begin
  perform p368ct.ok('D44 submitted values byte-identical after all decisions and refusals',
    not exists (select * from p368ct.items_before except select batch_id, metric_id, measured_value, unit, source_excerpt, disposition from public.p36_biomarker_review_items)
    and not exists (select batch_id, metric_id, measured_value, unit, source_excerpt, disposition from public.p36_biomarker_review_items
      where batch_id <> (select v::uuid from p368ct.ctx where k='self') except select * from p368ct.items_before));
  perform p368ct.ok('D45 no promotion into mission_events or crew_health_record_index',
    (select (me, hi) from p368ct.clinical_before) = ((select count(*) from public.mission_events), (select count(*) from public.crew_health_record_index)));
  perform p368ct.ok('D46 decision RPC: security definer, pinned search_path, authenticated only',
    (select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where proname='p368_decide_ground_medical_batch')
    and has_function_privilege('authenticated','public.p368_decide_ground_medical_batch(text,uuid,text,text,text,integer)','execute')
    and not has_function_privilege('anon','public.p368_decide_ground_medical_batch(text,uuid,text,text,text,integer)','execute'));
  perform p368ct.ok('D47 P36 tables keep forced RLS and no browser grants',
    (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relname in
      ('p36_biomarker_review_batches','p36_biomarker_review_items','p36_biomarker_review_events','p36_metric_unit_catalog'))
    and not exists (select 1 from information_schema.role_table_grants where table_name like 'p36_%' and grantee in ('anon','authenticated')));
  perform p368ct.ok('D48 no batch ever reached the legacy approved/rejected statuses',
    not exists (select 1 from public.p36_biomarker_review_batches where status in ('approved','rejected')));
end $$;
select 'P368C DONE';
