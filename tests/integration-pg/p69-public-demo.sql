-- P69/P71 public demo workspace scenarios (DISPOSABLE PostgreSQL only; synthetic identities).
\set ON_ERROR_STOP 1
create schema p69t;
grant usage on schema p69t to authenticated, anon, service_role;
create function p69t.as_uid(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid,''), false) $$;
create function p69t.expect_fail(label text, stmt text, pat text) returns void language plpgsql as $$
begin begin execute stmt; exception when others then
  if sqlerrm ~* pat or sqlstate ~* pat then raise notice 'PASS: % (% %)', label, sqlstate, sqlerrm; return; end if;
  raise exception 'FAIL: % wrong error: % %', label, sqlstate, sqlerrm; end;
  raise exception 'FAIL: % unexpectedly succeeded', label; end $$;
create function p69t.ok(label text, cond boolean) returns void language plpgsql as $$
begin if cond then raise notice 'PASS: %', label; else raise exception 'FAIL: %', label; end if; end $$;
create table p69t.ctx(k text primary key, v text);
grant all on p69t.ctx to authenticated, anon, service_role;
grant execute on all functions in schema p69t to authenticated, anon, service_role;
create function p69t.get(key text) returns text language sql as $$ select v from p69t.ctx where k = key $$;
grant execute on function p69t.get(text) to authenticated, anon, service_role;

-- Synthetic user IDs: A1 astronaut, R1 researcher, M1 medical (workspace A); B1 astronaut (workspace B).
insert into p69t.ctx values
  ('A1','00000000-0000-0000-0000-00000000a001'), ('R1','00000000-0000-0000-0000-00000000a002'),
  ('M1','00000000-0000-0000-0000-00000000a003'), ('B1','00000000-0000-0000-0000-00000000b001'),
  ('X1','00000000-0000-0000-0000-00000000c001');

-- 1. Browser roles cannot provision or admit.
set role anon;
select p69t.expect_fail('anon cannot admit', $$select public.p69_demo_admit_v1(repeat('a',64))$$, 'permission denied');
select p69t.expect_fail('anon cannot provision', $$select public.p69_demo_provision_v1(gen_random_uuid(), gen_random_uuid(), 'astronaut', null)$$, 'permission denied');
select p69t.expect_fail('anon cannot read records', $$select public.p69_demo_records_v1()$$, 'permission denied');
reset role;
set role authenticated;
select p69t.as_uid(p69t.get('A1'));
select p69t.expect_fail('authenticated cannot admit', $$select public.p69_demo_admit_v1(repeat('a',64))$$, 'permission denied');
select p69t.expect_fail('authenticated cannot provision', $$select public.p69_demo_provision_v1(gen_random_uuid(), gen_random_uuid(), 'astronaut', null)$$, 'permission denied');
select p69t.expect_fail('non-member has no demo session', $$select public.p69_demo_session_v1()$$, 'not a demo workspace member');
reset role;

