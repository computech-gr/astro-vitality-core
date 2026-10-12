-- P24: Explicit, operator-authorized reuse of an existing global crew identity.
-- No crew duplication, no event reassignment, no cross-mission access grants.
create or replace function public.assign_existing_crew_to_mission(
  p_source_mission_id text, p_target_mission_id text, p_crew_member_id text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_target_status text; v_source_status text; v_crew_name text; v_assignment_status text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_source_mission_id is null or p_target_mission_id is null or p_crew_member_id is null
     or p_source_mission_id = p_target_mission_id then raise exception 'distinct source and target missions required'; end if;
  if not public.has_mission_role(p_source_mission_id,array['mission_operator'])
     or not public.has_mission_role(p_target_mission_id,array['mission_operator']) then
    raise exception 'operator access required for both missions';
  end if;
  select status into v_target_status from public.missions where id=p_target_mission_id for update;
  if v_target_status is null or v_target_status not in ('planning','active') then
    raise exception 'target mission must be planning or active';
  end if;
  select status into v_source_status from public.mission_crew_assignments
    where mission_id=p_source_mission_id and crew_member_id=p_crew_member_id;
  if v_source_status is null then raise exception 'crew identity not assigned to source mission'; end if;
  select display_name into v_crew_name from public.crew_members where id=p_crew_member_id;
  if v_crew_name is null then raise exception 'crew identity not found'; end if;
  if exists(select 1 from public.mission_crew_assignments where mission_id=p_target_mission_id and crew_member_id=p_crew_member_id) then
    raise exception 'crew identity already assigned to target mission';
  end if;
  -- New mission starts as candidate; explicit activation remains an operator decision.
  v_assignment_status := 'candidate';
  insert into public.mission_crew_assignments(mission_id,crew_member_id,status,created_by)
  values(p_target_mission_id,p_crew_member_id,v_assignment_status,auth.uid());
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_target_mission_id,auth.uid(),'existing_crew_assigned','crew_member',p_crew_member_id,
    jsonb_build_object('source_mission_id',p_source_mission_id,'status',v_assignment_status));
  return jsonb_build_object('crew_member_id',p_crew_member_id,'display_name',v_crew_name,
    'mission_id',p_target_mission_id,'status',v_assignment_status);
end $$;
revoke all on function public.assign_existing_crew_to_mission(text,text,text) from public, anon;
grant execute on function public.assign_existing_crew_to_mission(text,text,text) to authenticated;