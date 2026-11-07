-- Rollback for 20261107040000_p36_global_triage.sql only. Removes the triage
-- grant table, triage history and their functions. Does not touch global
-- review, handoff submissions, scientific authorization or catalogs.
-- Destructive for triage history: export it first if it must be retained.
drop function if exists public.p36_global_triage_list_v1(text, text);
drop function if exists public.p36_global_triage_append_v1(text, text, uuid, text, text, text, text[], uuid, uuid);
drop table if exists public.p36_global_triage_events;
drop table if exists public.p36_global_triage_writers;
drop function if exists public.p36_global_triage_record_grant();
