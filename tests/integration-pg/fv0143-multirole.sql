-- FV-01.4.3 Multi-Role Security Hardening scenarios (disposable database only).
\set ON_ERROR_STOP 1
\set op   '00000000-0000-0000-0000-0000000000a1'
\set gm   '00000000-0000-0000-0000-0000000000a2'
\set res  '00000000-0000-0000-0000-0000000000a3'
\set op2  '00000000-0000-0000-0000-0000000000a4'
\set c1u  '00000000-0000-0000-0000-0000000000b1'
\set c2u  '00000000-0000-0000-0000-0000000000b2'
\set c4u  '00000000-0000-0000-0000-0000000000b4'
\set u1   '00000000-0000-0000-0000-0000000000c1'
\set u2   '00000000-0000-0000-0000-0000000000c2'

-- Fixture additions (as postgres): second operator in m1, two fresh users, single-operator mission m5.
insert into auth.users(id, email, email_confirmed_at) values (:'u1','c1@fv.test',now()), (:'u2','c2@fv.test',now()),
  ('00000000-0000-0000-0000-0000000000d1','d1@fv.test',null), ('00000000-0000-0000-0000-0000000000d2','dup@fv.test',now()), ('00000000-0000-0000-0000-0000000000d3','DUP@fv.test',now());
insert into public.mission_memberships(mission_id, user_id, role, active) values ('m1', :'op2', 'mission_operator', true);
insert into public.missions(id, code, name, status) values ('m5', 'FV-M5', 'Single operator mission', 'planning');
insert into public.mission_memberships(mission_id, user_id, role, active) values ('m5', :'op', 'mission_operator', true);

