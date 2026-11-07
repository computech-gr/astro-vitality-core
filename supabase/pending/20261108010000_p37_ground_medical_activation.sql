-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
-- Requires the installed P37 catalog activation migration
-- (20261108000000_p37_catalog_activation.sql).
--
-- P37 role-based catalog activation. Activation and revocation are authorized
-- dynamically by an active Ground Medical membership in the approval's
-- originating mission (mission planning/active; a crew-scoped membership must
-- match the submission's crew member), never by an email-specific grant.
--   * Scientific approval rules, approver grant and evidence checks unchanged.
--   * Activator must differ from the scientific approver and from the
--     source-validation verifier; the receipt is re-checked at activation.
--   * Membership row locked FOR SHARE so a concurrent deactivation cannot race.
--   * Same response for unknown approvals and unauthorized callers (no oracle).
--   * Append-only events; activation/revocation now also record the mission.
--   * p37_catalog_activators is retained but no longer authorizes anything.

create function public.p37_catalog_activator_membership(p_mission_id text, p_submission_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select m.id from public.mission_memberships m
    join public.missions s on s.id = m.mission_id and s.status in ('planning','active')
    join public.p36_dynamic_handoff_submissions h on h.submission_id = p_submission_id and h.mission_id = m.mission_id
   where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active and m.role = 'ground_medical'
     and (m.crew_member_id is null or m.crew_member_id = h.crew_member_id)
   order by (m.crew_member_id is null) desc, m.id
   limit 1
$$;

create or replace function public.p37_catalog_activate_v1(p_approval_event_id uuid, p_expected_entry_sha256 text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_sha text; v_ap public.p37_catalog_events; v_existing public.p37_catalog_events; v_row public.p37_catalog_events;
  v_keys text[]; v_conflict text; v_membership uuid; v_val record; v_n integer;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_approval_event_id is null or p_idempotency_key is null or p_expected_entry_sha256 is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  select * into v_ap from public.p37_catalog_events e where e.id = p_approval_event_id and e.event_type = 'APPROVE';
  if found then v_membership := public.p37_catalog_activator_membership(v_ap.mission_id, v_ap.submission_id); end if;
  if v_membership is null then
    raise exception 'catalog activation requires active Ground Medical membership in the approval mission' using errcode = '42501'; end if;
  perform 1 from public.mission_memberships m where m.id = v_membership and m.active for share;
  if not found then raise exception 'catalog activation requires active Ground Medical membership in the approval mission' using errcode = '42501'; end if;
  v_sha := encode(sha256(convert_to(concat_ws('|', 'ACTIVATE', p_approval_event_id::text, p_expected_entry_sha256, v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p37_catalog_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;
  -- Serialize every activation so conflict checks see a consistent active set.
  perform pg_advisory_xact_lock(hashtextextended('p37-catalog-activation', 0));
  if v_ap.entry_sha256 <> p_expected_entry_sha256 then return jsonb_build_object('status', 'rejected', 'detail', 'proposal digest does not match the approved proposal'); end if;
  if v_ap.actor_user_id = v_uid then return jsonb_build_object('status', 'rejected', 'detail', 'the scientific approver cannot activate their own approval'); end if;
  if exists (select 1 from public.p37_catalog_events e where e.event_type = 'ACTIVATE' and e.approval_event_id = v_ap.id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this approval was already activated; a revoked entry needs a new approval'); end if;
  select count(*) into v_n from public.p36_dynamic_source_validation v
    join public.p36_dynamic_handoff_submissions h on h.submission_id = v_ap.submission_id
   where v.mission_id = v_ap.mission_id and v.crew_member_id = h.crew_member_id and v.provenance = v_ap.provenance
     and v.term_id = v_ap.term_id and v.validation_reference = v_ap.validation_reference;
  if v_n <> 1 then return jsonb_build_object('status', 'rejected', 'detail', 'the approval''s source-validation receipt is missing or ambiguous'); end if;
  select v.* into v_val from public.p36_dynamic_source_validation v
    join public.p36_dynamic_handoff_submissions h on h.submission_id = v_ap.submission_id
   where v.mission_id = v_ap.mission_id and v.crew_member_id = h.crew_member_id and v.provenance = v_ap.provenance
     and v.term_id = v_ap.term_id and v.validation_reference = v_ap.validation_reference;
  if v_val.canonical_metric_id is distinct from v_ap.canonical_id or btrim(v_val.exact_unit) is distinct from v_ap.entry->>'unit'
     or btrim(v_val.specimen) is distinct from v_ap.entry->>'specimen' or btrim(v_val.method) is distinct from v_ap.entry->>'method' then
    return jsonb_build_object('status', 'rejected', 'detail', 'the source-validation receipt no longer matches the approved proposal'); end if;
  if v_val.verified_by = v_uid::text then
    return jsonb_build_object('status', 'rejected', 'detail', 'the source validator cannot activate the entry they validated'); end if;
  if exists (select 1 from public.p36_metric_unit_catalog c where c.metric_id = v_ap.canonical_id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'canonical ID collides with the base catalog'); end if;
  v_keys := public.p37_catalog_keys(v_ap.entry);
  select oa.canonical_id into v_conflict from public.p37_catalog_events act
    join public.p37_catalog_events oa on oa.id = act.approval_event_id
    where act.event_type = 'ACTIVATE'
      and not exists (select 1 from public.p37_catalog_events r where r.event_type = 'REVOKE' and r.activation_event_id = act.id)
      and (oa.canonical_id = v_ap.canonical_id or public.p37_catalog_keys(oa.entry) && v_keys)
    limit 1;
  if v_conflict is not null then
    return jsonb_build_object('status', 'rejected', 'detail', 'conflicts with active entry ' || v_conflict); end if;
  insert into public.p37_catalog_events(event_type, canonical_id, mission_id, provenance, approval_event_id, entry_sha256, actor_user_id, idempotency_key, request_sha256)
  values ('ACTIVATE', v_ap.canonical_id, v_ap.mission_id, v_ap.provenance, v_ap.id, v_ap.entry_sha256, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'catalog_version', v_row.seq, 'recorded_at', v_row.recorded_at);
end $$;

create or replace function public.p37_catalog_revoke_v1(p_activation_event_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_sha text; v_act public.p37_catalog_events; v_ap public.p37_catalog_events;
  v_existing public.p37_catalog_events; v_row public.p37_catalog_events; v_membership uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_activation_event_id is null or p_idempotency_key is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  select * into v_act from public.p37_catalog_events e where e.id = p_activation_event_id and e.event_type = 'ACTIVATE';
  if found then
    select * into v_ap from public.p37_catalog_events e where e.id = v_act.approval_event_id and e.event_type = 'APPROVE';
    if found then v_membership := public.p37_catalog_activator_membership(v_ap.mission_id, v_ap.submission_id); end if;
  end if;
  if v_membership is null then
    raise exception 'catalog revocation requires active Ground Medical membership in the approval mission' using errcode = '42501'; end if;
  perform 1 from public.mission_memberships m where m.id = v_membership and m.active for share;
  if not found then raise exception 'catalog revocation requires active Ground Medical membership in the approval mission' using errcode = '42501'; end if;
  v_sha := encode(sha256(convert_to(concat_ws('|', 'REVOKE', p_activation_event_id::text, v_reason, v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p37_catalog_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 8 and 2000 then return jsonb_build_object('status', 'rejected', 'detail', 'a documented revocation reason (8 to 2000 characters) is required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('p37-catalog-activation', 0));
  if exists (select 1 from public.p37_catalog_events r where r.event_type = 'REVOKE' and r.activation_event_id = v_act.id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'already revoked'); end if;
  insert into public.p37_catalog_events(event_type, canonical_id, mission_id, provenance, activation_event_id, reason, actor_user_id, idempotency_key, request_sha256)
  values ('REVOKE', v_act.canonical_id, v_ap.mission_id, v_ap.provenance, v_act.id, v_reason, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'catalog_version', v_row.seq, 'recorded_at', v_row.recorded_at);
end $$;

-- Researcher lifecycle view: can_activate now reflects the role-based rule for this mission.
create or replace function public.p37_catalog_lifecycle_v1(p_mission_id text, p_provenance text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_basis text; v_events jsonb; v_receipts jsonb; v_n integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then raise exception 'invalid provenance' using errcode = '22023'; end if;
  v_basis := public.p36_global_review_basis(p_mission_id, p_provenance);
  if v_basis is null then raise exception 'scope denied' using errcode = '42501'; end if;
  with ap as (select * from public.p37_catalog_events e where e.event_type = 'APPROVE' and e.mission_id = p_mission_id and e.provenance = p_provenance)
  select coalesce(jsonb_agg(jsonb_build_object(
      'approval_event_id', ap.id, 'submission_id', ap.submission_id, 'term_id', ap.term_id, 'canonical_id', ap.canonical_id,
      'entry', ap.entry, 'entry_sha256', ap.entry_sha256, 'approved_at', ap.recorded_at, 'approved_by_caller', ap.actor_user_id = auth.uid(),
      'activation_event_id', act.id, 'activated_at', act.recorded_at, 'activated_by_caller', act.actor_user_id = auth.uid(),
      'revocation_event_id', rv.id, 'revoked_at', rv.recorded_at, 'revocation_reason', rv.reason
    ) order by ap.seq), '[]'::jsonb), count(*)
  into v_events, v_n
  from ap
  left join public.p37_catalog_events act on act.event_type = 'ACTIVATE' and act.approval_event_id = ap.id
  left join public.p37_catalog_events rv on rv.event_type = 'REVOKE' and rv.activation_event_id = act.id;
  select coalesce(jsonb_agg(jsonb_build_object('term_id', v.term_id, 'validation_reference', v.validation_reference,
      'canonical_metric_id', v.canonical_metric_id, 'exact_unit', v.exact_unit, 'specimen', v.specimen, 'method', v.method,
      'protocol', v.protocol, 'protocol_version', v.protocol_version, 'verified_at', v.verified_at) order by v.term_id, v.validation_reference), '[]'::jsonb)
  into v_receipts
  from public.p36_dynamic_source_validation v where v.mission_id = p_mission_id and v.provenance = p_provenance;
  insert into public.p36_global_review_audit(actor_id, action, mission_id, provenance, access_basis, row_count, details)
  values (auth.uid(), 'list_submissions', p_mission_id, p_provenance, v_basis, v_n, jsonb_build_object('view', 'p37_catalog_lifecycle'));
  return jsonb_build_object(
    'can_approve', exists (select 1 from public.p37_scientific_approvers a where a.user_id = auth.uid() and a.revoked_at is null),
    'can_activate', exists (select 1 from public.mission_memberships m join public.missions s on s.id = m.mission_id and s.status in ('planning','active')
      where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active and m.role = 'ground_medical'),
    'events', v_events, 'receipts', v_receipts);
end $$;

-- Ground Medical activation queue: approved proposals of one mission the caller may activate (definitions only, no identities).
create function public.p37_catalog_activation_queue_v1(p_mission_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_events jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null or not exists (select 1 from public.mission_memberships m
      join public.missions s on s.id = m.mission_id and s.status in ('planning','active')
      where m.mission_id = p_mission_id and m.user_id = v_uid and m.active and m.role = 'ground_medical') then
    raise exception 'scope denied' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'approval_event_id', ap.id, 'submission_id', ap.submission_id, 'term_id', ap.term_id, 'canonical_id', ap.canonical_id,
      'provenance', ap.provenance, 'entry', ap.entry, 'entry_sha256', ap.entry_sha256, 'approved_at', ap.recorded_at,
      'approved_by_caller', ap.actor_user_id = v_uid,
      'caller_may_activate', public.p37_catalog_activator_membership(ap.mission_id, ap.submission_id) is not null,
      'activation_event_id', act.id, 'activated_at', act.recorded_at, 'activated_by_caller', act.actor_user_id = v_uid,
      'revocation_event_id', rv.id, 'revoked_at', rv.recorded_at, 'revocation_reason', rv.reason
    ) order by ap.seq), '[]'::jsonb)
  into v_events
  from public.p37_catalog_events ap
  left join public.p37_catalog_events act on act.event_type = 'ACTIVATE' and act.approval_event_id = ap.id
  left join public.p37_catalog_events rv on rv.event_type = 'REVOKE' and rv.activation_event_id = act.id
  where ap.event_type = 'APPROVE' and ap.mission_id = p_mission_id;
  return jsonb_build_object('can_activate', true, 'events', v_events);
end $$;

comment on table public.p37_catalog_activators is
  'DEPRECATED: catalog activation is authorized by active Ground Medical mission membership (p37_catalog_activator_membership); rows here no longer grant anything.';

revoke all on function public.p37_catalog_activator_membership(text, uuid), public.p37_catalog_activation_queue_v1(text),
  public.p37_catalog_activate_v1(uuid, text, uuid), public.p37_catalog_revoke_v1(uuid, text, uuid),
  public.p37_catalog_lifecycle_v1(text, text) from public, anon, authenticated, service_role;
grant execute on function public.p37_catalog_activate_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p37_catalog_revoke_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p37_catalog_lifecycle_v1(text, text) to authenticated;
grant execute on function public.p37_catalog_activation_queue_v1(text) to authenticated;
