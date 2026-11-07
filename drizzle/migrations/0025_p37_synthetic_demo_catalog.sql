-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
-- Requires the installed P36 dynamic handoff, global review, global triage and
-- P37 lifecycle + role-based Ground Medical activation migrations.
--
-- P37 SYNTHETIC DEMO catalog lifecycle (one owner-allow-listed term at a time):
--   ACCEPT_FOR_REVIEW (existing triage) -> DEMO_DECIDE (existing scientific
--   approver grant + global review basis; explicit "not a scientific approval"
--   acknowledgement; NO source-validation receipt, specimen or method) ->
--   DEMO_ACTIVATE (active Ground Medical member of the mission, never the
--   decider) -> DEMO_REVOKE.
--   * Isolated: separate append-only table and demo: identifier namespace. Never
--     reads or writes p37_catalog_events, p36_dynamic_source_validation,
--     submissions, terms, triage, the P36 authorization ledger or
--     p36_metric_unit_catalog, and is synthetic provenance only.
--   * Only (submission, term) pairs in p37_demo_scope are eligible; that table
--     has no application write path (owner-provisioned rows only).
--   * Snapshots are mission-scoped definitions only (no observations or
--     identities) and are signed by a separate synthetic-demo key that the
--     production catalog loader never trusts.

create table public.p37_demo_scope (
  submission_id uuid not null references public.p36_dynamic_handoff_submissions(submission_id),
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  authorization_ref text not null check (char_length(authorization_ref) between 8 and 200),
  granted_at timestamptz not null default now(),
  primary key (submission_id, term_id)
);
create table public.p37_demo_catalog_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  event_type text not null check (event_type in ('DEMO_DECIDE','DEMO_ACTIVATE','DEMO_REVOKE')),
  demo_id text not null check (demo_id ~ '^demo:ubt-[0-9a-f]{8}$'),
  mission_id text not null references public.missions(id),
  provenance text not null default 'synthetic' check (provenance = 'synthetic'),
  submission_id uuid not null references public.p36_dynamic_handoff_submissions(submission_id),
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  entry jsonb,
  entry_sha256 text check (entry_sha256 is null or entry_sha256 ~ '^[0-9a-f]{64}$'),
  decision_event_id uuid references public.p37_demo_catalog_events(id),
  activation_event_id uuid references public.p37_demo_catalog_events(id),
  reason text check (reason is null or char_length(reason) between 8 and 2000),
  actor_user_id uuid not null,
  idempotency_key uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  check ((event_type = 'DEMO_DECIDE' and entry is not null and entry_sha256 is not null and decision_event_id is null and activation_event_id is null and reason is null)
      or (event_type = 'DEMO_ACTIVATE' and entry is null and entry_sha256 is not null and decision_event_id is not null and activation_event_id is null)
      or (event_type = 'DEMO_REVOKE' and entry is null and activation_event_id is not null and decision_event_id is null and reason is not null))
);
create unique index p37_demo_one_decision_per_term on public.p37_demo_catalog_events (submission_id, term_id) where event_type = 'DEMO_DECIDE';
create unique index p37_demo_one_activation_per_decision on public.p37_demo_catalog_events (decision_event_id) where event_type = 'DEMO_ACTIVATE';
create unique index p37_demo_one_revocation_per_activation on public.p37_demo_catalog_events (activation_event_id) where event_type = 'DEMO_REVOKE';

revoke all on public.p37_demo_scope, public.p37_demo_catalog_events from public, anon, authenticated, service_role;
grant select on public.p37_demo_scope, public.p37_demo_catalog_events to service_role;
alter table public.p37_demo_scope enable row level security;
alter table public.p37_demo_catalog_events enable row level security;
-- No direct application policies on either table.

do $acl$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    revoke insert, update, delete, truncate on public.p37_demo_scope, public.p37_demo_catalog_events from sandbox_exec;
  end if;
end $acl$;

create trigger p37_demo_catalog_events_immutable before update or delete on public.p37_demo_catalog_events
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p37_demo_catalog_events_no_truncate before truncate on public.p37_demo_catalog_events
  for each statement execute function public.p36_global_review_reject_mutation();
create trigger p37_demo_scope_immutable before update or delete on public.p37_demo_scope
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p37_demo_scope_no_truncate before truncate on public.p37_demo_scope
  for each statement execute function public.p36_global_review_reject_mutation();

