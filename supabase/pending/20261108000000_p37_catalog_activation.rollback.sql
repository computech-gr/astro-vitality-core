-- Rollback for 20261108000000_p37_catalog_activation.sql. Refuses while any
-- catalog event or grant exists (immutable history must be preserved under a
-- separately authorized plan). Never touches P36 objects.
do $$ begin
  if exists (select 1 from public.p37_catalog_events) or exists (select 1 from public.p37_scientific_approvers)
     or exists (select 1 from public.p37_catalog_activators) then
    raise exception 'Rollback refused: P37 catalog events or grants exist.';
  end if;
end $$;
drop function public.p37_catalog_lifecycle_v1(text, text);
drop function public.p37_catalog_snapshot_v1();
drop function public.p37_catalog_revoke_v1(uuid, text, uuid);
drop function public.p37_catalog_activate_v1(uuid, text, uuid);
drop function public.p37_catalog_approve_v1(text, text, uuid, text, text, text, text, uuid);
drop table public.p37_catalog_events;
drop table public.p37_catalog_activators;
drop table public.p37_scientific_approvers;
drop function public.p37_catalog_keys(jsonb);
drop function public.p37_catalog_record_grant();
