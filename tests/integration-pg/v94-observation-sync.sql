-- v9.4 observation sync: RLS / role / append-only / tamper scenarios. DISPOSABLE local database only
-- (scripts/verify-v94-observation-sync-pg.mjs). Requires fv01-setup.sql fixtures:
--   a2 = ground_medical m1 (mission-wide) · b1 = crew_self m1/c1 · b2 = crew_self m1/c2
--   a3 = researcher m1 · a1 = mission_operator m1 · b4 = crew_self m2/c4 · c4 is not assigned to m1.
\set ON_ERROR_STOP 1
create schema v94t;
grant usage on schema v94t to authenticated, anon;
create function v94t.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'no error';
exception when others then
  return sqlstate;
end $$;
grant execute on function v94t.err(text) to authenticated, anon;
create function v94t.check(ok boolean, name text) returns text language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', name; end if;
  return 'PASS: ' || name;
end $$;
grant execute on function v94t.check(boolean, text) to authenticated, anon;
create function v94t.ev(p_obs text, p_kind text default 'entry', p_fp text default null) returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('eventId', p_obs || ':' || p_kind, 'observationId', p_obs, 'eventKind', p_kind,
    'cipherAlg','A256GCM-HKDF-SHA256-v1','keyVersion',1,'iv','AAAAAAAAAAAAAAAA',
    'ciphertext', 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=',
    'fingerprint', coalesce(p_fp, 'ofp-' || repeat('a', 64))))
$$;
grant execute on function v94t.ev(text,text,text) to authenticated;
create function v94t.status(p jsonb) returns text language sql immutable as $$ select p->0->>'status' $$;
grant execute on function v94t.status(jsonb) to authenticated;

\set GM '00000000-0000-0000-0000-0000000000a2'
\set CREW1 '00000000-0000-0000-0000-0000000000b1'
\set CREW2 '00000000-0000-0000-0000-0000000000b2'
\set RES '00000000-0000-0000-0000-0000000000a3'
\set OP '00000000-0000-0000-0000-0000000000a1'
\set CREW4 '00000000-0000-0000-0000-0000000000b4'

-- Anonymous / unauthenticated
set role anon;
select v94t.check(v94t.err($q$select public.observation_sync_append_v1('m1','c1','synthetic','[]',false)$q$) = '42501', 'anon cannot call append');
select v94t.check(v94t.err($q$select public.observation_sync_list_v1('m1','c1','synthetic',0,10)$q$) = '42501', 'anon cannot call list');
select v94t.check(v94t.err($q$select count(*) from public.observation_sync_events$q$) = '42501', 'anon cannot select the table');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select v94t.check(v94t.err($q$select public.observation_sync_append_v1('m1','c1','synthetic','[]',false)$q$) = '42501', 'no auth.uid() is refused');

-- Crew Self: own crew insert, replay duplicate, conflict
select set_config('request.jwt.claim.sub', :'CREW1', false);
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','synthetic', v94t.ev('obs-00000001'), false)) = 'inserted', 'crew_self uploads own encrypted event');
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','synthetic', v94t.ev('obs-00000001'), false)) = 'duplicate', 'identical replay is an idempotent duplicate');
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','synthetic', v94t.ev('obs-00000001','entry','ofp-' || repeat('b',64)), false)) = 'conflict', 'same event id with a different fingerprint is a conflict');
select v94t.check((select fingerprint from public.observation_sync_events where event_id = 'obs-00000001:entry') = 'ofp-' || repeat('a',64), 'conflict never overwrites the stored event');
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','synthetic', v94t.ev('obs-00000001','status'), false)) = 'inserted', 'status event is a separate append');
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','synthetic',
  jsonb_build_array(jsonb_build_object('eventId','obs-00000002:entry','observationId','obs-00000003','eventKind','entry','cipherAlg','A256GCM-HKDF-SHA256-v1','keyVersion',1,'iv','AAAAAAAAAAAAAAAA','ciphertext','QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=','fingerprint','ofp-' || repeat('a',64))), false)) = 'rejected', 'event id must match observation id and kind');
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','synthetic',
  jsonb_build_array(jsonb_build_object('eventId','obs-00000004:entry','observationId','obs-00000004','eventKind','entry','cipherAlg','none','keyVersion',1,'iv','AAAAAAAAAAAAAAAA','ciphertext','plain text value 62 bpm','fingerprint','ofp-' || repeat('a',64))), false)) = 'rejected', 'unencrypted payload / unknown cipher rejected');
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','synthetic',
  jsonb_build_array(jsonb_build_object('eventId','obs-00000005:entry','observationId','obs-00000005','eventKind','entry','cipherAlg','A256GCM-HKDF-SHA256-v1','keyVersion',1,'iv','AAAAAAAAAAAAAAAA','ciphertext','not base64 62 bpm!','fingerprint','ofp-' || repeat('a',64))), false)) = 'rejected', 'non-base64 ciphertext rejected by constraint');
