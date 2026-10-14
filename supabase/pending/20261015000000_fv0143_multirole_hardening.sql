-- FV-01.4.3 Multi-Role Security Hardening (F1, F2)
-- STATUS: STAGED, NOT APPLIED. Awaiting explicit owner approval of the role
-- compatibility matrix and production migration. Lives outside
-- supabase/migrations so it cannot be applied or published accidentally.
-- Exercised only by the disposable harness (FV0143_INCLUDE_PENDING=1).

-- ---------------------------------------------------------------------------
-- 1. Role compatibility policy (F2). Single source of truth for same-mission
--    pairs. Different missions are never restricted.
-- ---------------------------------------------------------------------------
create or replace function public.mission_roles_compatible(p_a text, p_b text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select not (
    (least(p_a,p_b), greatest(p_a,p_b)) in (
      ('crew_self','ground_medical'),
      ('crew_self','researcher'),
      ('ground_medical','mission_operator')
    )
  );
$$;
revoke all on function public.mission_roles_compatible(text,text) from public;
grant execute on function public.mission_roles_compatible(text,text) to authenticated;

create or replace function public.mission_role_conflict(p_mission_id text, p_user_id uuid, p_role text, p_exclude uuid default null)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select mm.role from public.mission_memberships mm
  where mm.mission_id = p_mission_id and mm.user_id = p_user_id and mm.active
    and mm.role <> p_role and (p_exclude is null or mm.id <> p_exclude)
    and not public.mission_roles_compatible(mm.role, p_role)
  order by mm.role limit 1;
$$;
revoke all on function public.mission_role_conflict(text,uuid,text,uuid) from public, anon, authenticated;

-- Backstop on EVERY write path (RPCs, future functions, privileged inserts).
-- Fires only when a row becomes/stays active, so existing rows are never revoked.
create or replace function public.enforce_membership_role_compatibility()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_conflict text;
begin
  if new.active then
    v_conflict := public.mission_role_conflict(new.mission_id, new.user_id, new.role, new.id);
    if v_conflict is not null then
      raise exception 'role combination not permitted: % with % in the same mission', new.role, v_conflict;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_membership_role_compatibility on public.mission_memberships;
create trigger trg_membership_role_compatibility
  before insert or update of active, role, mission_id, user_id on public.mission_memberships
  for each row execute function public.enforce_membership_role_compatibility();

-- ---------------------------------------------------------------------------
-- 2. Ground Medical approval state on invites (additive, defaulted).
-- ---------------------------------------------------------------------------
alter table public.mission_invites
  add column if not exists approval_state text not null default 'not_required',
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz;
do $$ begin
  alter table public.mission_invites add constraint mission_invites_approval_state_ck
    check (approval_state in ('not_required','pending','approved'));
exception when duplicate_object then null; end $$;

-- Requirement 10: no pre-existing open Ground Medical invite may bypass approval.
update public.mission_invites set approval_state = 'pending'
where role = 'ground_medical' and active and claimed_at is null and approval_state = 'not_required';

-- ---------------------------------------------------------------------------
-- 3. Invite creation: Ground Medical invites start pending.
-- ---------------------------------------------------------------------------
create or replace function public.create_mission_invite(p_mission_id text, p_role text, p_crew_member_id text default null, p_expires_in_hours integer default 24)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $function$
declare
  v_code text; v_hash text; v_invite_id uuid; v_hours integer; v_state text;
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

  v_state := case when p_role = 'ground_medical' then 'pending' else 'not_required' end;
  v_hours := greatest(1, least(coalesce(p_expires_in_hours,24), 168));
  v_code := encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(v_code, 'sha256'), 'hex');

  insert into public.mission_invites(mission_id,code_hash,role,crew_member_id,expires_at,created_by,approval_state)
  values(p_mission_id,v_hash,p_role,p_crew_member_id,now() + make_interval(hours => v_hours),auth.uid(),v_state)
  returning id into v_invite_id;

  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_mission_id,auth.uid(),'mission_invite_created','mission_invite',v_invite_id::text,
    jsonb_build_object('role',p_role,'crew_member_id',p_crew_member_id,'expires_in_hours',v_hours,'approval_state',v_state));

  return jsonb_build_object('code',v_code,'invite_id',v_invite_id,'mission_id',p_mission_id,'role',p_role,
    'expires_in_hours',v_hours,'approval_state',v_state);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Ground Medical approval. Approver must be an independent person: not the
--    inviter, already holding Ground Medical or Operator in THIS mission.
--    Single-use (pending -> approved only). No tokens. If no independent
--    approver exists (single-Operator mission without Ground Medical),
--    onboarding stays blocked by design.
-- ---------------------------------------------------------------------------
create or replace function public.approve_mission_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare v_invite public.mission_invites%rowtype; v_reason text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into v_invite from public.mission_invites where id = p_invite_id for update;
  if not found or not public.has_mission_role(v_invite.mission_id, array['mission_operator','ground_medical']) then
    raise exception 'invite approval denied';
  end if;

  if v_invite.role <> 'ground_medical' or v_invite.approval_state <> 'pending' then v_reason := 'not_pending';
  elsif not v_invite.active or v_invite.claimed_at is not null or v_invite.expires_at <= now() then v_reason := 'invite_unavailable';
  elsif v_invite.created_by = auth.uid() then v_reason := 'inviter_cannot_approve';
  end if;

  if v_reason is not null then
    insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
    values(v_invite.mission_id,auth.uid(),'mission_invite_approval_denied','mission_invite',v_invite.id::text,
      jsonb_build_object('reason',v_reason,'role',v_invite.role));
    return jsonb_build_object('status','rejected','reason',v_reason);
  end if;

  update public.mission_invites set approval_state='approved', approved_by=auth.uid(), approved_at=now() where id=v_invite.id;
  insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
  values(v_invite.mission_id,auth.uid(),'mission_invite_approved','mission_invite',v_invite.id::text,
    jsonb_build_object('role',v_invite.role,'inviter_user_id',v_invite.created_by));
  return jsonb_build_object('status','approved','invite_id',v_invite.id);
