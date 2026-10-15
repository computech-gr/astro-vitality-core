-- P36.8A: read-only, synthetic-only Ground Medical review queue.
-- Deploy ONLY to Lovable Cloud after live schema/role verification and owner approval.
-- No review decisions, status updates, clinical promotion or direct table grants.
create or replace function public.p368_list_ground_medical_pending(p_mission_id text)
returns table(batch_id uuid, crew_member_id text, observed_on date, submitted_at timestamptz, item_count bigint, review_status text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or p_mission_id is null then
    raise exception 'P36.8A access denied' using errcode='42501';
  end if;
  -- Lock the active membership while reading to serialize with revocation.
  perform 1 from public.mission_memberships mm
    where mm.user_id = auth.uid() and mm.active = true
      and mm.role = 'ground_medical' and mm.mission_id = p_mission_id
    for share;
  if not found then
    raise exception 'P36.8A access denied' using errcode='42501';
  end if;
  return query
    select b.id, b.crew_member_id, b.observation_date, b.created_at,
      (select count(*) from public.p36_biomarker_review_items i where i.batch_id=b.id), b.status
    from public.p36_biomarker_review_batches b
    where b.mission_id=p_mission_id and b.classification='synthetic'
      and b.status='pending_review' and b.submitted_by_user_snapshot <> auth.uid()
    order by b.created_at asc, b.id asc limit 100;
end $$;
revoke all on function public.p368_list_ground_medical_pending(text) from public, anon;
grant execute on function public.p368_list_ground_medical_pending(text) to authenticated;

create or replace function public.p368_get_ground_medical_batch(p_mission_id text, p_batch_id uuid)
returns table(batch_id uuid, crew_member_id text, observed_on date, submitted_at timestamptz,
              review_status text, metric_id text, measured_value numeric, unit text, source_excerpt text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or p_mission_id is null or p_batch_id is null then
    raise exception 'P36.8A access denied' using errcode='42501';
  end if;
  perform 1 from public.mission_memberships mm
    where mm.user_id=auth.uid() and mm.active=true and mm.role='ground_medical'
      and mm.mission_id=p_mission_id for share;
  if not found then
    raise exception 'P36.8A access denied' using errcode='42501';
  end if;
  return query
    select b.id,b.crew_member_id,b.observation_date,b.created_at,b.status,
           i.metric_id,i.measured_value,i.unit,i.source_excerpt
    from public.p36_biomarker_review_batches b
    join public.p36_biomarker_review_items i on i.batch_id=b.id
    where b.id=p_batch_id and b.mission_id=p_mission_id and b.classification='synthetic'
      and b.status='pending_review' and b.submitted_by_user_snapshot <> auth.uid()
    order by i.metric_id asc;
end $$;
revoke all on function public.p368_get_ground_medical_batch(text,uuid) from public, anon;
grant execute on function public.p368_get_ground_medical_batch(text,uuid) to authenticated;
comment on function public.p368_list_ground_medical_pending(text) is 'P36.8A synthetic-only independent Ground Medical read-only queue; max 100';
comment on function public.p368_get_ground_medical_batch(text,uuid) is 'P36.8A synthetic-only Ground Medical read-only batch detail; no decisions';
