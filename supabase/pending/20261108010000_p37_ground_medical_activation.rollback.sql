-- ROLLBACK for 20261108010000_p37_ground_medical_activation.sql (preparation only;
-- separate owner approval required). Restores the original activator-grant
-- authorization bodies from 20261108000000_p37_catalog_activation.sql verbatim and
-- drops the role-based helpers. Recorded events are append-only and are kept; the
-- original CHECK constraint already permits mission_id/provenance on ACTIVATE/REVOKE.

drop function if exists public.p37_catalog_activation_queue_v1(text);
create or replace function public.p37_catalog_activate_v1(p_approval_event_id uuid, p_expected_entry_sha256 text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_sha text; v_ap public.p37_catalog_events; v_existing public.p37_catalog_events; v_row public.p37_catalog_events;
  v_keys text[]; v_conflict text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_approval_event_id is null or p_idempotency_key is null or p_expected_entry_sha256 is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  perform 1 from public.p37_catalog_activators a where a.user_id = v_uid and a.revoked_at is null for share;
  if not found then raise exception 'catalog activation authorization required' using errcode = '42501'; end if;
  v_sha := encode(sha256(convert_to(concat_ws('|', 'ACTIVATE', p_approval_event_id::text, p_expected_entry_sha256, v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p37_catalog_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;
  -- Serialize every activation so conflict checks see a consistent active set.
  perform pg_advisory_xact_lock(hashtextextended('p37-catalog-activation', 0));
  select * into v_ap from public.p37_catalog_events e where e.id = p_approval_event_id and e.event_type = 'APPROVE';
  if not found then return jsonb_build_object('status', 'rejected', 'detail', 'no scientific approval exists for this proposal'); end if;
  if v_ap.entry_sha256 <> p_expected_entry_sha256 then return jsonb_build_object('status', 'rejected', 'detail', 'proposal digest does not match the approved proposal'); end if;
  if v_ap.actor_user_id = v_uid then return jsonb_build_object('status', 'rejected', 'detail', 'the scientific approver cannot activate their own approval'); end if;
  if exists (select 1 from public.p37_catalog_events e where e.event_type = 'ACTIVATE' and e.approval_event_id = v_ap.id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this approval was already activated; a revoked entry needs a new approval'); end if;
  v_keys := public.p37_catalog_keys(v_ap.entry);
  select oa.canonical_id into v_conflict from public.p37_catalog_events act
    join public.p37_catalog_events oa on oa.id = act.approval_event_id
    where act.event_type = 'ACTIVATE'
      and not exists (select 1 from public.p37_catalog_events r where r.event_type = 'REVOKE' and r.activation_event_id = act.id)
      and (oa.canonical_id = v_ap.canonical_id or public.p37_catalog_keys(oa.entry) && v_keys)
    limit 1;
  if v_conflict is not null then
    return jsonb_build_object('status', 'rejected', 'detail', 'conflicts with active entry ' || v_conflict); end if;
  insert into public.p37_catalog_events(event_type, canonical_id, approval_event_id, entry_sha256, actor_user_id, idempotency_key, request_sha256)
  values ('ACTIVATE', v_ap.canonical_id, v_ap.id, v_ap.entry_sha256, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'catalog_version', v_row.seq, 'recorded_at', v_row.recorded_at);
end $$;

create or replace function public.p37_catalog_revoke_v1(p_activation_event_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_sha text; v_act public.p37_catalog_events; v_existing public.p37_catalog_events; v_row public.p37_catalog_events;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_activation_event_id is null or p_idempotency_key is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  perform 1 from public.p37_catalog_activators a where a.user_id = v_uid and a.revoked_at is null for share;
  if not found then raise exception 'catalog activation authorization required' using errcode = '42501'; end if;
  v_sha := encode(sha256(convert_to(concat_ws('|', 'REVOKE', p_activation_event_id::text, v_reason, v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p37_catalog_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 8 and 2000 then return jsonb_build_object('status', 'rejected', 'detail', 'a documented revocation reason (8 to 2000 characters) is required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('p37-catalog-activation', 0));
  select * into v_act from public.p37_catalog_events e where e.id = p_activation_event_id and e.event_type = 'ACTIVATE';
  if not found then return jsonb_build_object('status', 'rejected', 'detail', 'no such activation'); end if;
  if exists (select 1 from public.p37_catalog_events r where r.event_type = 'REVOKE' and r.activation_event_id = v_act.id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'already revoked'); end if;
  insert into public.p37_catalog_events(event_type, canonical_id, activation_event_id, reason, actor_user_id, idempotency_key, request_sha256)
  values ('REVOKE', v_act.canonical_id, v_act.id, v_reason, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'catalog_version', v_row.seq, 'recorded_at', v_row.recorded_at);
end $$;

-- Lifecycle for one authorized mission: approvals/activations/revocations, receipt metadata and caller capabilities.
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
    'can_activate', exists (select 1 from public.p37_catalog_activators a where a.user_id = auth.uid() and a.revoked_at is null),
    'events', v_events, 'receipts', v_receipts);
end $$;

drop function if exists public.p37_catalog_activator_membership(text, uuid);
comment on table public.p37_catalog_activators is null;

revoke all on function public.p37_catalog_activate_v1(uuid, text, uuid), public.p37_catalog_revoke_v1(uuid, text, uuid),
  public.p37_catalog_lifecycle_v1(text, text) from public, anon, authenticated, service_role;
grant execute on function public.p37_catalog_activate_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p37_catalog_revoke_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p37_catalog_lifecycle_v1(text, text) to authenticated;
