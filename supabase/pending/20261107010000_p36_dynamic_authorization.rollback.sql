begin;
do $$ begin
  if exists(select 1 from public.p36_dynamic_authorization_events) then raise exception 'Rollback refused: scientific audit events exist; separately authorize a preservation plan.'; end if;
end $$;
drop function public.p36_dynamic_auth_list_v1(text,text,text,bigint,int);
drop function public.p36_dynamic_auth_append_v1(text,text,text,uuid,text,text);
drop table public.p36_dynamic_authorization_events;
drop function public.p36_dynamic_auth_has_role(text,text[]);
drop function public.p36_dynamic_auth_event_hash(text,text,uuid,text,text,text);
drop function public.p36_dynamic_auth_reject_mutation();
commit;