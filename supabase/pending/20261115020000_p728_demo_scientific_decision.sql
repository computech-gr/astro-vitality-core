-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
-- Requires the installed P36 dynamic handoff, global review, global triage,
-- P37 lifecycle + Ground Medical activation, P37 SYNTHETIC DEMO catalog,
-- P38 bulk and P61.5 Researcher scope migrations.
--
-- P72.8 DEMO SCIENTIFIC APPROVAL — NOT CLINICALLY VALIDATED.
--   Restores the direct Researcher decision for explicitly classified synthetic
--   demonstration missions and adds the audit facts the existing demo ledger
--   does not hold:
--   * p728_demo_missions: owner-provisioned classification of a mission as a
--     synthetic demonstration mission (no application write path). Only these
--     missions use the P72.8 decision functions.
--   * p728_demo_review_records: append-only decision records with the
--     authenticated actor, role, timestamp, decision, scientific rationale and
--     evidence references; the original submission ID and term ID are kept and
--     the record links to the existing demo ledger event.
--   * p728_demo_researcher_decide_v1: APPROVE (adds the accepted term to the
--     demo scope through the existing P61.5 Researcher authorization when
--     needed, then the existing P37 DEMO_DECIDE) or REJECT, one rationale per
--     call, bounded batches of 1 to 50, per-item all-or-nothing. No
--     source-validation receipt, specimen, method or reference interval.
--   * p728_demo_medical_decide_v1: Ground Medical ACTIVATE (existing P37
--     DEMO_ACTIVATE) or DECLINE, with rationale; never the decider.
--   * Guard trigger on the existing demo ledger: a rejected term can never be
--     decided, a declined decision can never be activated, a mission with any
--     non-synthetic submission or synchronized observation can never receive a
--     new demo decision, and in classified missions decisions and activations
--     must come through the P72.8 functions (so a rationale is always recorded).
--   * Never reads or writes p37_catalog_events, p36_dynamic_source_validation,
--     the P36 authorization ledger, submitted terms, triage or observations.
--     Production scientific approval keeps its source-validation receipt
--     requirement unchanged.

create table public.p728_demo_missions (
  mission_id text primary key references public.missions(id),
  authorization_ref text not null check (char_length(authorization_ref) between 8 and 200),
  classified_at timestamptz not null default now()
);

create table public.p728_demo_review_records (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  record_type text not null check (record_type in
    ('RESEARCHER_DEMO_APPROVE','RESEARCHER_DEMO_REJECT','MEDICAL_DEMO_ACTIVATE','MEDICAL_DEMO_DECLINE')),
  mission_id text not null references public.missions(id),
  provenance text not null default 'synthetic' check (provenance = 'synthetic'),
  submission_id uuid not null references public.p36_dynamic_handoff_submissions(submission_id),
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  demo_event_id uuid references public.p37_demo_catalog_events(id),
  rationale text not null check (char_length(rationale) between 8 and 2000 and rationale = btrim(rationale)),
  evidence_refs jsonb not null check (jsonb_typeof(evidence_refs) = 'array' and jsonb_array_length(evidence_refs) <= 20),
  label text not null default 'DEMO SCIENTIFIC APPROVAL — NOT CLINICALLY VALIDATED'
    check (label = 'DEMO SCIENTIFIC APPROVAL — NOT CLINICALLY VALIDATED'),
  actor_user_id uuid not null,
  actor_role text not null check (actor_role in ('researcher','ground_medical')),
  idempotency_key uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  check ((record_type = 'RESEARCHER_DEMO_REJECT') = (demo_event_id is null)),
  check ((record_type like 'RESEARCHER_%') = (actor_role = 'researcher'))
);
create unique index p728_one_researcher_decision_per_term on public.p728_demo_review_records (submission_id, term_id)
  where record_type in ('RESEARCHER_DEMO_APPROVE','RESEARCHER_DEMO_REJECT');
