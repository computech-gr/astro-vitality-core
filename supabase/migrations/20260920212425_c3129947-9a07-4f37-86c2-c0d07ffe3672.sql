-- P20 Secure Bootstrap & Auth Readiness
-- One-shot first-operator bootstrap without a browser-shipped privileged secret.
-- The bootstrap secret hash is armed only by service_role, consumed only by an
-- authenticated user, and permanently blocked once any active mission operator exists.

create table if not exists public.mission_bootstrap_control (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  armed_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  mission_id text references public.missions(id) on delete set null
);

alter table public.mission_bootstrap_control enable row level security;
alter table public.mission_bootstrap_control force row level security;
revoke all on public.mission_bootstrap_control from public, anon, authenticated;

create or replace function public.configure_mission_bootstrap(p_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text := lower(btrim(coalesce(p_secret_hash, '')));
  v_existing public.mission_bootstrap_control%rowtype;
begin
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bootstrap secret hash must be lowercase sha256 hex';
  end if;
  if exists (
    select 1 from public.mission_memberships
    where role = 'mission_operator' and active
  ) then
    raise exception 'bootstrap is permanently unavailable after operator provisioning';
  end if;

  select * into v_existing
  from public.mission_bootstrap_control
  where singleton
  for update;

  if found and v_existing.consumed_at is not null then
    raise exception 'bootstrap has already been consumed';
  end if;

  insert into public.mission_bootstrap_control(singleton, secret_hash, armed_at, consumed_at, consumed_by, mission_id)
  values(true, v_hash, now(), null, null, null)
  on conflict (singleton) do update
    set secret_hash = excluded.secret_hash,
        armed_at = excluded.armed_at,
        consumed_at = null,
        consumed_by = null,
        mission_id = null;

  return jsonb_build_object('armed', true, 'consumed', false);
end;
$$;
revoke all on function public.configure_mission_bootstrap(text) from public, anon, authenticated;
grant execute on function public.configure_mission_bootstrap(text) to service_role;

create or replace function public.get_mission_bootstrap_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_control public.mission_bootstrap_control%rowtype;
  v_operator_exists boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select exists(
    select 1 from public.mission_memberships
    where role = 'mission_operator' and active
  ) into v_operator_exists;

  select * into v_control
  from public.mission_bootstrap_control
  where singleton;

  return jsonb_build_object(
    'operator_exists', v_operator_exists,
    'bootstrap_armed', coalesce(v_control.secret_hash is not null and v_control.consumed_at is null, false),
    'bootstrap_consumed', coalesce(v_control.consumed_at is not null, false)
  );
end;
$$;
revoke all on function public.get_mission_bootstrap_status() from public, anon;
grant execute on function public.get_mission_bootstrap_status() to authenticated;

create or replace function public.bootstrap_first_mission(
  p_code text,
  p_name text,
  p_bootstrap_secret text,
  p_starts_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_control public.mission_bootstrap_control%rowtype;
  v_code text;
  v_name text;
  v_mission_id text;
  v_supplied_hash text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  -- Serialize concurrent bootstrap attempts before checking global operator state.
  perform pg_advisory_xact_lock(hashtext('mitochondria:first-mission-bootstrap'));

  if exists (
    select 1 from public.mission_memberships
    where role = 'mission_operator' and active
  ) then
    raise exception 'bootstrap unavailable: an active mission operator already exists';
  end if;

  select * into v_control
  from public.mission_bootstrap_control
  where singleton
  for update;

  if not found or v_control.consumed_at is not null then
    raise exception 'bootstrap is not armed';
  end if;

  if length(coalesce(p_bootstrap_secret, '')) < 32 then
    raise exception 'invalid bootstrap secret';
  end if;
  v_supplied_hash := encode(digest(convert_to(p_bootstrap_secret, 'UTF8'), 'sha256'), 'hex');
  if v_supplied_hash <> v_control.secret_hash then
    raise exception 'invalid bootstrap secret';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  v_name := btrim(coalesce(p_name, ''));
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    raise exception 'mission code must be 3-32 characters using A-Z, 0-9, underscore or hyphen';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'mission name must be 3-120 characters';
  end if;
  if exists(select 1 from public.missions where code = v_code) then
    raise exception 'mission code already exists';
  end if;

  v_mission_id := 'mission-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.missions(id, code, name, status, starts_at)
  values(v_mission_id, v_code, v_name, 'planning', p_starts_at);

  insert into public.mission_memberships(mission_id, user_id, role, active)
  values(v_mission_id, auth.uid(), 'mission_operator', true);

  update public.mission_bootstrap_control
  set consumed_at = now(), consumed_by = auth.uid(), mission_id = v_mission_id
  where singleton;

  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values(
    v_mission_id,
    auth.uid(),
    'first_operator_bootstrap_consumed',
    'mission',
    v_mission_id,
    jsonb_build_object('code', v_code, 'name', v_name, 'status', 'planning', 'bootstrap_one_time', true)
  );

  return jsonb_build_object(
    'mission_id', v_mission_id,
    'code', v_code,
    'name', v_name,
    'status', 'planning',
    'operator_membership_created', true,
    'bootstrap_consumed', true
  );
end;
$$;
revoke all on function public.bootstrap_first_mission(text,text,text,timestamptz) from public, anon;
grant execute on function public.bootstrap_first_mission(text,text,text,timestamptz) to authenticated;