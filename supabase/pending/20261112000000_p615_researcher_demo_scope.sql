-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
-- Requires the installed P36 dynamic handoff, global review and global triage,
-- P37 SYNTHETIC DEMO catalog (20261108020000) and P38 bulk (20261108030000).
--
-- P61.5 Researcher SYNTHETIC DEMO scope authorization and alias mappings.
--   * p615_demo_scope_authorize_v1: the existing Researcher capability (active
--     P37 scientific approver grant + P36 global review basis for the mission's
--     synthetic data) adds accepted-for-review synthetic terms with an exact,
--     unambiguous submitted unit to p37_demo_scope. Bounded batches (1 to 50),
--     idempotent per key, serialized per mission, append-only grant record
--     (actor, basis, mission, submission, term, unit, reference, time).
--     Existing scope rows are never updated or deleted; terms already in the
--     scope are reported "skipped" and never inserted again.
--   * p615_demo_alias_decide/activate/revoke_v1: a reviewed alias of a submitted
--     term to ONE existing ACTIVE demo entry with the identical exact unit.
--     Researcher decides (rationale + explicit acknowledgement, never the
--     submitter), Ground Medical activates (never the decider) and may revoke.
--     No text-similarity merging, no unit conversion, no observation rewrite.
--     A term with an alias decision can no longer receive an independent demo
--     decision (identity guard trigger), and vice versa.
--   * Alias events draw from the demo catalog sequence, so a signed demo
--     snapshot version always increases when an alias is activated or revoked.
--   * Synthetic provenance only. Never reads or writes p37_catalog_events,
--     p36_dynamic_source_validation, submissions, terms, triage, the P36
--     authorization ledger or p36_metric_unit_catalog. No table grants to
--     application roles; only the listed caller-scoped functions are callable.

create table public.p615_demo_scope_grants (
  id uuid primary key,
  mission_id text not null references public.missions(id),
  provenance text not null default 'synthetic' check (provenance = 'synthetic'),
  submission_id uuid not null,
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  exact_unit text not null check (char_length(exact_unit) between 1 and 64),
  authorization_ref text not null unique check (authorization_ref = 'researcher-authorization:' || id::text),
  actor_user_id uuid not null,
  access_basis text not null check (access_basis in ('mission_researcher','global_scientific_review')),
  idempotency_key uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (submission_id, term_id),
  foreign key (submission_id, term_id) references public.p37_demo_scope(submission_id, term_id)
);

create table public.p615_demo_alias_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint not null unique default nextval('public.p37_demo_catalog_events_seq_seq'::regclass),
  event_type text not null check (event_type in ('ALIAS_DECIDE','ALIAS_ACTIVATE','ALIAS_REVOKE')),
  alias_id text not null check (alias_id ~ '^alias:ubt-[0-9a-f]{8}$'),
  target_demo_id text not null check (target_demo_id ~ '^demo:ubt-[0-9a-f]{8}$'),
  mission_id text not null references public.missions(id),
  provenance text not null default 'synthetic' check (provenance = 'synthetic'),
  submission_id uuid not null references public.p36_dynamic_handoff_submissions(submission_id),
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  entry jsonb,
  entry_sha256 text check (entry_sha256 is null or entry_sha256 ~ '^[0-9a-f]{64}$'),
  target_decision_event_id uuid references public.p37_demo_catalog_events(id),
  decision_event_id uuid references public.p615_demo_alias_events(id),
  activation_event_id uuid references public.p615_demo_alias_events(id),
  reason text check (reason is null or char_length(reason) between 8 and 2000),
  actor_user_id uuid not null,
  idempotency_key uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  check ((event_type = 'ALIAS_DECIDE' and entry is not null and entry_sha256 is not null and target_decision_event_id is not null
          and decision_event_id is null and activation_event_id is null and reason is not null)
      or (event_type = 'ALIAS_ACTIVATE' and entry is null and entry_sha256 is not null and decision_event_id is not null
          and target_decision_event_id is null and activation_event_id is null and reason is null)
      or (event_type = 'ALIAS_REVOKE' and entry is null and activation_event_id is not null and decision_event_id is null
          and target_decision_event_id is null and reason is not null))
);
create unique index p615_alias_one_decision_per_term on public.p615_demo_alias_events (submission_id, term_id) where event_type = 'ALIAS_DECIDE';
create unique index p615_alias_one_activation_per_decision on public.p615_demo_alias_events (decision_event_id) where event_type = 'ALIAS_ACTIVATE';
create unique index p615_alias_one_revocation_per_activation on public.p615_demo_alias_events (activation_event_id) where event_type = 'ALIAS_REVOKE';