create unique index p728_one_medical_decision_per_term on public.p728_demo_review_records (submission_id, term_id)
  where record_type in ('MEDICAL_DEMO_ACTIVATE','MEDICAL_DEMO_DECLINE');

revoke all on public.p728_demo_missions, public.p728_demo_review_records from public, anon, authenticated, service_role;
grant select on public.p728_demo_missions, public.p728_demo_review_records to service_role;
alter table public.p728_demo_missions enable row level security;
alter table public.p728_demo_review_records enable row level security;
-- No direct application policies on either table.
do $acl$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    revoke insert, update, delete, truncate on public.p728_demo_missions, public.p728_demo_review_records from sandbox_exec;
  end if;
end $acl$;

create trigger p728_demo_missions_immutable before update or delete on public.p728_demo_missions
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p728_demo_missions_no_truncate before truncate on public.p728_demo_missions
  for each statement execute function public.p36_global_review_reject_mutation();
create trigger p728_demo_review_records_immutable before update or delete on public.p728_demo_review_records
  for each row execute function public.p36_global_review_reject_mutation();
create trigger p728_demo_review_records_no_truncate before truncate on public.p728_demo_review_records
  for each statement execute function public.p36_global_review_reject_mutation();

-- Why this mission may not use the demo exception (null = eligible). Mixed
-- provenance anywhere in the mission disqualifies it.
create function public.p728_demo_mission_problem(p_mission_id text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_mixed boolean := false;
begin
  if not exists (select 1 from public.p728_demo_missions d where d.mission_id = p_mission_id) then
    return 'this mission is not classified as a synthetic demonstration mission'; end if;
  if not exists (select 1 from public.missions m where m.id = p_mission_id and m.status in ('planning','active')) then
    return 'this mission is not open'; end if;
  if not exists (select 1 from public.p36_mission_scientific_sharing s
      where s.mission_id = p_mission_id and s.permitted_provenance = array['synthetic']::text[]) then
    return 'the mission sharing policy is not synthetic-only'; end if;
  if exists (select 1 from public.p36_dynamic_handoff_submissions h where h.mission_id = p_mission_id and h.provenance <> 'synthetic') then
    return 'the mission holds non-synthetic submissions (mixed provenance)'; end if;
  if to_regclass('public.observation_sync_events') is not null then
    execute 'select exists (select 1 from public.observation_sync_events o where o.mission_id = $1 and o.provenance <> ''synthetic'')'
      into v_mixed using p_mission_id;
    if v_mixed then return 'the mission holds non-synthetic examinations (mixed provenance)'; end if;
  end if;
  return null;
end $$;

create function public.p728_demo_event_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_classified boolean;
begin
  v_classified := exists (select 1 from public.p728_demo_missions d where d.mission_id = new.mission_id);
  if new.event_type = 'DEMO_DECIDE' then
    if exists (select 1 from public.p728_demo_review_records r where r.submission_id = new.submission_id
        and r.term_id = new.term_id and r.record_type = 'RESEARCHER_DEMO_REJECT') then
      raise exception 'this submitted term has a recorded demo scientific rejection' using errcode = '42501'; end if;
    if exists (select 1 from public.p36_dynamic_handoff_submissions h where h.mission_id = new.mission_id and h.provenance <> 'synthetic') then
      raise exception 'demo decisions are not permitted in a mixed-provenance mission' using errcode = '42501'; end if;
    if v_classified and coalesce(current_setting('p728.decision_key', true), '') <> new.idempotency_key::text then
      raise exception 'demo scientific decisions in this mission must record a rationale (P72.8)' using errcode = '42501'; end if;
  elsif new.event_type = 'DEMO_ACTIVATE' then
    if exists (select 1 from public.p728_demo_review_records r where r.submission_id = new.submission_id
        and r.term_id = new.term_id and r.record_type = 'MEDICAL_DEMO_DECLINE') then
      raise exception 'Ground Medical declined this demo decision' using errcode = '42501'; end if;
    if v_classified and coalesce(current_setting('p728.decision_key', true), '') <> new.idempotency_key::text then
      raise exception 'demo activations in this mission must record a rationale (P72.8)' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
create trigger p728_demo_event_guard before insert on public.p37_demo_catalog_events
  for each row execute function public.p728_demo_event_guard();

-- Normalized evidence references: distinct, trimmed, 1..300 characters each, at most 20.
create function public.p728_evidence_refs(p_refs jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if p_refs is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p_refs) <> 'array' or exists (select 1 from jsonb_array_elements(p_refs) x where jsonb_typeof(x) <> 'string') then
    raise exception 'evidence references must be a list of text references' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(r order by r), '[]'::jsonb) into v
    from (select distinct btrim(x) r from jsonb_array_elements_text(p_refs) x where btrim(x) <> '') s;
  if jsonb_array_length(v) > 20 or exists (select 1 from jsonb_array_elements_text(v) x where char_length(x) > 300) then
    raise exception 'at most 20 evidence references of up to 300 characters' using errcode = '22023'; end if;
  return v;
