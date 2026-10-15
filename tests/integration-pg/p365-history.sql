-- P36.5 saved-review history scenarios (disposable PostgreSQL only; synthetic identities from fv01-setup.sql).
\set ON_ERROR_STOP 1
create schema p365t;
grant usage on schema p365t to authenticated, anon;
create function p365t.it(m text default 'cv-001', v text default '72') returns jsonb
language sql as $$ select jsonb_build_array(jsonb_build_object('metricId',m,'value',v,'unit','bpm','sourceExcerpt','Synthetic '||m||': '||v||' bpm')) $$;
create function p365t.sub(uid text, mission text, crew text, sha text, k text, d date, items jsonb default null) returns jsonb
language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', coalesce(uid,''), true);
  return public.p36_submit_synthetic_review_batch(mission, crew, d, 'synthetic.pdf', sha, coalesce(items, p365t.it()), k, true);
end $$;
create function p365t.hist(uid text, mission text, crew text) returns setof record
language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', coalesce(uid,''), true);
  return query select h.batch_id, h.observed_on, h.created_at, h.review_status, h.item_count
    from public.p36_list_synthetic_review_history(mission, crew) h;
end $$;
create function p365t.n(uid text, mission text, crew text) returns bigint language sql as $$
  select count(*) from p365t.hist(uid, mission, crew) as t(a uuid, b date, c timestamptz, d text, e bigint) $$;
create function p365t.expect_fail(label text, stmt text, pat text) returns void language plpgsql as $$
begin begin execute stmt; exception when others then
  if sqlerrm ~* pat then raise notice 'PASS: % (%)', label, sqlerrm; return; end if;
  raise exception 'FAIL: % wrong error: %', label, sqlerrm; end;
  raise exception 'FAIL: % unexpectedly succeeded', label; end $$;
create function p365t.ok(label text, cond boolean) returns void language plpgsql as $$
begin if cond then raise notice 'PASS: %', label; else raise exception 'FAIL: %', label; end if; end $$;
grant execute on all functions in schema p365t to authenticated, anon;

set role authenticated;
do $$
declare b1 text := '00000000-0000-0000-0000-0000000000b1';
        b2 text := '00000000-0000-0000-0000-0000000000b2';
        b4 text := '00000000-0000-0000-0000-0000000000b4';
        r jsonb; r2 jsonb; dates date[]; cnt bigint[];
