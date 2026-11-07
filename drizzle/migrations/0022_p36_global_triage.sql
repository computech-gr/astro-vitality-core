-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
-- Requires 20261107030000_p36_global_scientific_review.sql (installed).
--
-- P36 Global Scientific Triage: records Accept for Scientific Review, Request
-- More Evidence and Reject Review Request on submitted unknown-biomarker
-- metadata.
--   * Triage is NOT scientific approval. It never writes the scientific
--     authorization ledger, the handoff tables or any catalog.
--   * Writing requires an explicit SQL-provisioned triage grant, separate from
--     global read permission, AND an active read basis for the exact mission
--     and provenance (mission Researcher or shared-mission global reviewer).
--   * History is append-only and chained per submitted term; concurrent
--     writers must name the event they are superseding (optimistic
--     concurrency), and every request carries a caller idempotency key.
--   * Rejection and evidence requests require a documented reason.

create table public.p36_global_triage_writers (
  user_id uuid primary key,
  authorization_ref text not null check (char_length(authorization_ref) between 8 and 200),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);
revoke all on public.p36_global_triage_writers from public, anon, authenticated, service_role;
grant select on public.p36_global_triage_writers to service_role;
alter table public.p36_global_triage_writers enable row level security;

create table public.p36_global_triage_events (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null references public.missions(id),
  provenance text not null check (provenance in ('synthetic','real')),
  submission_id uuid not null references public.p36_dynamic_handoff_submissions(submission_id),
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  action text not null check (action in ('ACCEPT_FOR_REVIEW','REQUEST_MORE_EVIDENCE','REJECT_REVIEW_REQUEST')),
  reason text check (reason is null or char_length(reason) between 8 and 2000),
  evidence_requirements text[] not null default '{}'::text[]
    check (evidence_requirements <@ array['identity','unit','method','specimen','protocol','source_validation','other']::text[]),
  previous_event_id uuid references public.p36_global_triage_events(id),
  idempotency_key uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null,
  access_basis text not null check (access_basis in ('mission_researcher','global_scientific_review')),
  recorded_at timestamptz not null default clock_timestamp(),
  check (action = 'ACCEPT_FOR_REVIEW' or reason is not null),
  check (action <> 'REQUEST_MORE_EVIDENCE' or cardinality(evidence_requirements) > 0),
  check (action = 'REQUEST_MORE_EVIDENCE' or cardinality(evidence_requirements) = 0)
);
-- One successor per event and one first event per submitted term.
create unique index p36_global_triage_one_successor on public.p36_global_triage_events (previous_event_id)
  where previous_event_id is not null;
create unique index p36_global_triage_one_genesis on public.p36_global_triage_events (submission_id, term_id)
  where previous_event_id is null;
create index p36_global_triage_mission on public.p36_global_triage_events (mission_id, provenance, recorded_at);
revoke all on public.p36_global_triage_events from public, anon, authenticated, service_role;
grant select on public.p36_global_triage_events to service_role;
alter table public.p36_global_triage_events enable row level security;
-- No direct application policies on either table.

do $acl$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    revoke insert, update, delete, truncate on public.p36_global_triage_writers,
      public.p36_global_triage_events from sandbox_exec;
  end if;
end $acl$;

create trigger p36_global_triage_events_immutable before update or delete on public.p36_global_triage_events
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p36_global_triage_events_no_truncate before truncate on public.p36_global_triage_events
  for each statement execute function public.p36_global_review_reject_mutation();
-- Triage grants are revoked by setting revoked_at, never by deleting the row.
create trigger p36_global_triage_writers_no_delete before delete on public.p36_global_triage_writers
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p36_global_triage_writers_no_truncate before truncate on public.p36_global_triage_writers
  for each statement execute function public.p36_global_review_reject_mutation();

create function public.p36_global_triage_record_grant() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.p36_global_review_audit(actor_id, action, details)
  values (auth.uid(), 'reviewer_change', jsonb_build_object('grant', 'triage_write', 'op', tg_op,
    'user_id', new.user_id, 'authorization_ref', new.authorization_ref, 'revoked', new.revoked_at is not null));
  return new;
end $$;
create trigger p36_global_triage_writers_audit after insert or update on public.p36_global_triage_writers
  for each row execute function public.p36_global_triage_record_grant();