create function fvtest.raises(p_sql text, p_pattern text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlerrm ~ p_pattern;
end $$;
grant execute on function fvtest.raises(text, text) to authenticated;
create function fvtest.invite_active(p_code text) returns boolean language sql security definer set search_path = public, extensions as $$
  select active from public.mission_invites where code_hash = encode(digest(p_code, 'sha256'), 'hex')
$$;
grant execute on function fvtest.invite_active(text) to authenticated;
create function fvtest.invite_id(p_code text) returns uuid language sql security definer set search_path = public, extensions as $$
  select id from public.mission_invites where code_hash = encode(digest(p_code, 'sha256'), 'hex')
$$;
grant execute on function fvtest.invite_id(text) to authenticated;
create function fvtest.roles(p_mission text, p_user uuid) returns text language sql security definer set search_path = public as $$
  select coalesce(string_agg(role, ',' order by role), '') from public.mission_memberships where mission_id = p_mission and user_id = p_user and active
$$;
grant execute on function fvtest.roles(text, uuid) to authenticated;

-- ---------- existing invitation compatibility (backfill) ----------
select fvtest.check((select approval_state from public.mission_invites where code_hash = encode(extensions.digest('legacy-open-ground-medical-code','sha256'),'hex')) = 'pending',
  'pre-existing open Ground Medical invite backfilled to pending');
select fvtest.check((select approval_state from public.mission_invites where code_hash = encode(extensions.digest('legacy-claimed-ground-medical-code','sha256'),'hex')) = 'not_required',
  'already-claimed historical Ground Medical invite left unchanged');
select fvtest.check((select approval_state from public.mission_invites where code_hash = encode(extensions.digest('legacy-open-crew-self-code','sha256'),'hex')) = 'not_required',
  'pre-existing Crew Self invite keeps working without approval');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u1', false);
select fvtest.check((public.accept_mission_invite('legacy-open-ground-medical-code'))->>'reason' = 'approval_required',
  'pre-existing Ground Medical invite cannot bypass approval');
select fvtest.check(fvtest.invite_active('legacy-open-ground-medical-code') and fvtest.roles('m1', :'u1') = '',
  'unapproved invite stays open and grants nothing');

-- ---------- F1: self-issued invitation refusal ----------
select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m1','researcher'))->>'code' as self_res \gset
select (public.create_mission_invite('m1','crew_self','c3'))->>'code' as self_crew \gset
select (public.create_mission_invite('m1','mission_operator'))->>'code' as self_op \gset
select fvtest.check((public.accept_mission_invite(:'self_res'))->>'reason' = 'self_issued_invite', 'operator cannot accept own Researcher invite');
select fvtest.check((public.accept_mission_invite(:'self_crew'))->>'reason' = 'self_issued_invite', 'operator cannot accept own Crew Self invite');
select fvtest.check((public.accept_mission_invite(:'self_op'))->>'reason' = 'self_issued_invite', 'operator cannot accept own Operator invite');
select fvtest.check(not fvtest.invite_active(:'self_res') and not fvtest.invite_active(:'self_crew'), 'self-issued invites are revoked on refusal');
select fvtest.check(fvtest.roles('m1', :'op') = 'mission_operator', 'self-acceptance granted no role');
select fvtest.check(fvtest.raises(format('select public.accept_mission_invite(%L)', :'self_res'), 'invalid, expired, or already used'), 'revoked self-issued invite cannot be replayed');

-- ---------- Ground Medical approval enforcement + replay ----------
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gm1 \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gm1'), 'c1@fv.test');
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gm1'), 'c1@fv.test'))->>'reason' = 'inviter_cannot_approve', 'inviter cannot approve own Ground Medical invite');
select fvtest.check((public.accept_mission_invite(:'gm1'))->>'reason' = 'self_issued_invite', 'inviter cannot accept own Ground Medical invite');
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gm2 \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gm2'), 'c2@fv.test');
select set_config('request.jwt.claim.sub', :'res', false);
select fvtest.check(fvtest.raises(format('select public.approve_mission_invite(%L, %L)', fvtest.invite_id(:'gm2'), 'c2@fv.test'), 'invite approval denied'), 'researcher cannot approve Ground Medical invite');
select set_config('request.jwt.claim.sub', :'c4u', false);
select fvtest.check(fvtest.raises(format('select public.approve_mission_invite(%L, %L)', fvtest.invite_id(:'gm2'), 'c2@fv.test'), 'invite approval denied'), 'member of another mission cannot approve');
select set_config('request.jwt.claim.sub', :'op2', false);
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gm2'), 'c2@fv.test'))->>'status' = 'approved', 'independent second operator approves');
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gm2'), 'c2@fv.test'))->>'reason' = 'not_pending', 'approval cannot be replayed');
select fvtest.check((public.accept_mission_invite(:'gm2'))->>'reason' = 'wrong_recipient', 'approver holding the code cannot redeem an invite bound to someone else');
select fvtest.check(fvtest.roles('m1', :'op2') = 'mission_operator', 'approver gained no Ground Medical role');

select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gm3 \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gm3'), 'c1@fv.test');
select set_config('request.jwt.claim.sub', :'gm', false);
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gm3'), 'c1@fv.test'))->>'status' = 'approved', 'existing Ground Medical can approve');
select set_config('request.jwt.claim.sub', :'u1', false);
select fvtest.check((public.accept_mission_invite(:'gm3'))->>'status' = 'accepted', 'independent recipient accepts approved Ground Medical invite');
select fvtest.check(fvtest.roles('m1', :'u1') = 'ground_medical', 'recipient holds exactly Ground Medical');

-- Single-operator mission: no independent approver exists -> onboarding blocked.
select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m5','ground_medical'))->>'code' as gm5 \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gm5'), 'c2@fv.test');
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gm5'), 'c2@fv.test'))->>'reason' = 'inviter_cannot_approve', 'single operator cannot self-approve');
select set_config('request.jwt.claim.sub', :'op2', false);
select fvtest.check(fvtest.raises(format('select public.approve_mission_invite(%L, %L)', fvtest.invite_id(:'gm5'), 'c2@fv.test'), 'invite approval denied'), 'operator of another mission cannot approve single-operator mission invite');
select set_config('request.jwt.claim.sub', :'u2', false);
select fvtest.check((public.accept_mission_invite(:'gm5'))->>'reason' = 'approval_required', 'single-operator Ground Medical onboarding stays blocked');


-- ---------- Ground Medical recipient binding ----------
select set_config('request.jwt.claim.sub', :'gm', false);
select fvtest.check((public.approve_mission_invite(fvtest.invite_id('legacy-open-ground-medical-code'), 'c1@fv.test'))->>'reason' = 'recipient_unbound',
  'pre-existing pending invite cannot be approved until a recipient is bound');
