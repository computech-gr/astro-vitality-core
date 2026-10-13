-- FV-01.2 PostgreSQL integration fixture. Runs ONLY against a disposable local
-- database (scripts/verify-fv01-pg-integration.mjs). Never run against production.
\set ON_ERROR_STOP 1
create schema fvtest;
grant usage on schema fvtest to authenticated;

create function fvtest.check(ok boolean, name text) returns text language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', name; end if;
  return 'PASS: ' || name;
end $$;
grant execute on function fvtest.check(boolean, text) to authenticated;

create function fvtest.ev(p_mission text, p_crew text, p_id text, p_ts timestamptz default now()) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', p_id, 'kind', 'observation', 'classification', 'medical_sensitive',
    'sourceId', 'fv01-test', 'sourceVersion', '1', 'sourcePriority', 50,
    'eventTimestamp', p_ts, 'createdAt', p_ts,
    'mission', jsonb_build_object('missionId', p_mission, 'crewMemberId', p_crew),
    'payload', jsonb_build_object('v', 1, 'id', p_id))
$$;
grant execute on function fvtest.ev(text, text, text, timestamptz) to authenticated;

insert into auth.users(id) select ('00000000-0000-0000-0000-0000000000' || x)::uuid
from unnest(array['a1','a2','a3','a4','b1','b2','b3','b4']) x;

insert into public.missions(id, code, name, status) values
  ('m1','FV-M1','Integration mission one','active'),
  ('m2','FV-M2','Integration mission two','active'),
  ('m3','FV-M3','Integration mission three','active'),
  ('m4','FV-M4','Integration mission four','active');

insert into public.crew_members(id, display_name, status) values
  ('c1','Crew One','active'),('c2','Crew Two','active'),('c3','Crew Three','active'),('c4','Crew Four','active');

insert into public.mission_crew_assignments(mission_id, crew_member_id, status) values
  ('m1','c1','active'),('m1','c2','active'),('m1','c3','active'),('m2','c4','active'),('m4','c1','active');

insert into public.mission_memberships(mission_id, user_id, crew_member_id, role, active) values
  ('m1','00000000-0000-0000-0000-0000000000a1',null,'mission_operator',true),
  ('m3','00000000-0000-0000-0000-0000000000a1',null,'mission_operator',true),
  ('m4','00000000-0000-0000-0000-0000000000a1',null,'mission_operator',true),
  ('m1','00000000-0000-0000-0000-0000000000a2',null,'ground_medical',true),
  ('m1','00000000-0000-0000-0000-0000000000a3',null,'researcher',true),
  ('m3','00000000-0000-0000-0000-0000000000a3',null,'researcher',true),
  ('m1','00000000-0000-0000-0000-0000000000b1','c1','crew_self',true),
  ('m4','00000000-0000-0000-0000-0000000000b1','c1','crew_self',true),
  ('m1','00000000-0000-0000-0000-0000000000b2','c2','crew_self',true),
  ('m2','00000000-0000-0000-0000-0000000000b4','c4','crew_self',true);