create function public.p36_global_triage_append_v1(
  p_mission_id text, p_provenance text, p_submission_id uuid, p_term_id text, p_action text,
  p_reason text, p_evidence_requirements text[], p_expected_previous_event_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_basis text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_reqs text[] := coalesce((select array_agg(distinct r order by r) from unnest(coalesce(p_evidence_requirements, '{}'::text[])) r), '{}'::text[]);
  v_sha text;
  v_existing public.p36_global_triage_events;
  v_latest public.p36_global_triage_events;
  v_row public.p36_global_triage_events;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null or p_submission_id is null or p_term_id is null or p_idempotency_key is null then
    raise exception 'missing arguments' using errcode = '22023'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then
    raise exception 'invalid provenance' using errcode = '22023'; end if;
  if p_action is null or p_action not in ('ACCEPT_FOR_REVIEW','REQUEST_MORE_EVIDENCE','REJECT_REVIEW_REQUEST') then
    raise exception 'invalid triage action' using errcode = '22023'; end if;

  -- Explicit write grant (locked against concurrent revocation), then read scope.
  perform 1 from public.p36_global_triage_writers w where w.user_id = v_uid and w.revoked_at is null for share;
  if not found then raise exception 'triage authorization required' using errcode = '42501'; end if;
  perform 1 from public.p36_mission_scientific_sharing s where s.mission_id = p_mission_id for share;
  v_basis := public.p36_global_review_basis(p_mission_id, p_provenance);
  if v_basis is null then raise exception 'scope denied' using errcode = '42501'; end if;

  v_sha := encode(sha256(convert_to(concat_ws('|', p_mission_id, p_provenance, p_submission_id::text, p_term_id, p_action,
    coalesce(v_reason, ''), array_to_string(v_reqs, ','), coalesce(p_expected_previous_event_id::text, 'GENESIS'), v_uid::text), 'UTF8')), 'hex');

  select * into v_existing from public.p36_global_triage_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then
      return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id, 'action', v_existing.action, 'recorded_at', v_existing.recorded_at);
    end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;

  if not exists (select 1 from public.p36_dynamic_handoff_submissions h
      join public.p36_dynamic_handoff_terms t on t.submission_id = h.submission_id
      where h.submission_id = p_submission_id and h.mission_id = p_mission_id and h.provenance = p_provenance and t.term_id = p_term_id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'submitted term not found in this mission and provenance');
  end if;

  if p_action <> 'ACCEPT_FOR_REVIEW' and v_reason is null then
    return jsonb_build_object('status', 'rejected', 'detail', 'a documented reason is required'); end if;
  if v_reason is not null and char_length(v_reason) not between 8 and 2000 then
    return jsonb_build_object('status', 'rejected', 'detail', 'reason must be 8 to 2000 characters'); end if;
  if not (v_reqs <@ array['identity','unit','method','specimen','protocol','source_validation','other']::text[]) then
    return jsonb_build_object('status', 'rejected', 'detail', 'unknown evidence requirement'); end if;
  if p_action = 'REQUEST_MORE_EVIDENCE' and cardinality(v_reqs) = 0 then
    return jsonb_build_object('status', 'rejected', 'detail', 'name at least one missing evidence requirement'); end if;
  if p_action <> 'REQUEST_MORE_EVIDENCE' and cardinality(v_reqs) > 0 then
    return jsonb_build_object('status', 'rejected', 'detail', 'evidence requirements apply only to evidence requests'); end if;

  -- Serialize writers per submitted term, then check the caller saw the latest event.
  perform pg_advisory_xact_lock(hashtextextended('p36-global-triage:' || p_submission_id::text || ':' || p_term_id, 0));
  select * into v_latest from public.p36_global_triage_events e
    where e.submission_id = p_submission_id and e.term_id = p_term_id
      and not exists (select 1 from public.p36_global_triage_events n where n.previous_event_id = e.id);
  if (v_latest.id) is distinct from p_expected_previous_event_id then
    return jsonb_build_object('status', 'stale', 'detail', 'another triage decision was recorded first', 'latest_event_id', v_latest.id);
  end if;
  if v_latest.action = 'REJECT_REVIEW_REQUEST' then
    return jsonb_build_object('status', 'rejected', 'detail', 'review request already rejected; a new submission is required'); end if;
  if v_latest.action = 'ACCEPT_FOR_REVIEW' and p_action = 'ACCEPT_FOR_REVIEW' then
    return jsonb_build_object('status', 'rejected', 'detail', 'already accepted for scientific review'); end if;

  insert into public.p36_global_triage_events(mission_id, provenance, submission_id, term_id, action, reason, evidence_requirements,
    previous_event_id, idempotency_key, request_sha256, actor_user_id, access_basis)
  values (p_mission_id, p_provenance, p_submission_id, p_term_id, p_action, v_reason, v_reqs,
    p_expected_previous_event_id, p_idempotency_key, v_sha, v_uid, v_basis)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'action', v_row.action, 'recorded_at', v_row.recorded_at);
end $$;

-- Triage history for one authorized mission plus the caller's write capability.
create function public.p36_global_triage_list_v1(p_mission_id text, p_provenance text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_basis text; v_rows jsonb; v_n integer; v_can boolean;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then
    raise exception 'invalid provenance' using errcode = '22023'; end if;
  v_basis := public.p36_global_review_basis(p_mission_id, p_provenance);
  if v_basis is null then raise exception 'scope denied' using errcode = '42501'; end if;
  v_can := exists (select 1 from public.p36_global_triage_writers w where w.user_id = auth.uid() and w.revoked_at is null);
  select coalesce(jsonb_agg(jsonb_build_object(
      'event_id', e.id, 'submission_id', e.submission_id, 'term_id', e.term_id, 'action', e.action,
      'reason', e.reason, 'evidence_requirements', to_jsonb(e.evidence_requirements),
      'previous_event_id', e.previous_event_id, 'recorded_at', e.recorded_at,
      'recorded_by_caller', e.actor_user_id = auth.uid(), 'access_basis', e.access_basis
    ) order by e.recorded_at, e.id), '[]'::jsonb), count(*)
  into v_rows, v_n
  from public.p36_global_triage_events e where e.mission_id = p_mission_id and e.provenance = p_provenance;
  insert into public.p36_global_review_audit(actor_id, action, mission_id, provenance, access_basis, row_count, details)
  values (auth.uid(), 'list_submissions', p_mission_id, p_provenance, v_basis, v_n, jsonb_build_object('view', 'triage_history'));
  return jsonb_build_object('can_triage', v_can, 'events', v_rows);
end $$;

revoke all on function public.p36_global_triage_record_grant(),
  public.p36_global_triage_append_v1(text, text, uuid, text, text, text, text[], uuid, uuid),
  public.p36_global_triage_list_v1(text, text) from public, anon, authenticated, service_role;
grant execute on function public.p36_global_triage_append_v1(text, text, uuid, text, text, text, text[], uuid, uuid) to authenticated;
grant execute on function public.p36_global_triage_list_v1(text, text) to authenticated;
