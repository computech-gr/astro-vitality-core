-- PENDING: narrowly scoped roster read; never applies to production automatically.
-- Depends on p36_dynamic_scope from 20261107000000_p36_dynamic_handoff.sql.
begin;
create function public.p36_dynamic_crew_roster_v1(p_mission_id text)
returns table(mission_id text, crew_member_id text, display_name text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.mission_memberships m where m.mission_id=p_mission_id
      and m.user_id=auth.uid() and m.active and m.role in ('crew_self','ground_medical','researcher')
  ) then raise exception 'scope denied' using errcode='42501'; end if;
  return query select a.mission_id, a.crew_member_id, c.display_name
    from public.mission_crew_assignments a join public.crew_members c on c.id=a.crew_member_id
    where a.mission_id=p_mission_id and a.status='active' and exists (
      select 1 from public.mission_memberships m where m.mission_id=a.mission_id
        and m.user_id=auth.uid() and m.active and m.role in ('crew_self','ground_medical','researcher')
        and (m.crew_member_id=a.crew_member_id or (m.crew_member_id is null and m.role in ('ground_medical','researcher')))
    ) order by c.display_name, a.crew_member_id;
end $$;
revoke all on function public.p36_dynamic_crew_roster_v1(text) from public,anon,authenticated,service_role;
grant execute on function public.p36_dynamic_crew_roster_v1(text) to authenticated;
commit;