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
  ('m2', :'c4u', 'mission_updated', 'mission', 'm2', '{"status":"active"}', '2026-01-02T12:00:00Z'),
  -- Adversarial rows: sensitive strings inside otherwise allowed keys must never be returned.
  ('m1', :'op', 'mission_invite_acceptance_denied', 'mission_invite', 'inv-3', '{"reason":"wrong_recipient: jane.doe@example.org code ZX9-LEAK","status":"Jane Doe","role":"TOKEN-eyJhbGciOi","classification":"patient Alice","policy":"sk_live_LEAKKEY","previous_status":"planning secret","expires_in_hours":"72 hours ADMINPASS","external_ref_present":"yes BOB","kind":"Secret Kind","outcome":"Leaky outcome"}', '2026-01-04T10:00:00Z'),
  ('m1', :'op', 'mission_invite_created', 'Mission Invite <bob@example.org>', 'inv-4', '{"role":"ground_medical","expires_in_hours":999999,"reason":"approval_required"}', '2026-01-05T10:00:00Z'),
  ('m1', :'op', 'Leak bob@example.org', 'mission', 'm1', '{}', '2026-01-06T10:00:00Z');

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
select fvtest.check((public.get_mission_audit_log('m1', p_limit => 1) ->> 'next_cursor') is not null, 'FV0146 opaque cursor issued when more rows exist');
select fvtest.check(public.get_mission_audit_log('m1', p_limit => 100) ->> 'next_cursor' is null, 'FV0146 no cursor on last page');
-- Walk all pages with limit 1 and compare to a single full read: deterministic, no gaps, no duplicates.
create temp table fv46_walk(ref text, n int) on commit preserve rows;
grant all on fv46_walk to authenticated;
do $$ declare c text; p jsonb; i int := 0; begin
  loop p := public.get_mission_audit_log('m1', p_limit => 1, p_cursor => c);
    insert into fv46_walk select e ->> 'ref', i from jsonb_array_elements(p -> 'entries') e; i := i + 1;
    c := p ->> 'next_cursor'; exit when c is null or i > 1000; end loop; end $$;