begin
  perform p365t.ok('H1 empty history returns zero rows for active Crew Self', p365t.n(b1,'m1','c1') = 0);

  -- Submitted out of chronological order on purpose.
  perform p365t.sub(b1,'m1','c1',repeat('1',64),'key-h-aaaaaaaaaaaa1','2026-09-10');
  perform p365t.sub(b1,'m1','c1',repeat('2',64),'key-h-aaaaaaaaaaaa2','2026-10-05', p365t.it('cv-001') || p365t.it('cv-003','70'));
  perform p365t.sub(b1,'m1','c1',repeat('3',64),'key-h-aaaaaaaaaaaa3','2026-08-01');
  select array_agg(b order by ord), array_agg(e order by ord) into dates, cnt from (
    select row_number() over () ord, * from p365t.hist(b1,'m1','c1') as t(a uuid, b date, c timestamptz, d text, e bigint)) x;
  perform p365t.ok('H2 history ordered newest observation date first',
    dates = array['2026-10-05','2026-09-10','2026-08-01']::date[]);
  perform p365t.ok('H3 item counts per batch correct (2,1,1)', cnt = array[2,1,1]::bigint[]);
  perform p365t.ok('H4 all saved batches are pending_review',
    (select bool_and(d = 'pending_review') from p365t.hist(b1,'m1','c1') as t(a uuid, b date, c timestamptz, d text, e bigint)));

  -- Repeat submission (same key/payload) replays; history does not grow.
  r := p365t.sub(b1,'m1','c1',repeat('1',64),'key-h-aaaaaaaaaaaa1','2026-09-10');
  perform p365t.ok('H5 repeat submission replays and history stays at 3 rows',
    r->>'status' = 'replayed' and p365t.n(b1,'m1','c1') = 3);

  -- Same observation date, two batches: tie broken by created_at desc.
  perform p365t.sub(b1,'m1','c1',repeat('4',64),'key-h-aaaaaaaaaaaa4','2026-09-10');
  perform p365t.ok('H6 same-date batches both listed (4 rows)', p365t.n(b1,'m1','c1') = 4);

  -- Other astronauts see only their own rows.
  perform p365t.sub(b2,'m1','c2',repeat('5',64),'key-h-aaaaaaaaaaaa5','2026-10-01');
  perform p365t.ok('H7 crew c2 sees only own batch; c1 history unchanged',
    p365t.n(b2,'m1','c2') = 1 and p365t.n(b1,'m1','c1') = 4);
  perform p365t.ok('H8 other mission astronaut (b4, m2/c4) sees empty history', p365t.n(b4,'m2','c4') = 0);

  perform p365t.expect_fail('H9a b1 cannot read crew c2 history', format('select p365t.n(%L,''m1'',''c2'')', b1), 'access denied');
  perform p365t.expect_fail('H9b b2 cannot read crew c1 history', format('select p365t.n(%L,''m1'',''c1'')', b2), 'access denied');
  perform p365t.expect_fail('H10a cross-mission: b1 cannot read m2/c4', format('select p365t.n(%L,''m2'',''c4'')', b1), 'access denied');
  perform p365t.expect_fail('H10b cross-mission: b4 cannot read m1/c1', format('select p365t.n(%L,''m1'',''c1'')', b4), 'access denied');
  perform p365t.expect_fail('H10c mismatched mission/crew pair (m2/c1) refused', format('select p365t.n(%L,''m2'',''c1'')', b1), 'access denied');
  perform p365t.expect_fail('H11a Mission Operator refused', $s$select p365t.n('00000000-0000-0000-0000-0000000000a1','m1','c1')$s$, 'access denied');
  perform p365t.expect_fail('H11b Ground Medical refused', $s$select p365t.n('00000000-0000-0000-0000-0000000000a2','m1','c1')$s$, 'access denied');
  perform p365t.expect_fail('H11c Researcher refused', $s$select p365t.n('00000000-0000-0000-0000-0000000000a3','m1','c1')$s$, 'access denied');
  perform p365t.expect_fail('H12a authenticated without user id refused', $s$select p365t.n(null,'m1','c1')$s$, 'requires authenticated');
  perform p365t.expect_fail('H12b null crew argument refused', format('select p365t.n(%L,''m1'',null)', b1), 'requires authenticated');
  perform p365t.expect_fail('H12c unknown user refused', $s$select p365t.n('00000000-0000-0000-0000-00000000ffff','m1','c1')$s$, 'access denied');
  perform p365t.expect_fail('H13 direct table read still denied',
    'select count(*) from public.p36_biomarker_review_batches', 'permission denied');
end $$;

-- Unauthenticated (anon) cannot execute the RPC.
reset role;
set role anon;
do $$ begin
  perform p365t.expect_fail('H14 anon cannot execute history RPC',
    $s$select * from public.p36_list_synthetic_review_history('m1','c1')$s$, 'permission denied');
end $$;
reset role;

-- Revocation: deactivate b1's membership as owner, then history refused.
update public.mission_memberships set active = false
 where user_id = '00000000-0000-0000-0000-0000000000b1' and mission_id = 'm1' and role = 'crew_self';
set role authenticated;
do $$ begin
  perform p365t.expect_fail('H15 revoked Crew Self membership cannot read own history',
    $s$select p365t.n('00000000-0000-0000-0000-0000000000b1','m1','c1')$s$, 'access denied');
  perform p365t.ok('H16 revocation did not affect crew c2 history',
    p365t.n('00000000-0000-0000-0000-0000000000b2','m1','c2') = 1);
end $$;
reset role;
do $$ begin
  perform p365t.ok('H17 revoked astronaut batches retained (4) and unchanged',
    (select count(*) from public.p36_biomarker_review_batches where crew_member_id = 'c1') = 4);
  perform p365t.ok('H18 RPC is security definer, execute granted only to authenticated (not anon/public)',
    (select prosecdef from pg_proc where proname = 'p36_list_synthetic_review_history')
    and has_function_privilege('authenticated','public.p36_list_synthetic_review_history(text,text)','execute')
    and not has_function_privilege('anon','public.p36_list_synthetic_review_history(text,text)','execute'));
end $$;
select 'P365 DONE';
