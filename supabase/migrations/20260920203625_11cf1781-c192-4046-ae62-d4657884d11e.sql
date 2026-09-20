-- P20 Mission Identity & Sign-in: one-time mission invite workflow.
-- Authentication alone never grants mission access. Membership remains explicit,
-- mission-scoped, role-scoped, RLS-governed and auditable.

create table if not exists public.mission_invites (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null references public.missions(id) on delete cascade,
  code_hash text not null unique,
  role text not null check (role in ('crew_self','ground_medical','mission_operator','researcher')),
  crew_member_id text references public.crew_members(id) on delete cascade,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  active boolean not null default true,
  constraint mission_invites_crew_self_ck check (role <> 'crew_self' or crew_member_id is not null)
);

create index if not exists mission_invites_mission_idx on public.mission_invites(mission_id, active, expires_at);

alter table public.mission_invites enable row level security;
alter table public.mission_invites force row level security;

revoke all on public.mission_invites from public, anon, authenticated;

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
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then
    raise exception 'mission invite creation denied';
  end if;
  if p_role not in ('crew_self','ground_medical','mission_operator','researcher') then
    raise exception 'invalid mission role';
  end if;
  if p_role = 'crew_self' and coalesce(btrim(p_crew_member_id), '') = '' then
    raise exception 'crew_self invite requires crew member id';
  end if;
  if p_crew_member_id is not null and not exists(select 1 from public.crew_members where id=p_crew_member_id) then
    raise exception 'crew member not found';
  end if;

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

  insert into public.mission_memberships(mission_id,user_id,crew_member_id,role,active)
  values(v_invite.mission_id,auth.uid(),v_invite.crew_member_id,v_invite.role,true)
  on conflict (mission_id,user_id,role) do update
    set crew_member_id=excluded.crew_member_id, active=true;

  update public.mission_invites
  set claimed_by=auth.uid(), claimed_at=now(), active=false
  where id=v_invite.id;

  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(v_invite.mission_id,auth.uid(),'mission_invite_accepted','mission_membership',v_invite.id::text,
    jsonb_build_object('role',v_invite.role,'crew_member_id',v_invite.crew_member_id));

  return jsonb_build_object('mission_id',v_invite.mission_id,'role',v_invite.role,'crew_member_id',v_invite.crew_member_id);
end;
$$;

revoke all on function public.accept_mission_invite(text) from public, anon;
grant execute on function public.accept_mission_invite(text) to authenticated;