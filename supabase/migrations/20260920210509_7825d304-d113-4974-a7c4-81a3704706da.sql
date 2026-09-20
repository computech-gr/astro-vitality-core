-- P20 Mission & Crew Operations: governed lifecycle for missions, crew registry,
-- membership activation, and mission-scoped invite issuance.
-- Browser clients retain read-only table access where already allowed; all mutations
-- below are authorized inside privileged RPCs with pinned search paths and audited.

create table if not exists public.mission_crew_assignments (
  mission_id text not null references public.missions(id) on delete cascade,
  crew_member_id text not null references public.crew_members(id) on delete cascade,
  status text not null default 'candidate' check (status in ('candidate','active','inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mission_id, crew_member_id)
);

create index if not exists mission_crew_assignments_status_idx
  on public.mission_crew_assignments(mission_id, status, crew_member_id);

alter table public.mission_crew_assignments enable row level security;
alter table public.mission_crew_assignments force row level security;
revoke all on public.mission_crew_assignments from public, anon, authenticated;

-- Preserve already-governed mission/crew relationships when upgrading an existing deployment.
insert into public.mission_crew_assignments(mission_id, crew_member_id, status, created_by)
select distinct x.mission_id, x.crew_member_id, 'active', null::uuid
from (
  select mission_id, crew_member_id from public.mission_memberships where crew_member_id is not null
  union
  select mission_id, crew_member_id from public.mission_events
) x
where x.crew_member_id is not null
on conflict (mission_id, crew_member_id) do nothing;

-- At most one active crew-self identity can own a crew slot within a mission.
create unique index if not exists mission_memberships_active_crew_self_uq
  on public.mission_memberships(mission_id, crew_member_id)
  where role = 'crew_self' and active and crew_member_id is not null;

create or replace function public.can_create_mission()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.mission_memberships mm
    where mm.user_id = auth.uid()
      and mm.role = 'mission_operator'
      and mm.active
  );
$$;
revoke all on function public.can_create_mission() from public, anon;
grant execute on function public.can_create_mission() to authenticated;

create or replace function public.create_mission_operation(
  p_code text,
  p_name text,
  p_starts_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code text;
  v_name text;
  v_id text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.can_create_mission() then raise exception 'mission creation denied'; end if;

  v_code := upper(btrim(coalesce(p_code,'')));
  v_name := btrim(coalesce(p_name,''));
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then raise exception 'mission code must be 3-32 characters using A-Z, 0-9, underscore or hyphen'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'mission name must be 3-120 characters'; end if;
  if exists(select 1 from public.missions where code = v_code) then raise exception 'mission code already exists'; end if;

  v_id := 'mission-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.missions(id, code, name, status, starts_at)
  values(v_id, v_code, v_name, 'planning', p_starts_at);

  insert into public.mission_memberships(mission_id, user_id, role, active)
  values(v_id, auth.uid(), 'mission_operator', true);

  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values(v_id, auth.uid(), 'mission_created', 'mission', v_id,
    jsonb_build_object('code', v_code, 'name', v_name, 'status', 'planning', 'creator_operator', true));

  return jsonb_build_object('mission_id',v_id,'code',v_code,'name',v_name,'status','planning');
end;
$$;
revoke all on function public.create_mission_operation(text,text,timestamptz) from public, anon;
grant execute on function public.create_mission_operation(text,text,timestamptz) to authenticated;

create or replace function public.update_mission_operation(
  p_mission_id text,
  p_name text default null,
  p_status text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.missions%rowtype;
  v_name text;
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then raise exception 'mission operation denied'; end if;

  select * into v_current from public.missions where id = p_mission_id for update;
  if not found then raise exception 'mission not found'; end if;

  v_name := coalesce(nullif(btrim(p_name),''), v_current.name);
  v_status := coalesce(nullif(btrim(p_status),''), v_current.status);
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'mission name must be 3-120 characters'; end if;
  if v_status not in ('planning','active','completed','aborted') then raise exception 'invalid mission status'; end if;

  if v_status <> v_current.status then
    if not (
      (v_current.status = 'planning' and v_status in ('active','aborted')) or
      (v_current.status = 'active' and v_status in ('completed','aborted'))
    ) then
      raise exception 'invalid mission lifecycle transition';
    end if;
  end if;

  update public.missions
  set name = v_name,
      status = v_status,
      starts_at = coalesce(p_starts_at, starts_at),
      ends_at = case when v_status in ('completed','aborted') then coalesce(p_ends_at, ends_at, now()) else p_ends_at end,
      updated_at = now()
  where id = p_mission_id;

  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values(p_mission_id, auth.uid(), 'mission_updated', 'mission', p_mission_id,
    jsonb_build_object('previous_status',v_current.status,'status',v_status,'name',v_name));

  return jsonb_build_object('mission_id',p_mission_id,'name',v_name,'status',v_status);
end;
$$;
revoke all on function public.update_mission_operation(text,text,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.update_mission_operation(text,text,text,timestamptz,timestamptz) to authenticated;

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
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then raise exception 'crew registration denied'; end if;

  select status into v_mission_status from public.missions where id = p_mission_id;
  if v_mission_status is null then raise exception 'mission not found'; end if;
  if v_mission_status in ('completed','aborted') then raise exception 'mission is closed for crew changes'; end if;

  v_display_name := btrim(coalesce(p_display_name,''));
  v_external_ref := nullif(btrim(coalesce(p_external_ref,'')), '');
  v_status := coalesce(nullif(btrim(p_status),''), 'candidate');
  if length(v_display_name) < 2 or length(v_display_name) > 100 then raise exception 'crew display name must be 2-100 characters'; end if;
  if v_external_ref is not null and length(v_external_ref) > 100 then raise exception 'crew external reference too long'; end if;
  if v_status not in ('candidate','active','inactive') then raise exception 'invalid crew status'; end if;

  v_crew_id := 'crew-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.crew_members(id, external_ref, display_name, status)
  values(v_crew_id, v_external_ref, v_display_name, v_status);

  insert into public.mission_crew_assignments(mission_id, crew_member_id, status, created_by)
  values(p_mission_id, v_crew_id, v_status, auth.uid());

  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values(p_mission_id, auth.uid(), 'crew_member_registered', 'crew_member', v_crew_id,
    jsonb_build_object('display_name', v_display_name, 'status', v_status));

  return jsonb_build_object('crew_member_id',v_crew_id,'display_name',v_display_name,'status',v_status);
end;
$$;
revoke all on function public.create_mission_crew_member(text,text,text,text) from public, anon;
grant execute on function public.create_mission_crew_member(text,text,text,text) to authenticated;

create or replace function public.update_mission_crew_member(
  p_mission_id text,
  p_crew_member_id text,
  p_display_name text default null,
  p_external_ref text default null,
  p_status text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.mission_crew_assignments%rowtype;
  v_member public.crew_members%rowtype;
  v_display_name text;
  v_external_ref text;
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then raise exception 'crew update denied'; end if;

  select * into v_assignment from public.mission_crew_assignments
  where mission_id=p_mission_id and crew_member_id=p_crew_member_id for update;
  if not found then raise exception 'crew member is not assigned to this mission'; end if;
  select * into v_member from public.crew_members where id=p_crew_member_id for update;

  v_display_name := coalesce(nullif(btrim(p_display_name),''), v_member.display_name);
  v_external_ref := case when p_external_ref is null then v_member.external_ref else nullif(btrim(p_external_ref),'') end;
  v_status := coalesce(nullif(btrim(p_status),''), v_assignment.status);
  if length(v_display_name) < 2 or length(v_display_name) > 100 then raise exception 'crew display name must be 2-100 characters'; end if;
  if v_external_ref is not null and length(v_external_ref) > 100 then raise exception 'crew external reference too long'; end if;
  if v_status not in ('candidate','active','inactive') then raise exception 'invalid crew status'; end if;

  if v_status = 'inactive' and exists(
    select 1 from public.mission_memberships mm
    where mm.mission_id=p_mission_id and mm.crew_member_id=p_crew_member_id and mm.role='crew_self' and mm.active
  ) then
    raise exception 'deactivate crew-self membership before inactivating crew member';
  end if;

  update public.mission_crew_assignments
  set status=v_status, updated_at=now()
  where mission_id=p_mission_id and crew_member_id=p_crew_member_id;
  update public.crew_members
  set display_name=v_display_name, external_ref=v_external_ref, status=v_status, updated_at=now()
  where id=p_crew_member_id;

  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values(p_mission_id, auth.uid(), 'crew_member_updated', 'crew_member', p_crew_member_id,
    jsonb_build_object('previous_status',v_assignment.status,'status',v_status,'display_name',v_display_name));

  return jsonb_build_object('crew_member_id',p_crew_member_id,'display_name',v_display_name,'status',v_status);
end;
$$;
revoke all on function public.update_mission_crew_member(text,text,text,text,text) from public, anon;
grant execute on function public.update_mission_crew_member(text,text,text,text,text) to authenticated;

create or replace function public.set_mission_membership_active(
  p_mission_id text,
  p_membership_id uuid,
  p_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership public.mission_memberships%rowtype;
  v_other_operators integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then raise exception 'membership update denied'; end if;

  select * into v_membership from public.mission_memberships
  where id=p_membership_id and mission_id=p_mission_id for update;
  if not found then raise exception 'membership not found in mission'; end if;

  if p_active and v_membership.role='crew_self' then
    if not exists(
      select 1 from public.mission_crew_assignments mca
      where mca.mission_id=p_mission_id and mca.crew_member_id=v_membership.crew_member_id and mca.status='active'
    ) then raise exception 'crew-self membership requires active mission crew assignment'; end if;
    if exists(
      select 1 from public.mission_memberships mm
      where mm.mission_id=p_mission_id and mm.crew_member_id=v_membership.crew_member_id
        and mm.role='crew_self' and mm.active and mm.id<>p_membership_id
    ) then raise exception 'crew member already has an active crew-self identity'; end if;
  end if;

  if not p_active and v_membership.role='mission_operator' and v_membership.active then
    select count(*) into v_other_operators
    from public.mission_memberships mm
    where mm.mission_id=p_mission_id and mm.role='mission_operator' and mm.active and mm.id<>p_membership_id;
    if v_other_operators < 1 then raise exception 'mission must retain at least one active operator'; end if;
  end if;

  update public.mission_memberships set active=p_active where id=p_membership_id;
  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values(p_mission_id, auth.uid(), case when p_active then 'membership_reactivated' else 'membership_deactivated' end,
    'mission_membership', p_membership_id::text,
    jsonb_build_object('role',v_membership.role,'crew_member_id',v_membership.crew_member_id,'target_user_id',v_membership.user_id));

  return jsonb_build_object('membership_id',p_membership_id,'active',p_active,'role',v_membership.role);
end;
$$;
revoke all on function public.set_mission_membership_active(text,uuid,boolean) from public, anon;
grant execute on function public.set_mission_membership_active(text,uuid,boolean) to authenticated;

create or replace function public.get_mission_operations_workspace(p_mission_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then raise exception 'mission operations access denied'; end if;

  select jsonb_build_object(
    'mission', jsonb_build_object(
      'id',m.id,'code',m.code,'name',m.name,'status',m.status,
      'starts_at',m.starts_at,'ends_at',m.ends_at,'created_at',m.created_at,'updated_at',m.updated_at
    ),
    'crew', coalesce((
      select jsonb_agg(jsonb_build_object(
        'crew_member_id',cm.id,'display_name',cm.display_name,'external_ref',cm.external_ref,
        'status',mca.status,'created_at',mca.created_at,'updated_at',mca.updated_at
      ) order by cm.display_name)
      from public.mission_crew_assignments mca
      join public.crew_members cm on cm.id=mca.crew_member_id
      where mca.mission_id=m.id
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',mm.id,'user_id',mm.user_id,'crew_member_id',mm.crew_member_id,
        'role',mm.role,'active',mm.active,'created_at',mm.created_at
      ) order by mm.role, mm.created_at)
      from public.mission_memberships mm
      where mm.mission_id=m.id
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',mi.id,'role',mi.role,'crew_member_id',mi.crew_member_id,'expires_at',mi.expires_at,
        'created_at',mi.created_at,'claimed_at',mi.claimed_at,'active',mi.active
      ) order by mi.created_at desc)
      from public.mission_invites mi
      where mi.mission_id=m.id
    ), '[]'::jsonb)
  ) into v_result
  from public.missions m where m.id=p_mission_id;

  if v_result is null then raise exception 'mission not found'; end if;
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_mission_id,auth.uid(),'mission_operations_workspace_read','mission',p_mission_id,'{}'::jsonb);
  return v_result;
end;
$$;
revoke all on function public.get_mission_operations_workspace(text) from public, anon;
grant execute on function public.get_mission_operations_workspace(text) to authenticated;

-- Re-issue invite RPC with mission/crew binding checks.
create or replace function public.create_mission_invite(
  p_mission_id text,
  p_role text,
  p_crew_member_id text default null,
  p_expires_in_hours integer default 24
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code text;
  v_hash text;
  v_invite_id uuid;
  v_hours integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then raise exception 'mission invite creation denied'; end if;
  if p_role not in ('crew_self','ground_medical','mission_operator','researcher') then raise exception 'invalid mission role'; end if;
  if p_role = 'crew_self' and coalesce(btrim(p_crew_member_id), '') = '' then raise exception 'crew_self invite requires crew member id'; end if;
  if p_role <> 'crew_self' and p_crew_member_id is not null then raise exception 'crew member binding is only valid for crew_self'; end if;
  if p_crew_member_id is not null and not exists(
    select 1 from public.mission_crew_assignments mca
    where mca.mission_id=p_mission_id and mca.crew_member_id=p_crew_member_id and mca.status='active'
  ) then raise exception 'crew member is not active in this mission'; end if;
  if p_role='crew_self' and exists(
    select 1 from public.mission_memberships mm
    where mm.mission_id=p_mission_id and mm.crew_member_id=p_crew_member_id and mm.role='crew_self' and mm.active
  ) then raise exception 'crew member already has an active crew-self identity'; end if;

  v_hours := greatest(1, least(coalesce(p_expires_in_hours,24), 168));
  v_code := encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(v_code, 'sha256'), 'hex');

  insert into public.mission_invites(mission_id,code_hash,role,crew_member_id,expires_at,created_by)
  values(p_mission_id,v_hash,p_role,p_crew_member_id,now() + make_interval(hours => v_hours),auth.uid())
  returning id into v_invite_id;

  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_mission_id,auth.uid(),'mission_invite_created','mission_invite',v_invite_id::text,
    jsonb_build_object('role',p_role,'crew_member_id',p_crew_member_id,'expires_in_hours',v_hours));

  return jsonb_build_object('code',v_code,'invite_id',v_invite_id,'mission_id',p_mission_id,'role',p_role,'expires_in_hours',v_hours);
end;
$$;
revoke all on function public.create_mission_invite(text,text,text,integer) from public, anon;
grant execute on function public.create_mission_invite(text,text,text,integer) to authenticated;

create or replace function public.accept_mission_invite(p_code text) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_invite public.mission_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(btrim(p_code),'') = '' then raise exception 'invite code required'; end if;

  v_hash := encode(digest(btrim(p_code), 'sha256'), 'hex');
  select * into v_invite
  from public.mission_invites
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
$$;
revoke all on function public.accept_mission_invite(text) from public, anon;
grant execute on function public.accept_mission_invite(text) to authenticated;