select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gmb \gset
select (public.create_mission_invite('m1','researcher'))->>'code' as resb \gset
select fvtest.check(fvtest.raises(format('select public.bind_mission_invite_recipient(%L, %L)', fvtest.invite_id(:'gmb'), 'nobody@fv.test'), 'recipient identity not verified'), 'unknown account cannot be bound');
select fvtest.check(fvtest.raises(format('select public.bind_mission_invite_recipient(%L, %L)', fvtest.invite_id(:'gmb'), 'd1@fv.test'), 'recipient identity not verified'), 'unconfirmed email cannot be bound (same error, no enumeration)');
select fvtest.check(fvtest.raises(format('select public.bind_mission_invite_recipient(%L, %L)', fvtest.invite_id(:'gmb'), 'dup@fv.test'), 'recipient identity not verified'), 'ambiguous identity cannot be bound');
select fvtest.check(fvtest.raises(format('select public.bind_mission_invite_recipient(%L, %L)', fvtest.invite_id(:'gmb'), 'a1@fv.test'), 'inviter cannot be the recipient'), 'inviter cannot bind themselves');
select fvtest.check(fvtest.raises(format('select public.bind_mission_invite_recipient(%L, %L)', fvtest.invite_id(:'resb'), 'c2@fv.test'), 'only required for ground_medical'), 'binding does not alter Researcher invites');
select set_config('request.jwt.claim.sub', :'res', false);
select fvtest.check(fvtest.raises(format('select public.bind_mission_invite_recipient(%L, %L)', fvtest.invite_id(:'gmb'), 'c2@fv.test'), 'recipient binding denied'), 'non-operator cannot bind recipients');
select set_config('request.jwt.claim.sub', :'op', false);
select fvtest.check((public.bind_mission_invite_recipient(fvtest.invite_id(:'gmb'), ' B3@FV.test '))->>'recipient_email' = 'b3@fv.test', 'operator binds a verified recipient (normalized)');
select set_config('request.jwt.claim.sub', :'gm', false);
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gmb'), 'c2@fv.test'))->>'reason' = 'recipient_mismatch', 'approver must confirm the exact bound identity');
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gmb'), 'b3@fv.test'))->>'status' = 'approved', 'approver authorizes the identity they verified');
select set_config('request.jwt.claim.sub', :'op', false);
select fvtest.check((public.bind_mission_invite_recipient(fvtest.invite_id(:'gmb'), 'c2@fv.test'))->>'approval_state' = 'pending', 'changing the recipient after approval resets to pending');
reset role;
select fvtest.check((select approved_by is null and approval_state = 'pending' from public.mission_invites where id = fvtest.invite_id(:'gmb')), 'previous approval is discarded on re-binding');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u2', false);
select fvtest.check((public.accept_mission_invite(:'gmb'))->>'reason' = 'approval_required', 'new recipient cannot redeem until re-approved');
select set_config('request.jwt.claim.sub', :'gm', false);
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gmb'), 'b3@fv.test'))->>'reason' = 'recipient_mismatch', 'stale approval for the old identity is refused');
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gmb'), 'c2@fv.test'))->>'status' = 'approved', 're-approval for the new identity');
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gmb'), 'c2@fv.test'))->>'reason' = 'not_pending', 'approval replay refused after re-approval');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', false);
select fvtest.check((public.accept_mission_invite(:'gmb'))->>'reason' = 'wrong_recipient', 'originally bound account with the code is refused after re-binding');
select fvtest.check(not fvtest.invite_active(:'gmb') and fvtest.roles('m1', '00000000-0000-0000-0000-0000000000b3') = '', 'wrong-recipient attempt revokes the leaked code and grants nothing');
select set_config('request.jwt.claim.sub', :'u2', false);
select fvtest.check(fvtest.raises(format('select public.accept_mission_invite(%L)', :'gmb'), 'invalid, expired, or already used'), 'revoked invite cannot be redeemed afterwards');
select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gmok \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gmok'), 'c2@fv.test');
select fvtest.check((select (public.get_mission_operations_workspace('m1'))->'invites' @> jsonb_build_array(jsonb_build_object('id', fvtest.invite_id(:'gmok'), 'recipient_email', 'c2@fv.test'))), 'operators see which identity awaits approval');
select fvtest.check(not ((public.get_mission_operations_workspace('m1'))::text ~ :'gmok'), 'workspace never exposes invite codes');
select set_config('request.jwt.claim.sub', :'gm', false);
select public.approve_mission_invite(fvtest.invite_id(:'gmok'), 'c2@fv.test');
select set_config('request.jwt.claim.sub', :'u1', false);
select fvtest.check((public.accept_mission_invite(:'gmok'))->>'reason' = 'wrong_recipient', 'different account with a valid code is refused');
select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gmok2 \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gmok2'), 'c2@fv.test');
select set_config('request.jwt.claim.sub', :'gm', false);
select public.approve_mission_invite(fvtest.invite_id(:'gmok2'), 'c2@fv.test');
select set_config('request.jwt.claim.sub', :'u2', false);
select fvtest.check((public.accept_mission_invite(:'gmok2'))->>'status' = 'accepted', 'bound, approved recipient accepts legitimately');
select fvtest.check(fvtest.roles('m1', :'u2') = 'ground_medical', 'legitimate recipient holds exactly Ground Medical');
select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gmself \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gmself'), 'a2@fv.test');
select set_config('request.jwt.claim.sub', :'gm', false);
select fvtest.check((public.approve_mission_invite(fvtest.invite_id(:'gmself'), 'a2@fv.test'))->>'reason' = 'recipient_cannot_approve', 'bound recipient cannot approve their own access');