revoke all on public.p615_demo_scope_grants, public.p615_demo_alias_events from public, anon, authenticated, service_role;
grant select on public.p615_demo_scope_grants, public.p615_demo_alias_events to service_role;
alter table public.p615_demo_scope_grants enable row level security;
alter table public.p615_demo_alias_events enable row level security;
-- No direct application policies on either table.

do $acl$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    revoke insert, update, delete, truncate on public.p615_demo_scope_grants, public.p615_demo_alias_events from sandbox_exec;
  end if;
end $acl$;

create trigger p615_demo_scope_grants_immutable before update or delete on public.p615_demo_scope_grants
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p615_demo_scope_grants_no_truncate before truncate on public.p615_demo_scope_grants
  for each statement execute function public.p36_global_review_reject_mutation();
create trigger p615_demo_alias_events_immutable before update or delete on public.p615_demo_alias_events
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p615_demo_alias_events_no_truncate before truncate on public.p615_demo_alias_events
  for each statement execute function public.p36_global_review_reject_mutation();

-- Literal unit text that names alternatives or no unit at all (mirrors the browser preflight; never normalized).
create function public.p615_unit_problem(p_unit text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_unit is null or btrim(p_unit) = '' then 'no exact unit was submitted'
    when p_unit <> btrim(p_unit) then 'the submitted unit has surrounding whitespace'
    when p_unit ~* '\s(ή|or)\s' then 'the submitted unit names alternative units; units are never chosen or converted'
    when p_unit ~ '[,;|]' or p_unit ~ '\s/\s' then 'the submitted unit names alternative units'
    when p_unit ~* '(assay|model)-specific' then 'the submitted unit is not specified'
    when p_unit ~* '^[a-z]+s/[a-z]+s$' then 'the submitted unit names alternative units'
  end
$$;

-- Latest P36 triage action of one submitted term.
create function public.p615_latest_triage(p_submission_id uuid, p_term_id text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select e.action from public.p36_global_triage_events e
   where e.submission_id = p_submission_id and e.term_id = p_term_id
     and not exists (select 1 from public.p36_global_triage_events n where n.previous_event_id = e.id)
   limit 1
$$;

-- Matching keys (normalized label | exact unit) of ACTIVE demo entries and ACTIVE aliases of one mission.
create function public.p615_active_keys(p_mission_id text)
returns table(key text, owner_id text, kind text)
language sql stable security definer set search_path = public, pg_temp as $$
  select k, od.demo_id, 'entry'
    from public.p37_demo_catalog_events act
    join public.p37_demo_catalog_events od on od.id = act.decision_event_id
    cross join lateral unnest(public.p37_demo_keys(od.entry)) k
   where act.event_type = 'DEMO_ACTIVATE' and act.mission_id = p_mission_id
     and not exists (select 1 from public.p37_demo_catalog_events r where r.event_type = 'DEMO_REVOKE' and r.activation_event_id = act.id)
  union all
  select lower(regexp_replace(btrim(l), '\s+', ' ', 'g')) || '|' || btrim(ad.entry->>'unit'), ad.alias_id, 'alias'
    from public.p615_demo_alias_events aa
    join public.p615_demo_alias_events ad on ad.id = aa.decision_event_id
    cross join lateral jsonb_array_elements_text(ad.entry->'labels') l
   where aa.event_type = 'ALIAS_ACTIVATE' and aa.mission_id = p_mission_id
     and not exists (select 1 from public.p615_demo_alias_events r where r.event_type = 'ALIAS_REVOKE' and r.activation_event_id = aa.id)
$$;

-- One identity path per submitted term: no independent demo decision after an alias decision.
create function public.p615_demo_identity_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.event_type = 'DEMO_DECIDE' then
    perform pg_advisory_xact_lock(hashtextextended('p615-term:' || new.submission_id::text || ':' || new.term_id, 0));
    if exists (select 1 from public.p615_demo_alias_events a
        where a.event_type = 'ALIAS_DECIDE' and a.submission_id = new.submission_id and a.term_id = new.term_id) then
      raise exception 'this submitted term already has a synthetic demo alias decision' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
create trigger p615_demo_identity_guard before insert on public.p37_demo_catalog_events
  for each row execute function public.p615_demo_identity_guard();

create function public.p615_demo_scope_authorize_v1(p_mission_id text, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_basis text; v_item jsonb; v_out jsonb := '[]'::jsonb; v_r jsonb;
  v_sub uuid; v_term text; v_unit text; v_key uuid; v_sha text; v_h record; v_meta jsonb;
  v_found boolean; v_problem text; v_existing public.p615_demo_scope_grants; v_id uuid; v_ref text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  perform public.p38_demo_bulk_check_items(p_items, 'term');
  perform 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null for share;
  if not found then raise exception 'scientific approval authorization required' using errcode = '42501'; end if;
  perform 1 from public.p36_mission_scientific_sharing s where s.mission_id = p_mission_id for share;
  v_basis := public.p36_global_review_basis(p_mission_id, 'synthetic');
  if v_basis is null then raise exception 'scope denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.missions m where m.id = p_mission_id and m.status in ('planning','active')) then
    raise exception 'scope denied' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('p38-demo-bulk:' || p_mission_id, 0));
  for v_item in select x from jsonb_array_elements(p_items) x loop
    v_sub := (v_item->>'submission_id')::uuid;
    v_term := v_item->>'term_id';
    v_unit := v_item->>'exact_unit';
    v_key := (v_item->>'idempotency_key')::uuid;
    if v_sub is null or v_term is null or v_term !~ '^ubt-[0-9a-f]{8}$' or v_unit is null or char_length(v_unit) > 64 then
      raise exception 'invalid batch item' using errcode = '22023'; end if;
    v_sha := encode(sha256(convert_to(concat_ws('|', 'P615_SCOPE_AUTHORIZE', p_mission_id, v_sub::text, v_term, v_unit, v_uid::text), 'UTF8')), 'hex');
    select * into v_existing from public.p615_demo_scope_grants g where g.idempotency_key = v_key;
    if found then
      if v_existing.request_sha256 <> v_sha then
        raise exception 'idempotency key reused with different request' using errcode = '22023'; end if;
      v_r := jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id, 'authorization_ref', v_existing.authorization_ref);
    else
      select h.mission_id, h.provenance, h.submitted_by into v_h from public.p36_dynamic_handoff_submissions h where h.submission_id = v_sub;
      v_found := found;
      if not v_found or v_h.mission_id <> p_mission_id then
        v_r := jsonb_build_object('status', 'rejected', 'detail', 'synthetic submission not found in this mission');
      elsif v_h.provenance <> 'synthetic' then
        v_r := jsonb_build_object('status', 'rejected', 'detail', 'only synthetic submissions may enter the synthetic demo scope');
      elsif v_h.submitted_by = v_uid then
        v_r := jsonb_build_object('status', 'rejected', 'detail', 'the submitter cannot authorize their own request');
      else
        select t.metadata into v_meta from public.p36_dynamic_handoff_terms t where t.submission_id = v_sub and t.term_id = v_term;
        v_found := found;
        v_problem := public.p615_unit_problem(v_meta->>'exactUnit');
        if not v_found then
          v_r := jsonb_build_object('status', 'rejected', 'detail', 'this term does not belong to the selected submission');
        elsif exists (select 1 from public.p37_demo_scope d where d.submission_id = v_sub and d.term_id = v_term) then
          v_r := jsonb_build_object('status', 'skipped', 'detail', 'already in the synthetic demo scope');
        elsif public.p615_latest_triage(v_sub, v_term) is distinct from 'ACCEPT_FOR_REVIEW' then
          v_r := jsonb_build_object('status', 'rejected', 'detail', 'the term must be accepted for scientific review first');
        elsif v_problem is not null then
          v_r := jsonb_build_object('status', 'rejected', 'detail', v_problem);
        elsif (v_meta->>'exactUnit') is distinct from v_unit then
          v_r := jsonb_build_object('status', 'rejected', 'detail', 'the unit does not match the exact submitted unit');
        else
          v_id := gen_random_uuid();
          v_ref := 'researcher-authorization:' || v_id::text;
          insert into public.p37_demo_scope(submission_id, term_id, authorization_ref) values (v_sub, v_term, v_ref);
          insert into public.p615_demo_scope_grants(id, mission_id, submission_id, term_id, exact_unit, authorization_ref,
            actor_user_id, access_basis, idempotency_key, request_sha256)
          values (v_id, p_mission_id, v_sub, v_term, v_unit, v_ref, v_uid, v_basis, v_key, v_sha);
          v_r := jsonb_build_object('status', 'recorded', 'event_id', v_id, 'authorization_ref', v_ref);
        end if;
      end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('submission_id', v_sub, 'term_id', v_term) || v_r);
  end loop;
  return jsonb_build_object('mission_id', p_mission_id, 'results', v_out);