-- Matching keys of one demo definition: normalized label | exact unit.
create function public.p37_demo_keys(p_entry jsonb) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct lower(regexp_replace(btrim(l), '\s+', ' ', 'g')) || '|' || btrim(p_entry->>'unit')), '{}'::text[])
  from (select p_entry->>'displayName' as l union all select jsonb_array_elements_text(p_entry->'aliases')) s
$$;

create function public.p37_demo_decide_v1(
  p_mission_id text, p_submission_id uuid, p_term_id text, p_display_name text, p_domain text,
  p_acknowledgement text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_basis text; v_sha text; v_sub record; v_meta jsonb; v_triage text;
  v_aliases jsonb; v_entry jsonb; v_existing public.p37_demo_catalog_events; v_row public.p37_demo_catalog_events;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null or p_submission_id is null or p_term_id is null or p_idempotency_key is null then
    raise exception 'missing arguments' using errcode = '22023'; end if;
  perform 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null for share;
  if not found then raise exception 'scientific approval authorization required' using errcode = '42501'; end if;
  perform 1 from public.p36_mission_scientific_sharing s where s.mission_id = p_mission_id for share;
  v_basis := public.p36_global_review_basis(p_mission_id, 'synthetic');
  if v_basis is null then raise exception 'scope denied' using errcode = '42501'; end if;

  v_sha := encode(sha256(convert_to(concat_ws('|', 'DEMO_DECIDE', p_mission_id, p_submission_id::text, p_term_id, v_name,
    coalesce(p_domain, ''), coalesce(p_acknowledgement, ''), v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p37_demo_catalog_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then
      return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id, 'entry_sha256', v_existing.entry_sha256); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;

  if p_acknowledgement is distinct from 'SYNTHETIC DEMO - NOT A SCIENTIFIC APPROVAL' then
    return jsonb_build_object('status', 'rejected', 'detail', 'the synthetic demo acknowledgement is required'); end if;
  if not exists (select 1 from public.p37_demo_scope d where d.submission_id = p_submission_id and d.term_id = p_term_id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this term is not in the owner-authorized synthetic demo scope'); end if;
  select h.crew_member_id, h.submitted_by into v_sub from public.p36_dynamic_handoff_submissions h
    where h.submission_id = p_submission_id and h.mission_id = p_mission_id and h.provenance = 'synthetic';
  if not found then return jsonb_build_object('status', 'rejected', 'detail', 'synthetic submission not found in this mission'); end if;
  if v_sub.submitted_by = v_uid then return jsonb_build_object('status', 'rejected', 'detail', 'the submitter cannot decide their own request'); end if;
  select t.metadata into v_meta from public.p36_dynamic_handoff_terms t where t.submission_id = p_submission_id and t.term_id = p_term_id;
  if not found then return jsonb_build_object('status', 'rejected', 'detail', 'submitted term not found'); end if;
  select e.action into v_triage from public.p36_global_triage_events e
    where e.submission_id = p_submission_id and e.term_id = p_term_id
      and not exists (select 1 from public.p36_global_triage_events n where n.previous_event_id = e.id);
  if v_triage is distinct from 'ACCEPT_FOR_REVIEW' then
    return jsonb_build_object('status', 'rejected', 'detail', 'the term must be accepted for scientific review first'); end if;
  if char_length(v_name) not between 3 and 120 then return jsonb_build_object('status', 'rejected', 'detail', 'display name must be 3 to 120 characters'); end if;
  if p_domain is null or p_domain not in ('bone','immune','cardiovascular','behavioral') then
    return jsonb_build_object('status', 'rejected', 'detail', 'unknown scientific domain'); end if;
  if btrim(coalesce(v_meta->>'exactUnit', '')) = '' then
    return jsonb_build_object('status', 'rejected', 'detail', 'the submitted term has no exact unit'); end if;
  select jsonb_agg(l order by l) into v_aliases from (select distinct btrim(x) as l from jsonb_array_elements_text(v_meta->'originalLabels') x where btrim(x) <> '') s;
  if v_aliases is null then return jsonb_build_object('status', 'rejected', 'detail', 'the submitted term has no observed label'); end if;

  v_entry := jsonb_build_object('demoId', 'demo:' || p_term_id, 'displayName', v_name, 'aliases', v_aliases,
    'unit', btrim(v_meta->>'exactUnit'), 'domain', p_domain, 'provenance', 'synthetic', 'missionId', p_mission_id,
    'submissionId', p_submission_id, 'termId', p_term_id,
    'classification', 'SYNTHETIC_DEMO_NOT_SCIENTIFICALLY_VALIDATED',
    'sourceDocumentSha256', coalesce(v_meta->'sourceDocumentSha256', '[]'::jsonb));
  insert into public.p37_demo_catalog_events(event_type, demo_id, mission_id, submission_id, term_id, entry, entry_sha256,
    actor_user_id, idempotency_key, request_sha256)
  values ('DEMO_DECIDE', 'demo:' || p_term_id, p_mission_id, p_submission_id, p_term_id, v_entry,
    encode(sha256(convert_to(v_entry::text, 'UTF8')), 'hex'), v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'entry_sha256', v_row.entry_sha256, 'recorded_at', v_row.recorded_at);
exception when unique_violation then
  return jsonb_build_object('status', 'rejected', 'detail', 'this submitted term already has a synthetic demo decision');
end $$;

create function public.p37_demo_activate_v1(p_decision_event_id uuid, p_expected_entry_sha256 text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_sha text; v_dec public.p37_demo_catalog_events; v_existing public.p37_demo_catalog_events;
  v_row public.p37_demo_catalog_events; v_membership uuid; v_keys text[]; v_conflict text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_decision_event_id is null or p_idempotency_key is null or p_expected_entry_sha256 is null then
    raise exception 'missing arguments' using errcode = '22023'; end if;
  select * into v_dec from public.p37_demo_catalog_events e where e.id = p_decision_event_id and e.event_type = 'DEMO_DECIDE';
  if found then v_membership := public.p37_catalog_activator_membership(v_dec.mission_id, v_dec.submission_id); end if;
  if v_membership is null then
    raise exception 'synthetic demo activation requires active Ground Medical membership in the decision mission' using errcode = '42501'; end if;
  perform 1 from public.mission_memberships m where m.id = v_membership and m.active for share;
  if not found then
    raise exception 'synthetic demo activation requires active Ground Medical membership in the decision mission' using errcode = '42501'; end if;
  v_sha := encode(sha256(convert_to(concat_ws('|', 'DEMO_ACTIVATE', p_decision_event_id::text, p_expected_entry_sha256, v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p37_demo_catalog_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p37-demo-catalog-activation', 0));
  if v_dec.entry_sha256 <> p_expected_entry_sha256 then
    return jsonb_build_object('status', 'rejected', 'detail', 'proposal digest does not match the synthetic demo decision'); end if;
  if v_dec.actor_user_id = v_uid then
    return jsonb_build_object('status', 'rejected', 'detail', 'the decider cannot activate their own synthetic demo decision'); end if;
  if not exists (select 1 from public.p37_demo_scope d where d.submission_id = v_dec.submission_id and d.term_id = v_dec.term_id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this term is not in the owner-authorized synthetic demo scope'); end if;
  if exists (select 1 from public.p37_demo_catalog_events e where e.event_type = 'DEMO_ACTIVATE' and e.decision_event_id = v_dec.id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this synthetic demo decision was already activated; a revoked entry needs a new decision'); end if;
  v_keys := public.p37_demo_keys(v_dec.entry);
  select od.demo_id into v_conflict from public.p37_demo_catalog_events act
    join public.p37_demo_catalog_events od on od.id = act.decision_event_id
   where act.event_type = 'DEMO_ACTIVATE' and act.mission_id = v_dec.mission_id
     and not exists (select 1 from public.p37_demo_catalog_events r where r.event_type = 'DEMO_REVOKE' and r.activation_event_id = act.id)
     and (od.demo_id = v_dec.demo_id or public.p37_demo_keys(od.entry) && v_keys)
   limit 1;
  if v_conflict is not null then
    return jsonb_build_object('status', 'rejected', 'detail', 'conflicts with active synthetic demo entry ' || v_conflict); end if;
  insert into public.p37_demo_catalog_events(event_type, demo_id, mission_id, submission_id, term_id, entry_sha256,
    decision_event_id, actor_user_id, idempotency_key, request_sha256)
  values ('DEMO_ACTIVATE', v_dec.demo_id, v_dec.mission_id, v_dec.submission_id, v_dec.term_id, v_dec.entry_sha256,
    v_dec.id, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'demo_catalog_version', v_row.seq, 'recorded_at', v_row.recorded_at);
end $$;

create function public.p37_demo_revoke_v1(p_activation_event_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_sha text; v_act public.p37_demo_catalog_events; v_existing public.p37_demo_catalog_events;
  v_row public.p37_demo_catalog_events; v_membership uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_activation_event_id is null or p_idempotency_key is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  select * into v_act from public.p37_demo_catalog_events e where e.id = p_activation_event_id and e.event_type = 'DEMO_ACTIVATE';
  if found then v_membership := public.p37_catalog_activator_membership(v_act.mission_id, v_act.submission_id); end if;
  if v_membership is null then
    raise exception 'synthetic demo revocation requires active Ground Medical membership in the decision mission' using errcode = '42501'; end if;
  perform 1 from public.mission_memberships m where m.id = v_membership and m.active for share;
  if not found then
    raise exception 'synthetic demo revocation requires active Ground Medical membership in the decision mission' using errcode = '42501'; end if;
  v_sha := encode(sha256(convert_to(concat_ws('|', 'DEMO_REVOKE', p_activation_event_id::text, v_reason, v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p37_demo_catalog_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 8 and 2000 then
    return jsonb_build_object('status', 'rejected', 'detail', 'a documented revocation reason (8 to 2000 characters) is required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('p37-demo-catalog-activation', 0));
  if exists (select 1 from public.p37_demo_catalog_events r where r.event_type = 'DEMO_REVOKE' and r.activation_event_id = v_act.id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'already revoked'); end if;
  insert into public.p37_demo_catalog_events(event_type, demo_id, mission_id, submission_id, term_id, activation_event_id,
    reason, actor_user_id, idempotency_key, request_sha256)
  values ('DEMO_REVOKE', v_act.demo_id, v_act.mission_id, v_act.submission_id, v_act.term_id, v_act.id,
    v_reason, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'demo_catalog_version', v_row.seq, 'recorded_at', v_row.recorded_at);
end $$;

-- Demo lifecycle for one mission: owner-scoped terms (labels/unit/triage only), demo events and caller capabilities.
create function public.p37_demo_lifecycle_v1(p_mission_id text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_basis text; v_gm boolean; v_approver boolean; v_terms jsonb; v_events jsonb; v_n integer;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  v_basis := public.p36_global_review_basis(p_mission_id, 'synthetic');
  v_approver := v_basis is not null and exists (select 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null);
  v_gm := exists (select 1 from public.mission_memberships m join public.missions s on s.id = m.mission_id and s.status in ('planning','active')
    where m.mission_id = p_mission_id and m.user_id = v_uid and m.active and m.role = 'ground_medical');
  if v_basis is null and not v_gm then raise exception 'scope denied' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'submission_id', d.submission_id, 'term_id', d.term_id,
      'original_labels', coalesce(t.metadata->'originalLabels', '[]'::jsonb), 'exact_unit', t.metadata->>'exactUnit',
      'candidate_metric_ids', coalesce(t.metadata->'candidateMetricIds', '[]'::jsonb),
      'triage_action', (select e.action from public.p36_global_triage_events e where e.submission_id = d.submission_id and e.term_id = d.term_id
          and not exists (select 1 from public.p36_global_triage_events n where n.previous_event_id = e.id)),
      'submitted_by_caller', h.submitted_by = v_uid,
      'caller_may_activate', public.p37_catalog_activator_membership(h.mission_id, h.submission_id) is not null
    ) order by d.term_id), '[]'::jsonb), count(*)
  into v_terms, v_n
  from public.p37_demo_scope d
  join public.p36_dynamic_handoff_submissions h on h.submission_id = d.submission_id and h.mission_id = p_mission_id and h.provenance = 'synthetic'
  join public.p36_dynamic_handoff_terms t on t.submission_id = d.submission_id and t.term_id = d.term_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'decision_event_id', dc.id, 'submission_id', dc.submission_id, 'term_id', dc.term_id, 'demo_id', dc.demo_id,
      'entry', dc.entry, 'entry_sha256', dc.entry_sha256, 'decided_at', dc.recorded_at, 'decided_by_caller', dc.actor_user_id = v_uid,
      'activation_event_id', act.id, 'activated_at', act.recorded_at, 'activated_by_caller', act.actor_user_id = v_uid,
      'revocation_event_id', rv.id, 'revoked_at', rv.recorded_at, 'revocation_reason', rv.reason
    ) order by dc.seq), '[]'::jsonb)
  into v_events
  from public.p37_demo_catalog_events dc
  left join public.p37_demo_catalog_events act on act.event_type = 'DEMO_ACTIVATE' and act.decision_event_id = dc.id
  left join public.p37_demo_catalog_events rv on rv.event_type = 'DEMO_REVOKE' and rv.activation_event_id = act.id
  where dc.event_type = 'DEMO_DECIDE' and dc.mission_id = p_mission_id;
  if v_basis is not null then
    insert into public.p36_global_review_audit(actor_id, action, mission_id, provenance, access_basis, row_count, details)
    values (v_uid, 'list_submissions', p_mission_id, 'synthetic', v_basis, v_n, jsonb_build_object('view', 'p37_demo_lifecycle'));
  end if;
  return jsonb_build_object('can_decide', v_approver, 'can_activate', v_gm, 'terms', v_terms, 'events', v_events);
end $$;

-- Activated synthetic demo definitions of one mission (no observations, no identities).
create function public.p37_demo_catalog_snapshot_v1(p_mission_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_entries jsonb; v_version bigint;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  if not (exists (select 1 from public.mission_memberships m where m.mission_id = p_mission_id and m.user_id = v_uid and m.active)
      or public.p36_global_review_basis(p_mission_id, 'synthetic') is not null) then
    raise exception 'scope denied' using errcode = '42501'; end if;
  select coalesce(max(seq), 0) into v_version from public.p37_demo_catalog_events
    where mission_id = p_mission_id and event_type in ('DEMO_ACTIVATE','DEMO_REVOKE');
  select coalesce(jsonb_agg(dc.entry || jsonb_build_object(
      'status', case when rv.id is null then 'ACTIVE' else 'REVOKED' end,
      'decision', jsonb_build_object('decisionEventId', dc.id, 'decidedAt', dc.recorded_at, 'entrySha256', dc.entry_sha256),
      'activation', jsonb_build_object('activationEventId', act.id, 'activatedAt', act.recorded_at, 'demoCatalogVersion', act.seq),
      'revocation', case when rv.id is null then null else jsonb_build_object('revocationEventId', rv.id, 'revokedAt', rv.recorded_at, 'reason', rv.reason, 'demoCatalogVersion', rv.seq) end
    ) order by dc.demo_id, act.seq), '[]'::jsonb)
  into v_entries
  from public.p37_demo_catalog_events act
  join public.p37_demo_catalog_events dc on dc.id = act.decision_event_id
  left join public.p37_demo_catalog_events rv on rv.event_type = 'DEMO_REVOKE' and rv.activation_event_id = act.id
  where act.event_type = 'DEMO_ACTIVATE' and act.mission_id = p_mission_id;
  return jsonb_build_object('mission_id', p_mission_id, 'demo_catalog_version', v_version, 'entries', v_entries);
end $$;

revoke all on function public.p37_demo_keys(jsonb),
  public.p37_demo_decide_v1(text, uuid, text, text, text, text, uuid),
  public.p37_demo_activate_v1(uuid, text, uuid), public.p37_demo_revoke_v1(uuid, text, uuid),
  public.p37_demo_lifecycle_v1(text), public.p37_demo_catalog_snapshot_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.p37_demo_decide_v1(text, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.p37_demo_activate_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p37_demo_revoke_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p37_demo_lifecycle_v1(text) to authenticated;
grant execute on function public.p37_demo_catalog_snapshot_v1(text) to authenticated;

comment on table public.p37_demo_catalog_events is
  'SYNTHETIC DEMO ONLY: append-only demonstration lifecycle; not scientific approval, source validation or a production catalog entry.';
comment on table public.p37_demo_scope is
  'SYNTHETIC DEMO ONLY: owner-provisioned (submission, term) pairs eligible for the demonstration lifecycle; no application write path.';