-- ---------- F2: forbidden role combinations ----------
select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m1','researcher'))->>'code' as r_c1 \gset
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gm_c1 \gset
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gm_op2 \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gm_c1'), 'b1@fv.test');
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gm_op2'), 'a4@fv.test');
select set_config('request.jwt.claim.sub', :'gm', false);
select public.approve_mission_invite(fvtest.invite_id(:'gm_c1'), 'b1@fv.test');
select public.approve_mission_invite(fvtest.invite_id(:'gm_op2'), 'a4@fv.test');
select set_config('request.jwt.claim.sub', :'c1u', false);
select fvtest.check((public.accept_mission_invite(:'r_c1'))->>'reason' = 'role_combination_not_permitted', 'Crew Self + Researcher refused');
select fvtest.check((public.accept_mission_invite(:'gm_c1'))->>'reason' = 'role_combination_not_permitted', 'Crew Self + Ground Medical refused');
select fvtest.check(fvtest.roles('m1', :'c1u') = 'crew_self', 'Crew Self keeps only its own role');
select set_config('request.jwt.claim.sub', :'op2', false);
select fvtest.check((public.accept_mission_invite(:'gm_op2'))->>'reason' = 'role_combination_not_permitted', 'Operator + Ground Medical refused');

-- ---------- authorized combinations + cross-mission ----------
select set_config('request.jwt.claim.sub', :'op', false);
select (public.create_mission_invite('m1','mission_operator'))->>'code' as op_c2 \gset
select (public.create_mission_invite('m1','researcher'))->>'code' as r_op2 \gset
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gm_res \gset
select (public.create_mission_invite('m1','ground_medical'))->>'code' as gm_c4 \gset
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gm_res'), 'a3@fv.test');
select public.bind_mission_invite_recipient(fvtest.invite_id(:'gm_c4'), 'b4@fv.test');
select set_config('request.jwt.claim.sub', :'gm', false);
select public.approve_mission_invite(fvtest.invite_id(:'gm_res'), 'a3@fv.test');
select public.approve_mission_invite(fvtest.invite_id(:'gm_c4'), 'b4@fv.test');
select set_config('request.jwt.claim.sub', :'c2u', false);
select fvtest.check((public.accept_mission_invite(:'op_c2'))->>'status' = 'accepted', 'Crew Self + Operator allowed');
select set_config('request.jwt.claim.sub', :'op2', false);
select fvtest.check((public.accept_mission_invite(:'r_op2'))->>'status' = 'accepted', 'Operator + Researcher allowed (issued by another operator)');
select set_config('request.jwt.claim.sub', :'res', false);
select fvtest.check((public.accept_mission_invite(:'gm_res'))->>'status' = 'accepted', 'Researcher + Ground Medical allowed');
select set_config('request.jwt.claim.sub', :'c4u', false);
select fvtest.check((public.accept_mission_invite(:'gm_c4'))->>'status' = 'accepted', 'Crew Self in m2 may hold Ground Medical in m1 (cross-mission)');
select fvtest.check(fvtest.roles('m2', :'c4u') = 'crew_self' and fvtest.roles('m1', :'c4u') = 'ground_medical', 'cross-mission roles stay mission-scoped');

