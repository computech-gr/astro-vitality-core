-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
--
-- P36 Global Scientific Review: read-only, metadata-only, auditable access to
-- submitted dynamic handoff terms across missions.
--   * Global capability is an explicit SQL-provisioned row (never inferred from
--     mission membership, never granted by an application endpoint).
--   * A mission is reachable through the global capability only while its own
--     sharing policy row lists the requested provenance; missions without a
--     policy row (including all future missions) are excluded by default.
--   * Mission-wide Researcher members keep access to their own missions.
--   * Output is a fixed whitelist: no payload_canonical, submitter user ID,
--     crew member ID or display name. Crew appear as keyed pseudonyms derived
--     from the existing per-mission research salt.
--   * Every read appends an immutable audit row. Decisions remain on the
--     existing mission-scoped authorization path; nothing here writes catalogs.

create table public.p36_global_scientific_reviewers (
  user_id uuid primary key,
  authorization_ref text not null check (char_length(authorization_ref) between 8 and 200),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);
revoke all on public.p36_global_scientific_reviewers from public, anon, authenticated, service_role;
grant select on public.p36_global_scientific_reviewers to service_role;
alter table public.p36_global_scientific_reviewers enable row level security;

create table public.p36_mission_scientific_sharing (
  mission_id text primary key references public.missions(id),
  permitted_provenance text[] not null
    check (permitted_provenance <@ array['synthetic','real']::text[]),
  policy_ref text not null check (char_length(policy_ref) between 8 and 200),
  changed_at timestamptz not null default now()
);
revoke all on public.p36_mission_scientific_sharing from public, anon, authenticated, service_role;
grant select on public.p36_mission_scientific_sharing to service_role;
alter table public.p36_mission_scientific_sharing enable row level security;

create table public.p36_global_review_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  action text not null check (action in ('list_missions','list_submissions','reviewer_change','sharing_change')),
  mission_id text,
  provenance text,
  access_basis text,
  row_count integer not null default 0,
  details jsonb not null default '{}'::jsonb
);
revoke all on public.p36_global_review_audit from public, anon, authenticated, service_role;
grant select on public.p36_global_review_audit to service_role;
alter table public.p36_global_review_audit enable row level security;
-- No direct application policies on any of the three tables.

-- Platform executor: preserve read access, deny writes (object-local).
do $acl$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    revoke insert, update, delete, truncate on public.p36_global_scientific_reviewers,
      public.p36_mission_scientific_sharing, public.p36_global_review_audit from sandbox_exec;
  end if;
end $acl$;

create function public.p36_global_review_reject_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'P36 global review history is append-only' using errcode = '42501'; end $$;
create trigger p36_global_review_audit_immutable before update or delete on public.p36_global_review_audit
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p36_global_review_audit_no_truncate before truncate on public.p36_global_review_audit
  for each statement execute function public.p36_global_review_reject_mutation();
-- Grants are revoked by setting revoked_at, never by deleting the row.
create trigger p36_global_reviewers_no_delete before delete on public.p36_global_scientific_reviewers
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p36_global_reviewers_no_truncate before truncate on public.p36_global_scientific_reviewers
  for each statement execute function public.p36_global_review_reject_mutation();
create trigger p36_mission_sharing_no_delete before delete on public.p36_mission_scientific_sharing
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p36_mission_sharing_no_truncate before truncate on public.p36_mission_scientific_sharing
  for each statement execute function public.p36_global_review_reject_mutation();

create function public.p36_global_review_record_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'p36_global_scientific_reviewers' then
    insert into public.p36_global_review_audit(actor_id, action, details)
    values (auth.uid(), 'reviewer_change', jsonb_build_object('op', tg_op, 'user_id', new.user_id,
      'authorization_ref', new.authorization_ref, 'revoked', new.revoked_at is not null));
  else
    insert into public.p36_global_review_audit(actor_id, action, mission_id, details)
    values (auth.uid(), 'sharing_change', new.mission_id, jsonb_build_object('op', tg_op,
      'permitted_provenance', to_jsonb(new.permitted_provenance), 'policy_ref', new.policy_ref));
  end if;
  return new;
end $$;
create trigger p36_global_reviewers_audit after insert or update on public.p36_global_scientific_reviewers
  for each row execute function public.p36_global_review_record_change();
create trigger p36_mission_sharing_audit after insert or update on public.p36_mission_scientific_sharing
  for each row execute function public.p36_global_review_record_change();

