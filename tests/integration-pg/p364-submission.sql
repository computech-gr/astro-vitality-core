-- P36.4 synthetic submission scenarios (disposable PostgreSQL only; synthetic identities from fv01-setup.sql).
\set ON_ERROR_STOP 1
create schema p364t;
grant usage on schema p364t to authenticated, anon;
create function p364t.it(m text default 'cv-001', u text default 'bpm', v text default '72') returns jsonb
language sql as $$ select jsonb_build_array(jsonb_build_object('metricId',m,'value',v,'unit',u,'sourceExcerpt','Synthetic '||m||': '||v||' '||u)) $$;
create function p364t.sub(uid text, mission text, crew text, sha text, k text, items jsonb,
  d date default '2026-10-01', att boolean default true, fname text default 'synthetic.pdf') returns jsonb
language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', coalesce(uid,''), true);
  return public.p36_submit_synthetic_review_batch(mission, crew, d, fname, sha, items, k, att);
end $$;
create function p364t.expect_fail(label text, stmt text, pat text) returns void language plpgsql as $$
begin begin execute stmt; exception when others then
  if sqlerrm ~* pat then raise notice 'PASS: % (%)', label, sqlerrm; return; end if;
  raise exception 'FAIL: % wrong error: %', label, sqlerrm; end;
  raise exception 'FAIL: % unexpectedly succeeded', label; end $$;
grant execute on all functions in schema p364t to authenticated, anon;
create table p364t.out(k text primary key, v jsonb);
grant all on p364t.out to authenticated;

\set B1 '''00000000-0000-0000-0000-0000000000b1'''
\set B2 '''00000000-0000-0000-0000-0000000000b2'''
set role authenticated;
insert into p364t.out select 's1', p364t.sub(:B1,'m1','c1',repeat('a',64),'key-s1-aaaaaaaaaaaa',p364t.it());
insert into p364t.out select 's2', p364t.sub(:B1,'m1','c1',repeat('a',64),'key-s1-aaaaaaaaaaaa',p364t.it());
do $$ begin
 perform p364t.expect_fail('S3 idempotency key reused with different payload refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('a',64),'key-s1-aaaaaaaaaaaa',p364t.it(v=>'73'))$s$, 'different payload');
 perform p364t.expect_fail('S4 duplicate source SHA-256 + date under a new key refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('a',64),'key-s4-aaaaaaaaaaaa',p364t.it(v=>'73'))$s$, 'duplicate synthetic submission');
 perform p364t.expect_fail('S5a Crew Self cannot submit for another crew member (b1->c2)',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c2',repeat('b',64),'key-s5a-aaaaaaaaaaa',p364t.it())$s$, 'active crew_self membership');
 perform p364t.expect_fail('S5b Crew Self cannot submit for another crew member (b2->c1)',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b2','m1','c1',repeat('b',64),'key-s5b-aaaaaaaaaaa',p364t.it())$s$, 'active crew_self membership');
 perform p364t.expect_fail('S6a cross-mission: b1 into m2/c4 refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m2','c4',repeat('b',64),'key-s6a-aaaaaaaaaaa',p364t.it())$s$, 'active crew_self membership');
 perform p364t.expect_fail('S6b cross-mission: b4 (m2) into m1/c1 refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b4','m1','c1',repeat('b',64),'key-s6b-aaaaaaaaaaa',p364t.it())$s$, 'active crew_self membership');
 perform p364t.expect_fail('S7a Ground Medical cannot submit',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000a2','m1','c1',repeat('b',64),'key-s7a-aaaaaaaaaaa',p364t.it())$s$, 'active crew_self membership');
 perform p364t.expect_fail('S7b Researcher cannot submit',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000a3','m1','c1',repeat('b',64),'key-s7b-aaaaaaaaaaa',p364t.it())$s$, 'active crew_self membership');
 perform p364t.expect_fail('S7c Mission Operator cannot submit',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000a1','m1','c1',repeat('b',64),'key-s7c-aaaaaaaaaaa',p364t.it())$s$, 'active crew_self membership');
 perform p364t.expect_fail('S8a unknown metric refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8a-aaaaaaaaaaa',p364t.it(m=>'cv-999'))$s$, 'exact catalog');
 perform p364t.expect_fail('S8b wrong-case unit refused (no conversion)',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8b-aaaaaaaaaaa',p364t.it(u=>'BPM'))$s$, 'exact catalog');
 perform p364t.expect_fail('S8c alternative unit refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8c-aaaaaaaaaaa',p364t.it(u=>'beats/min'))$s$, 'exact catalog');
 perform p364t.expect_fail('S8d range value refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8d-aaaaaaaaaaa',p364t.it(v=>'60-80'))$s$, 'plain decimal');
 perform p364t.expect_fail('S8e comparator value refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8e-aaaaaaaaaaa',p364t.it(v=>'<5'))$s$, 'plain decimal');
 perform p364t.expect_fail('S8f duplicate metric in one batch refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8f-aaaaaaaaaaa',p364t.it() || p364t.it(v=>'80'))$s$, 'duplicate metric');
 perform p364t.expect_fail('S8g extra observation field refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8g-aaaaaaaaaaa',jsonb_build_array(p364t.it()->0 || '{"interpretation":"normal"}'))$s$, 'shape is invalid');
 perform p364t.expect_fail('S8h empty batch refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8h-aaaaaaaaaaa','[]'::jsonb)$s$, 'between 1 and 100');
 perform p364t.expect_fail('S8i more than 100 observations refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s8i-aaaaaaaaaaa',(select jsonb_agg(p364t.it()->0) from generate_series(1,101)))$s$, 'between 1 and 100');
 perform p364t.expect_fail('S9a missing synthetic attestation refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s9a-aaaaaaaaaaa',p364t.it(),att=>false)$s$, 'synthetic-only');
 perform p364t.expect_fail('S9b malformed SHA-256 refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1','ABC','key-s9b-aaaaaaaaaaa',p364t.it())$s$, 'SHA-256');
 perform p364t.expect_fail('S9c future observation date refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s9c-aaaaaaaaaaa',p364t.it(),d=>current_date+1)$s$, 'valid observation date');
 perform p364t.expect_fail('S9d path-like filename refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'key-s9d-aaaaaaaaaaa',p364t.it(),fname=>'../x.pdf')$s$, 'filename');
 perform p364t.expect_fail('S9e short idempotency key refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m1','c1',repeat('b',64),'short',p364t.it())$s$, 'idempotency key');
 perform p364t.expect_fail('S10a authenticated role without a user id refused',
   $s$select p364t.sub(null,'m1','c1',repeat('b',64),'key-s10a-aaaaaaaaaa',p364t.it())$s$, 'authenticated user');
 perform p364t.expect_fail('S11a browser role cannot read batches', 'select * from public.p36_biomarker_review_batches', 'permission denied');
 perform p364t.expect_fail('S11b browser role cannot insert batches', $s$insert into public.p36_biomarker_review_batches(mission_id) values ('m1')$s$, 'permission denied');
 perform p364t.expect_fail('S11c browser role cannot read items', 'select * from public.p36_biomarker_review_items', 'permission denied');
 perform p364t.expect_fail('S11d browser role cannot read catalog', 'select * from public.p36_metric_unit_catalog', 'permission denied');
