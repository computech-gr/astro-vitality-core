-- Data-preserving rollback: no override flag; preservation requires a separately reviewed plan.
begin;
do $$ begin
  if exists(select 1 from public.p36_dynamic_handoff_submissions) or exists(select 1 from public.p36_dynamic_handoff_terms) then
    raise exception 'Rollback refused: immutable handoff records exist. Preserve them under a separately authorized plan.';
  end if;
end $$;
drop function public.p36_dynamic_handoff_list_v1(text,text,text,bigint,int);
drop function public.p36_dynamic_handoff_append_v1(text,text,text,text,text,text);
drop table public.p36_dynamic_handoff_terms;
drop table public.p36_dynamic_handoff_submissions;
drop function public.p36_dynamic_scope(text,text,boolean);
drop function public.p36_dynamic_reject_mutation();
commit;