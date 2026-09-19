-- P16 Security & Safety Hardening
-- Tightens the P15 mission boundary without changing the scientific model.

-- Helper functions are never anonymous/browser-public capabilities.
revoke all on function public.ensure_mission_research_key() from public, anon, authenticated;
grant execute on function public.ensure_mission_research_key() to service_role;

revoke all on function public.has_mission_role(text,text[]) from public, anon;
grant execute on function public.has_mission_role(text,text[]) to authenticated;

-- A crew-self membership must always bind to a concrete crew member.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mission_memberships_crew_self_ck'
  ) then
    alter table public.mission_memberships
      add constraint mission_memberships_crew_self_ck
      check (role <> 'crew_self' or crew_member_id is not null) not valid;
  end if;
end $$;
alter table public.mission_memberships validate constraint mission_memberships_crew_self_ck;

-- Recursive best-effort removal of direct/free-text identifiers before research export.
-- This is pseudonymization, not a claim of irreversible anonymization.
create or replace function public.deidentify_research_jsonb(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_value is null then return null; end if;
  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(jsonb_object_agg(e.key, public.deidentify_research_jsonb(e.value)), '{}'::jsonb)
      into v_result
      from jsonb_each(p_value) e
      where lower(e.key) not in (
        'displayname','name','firstname','lastname','email','phone','address','birthdate','dob',
        'externalref','actorid','crewmemberid','userid','user_id','crew_member_id',
        'notes','note','comment','comments','message','freetext','free_text'
      );
      return v_result;
    when 'array' then
      select coalesce(jsonb_agg(public.deidentify_research_jsonb(e.value)), '[]'::jsonb)
      into v_result from jsonb_array_elements(p_value) e(value);
      return v_result;
    else
      return p_value;
  end case;
end $$;
revoke all on function public.deidentify_research_jsonb(jsonb) from public, anon, authenticated;
grant execute on function public.deidentify_research_jsonb(jsonb) to service_role;

create or replace function public.ingest_mission_event(p_event jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission text;
  v_crew text;
  v_id text;
  v_kind text;
  v_classification text;
  v_source_id text;
  v_source_version text;
  v_priority integer;
  v_hash text;
  v_existing public.mission_events%rowtype;
  v_is_crew_self boolean;
  v_is_ground_medical boolean;
  v_is_operator boolean;
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

  -- Cast once here so malformed timestamps fail closed before any write.
  perform (p_event->>'eventTimestamp')::timestamptz;
  perform (p_event->>'createdAt')::timestamptz;

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
  select * into v_existing from public.mission_events where idempotency_key=p_idempotency_key or id=v_id limit 1;
  if found then
    if v_existing.id = v_id and v_existing.payload_hash = v_hash and v_existing.mission_id = v_mission and v_existing.crew_member_id = v_crew then
      return jsonb_build_object('status','duplicate','record_id',v_existing.id);
    end if;
    return jsonb_build_object(
      'status','conflict',
      'record_id',v_existing.id,
      'remote',jsonb_build_object(
        'id',v_existing.id,'sourceId',v_existing.source_id,'sourceVersion',v_existing.source_version,
        'sourcePriority',v_existing.source_priority,'eventTimestamp',v_existing.event_timestamp,
        'payloadHash',v_existing.payload_hash
      )
    );
  end if;

  insert into public.mission_events(
    id,mission_id,crew_member_id,kind,event_timestamp,created_at,source_id,source_version,
    source_priority,classification,payload,payload_hash,idempotency_key,ingested_by
  ) values(
    v_id,v_mission,v_crew,v_kind,(p_event->>'eventTimestamp')::timestamptz,(p_event->>'createdAt')::timestamptz,
    v_source_id,v_source_version,v_priority,v_classification,p_event->'payload',v_hash,p_idempotency_key,auth.uid()
  );
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(v_mission,auth.uid(),'mission_event_ingested','mission_event',v_id,jsonb_build_object('kind',v_kind,'classification',v_classification,'source_id',v_source_id));
  return jsonb_build_object('status','accepted','record_id',v_id);
end $$;
revoke all on function public.ingest_mission_event(jsonb,text) from public, anon;
grant execute on function public.ingest_mission_event(jsonb,text) to authenticated;

create or replace function public.export_research_mission(p_mission_id text)
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id,array['researcher','ground_medical']) then raise exception 'research export denied'; end if;
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata)
  values(p_mission_id,auth.uid(),'research_export','mission',jsonb_build_object('deidentified',true,'pseudonymized',true));
  return query
  select jsonb_build_object(
    'participant_id','p_'||substr(encode(digest(k.pseudonym_salt || convert_to(e.crew_member_id::text,'UTF8'),'sha256'),'hex'),1,20),
    'mission_id',e.mission_id,
    'kind',e.kind,
    'occurred_at',e.event_timestamp,
    'classification','deidentified',
    'payload',public.deidentify_research_jsonb(e.payload),
    'source_category',split_part(e.source_id,':',1)
  )
  from public.mission_events e
  join public.mission_research_keys k on k.mission_id=e.mission_id
  where e.mission_id=p_mission_id
  order by e.event_timestamp;
end $$;
revoke all on function public.export_research_mission(text) from public, anon;
grant execute on function public.export_research_mission(text) to authenticated;

-- Reassert table privilege/RLS posture after hardening.
revoke all on public.missions, public.crew_members, public.mission_memberships, public.mission_research_keys, public.mission_events, public.audit_events from anon;
revoke all on public.mission_research_keys from authenticated;
revoke insert, update, delete on public.mission_events, public.audit_events from authenticated;
