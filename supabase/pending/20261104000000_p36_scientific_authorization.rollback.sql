-- Rollback for 20261104000000_p36_scientific_authorization.sql (PENDING; owner approval required).
-- Removes ONLY the objects added by that migration. It refuses to run while the ledger holds rows,
-- because dropping it would destroy scientific authorization audit history. To roll back with data,
-- first export the table and then run with: set local p36_sci_auth.allow_destructive_rollback = 'on';
do $$
begin
  if to_regclass('public.p36_scientific_authorization_events') is not null
     and coalesce(current_setting('p36_sci_auth.allow_destructive_rollback', true), '') <> 'on'
     and exists (select 1 from public.p36_scientific_authorization_events) then
    raise exception 'p36 authorization ledger contains audit rows; export it and set p36_sci_auth.allow_destructive_rollback=on';
  end if;
end $$;

drop function if exists public.p36_sci_auth_list_v1(text, bigint, int);
drop function if exists public.p36_sci_auth_append_v1(text, uuid, text, text);
drop table if exists public.p36_scientific_authorization_events;
drop function if exists public.p36_sci_auth_reject_mutation();
drop function if exists public.p36_sci_auth_event_hash(text, text, uuid, text, text, text);
drop function if exists public.p36_sci_auth_has_role(text, text[]);
