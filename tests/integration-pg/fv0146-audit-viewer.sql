-- FV-01.4.6 Mission Audit Viewer scenarios (disposable database only).
\set ON_ERROR_STOP 1
\set op   '00000000-0000-0000-0000-0000000000a1'
\set gm   '00000000-0000-0000-0000-0000000000a2'
\set res  '00000000-0000-0000-0000-0000000000a3'
\set c1u  '00000000-0000-0000-0000-0000000000b1'
\set c4u  '00000000-0000-0000-0000-0000000000b4'

-- Fixture audit rows (as postgres) including sensitive metadata that must never be returned.
insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata, occurred_at) values
  ('m1', :'op', 'mission_updated', 'mission', 'm1', '{"previous_status":"planning","status":"active","name":"Secret Name"}', '2026-01-01T10:00:00Z'),
  ('m1', :'gm', 'mission_invite_acceptance_denied', 'mission_invite', 'inv-1', '{"reason":"wrong_recipient","code":"PLAINTEXT-CODE","email":"x@y.z","code_hash":"abc"}', '2026-01-02T10:00:00Z'),
  ('m1', :'op', 'mission_invite_created', 'mission_invite', 'inv-2', '{"role":"crew_self","payload":{"hr":72}}', '2026-01-03T10:00:00Z'),
  ('m2', :'c4u', 'mission_updated', 'mission', 'm2', '{"status":"active"}', '2026-01-02T12:00:00Z');

create or replace function fvtest.raises46(p_sql text, p_pattern text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlerrm ~ p_pattern; end $$;
grant execute on function fvtest.raises46(text, text) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
select fvtest.check(jsonb_array_length(public.get_mission_audit_log('m1') -> 'entries') >= 3, 'FV0146 operator reads own mission audit log');
select fvtest.check(not exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where e ->> 'target_type' = 'mission' and e ->> 'action' = 'mission_updated' and (e -> 'details') ? 'name'), 'FV0146 mission name redacted from details');
select fvtest.check(public.get_mission_audit_log('m1', p_limit => 100)::text !~ '(PLAINTEXT-CODE|x@y\.z|code_hash|"hr"|Secret Name|0000000000a)', 'FV0146 codes, emails, hashes, payloads and actor IDs never returned');
select fvtest.check(public.get_mission_audit_log('m1', p_limit => 100)::text !~ 'inv-', 'FV0146 target identifiers not returned');
select fvtest.check(not exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where e ->> 'actor' like '%-%-%'), 'FV0146 actor is self or pseudonymous reference');
select fvtest.check(exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where e ->> 'actor' = 'self'), 'FV0146 own actions labelled self');
select fvtest.check(not exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where e ->> 'occurred_at' = '2026-01-02T12:00:00+00:00'), 'FV0146 other mission rows never included');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m2')$q$, 'mission audit access denied'), 'FV0146 operator denied for mission without operator membership');
select fvtest.check((select bool_and(e ->> 'outcome' = 'refused') from jsonb_array_elements(public.get_mission_audit_log('m1', p_outcome => 'refused', p_limit => 100) -> 'entries') e), 'FV0146 outcome filter refused');
select fvtest.check((select bool_and(e ->> 'action' = 'mission_invite_created') from jsonb_array_elements(public.get_mission_audit_log('m1', p_action => 'mission_invite_created') -> 'entries') e), 'FV0146 action filter');
select fvtest.check(jsonb_array_length(public.get_mission_audit_log('m1', p_from => '2026-01-02T00:00:00Z', p_to => '2026-01-03T00:00:00Z') -> 'entries') = 1, 'FV0146 date filter half-open UTC range');
select fvtest.check(jsonb_array_length(public.get_mission_audit_log('m1', p_search => 'INVITE') -> 'entries') >= 2, 'FV0146 case-insensitive search');
select fvtest.check(jsonb_array_length(public.get_mission_audit_log('m1', p_search => 'zzz-no-match') -> 'entries') = 0, 'FV0146 empty result');
select fvtest.check((public.get_mission_audit_log('m1', p_limit => 1) ->> 'has_more')::boolean, 'FV0146 pagination has_more');
select fvtest.check(
  (select (public.get_mission_audit_log('m1', p_limit => 1, p_before_at => (e ->> 'occurred_at')::timestamptz, p_before_id => (e ->> 'id')::uuid) -> 'entries' -> 0 ->> 'id') <> (e ->> 'id')
   from (select public.get_mission_audit_log('m1', p_limit => 1) -> 'entries' -> 0 as e) s), 'FV0146 keyset cursor advances');
select fvtest.check(jsonb_array_length(public.get_mission_audit_log('m1', p_limit => 1000) -> 'entries') <= 100, 'FV0146 limit bounded to 100');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1', p_outcome => 'x')$q$, 'invalid outcome'), 'FV0146 invalid outcome rejected');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1', p_from => now(), p_to => now() - interval '1 day')$q$, 'invalid date range'), 'FV0146 reversed date range rejected');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1', p_before_at => now())$q$, 'invalid cursor'), 'FV0146 half cursor rejected');
select fvtest.check(fvtest.raises46($q$select count(*) from public.audit_events$q$, 'permission denied'), 'FV0146 no direct table read for browser accounts');
select fvtest.check(fvtest.raises46($q$update public.audit_events set action = 'x'$q$, 'permission denied|append-only|immutable'), 'FV0146 audit update refused');
select fvtest.check(fvtest.raises46($q$delete from public.audit_events$q$, 'permission denied|append-only|immutable'), 'FV0146 audit delete refused');

select set_config('request.jwt.claim.sub', :'gm', false);
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'mission audit access denied'), 'FV0146 ground medical denied');
select set_config('request.jwt.claim.sub', :'res', false);
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'mission audit access denied'), 'FV0146 researcher denied');
select set_config('request.jwt.claim.sub', :'c1u', false);
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'mission audit access denied'), 'FV0146 crew self denied');
select set_config('request.jwt.claim.sub', '', false);
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'authentication required|invalid input'), 'FV0146 unauthenticated denied');
reset role;
set role anon;
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'permission denied'), 'FV0146 anon cannot execute');
reset role;
select fvtest.check((select provolatile = 's' and prosecdef and proconfig::text like '%search_path=public, pg_temp%' from pg_proc where proname = 'get_mission_audit_log'), 'FV0146 stable security definer with fixed search_path');
select 'FV0146 DONE';
