-- P36.8A Ground Medical read-only RPC scenarios (disposable PostgreSQL only; synthetic identities from fv01-setup.sql).
\set ON_ERROR_STOP 1
create schema p368t;
grant usage on schema p368t to authenticated, anon;
create function p368t.as_uid(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid,''), true) $$;
create function p368t.list_n(uid text, mission text) returns bigint language plpgsql as $$
begin perform p368t.as_uid(uid);
  return (select count(*) from public.p368_list_ground_medical_pending(mission)); end $$;
create function p368t.detail_n(uid text, mission text, b uuid) returns bigint language plpgsql as $$
begin perform p368t.as_uid(uid);
  return (select count(*) from public.p368_get_ground_medical_batch(mission, b)); end $$;
create function p368t.expect_fail(label text, stmt text, pat text) returns void language plpgsql as $$
begin begin execute stmt; exception when others then
  if sqlerrm ~* pat then raise notice 'PASS: % (%)', label, sqlerrm; return; end if;
  raise exception 'FAIL: % wrong error: %', label, sqlerrm; end;
  raise exception 'FAIL: % unexpectedly succeeded', label; end $$;
create function p368t.ok(label text, cond boolean) returns void language plpgsql as $$
begin if cond then raise notice 'PASS: %', label; else raise exception 'FAIL: %', label; end if; end $$;
create table p368t.ctx(k text primary key, v text);
grant all on p368t.ctx to authenticated, anon;
grant execute on all functions in schema p368t to authenticated, anon;

-- Fixture: one synthetic pending batch (2 items) submitted by Crew Self b1 in m1.
set role authenticated;
do $$ declare r jsonb; begin
  perform p368t.as_uid('00000000-0000-0000-0000-0000000000b1');
  r := public.p36_submit_synthetic_review_batch('m1','c1','2026-10-01','synthetic.pdf',repeat('a',64),
    jsonb_build_array(
      jsonb_build_object('metricId','cv-001','value','72','unit','bpm','sourceExcerpt','Synthetic cv-001: 72 bpm'),
      jsonb_build_object('metricId','cv-003','value','70','unit','bpm','sourceExcerpt','Synthetic cv-003: 70 bpm')),
    'key-p368-aaaaaaaaaaa1', true);
  insert into p368t.ctx values ('batch', r->>'batchId');
end $$;
reset role;
create table p368t.before as select
  (select count(*) from public.p36_biomarker_review_batches) b,
  (select count(*) from public.p36_biomarker_review_items) i,
  (select count(*) from public.p36_biomarker_review_events) e,
  (select count(*) from public.audit_events) a,
  (select string_agg(id::text||status, ',' order by id) from public.p36_biomarker_review_batches) s;

set role authenticated;
do $$
declare gm text := '00000000-0000-0000-0000-0000000000a2';
        bid uuid := (select v::uuid from p368t.ctx where k='batch');
begin
  perform p368t.ok('G1 active independent Ground Medical lists the pending batch with item count 2',
    p368t.list_n(gm,'m1') = 1 and (select item_count from public.p368_list_ground_medical_pending('m1')) = 2);
  perform p368t.ok('G2 Ground Medical reads exact values read-only',
    p368t.detail_n(gm,'m1',bid) = 2
    and (select string_agg(metric_id||'='||measured_value||unit, ',' order by metric_id) from public.p368_get_ground_medical_batch('m1',bid))
        = 'cv-001=72bpm,cv-003=70bpm');
  perform p368t.expect_fail('G3 no authenticated identity denied (list)', $s$select p368t.list_n(null,'m1')$s$, 'access denied');
  perform p368t.expect_fail('G4 Crew Self submitter denied (list)', $s$select p368t.list_n('00000000-0000-0000-0000-0000000000b1','m1')$s$, 'access denied');
  perform p368t.expect_fail('G5 Crew Self submitter denied (detail)', format($s$select p368t.detail_n('00000000-0000-0000-0000-0000000000b1','m1',%L)$s$, bid), 'access denied');
  perform p368t.expect_fail('G6 Mission Operator denied', $s$select p368t.list_n('00000000-0000-0000-0000-0000000000a1','m1')$s$, 'access denied');
  perform p368t.expect_fail('G7 Researcher denied', $s$select p368t.list_n('00000000-0000-0000-0000-0000000000a3','m1')$s$, 'access denied');
  perform p368t.expect_fail('G8 cross-mission Ground Medical access denied (m2)', $s$select p368t.list_n('00000000-0000-0000-0000-0000000000a2','m2')$s$, 'access denied');
  perform p368t.expect_fail('G9 cross-mission detail denied (m2 + m1 batch id)', format($s$select p368t.detail_n('00000000-0000-0000-0000-0000000000a2','m2',%L)$s$, bid), 'access denied');
  perform p368t.ok('G10 unknown batch id returns no rows', p368t.detail_n(gm,'m1','00000000-0000-0000-0000-000000000000') = 0);