end $$;

create function public.p728_demo_researcher_decide_v1(
  p_mission_id text, p_decision text, p_rationale text, p_evidence_refs jsonb, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_problem text; v_rationale text := btrim(coalesce(p_rationale, '')); v_refs jsonb;
  v_item jsonb; v_out jsonb := '[]'::jsonb; v_r jsonb; v_sub uuid; v_term text; v_key uuid; v_sha text;
  v_existing public.p728_demo_review_records; v_h record; v_scope jsonb; v_res jsonb; v_dec jsonb; v_triage text;
  v_type text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null or p_decision is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  if p_decision not in ('APPROVE','REJECT') then raise exception 'unknown decision' using errcode = '22023'; end if;
  perform public.p38_demo_bulk_check_items(p_items, 'term');
  perform 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null for share;
  if not found then raise exception 'scientific approval authorization required' using errcode = '42501'; end if;
  perform 1 from public.p36_mission_scientific_sharing s where s.mission_id = p_mission_id for share;
  if public.p36_global_review_basis(p_mission_id, 'synthetic') is null then
    raise exception 'scope denied' using errcode = '42501'; end if;
  v_problem := public.p728_demo_mission_problem(p_mission_id);
  if v_problem is not null then raise exception '%', v_problem using errcode = '42501'; end if;
  if char_length(v_rationale) not between 8 and 2000 then
    raise exception 'a scientific rationale of 8 to 2000 characters is required' using errcode = '22023'; end if;
  v_refs := public.p728_evidence_refs(p_evidence_refs);
  v_type := case p_decision when 'APPROVE' then 'RESEARCHER_DEMO_APPROVE' else 'RESEARCHER_DEMO_REJECT' end;
  perform pg_advisory_xact_lock(hashtextextended('p38-demo-bulk:' || p_mission_id, 0));
  for v_item in select x from jsonb_array_elements(p_items) x loop
    v_sub := (v_item->>'submission_id')::uuid;
    v_term := v_item->>'term_id';
    v_key := (v_item->>'idempotency_key')::uuid;
    if v_sub is null or v_term is null or v_term !~ '^ubt-[0-9a-f]{8}$' then
      raise exception 'invalid batch item' using errcode = '22023'; end if;
    v_sha := encode(sha256(convert_to(concat_ws('|', 'P728_RESEARCHER', p_mission_id, p_decision, v_sub::text, v_term,
      coalesce(btrim(v_item->>'display_name'), ''), coalesce(v_item->>'domain', ''), coalesce(v_item->>'exact_unit', ''),
      v_rationale, v_refs::text, v_uid::text), 'UTF8')), 'hex');
    select * into v_existing from public.p728_demo_review_records r where r.idempotency_key = v_key;
    if found then
      if v_existing.request_sha256 <> v_sha then
        raise exception 'idempotency key reused with different request' using errcode = '22023'; end if;
      v_r := jsonb_build_object('status', 'duplicate', 'record_id', v_existing.id, 'demo_event_id', v_existing.demo_event_id);
    else
      begin
        select h.mission_id, h.provenance, h.submitted_by into v_h from public.p36_dynamic_handoff_submissions h where h.submission_id = v_sub;
        if not found or v_h.mission_id <> p_mission_id then raise exception 'synthetic submission not found in this mission'; end if;
        if v_h.provenance <> 'synthetic' then raise exception 'only synthetic submissions may receive a demo scientific decision'; end if;
        if v_h.submitted_by = v_uid then raise exception 'the submitter cannot decide their own request'; end if;
        if not exists (select 1 from public.p36_dynamic_handoff_terms t where t.submission_id = v_sub and t.term_id = v_term) then
          raise exception 'this term does not belong to the selected submission'; end if;
        if exists (select 1 from public.p728_demo_review_records r where r.submission_id = v_sub and r.term_id = v_term
            and r.record_type in ('RESEARCHER_DEMO_APPROVE','RESEARCHER_DEMO_REJECT')) then
          raise exception 'this term already has a demo scientific decision'; end if;
        if exists (select 1 from public.p37_demo_catalog_events e where e.event_type = 'DEMO_DECIDE'
            and e.submission_id = v_sub and e.term_id = v_term) then
          raise exception 'this term already has a synthetic demo decision'; end if;
        select e.action into v_triage from public.p36_global_triage_events e
          where e.submission_id = v_sub and e.term_id = v_term
            and not exists (select 1 from public.p36_global_triage_events n where n.previous_event_id = e.id);
        if v_triage is distinct from 'ACCEPT_FOR_REVIEW' then
          raise exception 'the term must be accepted for scientific review first'; end if;
        v_dec := null;
        if p_decision = 'APPROVE' then
          if not exists (select 1 from public.p37_demo_scope d where d.submission_id = v_sub and d.term_id = v_term) then
            v_scope := public.p615_demo_scope_authorize_v1(p_mission_id, jsonb_build_array(jsonb_build_object(
              'submission_id', v_sub, 'term_id', v_term, 'exact_unit', v_item->>'exact_unit',
              'idempotency_key', md5('p728-scope:' || v_key::text)::uuid)));
            v_res := v_scope->'results'->0;
            if v_res->>'status' not in ('recorded','duplicate','skipped') then
              raise exception '%', coalesce(v_res->>'detail', 'the term could not enter the synthetic demo scope'); end if;
          end if;
          perform set_config('p728.decision_key', v_key::text, true);
          v_dec := public.p37_demo_decide_v1(p_mission_id, v_sub, v_term, v_item->>'display_name', v_item->>'domain',
            'SYNTHETIC DEMO - NOT A SCIENTIFIC APPROVAL', v_key);
          perform set_config('p728.decision_key', '', true);
          if v_dec->>'status' is distinct from 'recorded' then
            raise exception '%', coalesce(v_dec->>'detail', 'the demo decision was not recorded'); end if;
        end if;
        insert into public.p728_demo_review_records(record_type, mission_id, submission_id, term_id, demo_event_id,
          rationale, evidence_refs, actor_user_id, actor_role, idempotency_key, request_sha256)
        values (v_type, p_mission_id, v_sub, v_term, (v_dec->>'event_id')::uuid, v_rationale, v_refs, v_uid, 'researcher', v_key, v_sha)
        returning jsonb_build_object('status', 'recorded', 'record_id', id, 'demo_event_id', demo_event_id,
          'entry_sha256', v_dec->>'entry_sha256', 'recorded_at', recorded_at) into v_r;
      exception when others then
        perform set_config('p728.decision_key', '', true);
        v_r := jsonb_build_object('status', 'rejected', 'detail', sqlerrm);
      end;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('submission_id', v_sub, 'term_id', v_term) || v_r);
  end loop;
  return jsonb_build_object('mission_id', p_mission_id, 'decision', p_decision, 'results', v_out);
