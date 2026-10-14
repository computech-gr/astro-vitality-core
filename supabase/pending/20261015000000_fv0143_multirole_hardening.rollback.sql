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
$function$

;
;
;
revoke execute on function public.approve_mission_invite(uuid) from authenticated;
comment on column public.mission_invites.approval_state is 'DEPRECATED: FV-01.4.3 rolled back';
comment on column public.mission_invites.approved_by is 'DEPRECATED: FV-01.4.3 rolled back';
comment on column public.mission_invites.approved_at is 'DEPRECATED: FV-01.4.3 rolled back';