end $$;
reset role;

-- Self-review fixture: a batch whose submitter snapshot is the Ground Medical user (triggers bypassed in disposable DB only).
set session_replication_role = replica;
insert into public.p36_biomarker_review_batches(mission_id, crew_member_id, submitted_by_membership_id, submitted_by_user_snapshot,
  source_fingerprint, source_filename, observation_date)
select 'm1','c1', mm.id, mm.user_id, repeat('b',64), 'self.pdf', '2026-10-02'
from public.mission_memberships mm where mm.mission_id='m1' and mm.role='ground_medical';
insert into p368t.ctx select 'self', id::text from public.p36_biomarker_review_batches where source_fingerprint = repeat('b',64);
set session_replication_role = origin;

set role authenticated;
do $$ declare gm text := '00000000-0000-0000-0000-0000000000a2';
        sid uuid := (select v::uuid from p368t.ctx where k='self');
begin
  perform p368t.ok('G11 self-submitted batch excluded from own queue (still 1)', p368t.list_n(gm,'m1') = 1);
  perform p368t.ok('G12 self-submitted batch detail returns no rows', p368t.detail_n(gm,'m1',sid) = 0);
end $$;
reset role;

set role anon;
do $$ begin
  perform p368t.expect_fail('G13 anon cannot execute list RPC', $s$select * from public.p368_list_ground_medical_pending('m1')$s$, 'permission denied');
  perform p368t.expect_fail('G14 anon cannot execute detail RPC', $s$select * from public.p368_get_ground_medical_batch('m1','00000000-0000-0000-0000-000000000000')$s$, 'permission denied');
end $$;
reset role;
set role authenticated;
do $$ begin
  perform p368t.expect_fail('G15 direct batch table read still denied', $s$select count(*) from public.p36_biomarker_review_batches$s$, 'permission denied');
  perform p368t.expect_fail('G16 direct item table read still denied', $s$select count(*) from public.p36_biomarker_review_items$s$, 'permission denied');
end $$;
reset role;

-- Revocation (disposable DB only): deactivate the Ground Medical membership.
update public.mission_memberships set active = false where mission_id='m1' and role='ground_medical';
set role authenticated;
do $$ begin
  perform p368t.expect_fail('G17 revoked Ground Medical denied (list)', $s$select p368t.list_n('00000000-0000-0000-0000-0000000000a2','m1')$s$, 'access denied');
  perform p368t.expect_fail('G18 revoked Ground Medical denied (detail)', format($s$select p368t.detail_n('00000000-0000-0000-0000-0000000000a2','m1',%L)$s$, (select v from p368t.ctx where k='batch')), 'access denied');
end $$;
reset role;

do $$ begin
  perform p368t.ok('G19 reads changed no batches, items, statuses, decisions or audit records (excluding self fixture)',
    (select (b+1, i, e, a) from p368t.before) = (select ((select count(*) from public.p36_biomarker_review_batches),
      (select count(*) from public.p36_biomarker_review_items),(select count(*) from public.p36_biomarker_review_events),
      (select count(*) from public.audit_events)))
    and (select bool_and(status='pending_review') from public.p36_biomarker_review_batches));
  perform p368t.ok('G20 both RPCs security definer, pinned search_path, execute only authenticated',
    (select bool_and(prosecdef and proconfig @> array['search_path=public, pg_temp']) from pg_proc where proname like 'p368_%')
    and has_function_privilege('authenticated','public.p368_list_ground_medical_pending(text)','execute')
    and not has_function_privilege('anon','public.p368_list_ground_medical_pending(text)','execute')
    and not has_function_privilege('anon','public.p368_get_ground_medical_batch(text,uuid)','execute'));
end $$;
select 'P368A DONE';
