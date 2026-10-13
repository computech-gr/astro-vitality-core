-- P28: Fail-closed privacy containment for research export.
-- Replace row-level pseudonymized records with a coarse mission aggregate.
-- No participant identifiers, exact timestamps, source/device IDs or payloads.
create or replace function public.export_research_mission(p_mission_id text)
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_crew integer;
  v_events bigint;
  v_bucket bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['researcher','ground_medical']) then
    raise exception 'research export denied';
  end if;
  -- At least three distinct crew members must have recorded data; no small-cohort exports.
  select count(distinct crew_member_id), count(*) into v_crew, v_events
  from public.mission_events where mission_id = p_mission_id;
  if v_crew < 3 then
    insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
    values(p_mission_id,auth.uid(),'research_export_suppressed','mission',
      jsonb_build_object('reason','minimum_cohort_not_met','policy','p28-v1'));
    return;
  end if;
  -- Suppress rare-event statistics and coarsen counts to tens.
  v_bucket := (v_events / 10) * 10;
  if v_bucket < 10 then
    insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
    values(p_mission_id,auth.uid(),'research_export_suppressed','mission',
      jsonb_build_object('reason','minimum_event_volume_not_met','policy','p28-v1'));
    return;
  end if;
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
  values(p_mission_id,auth.uid(),'research_export_aggregate','mission',
    jsonb_build_object('policy','p28-v1','record_count',1));
  return query select jsonb_build_object(
    'schema','mitochondria.research.aggregate.v1',
    'cohort','3_or_more',
    'event_count_lower_bound',v_bucket,
    'event_count_bucket_width',10,
    'suppression_policy','minimum_3_crew_and_10_events',
    'classification','aggregate_only'
  );
end $$;
revoke all on function public.export_research_mission(text) from public, anon;
grant execute on function public.export_research_mission(text) to authenticated;