-- Access basis for one mission/provenance, or null when denied.
create function public.p36_global_review_basis(p_mission text, p_provenance text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when exists (select 1 from public.mission_memberships m
      where m.mission_id = p_mission and m.user_id = auth.uid() and m.active
        and m.role = 'researcher' and m.crew_member_id is null) then 'mission_researcher'
    when exists (select 1 from public.p36_global_scientific_reviewers r
      where r.user_id = auth.uid() and r.revoked_at is null)
      and exists (select 1 from public.p36_mission_scientific_sharing s
      where s.mission_id = p_mission and p_provenance = any(s.permitted_provenance)) then 'global_scientific_review'
  end $$;

create function public.p36_global_review_missions_v1(p_provenance text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_rows jsonb; v_n integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then
    raise exception 'invalid provenance' using errcode = '22023'; end if;
  with scoped as (
    select mi.id, mi.code, mi.name, public.p36_global_review_basis(mi.id, p_provenance) as basis
    from public.missions mi
  ), term_rows as (
    select h.mission_id, h.submission_id, t.term_id,
      not exists (select 1 from public.p36_dynamic_authorization_events e
        where e.authority_mission_id = h.mission_id and e.crew_member_id = h.crew_member_id
          and e.provenance = h.provenance and e.term_id = t.term_id
          and e.kind = 'decision' and e.action in ('APPROVE','REJECT')) as pending
    from public.p36_dynamic_handoff_submissions h
    join public.p36_dynamic_handoff_terms t on t.submission_id = h.submission_id
    where h.provenance = p_provenance
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'mission_id', s.id, 'mission_code', s.code, 'mission_name', s.name, 'access_basis', s.basis,
      'submission_count', (select count(distinct r.submission_id) from term_rows r where r.mission_id = s.id),
      'term_count', (select count(*) from term_rows r where r.mission_id = s.id),
      'pending_term_count', (select count(*) from term_rows r where r.mission_id = s.id and r.pending)
    ) order by s.code, s.id), '[]'::jsonb), count(*)
  into v_rows, v_n from scoped s where s.basis is not null;
  insert into public.p36_global_review_audit(actor_id, action, provenance, row_count)
  values (auth.uid(), 'list_missions', p_provenance, v_n);
  return v_rows;
end $$;

create function public.p36_global_review_list_v1(p_mission_id text, p_provenance text, p_after_seq bigint, p_limit integer)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_basis text; v_salt bytea; v_rows jsonb; v_n integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then
    raise exception 'invalid provenance' using errcode = '22023'; end if;
  v_basis := public.p36_global_review_basis(p_mission_id, p_provenance);
  if v_basis is null then raise exception 'scope denied' using errcode = '42501'; end if;
  select k.pseudonym_salt into v_salt from public.mission_research_keys k where k.mission_id = p_mission_id;
  if v_salt is null then raise exception 'scope unavailable' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'submission_id', h.submission_id, 'mission_id', h.mission_id, 'mission_code', m.code, 'mission_name', m.name,
      'crew_pseudonym', 'crew-p-' || left(encode(sha256(v_salt || convert_to('p36-global-review:' || h.crew_member_id, 'UTF8')), 'hex'), 16),
      'provenance', h.provenance, 'request_id', h.request_id, 'submitted_role', h.submitted_role,
      'received_at', h.received_at, 'received_seq', h.received_seq, 'payload_sha256', h.payload_sha256,
      'access_basis', v_basis,
      'terms', (select coalesce(jsonb_agg(jsonb_build_object(
          'termId', t.term_id,
          'originalLabels', t.metadata -> 'originalLabels', 'exactUnit', t.metadata -> 'exactUnit',
          'classification', t.metadata -> 'classification', 'candidateMetricIds', t.metadata -> 'candidateMetricIds',
          'sourceDocumentSha256', t.metadata -> 'sourceDocumentSha256', 'evidencePointers', t.metadata -> 'evidencePointers',
          'method', t.metadata -> 'method', 'specimen', t.metadata -> 'specimen',
          'decision', (select e.action from public.p36_dynamic_authorization_events e
            where e.authority_mission_id = h.mission_id and e.crew_member_id = h.crew_member_id
              and e.provenance = h.provenance and e.term_id = t.term_id and e.kind = 'decision'
            order by e.received_seq desc limit 1)
        ) order by t.term_id), '[]'::jsonb)
        from public.p36_dynamic_handoff_terms t where t.submission_id = h.submission_id)
    ) order by h.received_seq), '[]'::jsonb), count(*)
  into v_rows, v_n
  from (select * from public.p36_dynamic_handoff_submissions x
        where x.mission_id = p_mission_id and x.provenance = p_provenance
          and x.received_seq > coalesce(p_after_seq, 0)
        order by x.received_seq limit least(greatest(coalesce(p_limit, 25), 1), 25)) h
  join public.missions m on m.id = h.mission_id;
  insert into public.p36_global_review_audit(actor_id, action, mission_id, provenance, access_basis, row_count)
  values (auth.uid(), 'list_submissions', p_mission_id, p_provenance, v_basis, v_n);
  return v_rows;
end $$;

revoke all on function public.p36_global_review_reject_mutation(), public.p36_global_review_record_change(),
  public.p36_global_review_basis(text, text), public.p36_global_review_missions_v1(text),
  public.p36_global_review_list_v1(text, text, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.p36_global_review_missions_v1(text) to authenticated;
grant execute on function public.p36_global_review_list_v1(text, text, bigint, integer) to authenticated;
