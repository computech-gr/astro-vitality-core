-- Rollback for 20261102000000_v94_observation_sync.sql (PENDING; owner approval required).
-- Removes ONLY the objects added by that migration. It refuses to run while the table holds
-- rows, because dropping it would destroy encrypted cross-device observation history. To roll
-- back with data, first export the table (see docs/V9_4_OBSERVATION_SYNC_OPERATOR.md) and run with:
--   set local observation_sync.allow_destructive_rollback = 'on';
do $$
begin
  if to_regclass('public.observation_sync_events') is not null
     and coalesce(current_setting('observation_sync.allow_destructive_rollback', true), '') <> 'on'
     and exists (select 1 from public.observation_sync_events) then
    raise exception 'observation sync table contains rows; export it and set observation_sync.allow_destructive_rollback=on';
  end if;
end $$;

drop function if exists public.observation_sync_list_v1(text, text, text, bigint, int);
drop function if exists public.observation_sync_append_v1(text, text, text, jsonb, boolean);
drop table if exists public.observation_sync_events;
drop function if exists public.observation_sync_reject_mutation();
drop function if exists public.observation_sync_can_access(text, text);
