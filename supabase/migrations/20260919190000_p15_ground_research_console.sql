-- P15 Ground / Research Console: mission-scoped persistence, role separation, audit and de-identified export.
create extension if not exists pgcrypto;

create table if not exists public.missions (
  id text primary key, code text not null unique, name text not null,
  status text not null check (status in ('planning','active','completed','aborted')),
  starts_at timestamptz, ends_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crew_members (
  id text primary key, external_ref text, display_name text not null,
  status text not null check (status in ('candidate','active','inactive')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.mission_memberships (
  id uuid primary key default gen_random_uuid(), mission_id text not null references public.missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, crew_member_id text references public.crew_members(id) on delete cascade,
  role text not null check (role in ('crew_self','ground_medical','mission_operator','researcher')),
  active boolean not null default true, created_at timestamptz not null default now(), unique(mission_id,user_id,role)
);
create table if not exists public.mission_research_keys (
  mission_id text primary key references public.missions(id) on delete cascade,
  pseudonym_salt bytea not null default gen_random_bytes(32), created_at timestamptz not null default now()
);
insert into public.mission_research_keys(mission_id) select id from public.missions on conflict do nothing;

create or replace function public.ensure_mission_research_key() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into public.mission_research_keys(mission_id) values(new.id) on conflict do nothing; return new; end $$;
drop trigger if exists trg_mission_research_key on public.missions;
create trigger trg_mission_research_key after insert on public.missions for each row execute function public.ensure_mission_research_key();

create table if not exists public.mission_events (
  id text primary key, mission_id text not null references public.missions(id) on delete cascade,
  crew_member_id text not null references public.crew_members(id) on delete cascade,
  kind text not null, event_timestamp timestamptz not null, created_at timestamptz not null,
  source_id text not null, source_version text not null, source_priority integer not null,
  classification text not null check (classification in ('synthetic','deidentified','mission_sensitive','medical_sensitive')),
  payload jsonb not null, payload_hash text not null, idempotency_key text not null unique, ingested_by uuid not null references auth.users(id), ingested_at timestamptz not null default now()
);
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(), mission_id text not null references public.missions(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id), action text not null, target_type text not null, target_id text,
  metadata jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);

alter table public.missions enable row level security; alter table public.missions force row level security;
alter table public.crew_members enable row level security; alter table public.crew_members force row level security;
alter table public.mission_memberships enable row level security; alter table public.mission_memberships force row level security;
alter table public.mission_research_keys enable row level security; alter table public.mission_research_keys force row level security;
alter table public.mission_events enable row level security; alter table public.mission_events force row level security;
alter table public.audit_events enable row level security; alter table public.audit_events force row level security;

revoke all on public.missions, public.crew_members, public.mission_memberships, public.mission_research_keys, public.mission_events, public.audit_events from anon;
revoke all on public.mission_research_keys from authenticated;
revoke insert, update, delete on public.mission_events, public.audit_events from authenticated;

grant select on public.missions, public.crew_members, public.mission_memberships, public.mission_events, public.audit_events to authenticated;

create or replace function public.has_mission_role(p_mission_id text, p_roles text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.mission_memberships m where m.mission_id=p_mission_id and m.user_id=auth.uid() and m.active and m.role=any(p_roles));
$$;
revoke all on function public.has_mission_role(text,text[]) from public, anon;
grant execute on function public.has_mission_role(text,text[]) to authenticated;

create policy missions_member_select on public.missions for select to authenticated using (public.has_mission_role(id, array['crew_self','ground_medical','mission_operator','researcher']));
create policy memberships_self_or_ground_select on public.mission_memberships for select to authenticated using (user_id=auth.uid() or public.has_mission_role(mission_id,array['ground_medical','mission_operator']));
create policy crew_member_ground_select on public.crew_members for select to authenticated using (exists(select 1 from public.mission_memberships mm where mm.crew_member_id=crew_members.id and (mm.user_id=auth.uid() or public.has_mission_role(mm.mission_id,array['ground_medical','mission_operator']))));
create policy mission_events_scoped_select on public.mission_events for select to authenticated using (
  public.has_mission_role(mission_id,array['ground_medical']) or
  exists(select 1 from public.mission_memberships mm where mm.mission_id=mission_events.mission_id and mm.user_id=auth.uid() and mm.role='crew_self' and mm.crew_member_id=mission_events.crew_member_id)
);
create policy audit_ground_select on public.audit_events for select to authenticated using (public.has_mission_role(mission_id,array['ground_medical','mission_operator']));

create or replace function public.ingest_mission_event(p_event jsonb, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission text; v_crew text; v_id text; v_hash text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  v_mission := p_event#>>'{mission,missionId}'; v_crew := p_event#>>'{mission,crewMemberId}'; v_id := p_event->>'id';
  if not (public.has_mission_role(v_mission,array['ground_medical','mission_operator']) or exists(select 1 from public.mission_memberships mm where mm.mission_id=v_mission and mm.user_id=auth.uid() and mm.role='crew_self' and mm.crew_member_id=v_crew and mm.active)) then raise exception 'mission access denied'; end if;
  v_hash := encode(digest(convert_to((p_event->'payload')::text,'UTF8'),'sha256'),'hex');
  if exists(select 1 from public.mission_events where idempotency_key=p_idempotency_key or id=v_id) then return jsonb_build_object('status','duplicate','record_id',v_id); end if;
  insert into public.mission_events(id,mission_id,crew_member_id,kind,event_timestamp,created_at,source_id,source_version,source_priority,classification,payload,payload_hash,idempotency_key,ingested_by)
  values(v_id,v_mission,v_crew,p_event->>'kind',(p_event->>'eventTimestamp')::timestamptz,(p_event->>'createdAt')::timestamptz,p_event->>'sourceId',p_event->>'sourceVersion',coalesce((p_event->>'sourcePriority')::int,50),p_event->>'classification',p_event->'payload',v_hash,p_idempotency_key,auth.uid());
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata) values(v_mission,auth.uid(),'mission_event_ingested','mission_event',v_id,jsonb_build_object('kind',p_event->>'kind','classification',p_event->>'classification'));
  return jsonb_build_object('status','accepted','record_id',v_id);
end $$;
revoke all on function public.ingest_mission_event(jsonb,text) from public, anon;
grant execute on function public.ingest_mission_event(jsonb,text) to authenticated;

create or replace function public.get_ground_mission_snapshot(p_mission_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
 if not public.has_mission_role(p_mission_id,array['ground_medical','mission_operator']) then raise exception 'ground access denied'; end if;
 insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata) values(p_mission_id,auth.uid(),'ground_snapshot_read','mission',jsonb_build_object('purpose','ground_console'));
 select jsonb_build_object(
  'mission_id',p_mission_id,'generated_at',now(),'total_events',count(*),'latest_event_at',max(event_timestamp),
  'crew_count',count(distinct crew_member_id),
  'finding_count',count(*) filter(where kind='health_finding'),
  'action_count',count(*) filter(where kind='action_guidance'),
  'device_health_event_count',count(*) filter(where kind='operational_event' and payload->>'category'='device_health'),
  'crew',coalesce((select jsonb_agg(row_to_json(x)) from (select crew_member_id, count(*) event_count, max(event_timestamp) latest_event_at from public.mission_events where mission_id=p_mission_id group by crew_member_id order by crew_member_id) x),'[]'::jsonb)
) into v_result from public.mission_events where mission_id=p_mission_id;
 return v_result;
end $$;
revoke all on function public.get_ground_mission_snapshot(text) from public, anon;
grant execute on function public.get_ground_mission_snapshot(text) to authenticated;

create or replace function public.export_research_mission(p_mission_id text) returns setof jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.has_mission_role(p_mission_id,array['researcher','ground_medical']) then raise exception 'research export denied'; end if;
 insert into public.audit_events(mission_id,actor_user_id,action,target_type,metadata) values(p_mission_id,auth.uid(),'research_export','mission',jsonb_build_object('deidentified',true));
 return query select jsonb_build_object(
   'participant_id','p_'||substr(encode(digest(k.pseudonym_salt || convert_to(e.crew_member_id::text,'UTF8'),'sha256'),'hex'),1,20),
   'mission_id',e.mission_id,'kind',e.kind,'occurred_at',e.event_timestamp,'classification','deidentified',
   'payload', e.payload - 'displayName' - 'name' - 'email' - 'externalRef' - 'actorId' - 'crewMemberId' - 'userId',
   'source_category',split_part(e.source_id,':',1)
 ) from public.mission_events e join public.mission_research_keys k on k.mission_id=e.mission_id where e.mission_id=p_mission_id order by e.event_timestamp;
end $$;
revoke all on function public.export_research_mission(text) from public, anon;
grant execute on function public.export_research_mission(text) to authenticated;