end $$;

create function public.p728_demo_medical_decide_v1(p_mission_id text, p_decision text, p_rationale text, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_problem text; v_rationale text := btrim(coalesce(p_rationale, ''));
  v_item jsonb; v_out jsonb := '[]'::jsonb; v_r jsonb; v_id uuid; v_key uuid; v_digest text; v_sha text;
  v_existing public.p728_demo_review_records; v_dec public.p37_demo_catalog_events; v_act jsonb; v_link uuid; v_type text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null or p_decision is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  if p_decision not in ('ACTIVATE','DECLINE') then raise exception 'unknown decision' using errcode = '22023'; end if;
  perform public.p38_demo_bulk_check_items(p_items, 'decision');
  if not exists (select 1 from public.mission_memberships m
      join public.missions s on s.id = m.mission_id and s.status in ('planning','active')
      where m.mission_id = p_mission_id and m.user_id = v_uid and m.active and m.role = 'ground_medical') then
    raise exception 'synthetic demo activation requires active Ground Medical membership in the mission' using errcode = '42501'; end if;
  v_problem := public.p728_demo_mission_problem(p_mission_id);
  if v_problem is not null then raise exception '%', v_problem using errcode = '42501'; end if;
  if char_length(v_rationale) not between 8 and 2000 then
    raise exception 'a rationale of 8 to 2000 characters is required' using errcode = '22023'; end if;
  v_type := case p_decision when 'ACTIVATE' then 'MEDICAL_DEMO_ACTIVATE' else 'MEDICAL_DEMO_DECLINE' end;
  perform pg_advisory_xact_lock(hashtextextended('p38-demo-bulk:' || p_mission_id, 0));
  for v_item in select x from jsonb_array_elements(p_items) x loop
    v_id := (v_item->>'decision_event_id')::uuid;
    v_key := (v_item->>'idempotency_key')::uuid;
    v_digest := v_item->>'expected_entry_sha256';
    if v_id is null or v_digest is null or v_digest !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid batch item' using errcode = '22023'; end if;
    v_sha := encode(sha256(convert_to(concat_ws('|', 'P728_MEDICAL', p_mission_id, p_decision, v_id::text, v_digest,
      v_rationale, v_uid::text), 'UTF8')), 'hex');
    select * into v_existing from public.p728_demo_review_records r where r.idempotency_key = v_key;
    if found then
      if v_existing.request_sha256 <> v_sha then
        raise exception 'idempotency key reused with different request' using errcode = '22023'; end if;
      v_r := jsonb_build_object('status', 'duplicate', 'record_id', v_existing.id, 'demo_event_id', v_existing.demo_event_id);
    else
      begin
        select * into v_dec from public.p37_demo_catalog_events e where e.id = v_id and e.event_type = 'DEMO_DECIDE';
        if not found or v_dec.mission_id <> p_mission_id then raise exception 'synthetic demo decision not found in this mission'; end if;
        if public.p37_catalog_activator_membership(v_dec.mission_id, v_dec.submission_id) is null then
          raise exception 'your Ground Medical membership does not cover this submission'; end if;
        if v_dec.actor_user_id = v_uid then raise exception 'the decider cannot activate or decline their own demo decision'; end if;
        if v_dec.entry_sha256 <> v_digest then raise exception 'proposal digest does not match the demo decision'; end if;
        if exists (select 1 from public.p728_demo_review_records r where r.submission_id = v_dec.submission_id and r.term_id = v_dec.term_id
            and r.record_type in ('MEDICAL_DEMO_ACTIVATE','MEDICAL_DEMO_DECLINE')) then
          raise exception 'this demo decision already has a Ground Medical decision'; end if;
        if exists (select 1 from public.p37_demo_catalog_events a where a.event_type = 'DEMO_ACTIVATE' and a.decision_event_id = v_id) then
          raise exception 'this demo decision is already activated; use revocation'; end if;
        if p_decision = 'ACTIVATE' then
          perform set_config('p728.decision_key', v_key::text, true);
          v_act := public.p37_demo_activate_v1(v_id, v_digest, v_key);
          perform set_config('p728.decision_key', '', true);
          if v_act->>'status' is distinct from 'recorded' then
            raise exception '%', coalesce(v_act->>'detail', 'the demo activation was not recorded'); end if;
          v_link := (v_act->>'event_id')::uuid;
        else
          v_link := v_id;
        end if;
        insert into public.p728_demo_review_records(record_type, mission_id, submission_id, term_id, demo_event_id,
          rationale, evidence_refs, actor_user_id, actor_role, idempotency_key, request_sha256)
        values (v_type, p_mission_id, v_dec.submission_id, v_dec.term_id, v_link, v_rationale, '[]'::jsonb, v_uid, 'ground_medical', v_key, v_sha)
        returning jsonb_build_object('status', 'recorded', 'record_id', id, 'demo_event_id', demo_event_id, 'recorded_at', recorded_at) into v_r;
      exception when others then
        perform set_config('p728.decision_key', '', true);
        v_r := jsonb_build_object('status', 'rejected', 'detail', sqlerrm);
      end;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('decision_event_id', v_id, 'term_id', v_dec.term_id) || v_r);
  end loop;
  return jsonb_build_object('mission_id', p_mission_id, 'decision', p_decision, 'results', v_out);