-- ---------- Crew Self binding with an extra role ----------
select set_config('request.jwt.claim.sub', :'c1u', false);
select fvtest.check((public.ingest_mission_event(fvtest.ev('m1','c1','fv0143-c1-own'), 'key-fv0143-c1-own-aaaaaa'))->>'status' = 'accepted', 'Crew Self writes own crew data');
select set_config('request.jwt.claim.sub', :'c2u', false);
select fvtest.check(fvtest.raises($q$select public.ingest_mission_event(fvtest.ev('m1','c1','fv0143-c2-as-c1'), 'key-fv0143-c2-as-c1-aaaa')$q$, 'operator event scope denied'),
  'Crew Self + Operator cannot write medical data for another crew member');
select fvtest.check((public.ingest_mission_event(fvtest.ev('m1','c2','fv0143-c2-own'), 'key-fv0143-c2-own-aaaaaa'))->>'status' = 'accepted', 'Crew Self + Operator still writes own crew data');
select fvtest.check((select count(*) from public.mission_events where crew_member_id = 'c1') = 0, 'Crew Self + Operator cannot read another crew member''s events');

-- ---------- F1: self-reactivation refusal + reactivation compatibility ----------
reset role;
insert into public.mission_memberships(mission_id, user_id, role, active) values ('m1', :'gm', 'mission_operator', false);
set role authenticated;
select set_config('request.jwt.claim.sub', :'op', false);
select public.set_mission_membership_active('m1', (select id from public.mission_memberships where mission_id='m1' and user_id=:'op2' and role='researcher'), false);
select set_config('request.jwt.claim.sub', :'op2', false);
select fvtest.check((public.set_mission_membership_active('m1', (select id from public.mission_memberships where mission_id='m1' and user_id=:'op2' and role='researcher'), true))->>'reason' = 'self_reactivation',
  'operator cannot reactivate own sensitive membership');
select set_config('request.jwt.claim.sub', :'op', false);
select fvtest.check((public.set_mission_membership_active('m1', (select id from public.mission_memberships where mission_id='m1' and user_id=:'op2' and role='researcher'), true))->>'status' = 'updated',
  'another operator may reactivate a compatible membership');
select fvtest.check((public.set_mission_membership_active('m1', (select id from public.mission_memberships where mission_id='m1' and user_id=:'gm' and role='mission_operator'), true))->>'reason' = 'role_combination_not_permitted',
  'reactivation cannot create Operator + Ground Medical');
select fvtest.check(fvtest.roles('m1', :'gm') = 'ground_medical', 'refused reactivation left roles unchanged');

-- ---------- alternate paths ----------
select fvtest.check(fvtest.raises($q$insert into public.mission_memberships(mission_id,user_id,role,active) values ('m1','00000000-0000-0000-0000-0000000000c2','ground_medical',true)$q$, 'permission denied'),
  'browser role cannot insert memberships directly');
select fvtest.check(fvtest.raises($q$update public.mission_invites set approval_state='approved'$q$, 'permission denied'),
  'browser role cannot self-approve invites by direct update');
reset role;
select fvtest.check(fvtest.raises($q$insert into public.mission_memberships(mission_id,user_id,role,active) values ('m1','00000000-0000-0000-0000-0000000000a2','mission_operator',true) on conflict (mission_id,user_id,role) do update set active=true$q$, 'role combination not permitted'),
  'database backstop blocks forbidden pair even on privileged write path');
select fvtest.check(not exists(select 1 from public.mission_memberships a join public.mission_memberships b on a.mission_id=b.mission_id and a.user_id=b.user_id and a.id<>b.id
  where a.active and b.active and not public.mission_roles_compatible(a.role,b.role)), 'no forbidden active pair exists anywhere');

-- ---------- auditability without secrets ----------
select fvtest.check((select count(*) from public.audit_events where action='mission_invite_acceptance_denied') >= 9, 'every acceptance denial is audited');
select fvtest.check((select count(*) from public.audit_events where action='mission_invite_approval_denied') >= 3, 'every approval denial is audited');
select fvtest.check((select count(*) from public.audit_events where action='membership_reactivation_denied') = 2, 'every reactivation denial is audited');
select fvtest.check(not exists(select 1 from public.audit_events where metadata::text ~ (:'self_res' || '|' || :'gm2' || '|legacy-open')), 'audit metadata never contains invite codes');

select 'FV0143 DONE';
