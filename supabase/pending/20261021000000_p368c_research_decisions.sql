-- P36.8C: governed synthetic research review decisions (proposed governed migration 0010).
-- STAGED ONLY. Never apply to the shared Lovable Cloud database without explicit owner approval.
-- Additive and re-runnable. Research-only decisions: accepted_for_research / rejected_for_research.
-- NO clinical approval, NO promotion into mission_events, crew_health_record_index or any
-- clinical record, NO direct table grants, NO change to submitted item values.

-- 1. Decision idempotency columns (nullable, additive).
alter table public.p36_biomarker_review_batches
  add column if not exists decision_idempotency_key text,
  add column if not exists decision_payload_hash text;
alter table public.p36_biomarker_review_batches drop constraint if exists p36_decision_idempotency_format;
alter table public.p36_biomarker_review_batches add constraint p36_decision_idempotency_format check (
  (decision_idempotency_key is null and decision_payload_hash is null)
  or (decision_idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$' and decision_payload_hash ~ '^[a-f0-9]{64}$'));
create unique index if not exists p36_batches_decision_idempotency
  on public.p36_biomarker_review_batches(reviewed_by_membership_id, decision_idempotency_key)
  where decision_idempotency_key is not null;

-- 2. Status superset + consistency constraints. Legacy 'approved'/'rejected' remain in the
-- CHECK only so the constraint stays a superset; no trigger transition can reach them.
alter table public.p36_biomarker_review_batches drop constraint if exists p36_biomarker_review_batches_status_check;
alter table public.p36_biomarker_review_batches add constraint p36_biomarker_review_batches_status_check check (
  status in ('pending_review','rejected','approved','quarantined','accepted_for_research','rejected_for_research'));
alter table public.p36_biomarker_review_batches drop constraint if exists p36_decision_receipt_consistent;
alter table public.p36_biomarker_review_batches add constraint p36_decision_receipt_consistent check (
  (status = 'pending_review' and decision_request_id is null and decision_received_at is null
    and decision_authorization_basis is null and decision_idempotency_key is null)
  or (status = 'quarantined' and decision_request_id is not null and decision_received_at is not null
    and decision_authorization_basis = 'locked_independent_ground_medical_membership')
  or (status in ('accepted_for_research','rejected_for_research') and decision_request_id is not null
    and decision_received_at is not null
    and decision_authorization_basis = 'locked_independent_ground_medical_membership'
    and decision_idempotency_key is not null and decision_payload_hash is not null)
  or status in ('approved','rejected'));
alter table public.p36_biomarker_review_batches drop constraint if exists p36_review_state_consistent;
alter table public.p36_biomarker_review_batches add constraint p36_review_state_consistent check (
  (status = 'pending_review' and reviewed_by_membership_id is null and reviewed_at is null)
  or (status in ('approved','rejected','quarantined','accepted_for_research','rejected_for_research')
    and reviewed_by_membership_id is not null and reviewed_at is not null));

-- 3. Batch transition guard. Every 0006 provenance/lock check is preserved verbatim; the
-- only addition is the RPC-gated pending -> research decision transition.
create or replace function public.p36_validate_review_memberships()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_submit public.mission_memberships%rowtype;
  v_review public.mission_memberships%rowtype;
  v_decision boolean := false;
begin
  select * into v_submit from public.mission_memberships
    where id = new.submitted_by_membership_id for share;
  if not found or v_submit.mission_id is distinct from new.mission_id
     or v_submit.crew_member_id is distinct from new.crew_member_id then
    raise exception 'P36 submitter membership scope mismatch';
  end if;
  if tg_op = 'INSERT' and (not v_submit.active or v_submit.role <> 'crew_self') then
    raise exception 'P36 new submission requires active crew_self';
  end if;
  if tg_op = 'INSERT' and (new.status <> 'pending_review' or new.reviewed_by_membership_id is not null
     or new.reviewed_by_user_snapshot is not null or new.decision_idempotency_key is not null
     or new.decision_payload_hash is not null) then
    raise exception 'P36 new batches must start pending with no reviewer';
  end if;
  if tg_op = 'UPDATE' then
    v_decision := new.status in ('accepted_for_research','rejected_for_research');
    if new.id is distinct from old.id
       or new.mission_id is distinct from old.mission_id
       or new.crew_member_id is distinct from old.crew_member_id
       or new.submitted_by_membership_id is distinct from old.submitted_by_membership_id
       or new.submitted_by_user_snapshot is distinct from old.submitted_by_user_snapshot
       or new.source_fingerprint is distinct from old.source_fingerprint
       or new.source_filename is distinct from old.source_filename
       or new.observation_date is distinct from old.observation_date
       or new.classification is distinct from old.classification
       or new.created_at is distinct from old.created_at
       or old.reviewed_by_membership_id is not null
       or old.reviewed_by_user_snapshot is not null
       or old.reviewed_at is not null
       or old.review_note is not null
       or old.decision_request_id is not null
       or old.decision_received_at is not null
       or old.decision_authorization_basis is not null
       or old.decision_idempotency_key is not null
       or old.decision_payload_hash is not null
       or old.status <> 'pending_review'
       or new.status not in ('quarantined','accepted_for_research','rejected_for_research')
       or new.reviewed_by_membership_id is null
       or new.reviewed_at is null then
      raise exception 'P36 historical reviewer/submitter provenance is immutable; only pending-to-quarantined or a governed research decision is permitted';
    end if;
    if v_decision then
      -- Research decisions only through p368_decide_ground_medical_batch (defense in depth;
      -- real authority is the RPC's locked membership checks). Submitter must still be active.
      if coalesce(current_setting('p36.decision_rpc', true), '') <> 'on' then
        raise exception 'P36.8C research decisions require the governed decision RPC';
      end if;
      if not v_submit.active or v_submit.role <> 'crew_self' then
        raise exception 'P36.8C research decision requires an active crew_self submitter';
      end if;
      if new.decision_idempotency_key is null or new.decision_payload_hash is null then
        raise exception 'P36.8C research decision requires idempotency evidence';
      end if;
    else
      if new.decision_idempotency_key is not null or new.decision_payload_hash is not null then
        raise exception 'P36 quarantine cannot carry research decision evidence';
      end if;
      -- Quarantine is ONLY for a revoked submitter (unchanged from 0006).
      if v_submit.active and v_submit.role = 'crew_self' then
        raise exception 'P36 quarantine requires revoked or disqualified submitter';
      end if;
    end if;
  end if;
  if new.submitted_by_user_snapshot is distinct from v_submit.user_id then
    raise exception 'P36 submitter snapshot must match membership user';
  end if;
  if new.reviewed_by_membership_id is not null then
    select * into v_review from public.mission_memberships
      where id = new.reviewed_by_membership_id for share;
    if not found or not v_review.active or v_review.role <> 'ground_medical'
       or v_review.mission_id is distinct from new.mission_id
       or v_review.user_id = v_submit.user_id then
      raise exception 'P36 reviewer must be an independent active ground_medical user in the same mission';
    end if;
    if new.reviewed_by_user_snapshot is distinct from v_review.user_id then
      raise exception 'P36 reviewer snapshot must match membership user';
    end if;
  elsif new.reviewed_by_user_snapshot is not null then
    raise exception 'P36 reviewer snapshot requires a reviewer membership';
  end if;
  if tg_op = 'UPDATE' then
    new.decision_request_id := gen_random_uuid();
    new.decision_received_at := clock_timestamp();
    new.decision_authorization_basis := 'locked_independent_ground_medical_membership';
  elsif new.decision_request_id is not null or new.decision_received_at is not null
     or new.decision_authorization_basis is not null then
    raise exception 'P36 pending submissions cannot carry decision receipts';
  end if;
  return new;
end $$;
revoke all on function public.p36_validate_review_memberships() from public, anon, authenticated;

-- 4. Append-only evidence: one terminal event per batch, event_type = resulting_status.
alter table public.p36_biomarker_review_events drop constraint if exists p36_biomarker_review_events_event_type_check;
alter table public.p36_biomarker_review_events add constraint p36_biomarker_review_events_event_type_check check (
  event_type in ('quarantined','accepted_for_research','rejected_for_research'));
alter table public.p36_biomarker_review_events drop constraint if exists p36_biomarker_review_events_resulting_status_check;
alter table public.p36_biomarker_review_events add constraint p36_biomarker_review_events_resulting_status_check check (
  resulting_status in ('quarantined','accepted_for_research','rejected_for_research') and resulting_status = event_type);
alter table public.p36_biomarker_review_events drop constraint if exists p36_events_one_per_batch;
alter table public.p36_biomarker_review_events add constraint p36_events_one_per_batch unique (batch_id);

create or replace function public.p36_record_quarantine_event()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'pending_review'
     and new.status in ('quarantined','accepted_for_research','rejected_for_research') then
    insert into public.p36_biomarker_review_events (
      batch_id, mission_id, event_type, previous_status, resulting_status,
      reviewer_membership_id, reviewer_user_snapshot,
      submitter_membership_id, submitter_user_snapshot,
      source_fingerprint, decision_note, decision_request_id, server_received_at, authorization_basis, occurred_at
    ) values (
      new.id, new.mission_id, new.status, old.status, new.status,
      new.reviewed_by_membership_id, new.reviewed_by_user_snapshot,
      new.submitted_by_membership_id, new.submitted_by_user_snapshot,
      new.source_fingerprint, new.review_note, new.decision_request_id, new.decision_received_at,
      new.decision_authorization_basis, new.reviewed_at
    );
  end if;
  return new;
end $$;
revoke all on function public.p36_record_quarantine_event() from public, anon, authenticated;

create or replace function public.p36_validate_quarantine_event_insert()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_batch public.p36_biomarker_review_batches%rowtype;
begin
  if pg_trigger_depth() <> 2 then
    raise exception 'P36 quarantine evidence must originate from batch transition';
  end if;
  select * into v_batch from public.p36_biomarker_review_batches
    where id = new.batch_id for share;
  if not found or v_batch.status not in ('quarantined','accepted_for_research','rejected_for_research')
     or new.mission_id is distinct from v_batch.mission_id
     or new.event_type is distinct from v_batch.status
     or new.previous_status <> 'pending_review'
     or new.resulting_status <> v_batch.status
     or new.reviewer_membership_id is distinct from v_batch.reviewed_by_membership_id
     or new.reviewer_user_snapshot is distinct from v_batch.reviewed_by_user_snapshot
     or new.submitter_membership_id is distinct from v_batch.submitted_by_membership_id
     or new.submitter_user_snapshot is distinct from v_batch.submitted_by_user_snapshot
     or new.source_fingerprint is distinct from v_batch.source_fingerprint
     or new.decision_note is distinct from v_batch.review_note
     or new.decision_request_id is distinct from v_batch.decision_request_id
     or new.server_received_at is distinct from v_batch.decision_received_at
     or new.authorization_basis is distinct from v_batch.decision_authorization_basis
     or new.occurred_at is distinct from v_batch.reviewed_at then
    raise exception 'P36 quarantine event does not match the committed batch transition';
  end if;
  return new;
end $$;
revoke all on function public.p36_validate_quarantine_event_insert() from public, anon, authenticated;

-- 5. Item protection gap: items were update-protected only; now delete-protected too.
-- Dedicated function so the 0007 rollback (which drops p36_reject_item_mutation) stays independent.
create or replace function public.p36_reject_item_delete()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'P36 submitted review items are immutable';
end $$;
revoke all on function public.p36_reject_item_delete() from public, anon, authenticated;
drop trigger if exists p36_items_no_delete on public.p36_biomarker_review_items;
create trigger p36_items_no_delete before delete on public.p36_biomarker_review_items
  for each row execute function public.p36_reject_item_delete();

-- 6. The ONLY research-decision path. Identity = auth.uid(); never a parameter.
create or replace function public.p368_decide_ground_medical_batch(
  p_mission_id text, p_batch_id uuid, p_decision text, p_note text,
  p_idempotency_key text, p_expected_item_count integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_member public.mission_memberships%rowtype;
  v_batch public.p36_biomarker_review_batches%rowtype;
  v_existing public.p36_biomarker_review_batches%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_hash text;
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'P36.8C access denied' using errcode = '42501';
  end if;
  if p_mission_id is null or p_batch_id is null then
    raise exception 'P36.8C mission and batch are required' using errcode = '22023';
  end if;
  if p_decision is null or p_decision not in ('accepted_for_research','rejected_for_research') then
    raise exception 'P36.8C invalid decision' using errcode = '22023';
  end if;
  if v_note is not null and (char_length(v_note) > 500 or v_note ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') then
    raise exception 'P36.8C note must be plain text of at most 500 characters' using errcode = '22023';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'P36.8C invalid idempotency key' using errcode = '22023';
  end if;
  if p_expected_item_count is null or p_expected_item_count not between 1 and 100 then
    raise exception 'P36.8C invalid expected item count' using errcode = '22023';
  end if;

  -- Caller's active Ground Medical authority in THIS mission; SHARE lock serializes with revocation.
  select * into v_member from public.mission_memberships
    where user_id = v_uid and mission_id = p_mission_id and role = 'ground_medical' and active
    order by id limit 1 for share;
  if not found then
    raise exception 'P36.8C access denied' using errcode = '42501';
  end if;

  v_hash := encode(extensions.digest(jsonb_build_object('mission', p_mission_id, 'batch', p_batch_id,
    'decision', p_decision, 'note', v_note, 'expected', p_expected_item_count)::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('p368c:' || v_member.id::text || ':' || p_idempotency_key, 0));
  select * into v_existing from public.p36_biomarker_review_batches
    where reviewed_by_membership_id = v_member.id and decision_idempotency_key = p_idempotency_key;
  if found then
    if v_existing.decision_payload_hash = v_hash then
      return jsonb_build_object('batch_id', v_existing.id, 'decision', v_existing.status,
        'decision_request_id', v_existing.decision_request_id,
        'decided_at', v_existing.decision_received_at, 'replay', true);
    end if;
    raise exception 'P36.8C idempotency key reused with a different decision' using errcode = '23505';
  end if;

  select * into v_batch from public.p36_biomarker_review_batches
    where id = p_batch_id and mission_id = p_mission_id for update;
  if not found or v_batch.classification <> 'synthetic' then
    raise exception 'P36.8C batch not available for decision' using errcode = '42501';
  end if;
  if v_batch.submitted_by_user_snapshot = v_uid then
    raise exception 'P36.8C self-review is not permitted' using errcode = '42501';
  end if;
  if v_batch.status <> 'pending_review' then
    raise exception 'P36.8C already_decided' using errcode = '55000';
  end if;
  select count(*) into v_count from public.p36_biomarker_review_items where batch_id = v_batch.id;
  if v_count <> p_expected_item_count then
    raise exception 'P36.8C stale view: item count changed' using errcode = '40001';
  end if;

  perform set_config('p36.decision_rpc', 'on', true);
  update public.p36_biomarker_review_batches set
    status = p_decision,
    reviewed_by_membership_id = v_member.id,
    reviewed_by_user_snapshot = v_uid,
    reviewed_at = clock_timestamp(),
    review_note = v_note,
    decision_idempotency_key = p_idempotency_key,
    decision_payload_hash = v_hash
  where id = v_batch.id
  returning * into v_batch;
  perform set_config('p36.decision_rpc', 'off', true);

  -- Privacy-safe audit: no values, excerpts, filename or note text.
  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_mission_id, v_uid, 'p36.review_decision', 'p36_review_batch', v_batch.id::text,
    jsonb_build_object('classification', 'synthetic', 'decision', p_decision,
      'decision_request_id', v_batch.decision_request_id, 'reviewer_membership_id', v_member.id,
      'item_count', v_count, 'research_only', true));

  return jsonb_build_object('batch_id', v_batch.id, 'decision', v_batch.status,
    'decision_request_id', v_batch.decision_request_id,
    'decided_at', v_batch.decision_received_at, 'replay', false);
end $$;
revoke all on function public.p368_decide_ground_medical_batch(text, uuid, text, text, text, integer) from public, anon;
grant execute on function public.p368_decide_ground_medical_batch(text, uuid, text, text, text, integer) to authenticated;
comment on function public.p368_decide_ground_medical_batch(text, uuid, text, text, text, integer) is
  'P36.8C synthetic-only research decision by an independent active Ground Medical reviewer. Research demonstration only; never clinical approval or record promotion.';
comment on column public.p36_biomarker_review_batches.status is
  'P36.8C: approved/rejected are legacy, unused and NOT authorized. Research decisions use accepted_for_research/rejected_for_research only.';
comment on table public.p36_biomarker_review_events is
  'P36.8C append-only terminal evidence (quarantine or research decision), one per batch, database-generated receipt. Not a proof against database owners. No client access.';
