-- FV-01 Security & Privacy Remediation
-- STATUS: PROPOSED — NOT APPLIED. Requires explicit owner approval before it is
-- moved to supabase/migrations/ and applied once. Additive/tightening only:
-- no tables or columns are dropped, no data is modified, no permission is broadened.
--
-- Addresses FV-01-01, -02, -03, -04, -05, -06, -08, -10 and FV-01-12
-- (TRUNCATE/REFERENCES/TRIGGER privileges found during the FV-01 grant review).

begin;

-- ---------------------------------------------------------------------------
-- FV-01-01: Crew Self reads of mission_events require an ACTIVE membership.
-- ---------------------------------------------------------------------------
drop policy if exists mission_events_scoped_select on public.mission_events;
create policy mission_events_scoped_select on public.mission_events
  for select to authenticated
  using (
    public.has_mission_role(mission_id, array['ground_medical'])
    or exists (
      select 1 from public.mission_memberships mm
      where mm.mission_id = mission_events.mission_id
        and mm.user_id = auth.uid()
        and mm.role = 'crew_self'
        and mm.active
        and mm.crew_member_id = mission_events.crew_member_id
    )
  );

-- ---------------------------------------------------------------------------
-- FV-01-08: crew_members self branch requires an ACTIVE membership.
-- ---------------------------------------------------------------------------
drop policy if exists crew_member_ground_select on public.crew_members;
create policy crew_member_ground_select on public.crew_members
  for select to authenticated
  using (
    exists (
      select 1 from public.mission_memberships mm
      where mm.crew_member_id = crew_members.id
        and (
          (mm.user_id = auth.uid() and mm.active)
          or public.has_mission_role(mm.mission_id, array['ground_medical','mission_operator'])
        )
    )
  );

-- ---------------------------------------------------------------------------
-- FV-01-05 / FV-01-12: browser roles keep SELECT only (writes stay RPC-only).
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger
  on public.crew_members, public.mission_memberships, public.missions
  from authenticated, anon;
revoke truncate, references, trigger
  on public.mission_events, public.audit_events, public.crew_health_record_index
  from authenticated, anon;

