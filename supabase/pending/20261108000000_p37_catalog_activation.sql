-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
-- Requires the installed P36 dynamic handoff/authorization, global review and
-- global triage migrations.
--
-- P37 governed catalog lifecycle for entirely new biomarkers:
--   ACCEPT_FOR_REVIEW (triage, existing) -> independently provisioned source
--   validation receipt (p36_dynamic_source_validation, existing, never written
--   here) -> APPROVE (scientific approver grant; derives the catalog proposal
--   server-side from the receipt and submitted labels) -> ACTIVATE (separate
--   catalog activator grant, different identity, exact proposal digest, no
--   conflicting active definition) -> REVOKE.
--   * Append-only, immutable, idempotent. Never writes submissions, terms,
--     triage, the P36 authorization ledger or p36_metric_unit_catalog.
--   * Devices receive activated entries only as server-signed snapshots.

create table public.p37_scientific_approvers (
  user_id uuid primary key,
  authorization_ref text not null check (char_length(authorization_ref) between 8 and 200),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);
create table public.p37_catalog_activators (
  user_id uuid primary key,
  authorization_ref text not null check (char_length(authorization_ref) between 8 and 200),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);
create table public.p37_catalog_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  event_type text not null check (event_type in ('APPROVE','ACTIVATE','REVOKE')),
  canonical_id text not null check (canonical_id ~ '^ext:[a-z0-9][a-z0-9-]{2,62}$'),
  mission_id text references public.missions(id),
  provenance text check (provenance in ('synthetic','real')),
  submission_id uuid references public.p36_dynamic_handoff_submissions(submission_id),
  term_id text check (term_id is null or term_id ~ '^ubt-[0-9a-f]{8}$'),
  entry jsonb,
  entry_sha256 text check (entry_sha256 is null or entry_sha256 ~ '^[0-9a-f]{64}$'),
  validation_reference text,
  approval_event_id uuid references public.p37_catalog_events(id),
  activation_event_id uuid references public.p37_catalog_events(id),
  reason text check (reason is null or char_length(reason) between 8 and 2000),
  actor_user_id uuid not null,
  idempotency_key uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  check ((event_type = 'APPROVE' and entry is not null and entry_sha256 is not null and mission_id is not null and provenance is not null
          and submission_id is not null and term_id is not null and validation_reference is not null and approval_event_id is null and activation_event_id is null)
      or (event_type = 'ACTIVATE' and approval_event_id is not null and entry_sha256 is not null and activation_event_id is null and entry is null)
      or (event_type = 'REVOKE' and activation_event_id is not null and approval_event_id is null and entry is null and reason is not null))
);
create unique index p37_catalog_one_approval_per_term on public.p37_catalog_events (submission_id, term_id) where event_type = 'APPROVE';
create unique index p37_catalog_one_activation_per_approval on public.p37_catalog_events (approval_event_id) where event_type = 'ACTIVATE';
create unique index p37_catalog_one_revocation_per_activation on public.p37_catalog_events (activation_event_id) where event_type = 'REVOKE';

revoke all on public.p37_scientific_approvers, public.p37_catalog_activators, public.p37_catalog_events from public, anon, authenticated, service_role;
grant select on public.p37_scientific_approvers, public.p37_catalog_activators, public.p37_catalog_events to service_role;
alter table public.p37_scientific_approvers enable row level security;
alter table public.p37_catalog_activators enable row level security;
alter table public.p37_catalog_events enable row level security;
-- No direct application policies on any P37 table.

do $acl$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    revoke insert, update, delete, truncate on public.p37_scientific_approvers, public.p37_catalog_activators,
      public.p37_catalog_events from sandbox_exec;
  end if;
end $acl$;

create trigger p37_catalog_events_immutable before update or delete on public.p37_catalog_events
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p37_catalog_events_no_truncate before truncate on public.p37_catalog_events
  for each statement execute function public.p36_global_review_reject_mutation();
create trigger p37_scientific_approvers_no_delete before delete on public.p37_scientific_approvers
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p37_scientific_approvers_no_truncate before truncate on public.p37_scientific_approvers
  for each statement execute function public.p36_global_review_reject_mutation();
create trigger p37_catalog_activators_no_delete before delete on public.p37_catalog_activators
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p37_catalog_activators_no_truncate before truncate on public.p37_catalog_activators
  for each statement execute function public.p36_global_review_reject_mutation();

create function public.p37_catalog_record_grant() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.p36_global_review_audit(actor_id, action, details)
  values (auth.uid(), 'reviewer_change', jsonb_build_object('grant', tg_argv[0], 'op', tg_op,
    'user_id', new.user_id, 'authorization_ref', new.authorization_ref, 'revoked', new.revoked_at is not null));
  return new;
end $$;
create trigger p37_scientific_approvers_audit after insert or update on public.p37_scientific_approvers
  for each row execute function public.p37_catalog_record_grant('scientific_approval');
create trigger p37_catalog_activators_audit after insert or update on public.p37_catalog_activators
  for each row execute function public.p37_catalog_record_grant('catalog_activation');