end $$;
reset role;
set role anon;
do $$ begin
 perform p364t.expect_fail('S10b anon cannot execute the submission function',
   $s$select public.p36_submit_synthetic_review_batch('m1','c1','2026-10-01','s.pdf',repeat('b',64),'[]','key-anon-aaaaaaaaaa',true)$s$, 'permission denied');
end $$;
reset role;
do $$ declare s1 jsonb; s2 jsonb; n int; a record; begin
 select v into s1 from p364t.out where k='s1'; select v into s2 from p364t.out where k='s2';
 if s1->>'status' <> 'submitted' or (s1->>'item_count')::int <> 1 or s1->>'review_status' <> 'pending_review' then raise exception 'FAIL S1 %', s1; end if;
 raise notice 'PASS: S1 valid Crew Self synthetic submission creates one pending_review batch with one item';
 if s2->>'status' <> 'replayed' or s2->>'batch_id' <> s1->>'batch_id' then raise exception 'FAIL S2 %', s2; end if;
 select count(*) into n from p36_biomarker_review_batches where idempotency_key='key-s1-aaaaaaaaaaaa';
 if n <> 1 then raise exception 'FAIL S2 count %', n; end if;
 raise notice 'PASS: S2 identical retry is an idempotent replay of the same batch';
 select count(*) into n from p36_biomarker_review_batches; if n <> 1 then raise exception 'FAIL S12 refused attempts left rows: %', n; end if;
 select count(*) into n from p36_biomarker_review_items; if n <> 1 then raise exception 'FAIL S12 items %', n; end if;
 raise notice 'PASS: S12 every refused attempt left no batch or item rows';
 select count(*) into n from audit_events where action='p36_synthetic_batch_submitted'; if n <> 1 then raise exception 'FAIL S13 audit count %', n; end if;
 select * into a from audit_events where action='p36_synthetic_batch_submitted';
 if a.actor_user_id <> '00000000-0000-0000-0000-0000000000b1' or a.mission_id <> 'm1' or a.target_id <> s1->>'batch_id'
    or a.metadata->>'classification' <> 'synthetic' or a.metadata ? 'source_filename' or a.metadata::text ~ 'Synthetic cv-001|synthetic\.pdf|"72"' then
   raise exception 'FAIL S13 audit %', row_to_json(a); end if;
 raise notice 'PASS: S13 exactly one audit event (replay adds none) with actor, mission, batch, no filename/value/excerpt';
 if (select submitted_by_user_snapshot from p36_biomarker_review_batches where id=(s1->>'batch_id')::uuid) <> '00000000-0000-0000-0000-0000000000b1'
    or (select classification from p36_biomarker_review_batches where id=(s1->>'batch_id')::uuid) <> 'synthetic' then raise exception 'FAIL S14'; end if;
 raise notice 'PASS: S14 batch provenance = JWT user snapshot + membership; classification synthetic';
 perform p364t.expect_fail('S15a submitted items are immutable', 'update p36_biomarker_review_items set measured_value=1', 'immutable');
 perform p364t.expect_fail('S15b idempotency evidence immutable', $s$update p36_biomarker_review_batches set idempotency_key='key-zz-aaaaaaaaaaaaa'$s$, 'immutable');