select v94t.check(v94t.err($q$select public.observation_sync_append_v1('m1','c1','real', v94t.ev('obs-00000006'), false)$q$) = '42501', 'REAL batch without explicit confirmation refused');
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','real', v94t.ev('obs-00000006'), true)) = 'inserted', 'REAL batch with explicit confirmation accepted');
select v94t.check(v94t.err($q$select public.observation_sync_append_v1('m1','c2','synthetic', v94t.ev('obs-00000007'), false)$q$) = '42501', 'crew_self cannot write another crew member');
select v94t.check(v94t.err($q$select public.observation_sync_list_v1('m1','c2','synthetic',0,10)$q$) = '42501', 'crew_self cannot read another crew member');
select v94t.check(jsonb_array_length(public.observation_sync_list_v1('m1','c1','synthetic',0,10)) = 2, 'crew_self lists own scope');
select v94t.check(jsonb_array_length(public.observation_sync_list_v1('m1','c1','synthetic',0,1)) = 1, 'page size honoured');
select v94t.check(jsonb_array_length(public.observation_sync_list_v1('m1','c1','synthetic',(public.observation_sync_list_v1('m1','c1','synthetic',0,1)->0->>'received_seq')::bigint,10)) = 1, 'cursor pagination by received_seq');
select v94t.check(jsonb_array_length(public.observation_sync_list_v1('m1','c1','real',0,10)) = 1, 'provenance scopes are separate');
select v94t.check(v94t.err($q$select public.observation_sync_append_v1('m1','c1','other','[]',false)$q$) = '22023', 'invalid provenance refused');
select v94t.check(v94t.err($q$select public.observation_sync_append_v1('m1','c1','synthetic', (select jsonb_agg(v94t.ev('obs-1' || lpad(g::text,7,'0'))->0) from generate_series(1,101) g), false)$q$) = '22023', 'batch over 100 events refused');

-- Direct writes denied
select v94t.check(v94t.err($q$insert into public.observation_sync_events(mission_id,crew_member_id,provenance,event_id,observation_id,event_kind,cipher_alg,key_version,iv,ciphertext,fingerprint,uploaded_by) values ('m1','c1','synthetic','obs-0000ffff:entry','obs-0000ffff','entry','A256GCM-HKDF-SHA256-v1',1,'AAAAAAAAAAAAAAAA','QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=','ofp-' || repeat('c',64),auth.uid())$q$) = '42501', 'direct insert denied');
select v94t.check(v94t.err($q$update public.observation_sync_events set fingerprint = 'ofp-' || repeat('d',64)$q$) = '42501', 'direct update denied');
select v94t.check(v94t.err($q$delete from public.observation_sync_events$q$) = '42501', 'direct delete denied');

-- Ground Medical: scoped access to the assigned crew member
select set_config('request.jwt.claim.sub', :'GM', false);
select v94t.check(v94t.status(public.observation_sync_append_v1('m1','c1','synthetic', v94t.ev('obs-00000010'), false)) = 'inserted', 'ground_medical uploads in scope');
select v94t.check(jsonb_array_length(public.observation_sync_list_v1('m1','c1','synthetic',0,100)) = 3, 'ground_medical reads scoped events');
select v94t.check(v94t.err($q$select public.observation_sync_list_v1('m1','c4','synthetic',0,10)$q$) = '42501', 'crew not assigned to the mission is refused');
select v94t.check(v94t.err($q$select public.observation_sync_list_v1('m2','c4','synthetic',0,10)$q$) = '42501', 'ground_medical of m1 cannot read m2');
select v94t.check(position('62 bpm' in (public.observation_sync_list_v1('m1','c1','synthetic',0,100))::text) = 0, 'listed rows carry ciphertext only, no plaintext values');

select set_config('request.jwt.claim.sub', :'CREW2', false);
select v94t.check((select count(*) from public.observation_sync_events) = 0, 'other crew sees no rows via RLS');

select set_config('request.jwt.claim.sub', :'RES', false);
select v94t.check(v94t.err($q$select public.observation_sync_append_v1('m1','c1','synthetic','[]',false)$q$) = '42501', 'researcher cannot append');
select v94t.check(v94t.err($q$select public.observation_sync_list_v1('m1','c1','synthetic',0,10)$q$) = '42501', 'researcher cannot list');
select v94t.check((select count(*) from public.observation_sync_events) = 0, 'researcher sees no rows via RLS');

select set_config('request.jwt.claim.sub', :'OP', false);
select v94t.check(v94t.err($q$select public.observation_sync_append_v1('m1','c1','synthetic','[]',false)$q$) = '42501', 'mission operator cannot append');
select v94t.check((select count(*) from public.observation_sync_events) = 0, 'mission operator sees no rows via RLS');

select set_config('request.jwt.claim.sub', :'CREW4', false);
select v94t.check((select count(*) from public.observation_sync_events) = 0, 'cross-mission crew sees no rows');
reset role;

-- Append-only even for privileged roles; service_role has no write grant
select v94t.check(v94t.err($q$update public.observation_sync_events set iv = 'BBBBBBBBBBBBBBBB'$q$) = '42501', 'trigger blocks privileged update');
select v94t.check(v94t.err($q$delete from public.observation_sync_events$q$) = '42501', 'trigger blocks privileged delete');
select v94t.check(v94t.err($q$truncate public.observation_sync_events$q$) = '42501', 'trigger blocks truncate');
select v94t.check(not has_table_privilege('service_role', 'public.observation_sync_events', 'INSERT'), 'service_role has no insert privilege');
select v94t.check(not has_table_privilege('authenticated', 'public.observation_sync_events', 'INSERT'), 'authenticated has no insert privilege');
select v94t.check((select count(*) from public.audit_events where action = 'observation_sync_appended') >= 3, 'content-free server audit events recorded');
select v94t.check((select count(*) from public.audit_events where action = 'observation_sync_appended' and metadata::text like '%bpm%') = 0, 'audit metadata carries no values');
-- Existing v9 review-sync objects untouched
select v94t.check(to_regclass('public.review_sync_attestation_events') is not null and to_regclass('public.review_sync_correction_events') is not null, 'v9 review-sync tables still present');
select 'V94 OBSERVATION SYNC DONE';