end;
$function$;
revoke all on function public.approve_mission_invite(uuid) from public, anon;
grant execute on function public.approve_mission_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Invite acceptance (F1). Denials RETURN 'rejected' so the audit row and
--    invite revocation commit (FV-01.1 pattern). No codes are logged.
-- ---------------------------------------------------------------------------
create or replace function public.accept_mission_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $function$
declare
  v_hash text;
  v_invite public.mission_invites%rowtype;
  v_current public.mission_memberships%rowtype;
  v_reason text;
  v_conflict text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(btrim(p_code),'') = '' then raise exception 'invite code required'; end if;

  v_hash := encode(digest(btrim(p_code), 'sha256'), 'hex');
  select * into v_invite from public.mission_invites
  where code_hash=v_hash and active and claimed_at is null and expires_at > now()
  for update;
  if not found then raise exception 'mission invite is invalid, expired, or already used'; end if;

  -- Serialize role grants for this user+mission so the compatibility check is race-free.
  perform pg_advisory_xact_lock(hashtext('mitochondria:membership:' || v_invite.mission_id || ':' || auth.uid()::text));

  if v_invite.created_by = auth.uid() then
    v_reason := 'self_issued_invite';
  elsif v_invite.role = 'ground_medical' and v_invite.approval_state <> 'approved' then
    v_reason := 'approval_required';
  elsif v_invite.role = 'ground_medical' and v_invite.approved_by = auth.uid() then
    v_reason := 'approver_cannot_be_recipient';
  else
    v_conflict := public.mission_role_conflict(v_invite.mission_id, auth.uid(), v_invite.role);
    if v_conflict is not null then v_reason := 'role_combination_not_permitted'; end if;
  end if;

  if v_reason is not null then
    -- approval_required keeps the invite open so a legitimate recipient can retry after approval.
    if v_reason <> 'approval_required' then
      update public.mission_invites set active=false where id=v_invite.id;
    end if;
    insert into public.audit_events(mission_id,actor_user_id,action,target_type,target_id,metadata)
    values(v_invite.mission_id,auth.uid(),'mission_invite_acceptance_denied','mission_invite',v_invite.id::text,
      jsonb_build_object('reason',v_reason,'role',v_invite.role,'conflicting_role',v_conflict,
        'invite_revoked',v_reason <> 'approval_required'));
    return jsonb_build_object('status','rejected','reason',v_reason,
      'message',case v_reason
        when 'self_issued_invite' then 'You cannot accept an invitation you issued.'
        when 'approval_required' then 'This Ground Medical invitation is awaiting independent approval.'
        when 'approver_cannot_be_recipient' then 'The approver of this invitation cannot accept it.'
        else 'This role cannot be combined with your existing role in this mission.' end);
  end if;

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
    jsonb_build_object('role',v_invite.role,'crew_member_id',v_invite.crew_member_id,'approved_by',v_invite.approved_by));

  return jsonb_build_object('status','accepted','mission_id',v_invite.mission_id,'role',v_invite.role,'crew_member_id',v_invite.crew_member_id);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Membership activation (F1 second path). Self-reactivation of any
--    non-operator role is refused; compatibility is checked before update.
-- ---------------------------------------------------------------------------
create or replace function public.set_mission_membership_active(p_mission_id text, p_membership_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_membership public.mission_memberships%rowtype;
  v_other_operators integer;
  v_conflict text;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_mission_role(p_mission_id, array['mission_operator']) then raise exception 'membership update denied'; end if;

  select * into v_membership from public.mission_memberships
  where id=p_membership_id and mission_id=p_mission_id for update;
  if not found then raise exception 'membership not found in mission'; end if;

  if p_active and not v_membership.active then
    perform pg_advisory_xact_lock(hashtext('mitochondria:membership:' || p_mission_id || ':' || v_membership.user_id::text));
    if v_membership.user_id = auth.uid() and v_membership.role <> 'mission_operator' then
      v_reason := 'self_reactivation';
    else
      v_conflict := public.mission_role_conflict(p_mission_id, v_membership.user_id, v_membership.role, v_membership.id);
      if v_conflict is not null then v_reason := 'role_combination_not_permitted'; end if;
    end if;
    if v_reason is not null then
      insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
      values(p_mission_id, auth.uid(), 'membership_reactivation_denied', 'mission_membership', p_membership_id::text,
        jsonb_build_object('reason',v_reason,'role',v_membership.role,'conflicting_role',v_conflict,'target_user_id',v_membership.user_id));
      return jsonb_build_object('status','rejected','reason',v_reason,
        'message',case v_reason when 'self_reactivation' then 'You cannot reactivate your own sensitive membership.'
          else 'This role cannot be combined with the user''s existing role in this mission.' end);
    end if;
  end if;

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

  return jsonb_build_object('status','updated','membership_id',p_membership_id,'active',p_active,'role',v_membership.role);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Operations workspace exposes approval state (no codes, no hashes).
-- ---------------------------------------------------------------------------
create or replace function public.get_mission_operations_workspace(p_mission_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare v_result jsonb;
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
        'created_at',mi.created_at,'claimed_at',mi.claimed_at,'active',mi.active,
        'approval_state',mi.approval_state,'approved_at',mi.approved_at,
        'issued_by_me',(mi.created_by = auth.uid())
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
$function$;