-- ---------------------------------------------------------------------------
-- FV-01-02 / FV-01-03: scoped idempotency, concurrency-safe insert,
-- active-assignment and lifecycle validation with an offline-retry window.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_mission_event(p_event jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer set search_path = public, extensions, pg_temp
as $function$
declare
  v_mission text; v_crew text; v_id text; v_kind text; v_classification text;
  v_source_id text; v_source_version text; v_priority integer; v_hash text;
  v_event_ts timestamptz; v_created_ts timestamptz;
  v_existing public.mission_events%rowtype;
  v_is_crew_self boolean; v_is_ground_medical boolean; v_is_operator boolean;
  v_mission_status text; v_mission_ends timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then raise exception 'event object required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 256 then
    raise exception 'invalid idempotency key';
  end if;

  v_mission := nullif(btrim(p_event#>>'{mission,missionId}'), '');
  v_crew := nullif(btrim(p_event#>>'{mission,crewMemberId}'), '');
  v_id := nullif(btrim(p_event->>'id'), '');
  v_kind := nullif(btrim(p_event->>'kind'), '');
  v_classification := nullif(btrim(p_event->>'classification'), '');
  v_source_id := nullif(btrim(p_event->>'sourceId'), '');
  v_source_version := nullif(btrim(p_event->>'sourceVersion'), '');
  v_priority := coalesce((p_event->>'sourcePriority')::integer, 50);

  if v_mission is null or v_crew is null or v_id is null then raise exception 'mission, crew and event id are required'; end if;
  if length(v_mission) > 128 or length(v_crew) > 128 or length(v_id) > 160 then raise exception 'event identifiers too long'; end if;
  if v_kind not in ('observation','self_check','readiness_assessment','health_finding','action_guidance','acknowledgement','protocol_snapshot','operational_event') then raise exception 'unsupported event kind'; end if;
  if v_classification not in ('synthetic','deidentified','mission_sensitive','medical_sensitive') then raise exception 'unsupported classification'; end if;
  if v_source_id is null or v_source_version is null or length(v_source_id) > 160 or length(v_source_version) > 80 then raise exception 'invalid source provenance'; end if;
  if v_priority < 0 or v_priority > 100 then raise exception 'source priority out of range'; end if;
  if p_event->'payload' is null or jsonb_typeof(p_event->'payload') not in ('object','array') then raise exception 'structured payload required'; end if;
  if octet_length((p_event->'payload')::text) > 262144 then raise exception 'payload too large'; end if;

  v_event_ts := (p_event->>'eventTimestamp')::timestamptz;
  v_created_ts := (p_event->>'createdAt')::timestamptz;

  select exists(select 1 from public.mission_memberships mm where mm.mission_id=v_mission and mm.user_id=auth.uid() and mm.role='crew_self' and mm.crew_member_id=v_crew and mm.active) into v_is_crew_self;
  select public.has_mission_role(v_mission,array['ground_medical']) into v_is_ground_medical;
  select public.has_mission_role(v_mission,array['mission_operator']) into v_is_operator;

  if not (v_is_crew_self or v_is_ground_medical or v_is_operator) then raise exception 'mission access denied'; end if;
  if v_is_operator and not v_is_ground_medical and not v_is_crew_self then
    if v_kind <> 'operational_event' or v_classification = 'medical_sensitive' then
      raise exception 'mission operator event scope denied';
    end if;
  end if;

  v_hash := encode(digest(convert_to((p_event->'payload')::text,'UTF8'),'sha256'),'hex');

  -- Serialize concurrent requests for the same identifiers (FV-01-02 race).
  perform pg_advisory_xact_lock(hashtext('mitochondria:event-id:' || v_id));
  perform pg_advisory_xact_lock(hashtext('mitochondria:idem:' || p_idempotency_key));

  select * into v_existing from public.mission_events
  where idempotency_key=p_idempotency_key or id=v_id
  order by (id = v_id) desc
  limit 1;
  if found then
    -- Metadata is disclosed ONLY within the caller's authorized mission + crew scope.
    if v_existing.mission_id <> v_mission or v_existing.crew_member_id <> v_crew or v_existing.id <> v_id then
      return jsonb_build_object('status','rejected','record_id',v_id,'reason','identifier_unavailable');
    end if;
    if v_existing.payload_hash = v_hash then
      -- Duplicates are idempotent even after mission close, so offline retries never fail.
      return jsonb_build_object('status','duplicate','record_id',v_existing.id);
    end if;
    return jsonb_build_object(
      'status','conflict','record_id',v_existing.id,
      'remote',jsonb_build_object(
        'id',v_existing.id,'sourceId',v_existing.source_id,'sourceVersion',v_existing.source_version,
        'sourcePriority',v_existing.source_priority,'eventTimestamp',v_existing.event_timestamp,
        'payloadHash',v_existing.payload_hash
      )
    );
  end if;

  -- FV-01-03: new writes require an active crew assignment in this mission.
  if not exists(
    select 1 from public.mission_crew_assignments mca
    where mca.mission_id=v_mission and mca.crew_member_id=v_crew and mca.status='active'
  ) then raise exception 'crew assignment inactive for mission'; end if;

  -- FV-01-03: lifecycle. Closed missions only accept offline events captured
  -- before the mission end (legitimate store-and-forward retries).
  select status, ends_at into v_mission_status, v_mission_ends from public.missions where id=v_mission;
  if v_mission_status is null then raise exception 'mission access denied'; end if;
  if v_mission_status in ('completed','aborted') then
    if v_mission_ends is null or v_event_ts > v_mission_ends then
      raise exception 'mission closed for new events';
    end if;
  elsif v_mission_status not in ('planning','active') then
    raise exception 'mission closed for new events';
  end if;

  begin
    insert into public.mission_events(
      id,mission_id,crew_member_id,kind,event_timestamp,created_at,source_id,source_version,
      source_priority,classification,payload,payload_hash,idempotency_key,ingested_by
    ) values(
      v_id,v_mission,v_crew,v_kind,v_event_ts,v_created_ts,
      v_source_id,v_source_version,v_priority,v_classification,p_event->'payload',v_hash,p_idempotency_key,auth.uid()
    );
  exception when unique_violation then
    -- Lost a race with a differently-keyed request; never disclose the winner's metadata.
    return jsonb_build_object('status','rejected','record_id',v_id,'reason','identifier_unavailable');
  end;

  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(v_mission,auth.uid(),'mission_event_ingested','mission_event',v_id,
    jsonb_build_object('kind',v_kind,'classification',v_classification,'source_id',v_source_id));
  return jsonb_build_object('status','accepted','record_id',v_id);
end $function$;

-- ---------------------------------------------------------------------------
-- FV-01-04: Mission Operators receive operational totals only.
-- ---------------------------------------------------------------------------
create or replace function public.get_ground_mission_snapshot(p_mission_id text)
returns jsonb
language plpgsql
security definer set search_path = public, extensions, pg_temp
as $function$
declare v_result jsonb; v_medical boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id,array['ground_medical','mission_operator']) then raise exception 'ground access denied'; end if;
  v_medical := public.has_mission_role(p_mission_id,array['ground_medical']);
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
  values(p_mission_id,auth.uid(),'ground_snapshot_read','mission',
    jsonb_build_object('purpose','ground_console','scope',case when v_medical then 'identified_medical' else 'operational' end));

  if v_medical then
    select jsonb_build_object(
      'mission_id',p_mission_id,'scope','identified_medical','generated_at',now(),
      'total_events',count(*),'latest_event_at',max(event_timestamp),
      'crew_count',count(distinct crew_member_id),
      'finding_count',count(*) filter(where kind='health_finding'),
      'action_count',count(*) filter(where kind='action_guidance'),
      'device_health_event_count',count(*) filter(where kind='operational_event' and payload->>'category'='device_health'),
      'crew',coalesce((select jsonb_agg(row_to_json(x)) from (
        select crew_member_id, count(*) event_count, max(event_timestamp) latest_event_at
        from public.mission_events where mission_id=p_mission_id
        group by crew_member_id order by crew_member_id) x),'[]'::jsonb)
    ) into v_result from public.mission_events where mission_id=p_mission_id;
  else
    select jsonb_build_object(
      'mission_id',p_mission_id,'scope','operational','generated_at',now(),
      'total_events',null,'latest_event_at',null,'finding_count',null,'action_count',null,
      'crew_count',(select count(*) from public.mission_crew_assignments where mission_id=p_mission_id and status='active'),
      'device_health_event_count',count(*) filter(where kind='operational_event' and payload->>'category'='device_health'),
      'crew','[]'::jsonb
    ) into v_result from public.mission_events where mission_id=p_mission_id;
  end if;
  return v_result;
end $function$;

-- ---------------------------------------------------------------------------
-- FV-01-06: research export — frozen closed-mission dataset, assigned cohort,
-- one export (or suppression) per caller per mission per 24h. Fails closed.
-- ---------------------------------------------------------------------------
create or replace function public.export_research_mission(p_mission_id text)
returns setof jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $function$
declare
  v_crew integer; v_events bigint; v_bucket bigint;
  v_status text; v_ends timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['researcher','ground_medical']) then
    raise exception 'research export denied';
  end if;

  -- FV-01.1 concurrency: the transaction-scoped lock serializes concurrent exports by
  -- the same user for the same mission. Under READ COMMITTED (PostgREST default) the
  -- EXISTS below takes a fresh snapshot after the lock is granted, so it observes the
  -- audit row committed by the first request and the second request is refused.
  -- The limit is per user, not per role: a user holding both researcher and
  -- ground_medical shares one budget. Rate limiting is NOT an anonymity guarantee;
  -- protection rests on the frozen dataset, cohort minimum and coarse bucketing.
  perform pg_advisory_xact_lock(hashtext('mitochondria:research-export:' || p_mission_id || ':' || auth.uid()::text));
  if exists(
    select 1 from public.audit_events
    where mission_id=p_mission_id and actor_user_id=auth.uid()
      and action in ('research_export_aggregate','research_export_suppressed')
      and occurred_at > now() - interval '24 hours'
  ) then
    raise exception 'research export rate limit: one export per mission per 24 hours';
  end if;

  select status, ends_at into v_status, v_ends from public.missions where id=p_mission_id;
  if v_status not in ('completed','aborted') or v_ends is null then
    insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
    values(p_mission_id,auth.uid(),'research_export_suppressed','mission',
      jsonb_build_object('reason','mission_not_closed','policy','fv01-v1'));
    return;
  end if;

  -- Frozen dataset: events ingested by mission end, from crew ever assigned to the
  -- mission. Assignment STATUS is deliberately not used: it remains editable after
  -- close and would let an operator toggle a single crew member in/out (differencing).
  -- Assignment rows have no delete path; ends_at is immutable after close (below);
  -- mission_events is append-only. Repeated queries therefore return identical output.
  select count(distinct e.crew_member_id), count(*) into v_crew, v_events
  from public.mission_events e
  where e.mission_id=p_mission_id and e.ingested_at <= v_ends
    and exists(select 1 from public.mission_crew_assignments a
               where a.mission_id=e.mission_id and a.crew_member_id=e.crew_member_id);

  if v_crew < 3 then
    insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
    values(p_mission_id,auth.uid(),'research_export_suppressed','mission',
      jsonb_build_object('reason','minimum_cohort_not_met','policy','fv01-v1'));
    return;
  end if;
  v_bucket := (v_events / 10) * 10;
  if v_bucket < 10 then
    insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
    values(p_mission_id,auth.uid(),'research_export_suppressed','mission',
      jsonb_build_object('reason','minimum_event_volume_not_met','policy','fv01-v1'));
    return;
  end if;
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
  values(p_mission_id,auth.uid(),'research_export_aggregate','mission',
    jsonb_build_object('policy','fv01-v1','record_count',1));
  return query select jsonb_build_object(
    'schema','mitochondria.research.aggregate.v1',
    'cohort','3_or_more',
    'event_count_lower_bound',v_bucket,
    'event_count_bucket_width',10,
    'suppression_policy','minimum_3_crew_and_10_events',
    'classification','aggregate_only'
  );
end $function$;

-- ---------------------------------------------------------------------------
-- FV-01-10: invitation redemption never silently replaces a Crew Self binding.
-- ---------------------------------------------------------------------------
create or replace function public.accept_mission_invite(p_code text)
returns jsonb
language plpgsql
security definer set search_path = public, extensions, pg_temp
as $function$
declare
  v_hash text;
  v_invite public.mission_invites%rowtype;
  v_current public.mission_memberships%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(btrim(p_code),'') = '' then raise exception 'invite code required'; end if;

  v_hash := encode(digest(btrim(p_code), 'sha256'), 'hex');
  select * into v_invite from public.mission_invites
  where code_hash=v_hash and active and claimed_at is null and expires_at > now()
  for update;
  if not found then raise exception 'mission invite is invalid, expired, or already used'; end if;

  if v_invite.role='crew_self' then
    if not exists(
      select 1 from public.mission_crew_assignments mca
      where mca.mission_id=v_invite.mission_id and mca.crew_member_id=v_invite.crew_member_id and mca.status='active'
    ) then raise exception 'crew member is not active in this mission'; end if;
    if exists(
      select 1 from public.mission_memberships mm
      where mm.mission_id=v_invite.mission_id and mm.crew_member_id=v_invite.crew_member_id
        and mm.role='crew_self' and mm.active and mm.user_id<>auth.uid()
    ) then raise exception 'crew member already has an active crew-self identity'; end if;

    select * into v_current from public.mission_memberships
    where mission_id=v_invite.mission_id and user_id=auth.uid() and role='crew_self'
    for update;
    if found and v_current.crew_member_id is distinct from v_invite.crew_member_id then
      -- FV-01.1: a RAISE here would roll back the audit row. Instead, fail closed by
      -- RETURNING a rejection so the audit evidence and invite revocation commit,
      -- while the membership is left completely untouched.
      update public.mission_invites set active=false where id=v_invite.id;
      insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
      values(v_invite.mission_id,auth.uid(),'mission_invite_binding_conflict','mission_invite',v_invite.id::text,
        jsonb_build_object('existing_crew_member_id',v_current.crew_member_id,'invite_crew_member_id',v_invite.crew_member_id,
          'existing_active',v_current.active,'invite_revoked',true));
      return jsonb_build_object('status','rejected','reason','crew_self_binding_conflict',
        'message','existing crew-self binding differs; operator review required');
    end if;
  end if;

  insert into public.mission_memberships(mission_id,user_id,crew_member_id,role,active)
  values(v_invite.mission_id,auth.uid(),v_invite.crew_member_id,v_invite.role,true)
  on conflict (mission_id,user_id,role) do update
    set crew_member_id=excluded.crew_member_id, active=true;

  update public.mission_invites set claimed_by=auth.uid(), claimed_at=now(), active=false where id=v_invite.id;
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(v_invite.mission_id,auth.uid(),'mission_invite_accepted','mission_membership',v_invite.id::text,
    jsonb_build_object('role',v_invite.role,'crew_member_id',v_invite.crew_member_id));

  return jsonb_build_object('mission_id',v_invite.mission_id,'role',v_invite.role,'crew_member_id',v_invite.crew_member_id);
end;
$function$;

-- Re-assert least-privilege execute grants (unchanged audience: authenticated only).
revoke all on function public.ingest_mission_event(jsonb, text) from public, anon;
revoke all on function public.get_ground_mission_snapshot(text) from public, anon;
revoke all on function public.export_research_mission(text) from public, anon;
revoke all on function public.accept_mission_invite(text) from public, anon;
grant execute on function public.ingest_mission_event(jsonb, text) to authenticated;
grant execute on function public.get_ground_mission_snapshot(text) to authenticated;
grant execute on function public.export_research_mission(text) to authenticated;
grant execute on function public.accept_mission_invite(text) to authenticated;

commit;
