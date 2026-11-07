-- Rollback of 20261108020000_p37_synthetic_demo_catalog.sql. Refuses to run once
-- any synthetic demo event exists, so demonstration history is never discarded.
do $guard$ begin
  if exists (select 1 from public.p37_demo_catalog_events) then
    raise exception 'synthetic demo events exist; rollback refused to preserve append-only history';
  end if;
end $guard$;
drop function public.p37_demo_catalog_snapshot_v1(text);
drop function public.p37_demo_lifecycle_v1(text);
drop function public.p37_demo_revoke_v1(uuid, text, uuid);
drop function public.p37_demo_activate_v1(uuid, text, uuid);
drop function public.p37_demo_decide_v1(text, uuid, text, text, text, text, uuid);
drop function public.p37_demo_keys(jsonb);
drop table public.p37_demo_catalog_events;
drop table public.p37_demo_scope;
