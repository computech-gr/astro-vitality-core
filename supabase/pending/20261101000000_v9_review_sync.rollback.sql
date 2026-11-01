-- Rollback for 20261101000000_v9_review_sync.sql (PENDING; owner approval required).
-- Removes ONLY the objects added by that migration. It refuses to run while either
-- table holds rows, because dropping them would destroy review audit history. To
-- roll back with data, first export both tables (see docs/V9_REVIEW_SYNC_OPERATOR.md)
-- and then run with: set local review_sync.allow_destructive_rollback = 'on';
do $$
begin
  if to_regclass('public.review_sync_attestation_events') is not null
     and coalesce(current_setting('review_sync.allow_destructive_rollback', true), '') <> 'on'
     and (exists (select 1 from public.review_sync_attestation_events)
          or exists (select 1 from public.review_sync_correction_events)) then
    raise exception 'review sync tables contain audit rows; export them and set review_sync.allow_destructive_rollback=on';
  end if;
end $$;

drop function if exists public.review_sync_list_v1(text, text, text, text, bigint, int);
drop function if exists public.review_sync_append_v1(text, text, text, jsonb, jsonb);
drop table if exists public.review_sync_correction_events;
drop table if exists public.review_sync_attestation_events;
drop function if exists public.review_sync_reject_mutation();
drop function if exists public.review_sync_can_read(text, text);
drop function if exists public.review_sync_is_ground_medical(text, text);
