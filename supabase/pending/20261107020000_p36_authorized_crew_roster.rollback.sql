-- Read-only feature rollback; no evidence table or history is removed.
begin;
drop function if exists public.p36_dynamic_crew_roster_v1(text);
commit;