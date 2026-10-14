-- FV-01.4.3 ROLLBACK (staged, NOT applied). Restores the pre-FV-01.4.3 function bodies
-- captured from the governed migration chain. Additive columns are retained (deprecated), never dropped.
drop trigger if exists trg_membership_role_compatibility on public.mission_memberships;
CREATE OR REPLACE FUNCTION public.accept_mission_invite(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$

;
CREATE OR REPLACE FUNCTION public.create_mission_invite(p_mission_id text, p_role text, p_crew_member_id text DEFAULT NULL::text, p_expires_in_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$

;
CREATE OR REPLACE FUNCTION public.set_mission_membership_active(p_mission_id text, p_membership_id uuid, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$

;
CREATE OR REPLACE FUNCTION public.get_mission_operations_workspace(p_mission_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$

;
revoke execute on function public.approve_mission_invite(uuid, text) from authenticated;
revoke execute on function public.bind_mission_invite_recipient(uuid, text) from authenticated;
comment on column public.mission_invites.approval_state is 'DEPRECATED: FV-01.4.3 rolled back';
comment on column public.mission_invites.approved_by is 'DEPRECATED: FV-01.4.3 rolled back';
comment on column public.mission_invites.approved_at is 'DEPRECATED: FV-01.4.3 rolled back';
comment on column public.mission_invites.intended_recipient_user_id is 'DEPRECATED: FV-01.4.3 rolled back';
comment on column public.mission_invites.intended_recipient_email is 'DEPRECATED: FV-01.4.3 rolled back';
comment on column public.mission_invites.recipient_bound_by is 'DEPRECATED: FV-01.4.3 rolled back';
comment on column public.mission_invites.recipient_bound_at is 'DEPRECATED: FV-01.4.3 rolled back';