-- Matching keys of one definition: normalized label | exact unit | specimen | method.
create function public.p37_catalog_keys(p_entry jsonb) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct lower(regexp_replace(btrim(l), '\s+', ' ', 'g')) || '|' || btrim(p_entry->>'unit') || '|'
    || lower(regexp_replace(btrim(p_entry->>'specimen'), '\s+', ' ', 'g')) || '|' || lower(regexp_replace(btrim(p_entry->>'method'), '\s+', ' ', 'g'))), '{}'::text[])
  from (select p_entry->>'canonicalName' as l union all select jsonb_array_elements_text(p_entry->'aliases')) s
$$;

create function public.p37_catalog_approve_v1(
  p_mission_id text, p_provenance text, p_submission_id uuid, p_term_id text, p_validation_reference text,
  p_canonical_name text, p_domain text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_basis text; v_sha text; v_sub record; v_meta jsonb; v_triage text; v_val record; v_n integer;
  v_aliases jsonb; v_entry jsonb; v_existing public.p37_catalog_events; v_row public.p37_catalog_events;
  v_name text := btrim(coalesce(p_canonical_name, ''));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null or p_submission_id is null or p_term_id is null or p_idempotency_key is null or p_validation_reference is null then
    raise exception 'missing arguments' using errcode = '22023'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then raise exception 'invalid provenance' using errcode = '22023'; end if;
  perform 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null for share;
  if not found then raise exception 'scientific approval authorization required' using errcode = '42501'; end if;
  perform 1 from public.p36_mission_scientific_sharing s where s.mission_id = p_mission_id for share;
  v_basis := public.p36_global_review_basis(p_mission_id, p_provenance);
  if v_basis is null then raise exception 'scope denied' using errcode = '42501'; end if;

  v_sha := encode(sha256(convert_to(concat_ws('|', 'APPROVE', p_mission_id, p_provenance, p_submission_id::text, p_term_id,
    p_validation_reference, v_name, coalesce(p_domain, ''), v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p37_catalog_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then
      return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id, 'entry_sha256', v_existing.entry_sha256); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;

  select h.submission_id, h.crew_member_id, h.submitted_by into v_sub from public.p36_dynamic_handoff_submissions h
    where h.submission_id = p_submission_id and h.mission_id = p_mission_id and h.provenance = p_provenance;
  if not found then return jsonb_build_object('status', 'rejected', 'detail', 'submission not found in this mission and provenance'); end if;
  if v_sub.submitted_by = v_uid then return jsonb_build_object('status', 'rejected', 'detail', 'the submitter cannot approve their own request'); end if;
  select t.metadata into v_meta from public.p36_dynamic_handoff_terms t where t.submission_id = p_submission_id and t.term_id = p_term_id;
  if not found then return jsonb_build_object('status', 'rejected', 'detail', 'submitted term not found'); end if;

  select e.action into v_triage from public.p36_global_triage_events e
    where e.submission_id = p_submission_id and e.term_id = p_term_id
      and not exists (select 1 from public.p36_global_triage_events n where n.previous_event_id = e.id);
  if v_triage is distinct from 'ACCEPT_FOR_REVIEW' then
    return jsonb_build_object('status', 'rejected', 'detail', 'the term must be accepted for scientific review first'); end if;

  select count(*) into v_n from public.p36_dynamic_source_validation v
    where v.mission_id = p_mission_id and v.crew_member_id = v_sub.crew_member_id and v.provenance = p_provenance
      and v.term_id = p_term_id and v.validation_reference = p_validation_reference;
  if v_n <> 1 then return jsonb_build_object('status', 'rejected', 'detail', 'exactly one independently provisioned source-validation receipt is required'); end if;
  select * into v_val from public.p36_dynamic_source_validation v
    where v.mission_id = p_mission_id and v.crew_member_id = v_sub.crew_member_id and v.provenance = p_provenance
      and v.term_id = p_term_id and v.validation_reference = p_validation_reference;
  if v_val.verified_by = v_uid::text then return jsonb_build_object('status', 'rejected', 'detail', 'source validation and scientific approval must be independent'); end if;
  if v_val.canonical_metric_id !~ '^ext:[a-z0-9][a-z0-9-]{2,62}$' then
    return jsonb_build_object('status', 'rejected', 'detail', 'validated canonical ID must be a new ext: identifier'); end if;
  if exists (select 1 from public.p36_metric_unit_catalog c where c.metric_id = v_val.canonical_metric_id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'canonical ID collides with the base catalog'); end if;
  if btrim(v_val.exact_unit) is distinct from btrim(v_meta->>'exactUnit') then
    return jsonb_build_object('status', 'rejected', 'detail', 'validated unit differs from the submitted unit; no conversion is permitted'); end if;
  if btrim(v_val.specimen) = '' or btrim(v_val.method) = '' or btrim(v_val.protocol) = '' then
    return jsonb_build_object('status', 'rejected', 'detail', 'validated specimen, method and protocol are required'); end if;
  if char_length(v_name) not between 3 and 120 then return jsonb_build_object('status', 'rejected', 'detail', 'canonical name must be 3 to 120 characters'); end if;
  if p_domain is null or p_domain not in ('bone','immune','cardiovascular','behavioral') then
    return jsonb_build_object('status', 'rejected', 'detail', 'unknown scientific domain'); end if;
  select jsonb_agg(l order by l) into v_aliases from (select distinct btrim(x) as l from jsonb_array_elements_text(v_meta->'originalLabels') x where btrim(x) <> '') s;
  if v_aliases is null then return jsonb_build_object('status', 'rejected', 'detail', 'the submitted term has no observed label'); end if;

  v_entry := jsonb_build_object('canonicalId', v_val.canonical_metric_id, 'canonicalName', v_name, 'aliases', v_aliases,
    'unit', btrim(v_val.exact_unit), 'specimen', btrim(v_val.specimen), 'method', btrim(v_val.method), 'protocol', btrim(v_val.protocol),
    'protocolVersion', btrim(v_val.protocol_version), 'domain', p_domain, 'provenance', p_provenance,
    'evidenceRefs', jsonb_build_array(v_val.validation_reference, 'sha256:' || v_val.source_sha256));
  insert into public.p37_catalog_events(event_type, canonical_id, mission_id, provenance, submission_id, term_id, entry, entry_sha256,
    validation_reference, actor_user_id, idempotency_key, request_sha256)
  values ('APPROVE', v_val.canonical_metric_id, p_mission_id, p_provenance, p_submission_id, p_term_id, v_entry,
    encode(sha256(convert_to(v_entry::text, 'UTF8')), 'hex'), p_validation_reference, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'entry_sha256', v_row.entry_sha256, 'recorded_at', v_row.recorded_at);
exception when unique_violation then
  return jsonb_build_object('status', 'rejected', 'detail', 'this submitted term already has a scientific approval');
end $$;

create function public.p37_catalog_activate_v1(p_approval_event_id uuid, p_expected_entry_sha256 text, p_idempotency_key uuid)
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

create function public.p37_catalog_revoke_v1(p_activation_event_id uuid, p_reason text, p_idempotency_key uuid)
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

-- Activated definitions only (no observations, no identities); any active mission member or P37/P36 grant holder may read.
create function public.p37_catalog_snapshot_v1() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_entries jsonb; v_version bigint;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (exists (select 1 from public.mission_memberships m where m.user_id = v_uid and m.active)
      or exists (select 1 from public.p36_global_scientific_reviewers r where r.user_id = v_uid and r.revoked_at is null)
      or exists (select 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null)
      or exists (select 1 from public.p37_catalog_activators a where a.user_id = v_uid and a.revoked_at is null)) then
    raise exception 'scope denied' using errcode = '42501'; end if;
  select coalesce(max(seq), 0) into v_version from public.p37_catalog_events where event_type in ('ACTIVATE','REVOKE');
  select coalesce(jsonb_agg(ap.entry || jsonb_build_object(
      'status', case when rv.id is null then 'ACTIVE' else 'REVOKED' end,
      'approval', jsonb_build_object('approvalEventId', ap.id, 'approvedAt', ap.recorded_at, 'proposalSha256', ap.entry_sha256),
      'activation', jsonb_build_object('activationEventId', act.id, 'activatedAt', act.recorded_at, 'catalogVersion', act.seq),
      'revocation', case when rv.id is null then null else jsonb_build_object('revocationEventId', rv.id, 'revokedAt', rv.recorded_at, 'reason', rv.reason, 'catalogVersion', rv.seq) end
    ) order by ap.canonical_id, act.seq), '[]'::jsonb)
  into v_entries
  from public.p37_catalog_events act
  join public.p37_catalog_events ap on ap.id = act.approval_event_id
  left join public.p37_catalog_events rv on rv.event_type = 'REVOKE' and rv.activation_event_id = act.id
  where act.event_type = 'ACTIVATE';
  return jsonb_build_object('catalog_version', v_version, 'entries', v_entries);
end $$;

-- Lifecycle for one authorized mission: approvals/activations/revocations, receipt metadata and caller capabilities.
create function public.p37_catalog_lifecycle_v1(p_mission_id text, p_provenance text) returns jsonb
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

revoke all on function public.p37_catalog_record_grant(), public.p37_catalog_keys(jsonb),
  public.p37_catalog_approve_v1(text, text, uuid, text, text, text, text, uuid),
  public.p37_catalog_activate_v1(uuid, text, uuid), public.p37_catalog_revoke_v1(uuid, text, uuid),
  public.p37_catalog_snapshot_v1(), public.p37_catalog_lifecycle_v1(text, text) from public, anon, authenticated, service_role;
grant execute on function public.p37_catalog_approve_v1(text, text, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.p37_catalog_activate_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p37_catalog_revoke_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p37_catalog_snapshot_v1() to authenticated;
grant execute on function public.p37_catalog_lifecycle_v1(text, text) to authenticated;