-- 2. Server provisioning (service_role).
set role service_role;
select p69t.as_uid('');
do $$ declare r jsonb; begin
  r := public.p69_demo_provision_v1(public.p69_demo_admit_v1(repeat('1',64)), p69t.get('A1')::uuid, 'astronaut', null);
  insert into p69t.ctx values ('codeA', r->>'joinCode'), ('wsA', r->>'workspaceId');
  perform p69t.ok('new workspace returns a one-time join code', (r->>'joinCode') ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$');
  r := public.p69_demo_provision_v1(public.p69_demo_admit_v1(repeat('1',64)), p69t.get('R1')::uuid, 'researcher', lower(p69t.get('codeA')));
  perform p69t.ok('researcher joins the same workspace by code', r->>'workspaceId' = p69t.get('wsA') and r->'joinCode' = 'null'::jsonb);
  r := public.p69_demo_provision_v1(public.p69_demo_admit_v1(repeat('1',64)), p69t.get('M1')::uuid, 'medical', p69t.get('codeA'));
  perform p69t.ok('medical joins the same workspace', r->>'workspaceId' = p69t.get('wsA'));
  r := public.p69_demo_provision_v1(public.p69_demo_admit_v1(repeat('2',64)), p69t.get('B1')::uuid, 'astronaut', null);
  insert into p69t.ctx values ('wsB', r->>'workspaceId');
  perform p69t.ok('second visitor gets a separate workspace', r->>'workspaceId' <> p69t.get('wsA'));
  insert into p69t.ctx values ('adm', public.p69_demo_admit_v1(repeat('3',64))::text);
end $$;
select p69t.expect_fail('wrong join code rejected', $$select public.p69_demo_provision_v1(public.p69_demo_admit_v1(repeat('4',64)), gen_random_uuid(), 'medical', 'AAAA-BBBB-CCCC')$$, 'MDJIN');
select p69t.expect_fail('malformed join code rejected', $$select public.p69_demo_provision_v1(public.p69_demo_admit_v1(repeat('4',64)), gen_random_uuid(), 'medical', 'x')$$, 'MDJIN');
select p69t.expect_fail('invalid role rejected', $$select public.p69_demo_provision_v1(public.p69_demo_admit_v1(repeat('4',64)), gen_random_uuid(), 'mission_operator', null)$$, 'invalid demo role');
do $$ begin perform public.p69_demo_provision_v1(p69t.get('adm')::uuid, p69t.get('X1')::uuid, 'researcher', null); end $$;
select p69t.expect_fail('admission is single-use', $$select public.p69_demo_provision_v1(p69t.get('adm')::uuid, gen_random_uuid(), 'researcher', null)$$, 'admission invalid');
select p69t.expect_fail('one identity, one membership', $$select public.p69_demo_provision_v1(public.p69_demo_admit_v1(repeat('5',64)), p69t.get('A1')::uuid, 'medical', null)$$, 'already provisioned');
do $$ begin for i in 1..12 loop perform public.p69_demo_admit_v1(repeat('9',64)); end loop; end $$;
select p69t.expect_fail('per-client admission rate limit', $$select public.p69_demo_admit_v1(repeat('9',64))$$, 'MDRAT');
reset role;

-- 3. Seeded synthetic workspace, read paths and redaction.
set role authenticated;
select p69t.as_uid(p69t.get('A1'));
do $$ declare s jsonb := public.p69_demo_session_v1(); r jsonb := public.p69_demo_records_v1(); c jsonb := public.p69_demo_context_v1(); begin
  perform p69t.ok('astronaut session is synthetic NASA-DEMO-304-001', s->>'role' = 'astronaut' and s->>'missionCode' = 'NASA-DEMO-304-001'
    and s->>'provenance' = 'synthetic' and s->>'crewSubjectName' like 'Alex Morgan%Synthetic Astronaut');
  perform p69t.ok('session counts members per role', (s->'members'->>'astronaut')::int = 1 and (s->'members'->>'researcher')::int = 1 and (s->'members'->>'medical')::int = 1);
  perform p69t.ok('seed has one complete examination with 30 measurements', jsonb_array_length(r) = 1
    and r->0->>'state' = 'medical_review_recorded' and (r->0->>'revision')::int = 3 and jsonb_array_length(r->0->'measurements') = 30);
  perform p69t.ok('astronaut cannot see scientific assessment details', (r->0->'events'->1->>'redacted')::boolean
    and r->0->'events'->1->'outcome' = 'null'::jsonb and r->0->'events'->2->>'outcome' = 'no_follow_up_needed');
  perform p69t.ok('four shared context readings with body temperature site', jsonb_array_length(c) = 4
    and exists (select 1 from jsonb_array_elements(c) x where x->>'parameterId' = 'body_temperature' and x->>'measurementSite' = 'oral' and x->'metricCode' = 'null'::jsonb)
    and exists (select 1 from jsonb_array_elements(c) x where x->>'parameterId' = 'radiation_dose_rate' and x->>'unit' = 'uSv/h'));
end $$;
select p69t.as_uid(p69t.get('R1'));
select p69t.ok('researcher sees scientific assessment', public.p69_demo_records_v1()->0->'events'->1->>'outcome' = 'consistent_with_synthetic_reference');

-- 4. Submission rules.
select p69t.as_uid(p69t.get('A1'));
do $$ declare r jsonb; r2 jsonb; begin
  r := public.p69_demo_submit_examination_v1(current_date,
    '[{"metricId":"demo:ubt-e1140df3","value":"121","unit":"mmHg"},{"metricId":"demo:ubt-5d16fcaf","value":"79","unit":"mmHg"}]'::jsonb, 'good', 'idem-submit-a1-000001');
  insert into p69t.ctx values ('rec', r->>'recordId');
  perform p69t.ok('astronaut submits EXAM-0002 at revision 1', r->>'recordRef' = 'EXAM-0002' and (r->>'revision')::int = 1 and not (r->>'replay')::boolean);
  r2 := public.p69_demo_submit_examination_v1(current_date,
    '[{"metricId":"demo:ubt-e1140df3","value":"121","unit":"mmHg"},{"metricId":"demo:ubt-5d16fcaf","value":"79","unit":"mmHg"}]'::jsonb, 'good', 'idem-submit-a1-000001');
  perform p69t.ok('idempotent replay returns the same record', r2->>'recordId' = r->>'recordId' and (r2->>'replay')::boolean);
end $$;
select p69t.expect_fail('idempotency key reuse with different payload', $$select public.p69_demo_submit_examination_v1(current_date, '[{"metricId":"demo:ubt-e1140df3","value":"130","unit":"mmHg"}]'::jsonb, 'good', 'idem-submit-a1-000001')$$, 'MDIDM');
select p69t.expect_fail('wrong unit rejected without conversion', $$select public.p69_demo_submit_examination_v1(current_date, '[{"metricId":"demo:ubt-e1140df3","value":"16","unit":"kPa"}]'::jsonb, 'good', 'idem-submit-a1-000002')$$, 'must be exactly');
select p69t.expect_fail('unknown parameter rejected', $$select public.p69_demo_submit_examination_v1(current_date, '[{"metricId":"demo:ubt-6b4e6b7f","value":"12.4","unit":"ng/mL"}]'::jsonb, 'good', 'idem-submit-a1-000003')$$, 'unknown demo parameter');
select p69t.expect_fail('duplicate parameter rejected', $$select public.p69_demo_submit_examination_v1(current_date, '[{"metricId":"demo:ubt-e1140df3","value":"1","unit":"mmHg"},{"metricId":"demo:ubt-e1140df3","value":"2","unit":"mmHg"}]'::jsonb, 'good', 'idem-submit-a1-000004')$$, 'duplicate');
select p69t.expect_fail('extra measurement keys rejected', $$select public.p69_demo_submit_examination_v1(current_date, '[{"metricId":"demo:ubt-e1140df3","value":"1","unit":"mmHg","approved":true}]'::jsonb, 'good', 'idem-submit-a1-000005')$$, 'exactly metricId');
select p69t.expect_fail('future date rejected', $$select public.p69_demo_submit_examination_v1(current_date + 5, '[{"metricId":"demo:ubt-e1140df3","value":"1","unit":"mmHg"}]'::jsonb, 'good', 'idem-submit-a1-000006')$$, 'out of range');
select p69t.as_uid(p69t.get('R1'));
select p69t.expect_fail('researcher cannot submit examinations', $$select public.p69_demo_submit_examination_v1(current_date, '[{"metricId":"demo:ubt-e1140df3","value":"1","unit":"mmHg"}]'::jsonb, 'good', 'idem-submit-r1-000001')$$, 'role not permitted');

-- 5. Workflow transitions.
select p69t.as_uid(p69t.get('M1'));
select p69t.expect_fail('medical review before scientific assessment', format($$select public.p69_demo_transition_v1(%L, 'medical_review_recorded', 'no_follow_up_needed', '', 1, 'idem-med-early-000001')$$, p69t.get('rec')), 'MDSTT');
select p69t.expect_fail('medical cannot record scientific assessment', format($$select public.p69_demo_transition_v1(%L, 'scientific_assessment_recorded', 'requires_more_evidence', '', 1, 'idem-med-sci-0000001')$$, p69t.get('rec')), 'role not permitted');
select p69t.as_uid(p69t.get('A1'));
select p69t.expect_fail('astronaut cannot assess', format($$select public.p69_demo_transition_v1(%L, 'scientific_assessment_recorded', 'requires_more_evidence', '', 1, 'idem-ast-sci-0000001')$$, p69t.get('rec')), 'role not permitted');
select p69t.as_uid(p69t.get('R1'));
select p69t.expect_fail('outcome from the wrong vocabulary', format($$select public.p69_demo_transition_v1(%L, 'scientific_assessment_recorded', 'no_follow_up_needed', '', 1, 'idem-res-bad-0000001')$$, p69t.get('rec')), 'invalid outcome');
select p69t.ok('researcher records assessment at revision 2',
  (public.p69_demo_transition_v1(p69t.get('rec')::uuid, 'scientific_assessment_recorded', 'requires_more_evidence', 'Synthetic: confirm diastolic trend.', 1, 'idem-res-ok-00000001')->>'revision')::int = 2);
select p69t.ok('transition replay is idempotent',
  (public.p69_demo_transition_v1(p69t.get('rec')::uuid, 'scientific_assessment_recorded', 'requires_more_evidence', 'Synthetic: confirm diastolic trend.', 1, 'idem-res-ok-00000001')->>'replay')::boolean);
select p69t.expect_fail('stale revision rejected', format($$select public.p69_demo_transition_v1(%L, 'scientific_assessment_recorded', 'consistent_with_synthetic_reference', '', 1, 'idem-res-stale-000001')$$, p69t.get('rec')), 'MDSTA');
select p69t.as_uid(p69t.get('M1'));
select p69t.expect_fail('medical with stale expected revision', format($$select public.p69_demo_transition_v1(%L, 'medical_review_recorded', 'follow_up_recommended', '', 1, 'idem-med-stale-000001')$$, p69t.get('rec')), 'MDSTA');
select p69t.ok('medical review recorded at revision 3 referencing the assessment',
  (public.p69_demo_transition_v1(p69t.get('rec')::uuid, 'medical_review_recorded', 'repeat_measurement_requested', 'Synthetic: repeat in 7 days.', 2, 'idem-med-ok-00000001')->>'state') = 'medical_review_recorded');
select p69t.expect_fail('no further transitions after final review', format($$select public.p69_demo_transition_v1(%L, 'medical_review_recorded', 'no_follow_up_needed', '', 3, 'idem-med-again-000001')$$, p69t.get('rec')), 'MDSTT');
select p69t.as_uid(p69t.get('A1'));
do $$ declare r jsonb; begin
  select x into r from jsonb_array_elements(public.p69_demo_records_v1()) x where x->>'id' = p69t.get('rec');
  perform p69t.ok('astronaut sees final medical state, assessment redacted', r->>'state' = 'medical_review_recorded'
    and r->'events'->2->>'outcome' = 'repeat_measurement_requested' and (r->'events'->1->>'redacted')::boolean
    and r->'events'->1->'note' = 'null'::jsonb);
  perform p69t.ok('history keeps actor role, revision and evidence hash', r->'events'->1->>'actorRole' = 'researcher'
    and r->'events'->2->'evidence' ? 'previousEventId' and (r->'events'->0->'evidence'->>'measurementsSha256') ~ '^[0-9a-f]{64}$');
end $$;

-- 5b. Ground Medical enters a new synthetic examination; the same record then
--     goes through Researcher assessment and Medical review, and the Astronaut
--     sees the final outcome with assessment details redacted.
select p69t.as_uid(p69t.get('M1'));
do $$ declare r jsonb; begin
  r := public.p69_demo_submit_examination_v1(current_date,
    '[{"metricId":"demo:ubt-12f6e490","value":"97","unit":"%"},{"metricId":"demo:ubt-c5a76e59","value":"6.1","unit":"h"}]'::jsonb, 'degraded', 'idem-submit-m1-000001');
  insert into p69t.ctx values ('recM', r->>'recordId');
  perform p69t.ok('medical submits a new synthetic examination at revision 1', r->>'recordRef' = 'EXAM-0003' and (r->>'revision')::int = 1);
end $$;
select p69t.expect_fail('medical cannot self-review before assessment', format($$select public.p69_demo_transition_v1(%L, 'medical_review_recorded', 'no_follow_up_needed', '', 1, 'idem-med-self-000001')$$, p69t.get('recM')), 'MDSTT');
select p69t.as_uid(p69t.get('R1'));
select p69t.ok('researcher assesses the medical-entered record',
  (public.p69_demo_transition_v1(p69t.get('recM')::uuid, 'scientific_assessment_recorded', 'consistent_with_synthetic_reference', 'Synthetic check.', 1, 'idem-res-m-000000001')->>'revision')::int = 2);
select p69t.as_uid(p69t.get('M1'));
select p69t.ok('medical reviews the same record',
  (public.p69_demo_transition_v1(p69t.get('recM')::uuid, 'medical_review_recorded', 'follow_up_recommended', 'Synthetic follow-up.', 2, 'idem-med-m-000000001')->>'revision')::int = 3);
select p69t.as_uid(p69t.get('A1'));
do $$ declare r jsonb; begin
  select x into r from jsonb_array_elements(public.p69_demo_records_v1()) x where x->>'id' = p69t.get('recM');
  perform p69t.ok('astronaut sees final outcome of the medical-entered record', r->>'submittedRole' = 'medical'
    and r->>'sourceLabel' = 'Ground Medical entered synthetic examination' and r->>'state' = 'medical_review_recorded'
    and r->'events'->2->>'outcome' = 'follow_up_recommended' and (r->'events'->1->>'redacted')::boolean
    and r->'events'->0->>'actorRole' = 'medical');
end $$;

-- 6. Cross-workspace isolation and direct table access.
select p69t.as_uid(p69t.get('B1'));
select p69t.expect_fail('other workspace cannot transition record', format($$select public.p69_demo_transition_v1(%L, 'scientific_assessment_recorded', 'requires_more_evidence', '', 1, 'idem-b1-cross-000001')$$, p69t.get('rec')), 'record not found');
select p69t.ok('other workspace sees only its own seed', jsonb_array_length(public.p69_demo_records_v1()) = 1
  and not exists (select 1 from jsonb_array_elements(public.p69_demo_records_v1()) x where x->>'id' = p69t.get('rec')));
select p69t.ok('direct reads are workspace-scoped', (select count(*) from public.p69_demo_records) = 1
  and (select count(*) from public.p69_demo_workspaces) = 1 and (select count(*) from public.p69_demo_members) = 1);
select p69t.expect_fail('no direct event reads', $$select count(*) from public.p69_demo_record_events$$, 'permission denied');
select p69t.expect_fail('join code hash not readable', $$select join_code_sha256 from public.p69_demo_workspaces$$, 'permission denied');
select p69t.expect_fail('no direct inserts', $$insert into public.p69_demo_records (workspace_id) values (gen_random_uuid())$$, 'permission denied');
select p69t.expect_fail('no direct updates', $$update public.p69_demo_members set role = 'medical'$$, 'permission denied');
reset role;
select p69t.expect_fail('records append-only even for owner', $$update public.p69_demo_records set source_label = 'x'$$, 'append-only');
select p69t.expect_fail('events append-only even for owner', $$delete from public.p69_demo_record_events$$, 'append-only');
select p69t.expect_fail('truncate rejected', $$truncate public.p69_demo_record_events cascade$$, 'append-only');
select p69t.expect_fail('workspace identity immutable', $$update public.p69_demo_workspaces set expires_at = now() + interval '40 hours', revision = revision + 1$$, 'immutable');

-- 7. Reset and restore (no deletion).
set role authenticated;
select p69t.as_uid(p69t.get('M1'));
select p69t.expect_fail('reset with stale revision', $$select public.p69_demo_reset_v1(99)$$, 'MDSTA');
do $$ declare s jsonb := public.p69_demo_session_v1(); r jsonb; begin
  r := public.p69_demo_reset_v1((s->>'workspaceRevision')::bigint);
  perform p69t.ok('reset creates seeded epoch 2', (r->>'epoch')::int = 2 and jsonb_array_length(public.p69_demo_records_v1()) = 1
    and jsonb_array_length(public.p69_demo_context_v1()) = 4);
  r := public.p69_demo_restore_v1(1, (r->>'workspaceRevision')::bigint);
  perform p69t.ok('restore returns epoch 1 with prior history intact', (r->>'epoch')::int = 1 and jsonb_array_length(public.p69_demo_records_v1()) = 3);
  s := public.p69_demo_session_v1();
  perform p69t.ok('workspace history records reset and restore', jsonb_array_length(s->'history') >= 5
    and exists (select 1 from jsonb_array_elements(s->'history') h where h->>'action' = 'reset')
    and exists (select 1 from jsonb_array_elements(s->'history') h where h->>'action' = 'restored'));
end $$;
select p69t.expect_fail('restore to current epoch rejected', $$select public.p69_demo_restore_v1(1, (public.p69_demo_session_v1()->>'workspaceRevision')::bigint)$$, 'invalid workspace version');
reset role;

-- 8. Expiry and identity release.
insert into public.p69_demo_workspaces (id, join_code_sha256, seed_version, created_at, expires_at)
  values ('00000000-0000-0000-0000-0000000e0001', repeat('e',64), 'p69-seed-v1', now() - interval '30 hours', now() - interval '6 hours');
insert into public.p69_demo_admissions (id, client_hash) values ('00000000-0000-0000-0000-0000000e00a1', repeat('e',64));
insert into public.p69_demo_members (user_id, workspace_id, role, admission_id)
  values ('00000000-0000-0000-0000-0000000e0b01', '00000000-0000-0000-0000-0000000e0001', 'astronaut', '00000000-0000-0000-0000-0000000e00a1');
set role authenticated;
select p69t.as_uid('00000000-0000-0000-0000-0000000e0b01');
select p69t.expect_fail('expired workspace refuses reads', $$select public.p69_demo_records_v1()$$, 'MDEXP');
reset role;
set role service_role;
select p69t.ok('expired identities are claimed for deletion once',
  public.p69_demo_claim_expired_v1(5) = '["00000000-0000-0000-0000-0000000e0b01"]'::jsonb and public.p69_demo_claim_expired_v1(5) = '[]'::jsonb);
reset role;
set role authenticated;
select p69t.expect_fail('released identity has no session', $$select public.p69_demo_session_v1()$$, 'not a demo workspace member');
reset role;
select 'P69 DONE';
