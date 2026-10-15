-- P36.5 STAGED ONLY. Apply only after P36.2B10 and P36.4 with owner approval.
-- No direct SELECT grants on review tables. Synthetic-only metadata, no values/excerpts/files.
create or replace function public.p36_list_synthetic_review_history(p_mission_id text, p_crew_member_id text)
returns table(batch_id uuid, observed_on date, created_at timestamptz, review_status text, item_count bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or p_mission_id is null or p_crew_member_id is null then
    raise exception 'P36 history requires authenticated Crew Self' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.mission_memberships mm
    where mm.user_id = auth.uid() and mm.active = true and mm.role = 'crew_self'
      and mm.mission_id = p_mission_id and mm.crew_member_id = p_crew_member_id
  ) then
    raise exception 'P36 history access denied' using errcode = '42501';
  end if;
  return query
    select b.id, b.observation_date, b.created_at, b.status,
      (select count(*) from public.p36_biomarker_review_items i where i.batch_id = b.id)
    from public.p36_biomarker_review_batches b
    where b.mission_id = p_mission_id and b.crew_member_id = p_crew_member_id
      and b.classification = 'synthetic'
      and b.submitted_by_user_snapshot = auth.uid()
    order by b.observation_date desc, b.created_at desc, b.id desc
    limit 100;
end $$;
revoke all on function public.p36_list_synthetic_review_history(text,text) from public, anon;
grant execute on function public.p36_list_synthetic_review_history(text,text) to authenticated;
comment on function public.p36_list_synthetic_review_history(text,text) is 'P36.5 read-only Crew Self synthetic batch metadata, max 100, no files/values/excerpts; owner-activation required.';