end $$;
-- S16 revocation: inactive Crew Self refused
update mission_memberships set active=false where user_id='00000000-0000-0000-0000-0000000000b2' and mission_id='m1';
set role authenticated;
do $$ begin perform p364t.expect_fail('S16 revoked Crew Self membership refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b2','m1','c2',repeat('c',64),'key-s16-aaaaaaaaaaa',p364t.it())$s$, 'active crew_self membership'); end $$;
reset role;
update mission_memberships set active=true where user_id='00000000-0000-0000-0000-0000000000b2' and mission_id='m1';
-- S17 rollback: forced item failure leaves no batch and no audit event
alter table p36_biomarker_review_items add constraint zz_p364_force_fail check (source_excerpt <> 'force-fail');
set role authenticated;
do $$ begin perform p364t.expect_fail('S17 item failure aborts the whole submission',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b2','m1','c2',repeat('d',64),'key-s17-aaaaaaaaaaa','[{"metricId":"cv-001","value":"70","unit":"bpm","sourceExcerpt":"force-fail"}]')$s$, 'zz_p364_force_fail'); end $$;
reset role;
alter table p36_biomarker_review_items drop constraint zz_p364_force_fail;
do $$ begin
 if exists(select 1 from p36_biomarker_review_batches where idempotency_key='key-s17-aaaaaaaaaaa') or (select count(*) from audit_events where action='p36_synthetic_batch_submitted') <> 1 then raise exception 'FAIL S17b'; end if;
 raise notice 'PASS: S17b rollback left no batch and no audit event';
end $$;
-- S18 closed mission refused (m4: b1/c1 active, then completed)
update missions set status='completed' where id='m4';
set role authenticated;
do $$ begin perform p364t.expect_fail('S18 closed mission refused',
   $s$select p364t.sub('00000000-0000-0000-0000-0000000000b1','m4','c1',repeat('e',64),'key-s18-aaaaaaaaaaa',p364t.it())$s$, 'not open|closed|frozen'); end $$;
reset role;
-- S19 existing B10 quarantine path still works on a P36.4-submitted batch
set role authenticated;
insert into p364t.out select 's19', p364t.sub(:B2,'m1','c2',repeat('f',64),'key-s19-aaaaaaaaaaa',p364t.it('cv-002'));
reset role;
update mission_memberships set active=false where user_id='00000000-0000-0000-0000-0000000000b2' and mission_id='m1';
update p36_biomarker_review_batches set status='quarantined',
  reviewed_by_membership_id=(select id from mission_memberships where mission_id='m1' and user_id='00000000-0000-0000-0000-0000000000a2' and role='ground_medical'),
  reviewed_by_user_snapshot='00000000-0000-0000-0000-0000000000a2', reviewed_at=now(), review_note='synthetic'
  where id=((select v from p364t.out where k='s19')->>'batch_id')::uuid;
do $$ begin
 if (select count(*) from p36_biomarker_review_events) <> 1 then raise exception 'FAIL S19'; end if;
 raise notice 'PASS: S19 B10 quarantine + atomic evidence still work for a P36.4 submission';
end $$;
update mission_memberships set active=true where user_id='00000000-0000-0000-0000-0000000000b2' and mission_id='m1';
do $$ begin
 if exists(select 1 from information_schema.role_table_grants where table_name like 'p36_%' and grantee in ('anon','authenticated')) then raise exception 'FAIL S20'; end if;
 if has_function_privilege('anon','public.p36_submit_synthetic_review_batch(text,text,date,text,text,jsonb,text,boolean)','execute') then raise exception 'FAIL S20b'; end if;
 if not (select prosecdef from pg_proc where proname='p36_submit_synthetic_review_batch') then raise exception 'FAIL S20c'; end if;
 raise notice 'PASS: S20 no p36 table grants to browser roles; function security definer; anon cannot execute';
end $$;
select 'P364 DONE';
