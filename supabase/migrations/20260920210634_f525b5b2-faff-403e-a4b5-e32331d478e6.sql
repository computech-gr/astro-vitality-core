create or replace function public.create_mission_crew_member(
  p_mission_id text,
  p_display_name text,
  p_external_ref text default null,
  p_status text default 'candidate'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_name text;
  v_external_ref text;
  v_status text;
  v_crew_id text;
  v_mission_status text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then raise exception 'crew creation denied'; end if;

  select status into v_mission_status from public.missions where id=p_mission_id;
  if v_mission_status not in ('planning','active') then raise exception 'crew cannot be added to a closed mission'; end if;

  v_display_name := btrim(coalesce(p_display_name,''));
  v_external_ref := nullif(btrim(coalesce(p_external_ref,'')), '');
  v_status := coalesce(nullif(btrim(p_status),''),'candidate');
  if length(v_display_name) < 2 or length(v_display_name) > 100 then raise exception 'crew display name must be 2-100 characters'; end if;
  if v_external_ref is not null and length(v_external_ref) > 100 then raise exception 'crew external reference too long'; end if;
  if v_status not in ('candidate','active','inactive') then raise exception 'invalid crew status'; end if;

  v_crew_id := 'crew-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.crew_members(id, external_ref, display_name, status)
  values(v_crew_id, v_external_ref, v_display_name, v_status);
  insert into public.mission_crew_assignments(mission_id, crew_member_id, status, created_by)
  values(p_mission_id, v_crew_id, v_status, auth.uid());

  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values(p_mission_id, auth.uid(), 'crew_member_created', 'crew_member', v_crew_id,
    jsonb_build_object('display_name',v_display_name,'status',v_status,'external_ref_present',v_external_ref is not null));

  return jsonb_build_object('crew_member_id',v_crew_id,'display_name',v_display_name,'status',v_status);
end;
$$;
revoke all on function public.create_mission_crew_member(text,text,text,text) from public, anon;
grant execute on function public.create_mission_crew_member(text,text,text,text) to authenticated;