end $$;

create function public.p615_demo_alias_decide_v1(
  p_mission_id text, p_submission_id uuid, p_term_id text, p_target_demo_id text,
  p_rationale text, p_acknowledgement text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_basis text; v_sha text; v_sub record; v_meta jsonb; v_unit text;
  v_existing public.p615_demo_alias_events; v_row public.p615_demo_alias_events;
  v_target public.p37_demo_catalog_events; v_n integer; v_labels jsonb; v_entry jsonb; v_conflict text;
  v_reason text := btrim(coalesce(p_rationale, ''));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null or p_submission_id is null or p_term_id is null or p_target_demo_id is null or p_idempotency_key is null then
    raise exception 'missing arguments' using errcode = '22023'; end if;
  perform 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null for share;
  if not found then raise exception 'scientific approval authorization required' using errcode = '42501'; end if;
  perform 1 from public.p36_mission_scientific_sharing s where s.mission_id = p_mission_id for share;
  v_basis := public.p36_global_review_basis(p_mission_id, 'synthetic');
  if v_basis is null then raise exception 'scope denied' using errcode = '42501'; end if;

  v_sha := encode(sha256(convert_to(concat_ws('|', 'ALIAS_DECIDE', p_mission_id, p_submission_id::text, p_term_id,
    p_target_demo_id, v_reason, coalesce(p_acknowledgement, ''), v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p615_demo_alias_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then
      return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id, 'entry_sha256', v_existing.entry_sha256); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;

  if p_acknowledgement is distinct from 'SYNTHETIC DEMO ALIAS - SAME MEASUREMENT AND EXACT UNIT - NOT A SCIENTIFIC APPROVAL' then
    return jsonb_build_object('status', 'rejected', 'detail', 'the synthetic demo alias acknowledgement is required'); end if;
  if char_length(v_reason) not between 8 and 2000 then
    return jsonb_build_object('status', 'rejected', 'detail', 'a documented identity rationale (8 to 2000 characters) is required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('p38-demo-bulk:' || p_mission_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('p615-term:' || p_submission_id::text || ':' || p_term_id, 0));
  if not exists (select 1 from public.p37_demo_scope d where d.submission_id = p_submission_id and d.term_id = p_term_id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this term is not in the synthetic demo scope'); end if;
  select h.submitted_by into v_sub from public.p36_dynamic_handoff_submissions h
    where h.submission_id = p_submission_id and h.mission_id = p_mission_id and h.provenance = 'synthetic';
  if not found then return jsonb_build_object('status', 'rejected', 'detail', 'synthetic submission not found in this mission'); end if;
  if v_sub.submitted_by = v_uid then return jsonb_build_object('status', 'rejected', 'detail', 'the submitter cannot decide their own request'); end if;
  select t.metadata into v_meta from public.p36_dynamic_handoff_terms t where t.submission_id = p_submission_id and t.term_id = p_term_id;
  if not found then return jsonb_build_object('status', 'rejected', 'detail', 'submitted term not found'); end if;
  if public.p615_latest_triage(p_submission_id, p_term_id) is distinct from 'ACCEPT_FOR_REVIEW' then
    return jsonb_build_object('status', 'rejected', 'detail', 'the term must be accepted for scientific review first'); end if;
  if public.p615_unit_problem(v_meta->>'exactUnit') is not null then
    return jsonb_build_object('status', 'rejected', 'detail', public.p615_unit_problem(v_meta->>'exactUnit')); end if;
  v_unit := v_meta->>'exactUnit';
  if exists (select 1 from public.p37_demo_catalog_events e where e.event_type = 'DEMO_DECIDE'
      and e.submission_id = p_submission_id and e.term_id = p_term_id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this term already has an independent synthetic demo decision'); end if;
  select count(*) into v_n from public.p37_demo_catalog_events dc
    join public.p37_demo_catalog_events act on act.event_type = 'DEMO_ACTIVATE' and act.decision_event_id = dc.id
   where dc.event_type = 'DEMO_DECIDE' and dc.mission_id = p_mission_id and dc.demo_id = p_target_demo_id
     and not exists (select 1 from public.p37_demo_catalog_events r where r.event_type = 'DEMO_REVOKE' and r.activation_event_id = act.id);
  if v_n <> 1 then
    return jsonb_build_object('status', 'rejected', 'detail', 'the target must be exactly one active synthetic demo entry of this mission'); end if;
  select dc.* into v_target from public.p37_demo_catalog_events dc
    join public.p37_demo_catalog_events act on act.event_type = 'DEMO_ACTIVATE' and act.decision_event_id = dc.id
   where dc.event_type = 'DEMO_DECIDE' and dc.mission_id = p_mission_id and dc.demo_id = p_target_demo_id
     and not exists (select 1 from public.p37_demo_catalog_events r where r.event_type = 'DEMO_REVOKE' and r.activation_event_id = act.id);
  if (v_target.entry->>'unit') is distinct from v_unit then
    return jsonb_build_object('status', 'rejected', 'detail', 'the target unit differs from the exact submitted unit; units are never converted'); end if;
  select jsonb_agg(l order by l) into v_labels from (select distinct btrim(x) as l from jsonb_array_elements_text(v_meta->'originalLabels') x where btrim(x) <> '') s;
  if v_labels is null then return jsonb_build_object('status', 'rejected', 'detail', 'the submitted term has no observed label'); end if;
  select k.owner_id into v_conflict from public.p615_active_keys(p_mission_id) k
   where k.key in (select lower(regexp_replace(btrim(l), '\s+', ' ', 'g')) || '|' || v_unit from jsonb_array_elements_text(v_labels) l)
   limit 1;
  if v_conflict is not null then
    return jsonb_build_object('status', 'rejected', 'detail', 'this label and unit are already recognized by ' || v_conflict); end if;

  v_entry := jsonb_build_object('aliasId', 'alias:' || p_term_id, 'targetDemoId', p_target_demo_id,
    'targetDisplayName', v_target.entry->>'displayName', 'labels', v_labels, 'unit', v_unit,
    'domain', v_target.entry->>'domain', 'provenance', 'synthetic', 'missionId', p_mission_id,
    'submissionId', p_submission_id, 'termId', p_term_id,
    'classification', 'SYNTHETIC_DEMO_ALIAS_NOT_SCIENTIFICALLY_VALIDATED', 'rationale', v_reason);
  insert into public.p615_demo_alias_events(event_type, alias_id, target_demo_id, mission_id, submission_id, term_id, entry,
    entry_sha256, target_decision_event_id, reason, actor_user_id, idempotency_key, request_sha256)
  values ('ALIAS_DECIDE', 'alias:' || p_term_id, p_target_demo_id, p_mission_id, p_submission_id, p_term_id, v_entry,
    encode(sha256(convert_to(v_entry::text, 'UTF8')), 'hex'), v_target.id, v_reason, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'entry_sha256', v_row.entry_sha256, 'recorded_at', v_row.recorded_at);
exception when unique_violation then
  return jsonb_build_object('status', 'rejected', 'detail', 'this submitted term already has a synthetic demo alias decision');
end $$;

create function public.p615_demo_alias_activate_v1(p_decision_event_id uuid, p_expected_entry_sha256 text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_sha text; v_dec public.p615_demo_alias_events; v_existing public.p615_demo_alias_events;
  v_row public.p615_demo_alias_events; v_membership uuid; v_conflict text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_decision_event_id is null or p_idempotency_key is null or p_expected_entry_sha256 is null then
    raise exception 'missing arguments' using errcode = '22023'; end if;
  select * into v_dec from public.p615_demo_alias_events e where e.id = p_decision_event_id and e.event_type = 'ALIAS_DECIDE';
  if found then v_membership := public.p37_catalog_activator_membership(v_dec.mission_id, v_dec.submission_id); end if;
  if v_membership is null then
    raise exception 'synthetic demo alias activation requires active Ground Medical membership in the decision mission' using errcode = '42501'; end if;
  perform 1 from public.mission_memberships m where m.id = v_membership and m.active for share;
  if not found then
    raise exception 'synthetic demo alias activation requires active Ground Medical membership in the decision mission' using errcode = '42501'; end if;
  v_sha := encode(sha256(convert_to(concat_ws('|', 'ALIAS_ACTIVATE', p_decision_event_id::text, p_expected_entry_sha256, v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p615_demo_alias_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p37-demo-catalog-activation', 0));
  if v_dec.entry_sha256 <> p_expected_entry_sha256 then
    return jsonb_build_object('status', 'rejected', 'detail', 'proposal digest does not match the synthetic demo alias decision'); end if;
  if v_dec.actor_user_id = v_uid then
    return jsonb_build_object('status', 'rejected', 'detail', 'the decider cannot activate their own synthetic demo alias decision'); end if;
  if not exists (select 1 from public.p37_demo_scope d where d.submission_id = v_dec.submission_id and d.term_id = v_dec.term_id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this term is not in the synthetic demo scope'); end if;
  if exists (select 1 from public.p615_demo_alias_events e where e.event_type = 'ALIAS_ACTIVATE' and e.decision_event_id = v_dec.id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'this synthetic demo alias decision was already activated; a revoked alias needs a new decision'); end if;
  if not exists (select 1 from public.p37_demo_catalog_events act
      where act.event_type = 'DEMO_ACTIVATE' and act.decision_event_id = v_dec.target_decision_event_id
        and not exists (select 1 from public.p37_demo_catalog_events r where r.event_type = 'DEMO_REVOKE' and r.activation_event_id = act.id)) then
    return jsonb_build_object('status', 'rejected', 'detail', 'the target synthetic demo entry is no longer active'); end if;
  select k.owner_id into v_conflict from public.p615_active_keys(v_dec.mission_id) k
   where k.key in (select lower(regexp_replace(btrim(l), '\s+', ' ', 'g')) || '|' || (v_dec.entry->>'unit') from jsonb_array_elements_text(v_dec.entry->'labels') l)
   limit 1;
  if v_conflict is not null then
    return jsonb_build_object('status', 'rejected', 'detail', 'conflicts with active synthetic demo identity ' || v_conflict); end if;
  insert into public.p615_demo_alias_events(event_type, alias_id, target_demo_id, mission_id, submission_id, term_id, entry_sha256,
    decision_event_id, actor_user_id, idempotency_key, request_sha256)
  values ('ALIAS_ACTIVATE', v_dec.alias_id, v_dec.target_demo_id, v_dec.mission_id, v_dec.submission_id, v_dec.term_id,
    v_dec.entry_sha256, v_dec.id, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'demo_catalog_version', v_row.seq, 'recorded_at', v_row.recorded_at);
end $$;

create function public.p615_demo_alias_revoke_v1(p_activation_event_id uuid, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_sha text; v_act public.p615_demo_alias_events; v_existing public.p615_demo_alias_events;
  v_row public.p615_demo_alias_events; v_membership uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_activation_event_id is null or p_idempotency_key is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  select * into v_act from public.p615_demo_alias_events e where e.id = p_activation_event_id and e.event_type = 'ALIAS_ACTIVATE';
  if found then v_membership := public.p37_catalog_activator_membership(v_act.mission_id, v_act.submission_id); end if;
  if v_membership is null then
    raise exception 'synthetic demo alias revocation requires active Ground Medical membership in the decision mission' using errcode = '42501'; end if;
  perform 1 from public.mission_memberships m where m.id = v_membership and m.active for share;
  if not found then
    raise exception 'synthetic demo alias revocation requires active Ground Medical membership in the decision mission' using errcode = '42501'; end if;
  v_sha := encode(sha256(convert_to(concat_ws('|', 'ALIAS_REVOKE', p_activation_event_id::text, v_reason, v_uid::text), 'UTF8')), 'hex');
  select * into v_existing from public.p615_demo_alias_events e where e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_sha then return jsonb_build_object('status', 'duplicate', 'event_id', v_existing.id); end if;
    raise exception 'idempotency key reused with different request' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 8 and 2000 then
    return jsonb_build_object('status', 'rejected', 'detail', 'a documented revocation reason (8 to 2000 characters) is required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('p37-demo-catalog-activation', 0));
  if exists (select 1 from public.p615_demo_alias_events r where r.event_type = 'ALIAS_REVOKE' and r.activation_event_id = v_act.id) then
    return jsonb_build_object('status', 'rejected', 'detail', 'already revoked'); end if;
  insert into public.p615_demo_alias_events(event_type, alias_id, target_demo_id, mission_id, submission_id, term_id, activation_event_id,
    reason, actor_user_id, idempotency_key, request_sha256)
  values ('ALIAS_REVOKE', v_act.alias_id, v_act.target_demo_id, v_act.mission_id, v_act.submission_id, v_act.term_id, v_act.id,
    v_reason, v_uid, p_idempotency_key, v_sha)
  returning * into v_row;
  return jsonb_build_object('status', 'recorded', 'event_id', v_row.id, 'demo_catalog_version', v_row.seq, 'recorded_at', v_row.recorded_at);
end $$;

-- Researcher scope grants and alias lifecycle of one mission, with caller capabilities.
create function public.p615_demo_governance_v1(p_mission_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_basis text; v_gm boolean; v_approver boolean; v_grants jsonb; v_aliases jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  v_basis := public.p36_global_review_basis(p_mission_id, 'synthetic');
  v_approver := v_basis is not null and exists (select 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null);
  v_gm := exists (select 1 from public.mission_memberships m join public.missions s on s.id = m.mission_id and s.status in ('planning','active')
    where m.mission_id = p_mission_id and m.user_id = v_uid and m.active and m.role = 'ground_medical');
  if v_basis is null and not v_gm then raise exception 'scope denied' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('grant_id', g.id, 'submission_id', g.submission_id, 'term_id', g.term_id,
      'exact_unit', g.exact_unit, 'authorization_ref', g.authorization_ref, 'access_basis', g.access_basis,
      'recorded_at', g.recorded_at, 'authorized_by_caller', g.actor_user_id = v_uid) order by g.recorded_at, g.term_id), '[]'::jsonb)
    into v_grants from public.p615_demo_scope_grants g where g.mission_id = p_mission_id;
  select coalesce(jsonb_agg(jsonb_build_object('decision_event_id', ad.id, 'submission_id', ad.submission_id, 'term_id', ad.term_id,
      'alias_id', ad.alias_id, 'target_demo_id', ad.target_demo_id, 'entry', ad.entry, 'entry_sha256', ad.entry_sha256,
      'decided_at', ad.recorded_at, 'decided_by_caller', ad.actor_user_id = v_uid,
      'activation_event_id', aa.id, 'activated_at', aa.recorded_at, 'activated_by_caller', aa.actor_user_id = v_uid,
      'revocation_event_id', ar.id, 'revoked_at', ar.recorded_at, 'revocation_reason', ar.reason,
      'caller_may_activate', public.p37_catalog_activator_membership(ad.mission_id, ad.submission_id) is not null
    ) order by ad.seq), '[]'::jsonb)
    into v_aliases
    from public.p615_demo_alias_events ad
    left join public.p615_demo_alias_events aa on aa.event_type = 'ALIAS_ACTIVATE' and aa.decision_event_id = ad.id
    left join public.p615_demo_alias_events ar on ar.event_type = 'ALIAS_REVOKE' and ar.activation_event_id = aa.id
   where ad.event_type = 'ALIAS_DECIDE' and ad.mission_id = p_mission_id;
  return jsonb_build_object('mission_id', p_mission_id, 'can_authorize', v_approver, 'can_activate', v_gm,
    'grants', v_grants, 'aliases', v_aliases);
end $$;

-- Activated synthetic demo alias definitions of one mission (no observations, no identities).
create function public.p615_demo_alias_snapshot_v1(p_mission_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_entries jsonb; v_version bigint;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  if not (exists (select 1 from public.mission_memberships m where m.mission_id = p_mission_id and m.user_id = v_uid and m.active)
      or public.p36_global_review_basis(p_mission_id, 'synthetic') is not null) then
    raise exception 'scope denied' using errcode = '42501'; end if;
  select coalesce(max(seq), 0) into v_version from public.p615_demo_alias_events
    where mission_id = p_mission_id and event_type in ('ALIAS_ACTIVATE','ALIAS_REVOKE');
  select coalesce(jsonb_agg((ad.entry - 'rationale') || jsonb_build_object(
      'status', case when ar.id is null then 'ACTIVE' else 'REVOKED' end,
      'decision', jsonb_build_object('decisionEventId', ad.id, 'decidedAt', ad.recorded_at, 'entrySha256', ad.entry_sha256),
      'activation', jsonb_build_object('activationEventId', aa.id, 'activatedAt', aa.recorded_at, 'demoCatalogVersion', aa.seq),
      'revocation', case when ar.id is null then null else jsonb_build_object('revocationEventId', ar.id, 'revokedAt', ar.recorded_at, 'reason', ar.reason, 'demoCatalogVersion', ar.seq) end
    ) order by ad.alias_id, aa.seq), '[]'::jsonb)
  into v_entries
  from public.p615_demo_alias_events aa
  join public.p615_demo_alias_events ad on ad.id = aa.decision_event_id
  left join public.p615_demo_alias_events ar on ar.event_type = 'ALIAS_REVOKE' and ar.activation_event_id = aa.id
  where aa.event_type = 'ALIAS_ACTIVATE' and aa.mission_id = p_mission_id;
  return jsonb_build_object('mission_id', p_mission_id, 'alias_catalog_version', v_version, 'aliases', v_entries);
end $$;

revoke all on function public.p615_unit_problem(text), public.p615_latest_triage(uuid, text),
  public.p615_active_keys(text), public.p615_demo_identity_guard(),
  public.p615_demo_scope_authorize_v1(text, jsonb),
  public.p615_demo_alias_decide_v1(text, uuid, text, text, text, text, uuid),
  public.p615_demo_alias_activate_v1(uuid, text, uuid), public.p615_demo_alias_revoke_v1(uuid, text, uuid),
  public.p615_demo_governance_v1(text), public.p615_demo_alias_snapshot_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.p615_demo_scope_authorize_v1(text, jsonb) to authenticated;
grant execute on function public.p615_demo_alias_decide_v1(text, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.p615_demo_alias_activate_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p615_demo_alias_revoke_v1(uuid, text, uuid) to authenticated;
grant execute on function public.p615_demo_governance_v1(text) to authenticated;
grant execute on function public.p615_demo_alias_snapshot_v1(text) to authenticated;

comment on table public.p615_demo_scope_grants is
  'SYNTHETIC DEMO ONLY: append-only record of Researcher additions to p37_demo_scope; not scientific approval or source validation.';
comment on table public.p615_demo_alias_events is
  'SYNTHETIC DEMO ONLY: append-only alias lifecycle to existing active demo entries (identical exact unit); not scientific approval.';