end $$;

-- Classification, caller capabilities and decision records of one mission (no actor IDs).
create function public.p728_demo_review_records_v1(p_mission_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_researcher boolean; v_medical boolean; v_rows jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  v_researcher := public.p36_global_review_basis(p_mission_id, 'synthetic') is not null;
  v_medical := exists (select 1 from public.mission_memberships m where m.mission_id = p_mission_id
    and m.user_id = v_uid and m.active and m.role = 'ground_medical');
  if not v_researcher and not v_medical then raise exception 'scope denied' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('record_id', r.id, 'record_type', r.record_type,
      'submission_id', r.submission_id, 'term_id', r.term_id, 'demo_event_id', r.demo_event_id,
      'rationale', r.rationale, 'evidence_refs', r.evidence_refs, 'label', r.label, 'actor_role', r.actor_role,
      'recorded_by_caller', r.actor_user_id = v_uid, 'recorded_at', r.recorded_at) order by r.seq), '[]'::jsonb)
    into v_rows from public.p728_demo_review_records r where r.mission_id = p_mission_id;
  return jsonb_build_object('mission_id', p_mission_id,
    'classified', exists (select 1 from public.p728_demo_missions d where d.mission_id = p_mission_id),
    'problem', public.p728_demo_mission_problem(p_mission_id),
    'can_decide', v_researcher and exists (select 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null),
    'can_activate', v_medical,
    'records', v_rows);
end $$;

revoke all on function public.p728_demo_mission_problem(text), public.p728_demo_event_guard(),
  public.p728_evidence_refs(jsonb),
  public.p728_demo_researcher_decide_v1(text, text, text, jsonb, jsonb),
  public.p728_demo_medical_decide_v1(text, text, text, jsonb),
  public.p728_demo_review_records_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.p728_demo_researcher_decide_v1(text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.p728_demo_medical_decide_v1(text, text, text, jsonb) to authenticated;
grant execute on function public.p728_demo_review_records_v1(text) to authenticated;
do $acl$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    revoke execute on function public.p728_demo_researcher_decide_v1(text, text, text, jsonb, jsonb),
      public.p728_demo_medical_decide_v1(text, text, text, jsonb), public.p728_demo_review_records_v1(text) from sandbox_exec;
  end if;
end $acl$;