select fvtest.check((select array_agg(ref order by n) from fv46_walk) = (select array_agg(e ->> 'ref' order by o) from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') with ordinality x(e, o)), 'FV0146 keyset cursor walk equals full ordered read');
select fvtest.check((select count(distinct ref) = count(*) from fv46_walk), 'FV0146 cursor walk has no duplicates');
select fvtest.check(not exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where e ? 'id' or (e ->> 'ref') ~ '-'), 'FV0146 raw audit record IDs never returned');
select fvtest.check(not exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where (e ->> 'ref') !~ '^[0-9a-f]{20}$'), 'FV0146 ref is an opaque 20-hex HMAC');
select fvtest.check((public.get_mission_audit_log('m1', p_limit => 1) ->> 'next_cursor') !~ '[0-9a-f]{8}-[0-9a-f]{4}', 'FV0146 cursor does not reveal a UUID');
select fvtest.check(fvtest.raises46(format($q$select public.get_mission_audit_log('m1', p_limit => 1, p_cursor => %L)$q$, overlay((public.get_mission_audit_log('m1', p_limit => 1) ->> 'next_cursor') placing (case when substr(public.get_mission_audit_log('m1', p_limit => 1) ->> 'next_cursor', 20, 1) = 'A' then 'B' else 'A' end) from 20 for 1)), 'invalid cursor'), 'FV0146 tampered cursor rejected');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1', p_cursor => 'not-a-cursor')$q$, 'invalid cursor'), 'FV0146 garbage cursor rejected');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1', p_cursor => repeat('A', 700))$q$, 'invalid cursor'), 'FV0146 oversized cursor rejected');
select fvtest.check(fvtest.raises46(format($q$select public.get_mission_audit_log('m1', p_action => 'mission_updated', p_cursor => %L)$q$, public.get_mission_audit_log('m1', p_limit => 1) ->> 'next_cursor'), 'invalid cursor'), 'FV0146 cursor bound to its filter set');
select fvtest.check(jsonb_array_length(public.get_mission_audit_log('m1', p_limit => 1000) -> 'entries') <= 100, 'FV0146 limit bounded to 100');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1', p_outcome => 'x')$q$, 'invalid outcome'), 'FV0146 invalid outcome rejected');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1', p_from => now(), p_to => now() - interval '1 day')$q$, 'invalid date range'), 'FV0146 reversed date range rejected');
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1', p_action => 'Bad Action!')$q$, 'invalid action'), 'FV0146 malformed action filter rejected');
-- Adversarial redaction: sensitive strings inside allowed keys, target types and actions.
select fvtest.check(public.get_mission_audit_log('m1', p_limit => 100)::text !~* '(jane|doe@|example\.org|ZX9-LEAK|TOKEN-|eyJhbG|Alice|sk_live|LEAKKEY|ADMINPASS|BOB|Secret Kind|Leaky|planning secret|Mission Invite <|999999)', 'FV0146 adversarial values in allowed keys never returned');
select fvtest.check(exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where e -> 'details' ->> 'reason' = 'wrong_recipient'), 'FV0146 enumerated reason categories still shown');
select fvtest.check(exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where e ->> 'target_type' = 'other') and exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e where e ->> 'action' = 'other'), 'FV0146 non-identifier action/target replaced by other');
select fvtest.check(not exists (select 1 from jsonb_array_elements(public.get_mission_audit_log('m1', p_limit => 100) -> 'entries') e, jsonb_object_keys(e -> 'details') k where k in ('kind', 'outcome')), 'FV0146 unconstrained kind/outcome keys removed');
select fvtest.check(not exists (select 1 from jsonb_array_elements_text(public.get_mission_audit_log('m1') -> 'actions') a where a !~ '^[a-z][a-z0-9_]*$'), 'FV0146 action list contains identifiers only');
select fvtest.check(fvtest.raises46($q$select count(*) from public.audit_events$q$, 'permission denied') or not exists (select 1 from public.audit_events where mission_id = 'm2'), 'FV0146 direct table read denied or mission-scoped (production: no browser SELECT grant)');
select fvtest.check(fvtest.raises46($q$update public.audit_events set action = 'x'$q$, 'permission denied|append-only|immutable'), 'FV0146 audit update refused');
select fvtest.check(fvtest.raises46($q$delete from public.audit_events$q$, 'permission denied|append-only|immutable'), 'FV0146 audit delete refused');

select fvtest.check(fvtest.raises46(format($q$select public.get_mission_audit_log('m2', p_cursor => %L)$q$, public.get_mission_audit_log('m1', p_limit => 1) ->> 'next_cursor'), 'mission audit access denied|invalid cursor'), 'FV0146 cursor cannot cross missions');
select set_config('request.jwt.claim.sub', :'gm', false);
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'mission audit access denied'), 'FV0146 ground medical denied');
select set_config('request.jwt.claim.sub', :'res', false);
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'mission audit access denied'), 'FV0146 researcher denied');
select set_config('request.jwt.claim.sub', :'c1u', false);
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'mission audit access denied'), 'FV0146 crew self denied');
select set_config('request.jwt.claim.sub', '', false);
select fvtest.check(fvtest.raises46($q$select public.get_mission_audit_log('m1')$q$, 'authentication required|invalid input'), 'FV0146 unauthenticated denied');
reset role;
select fvtest.check(not has_function_privilege('anon', 'public.get_mission_audit_log(text,timestamptz,timestamptz,text,text,text,integer,text)', 'execute'), 'FV0146 anon cannot execute');
select fvtest.check((select provolatile = 's' and prosecdef and proconfig::text like '%search_path=public, pg_temp%' from pg_proc where proname = 'get_mission_audit_log' and pronargs = 8), 'FV0146 stable security definer with fixed search_path');
select fvtest.check((select count(*) from pg_proc where proname = 'get_mission_audit_log') = 1, 'FV0146 only revision-2 signature exists');
select 'FV0146 DONE';
