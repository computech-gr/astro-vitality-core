-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
-- Requires the installed P37 SYNTHETIC DEMO catalog (20261108020000 / 0025).
--
-- P38 bulk SYNTHETIC DEMO lifecycle. Three bounded batch functions (1 to 50
-- terms per call) that run the EXISTING per-term caller-scoped functions inside
-- one transaction per batch:
--   * p38_demo_bulk_triage_accept_v1 -> p36_global_triage_append_v1 (ACCEPT_FOR_REVIEW)
--   * p38_demo_bulk_decide_v1        -> p37_demo_decide_v1
--   * p38_demo_bulk_activate_v1      -> p37_demo_activate_v1
-- Every rule of the per-term functions still applies to every term (grants,
-- global review basis, owner demo scope, triage acceptance, submitter and
-- decider separation, Ground Medical membership, digest match, key conflicts,
-- one immutable event per term). Per-term rejections write nothing and are
-- reported; any exception (authorization, malformed request) rolls back the
-- whole batch, so a batch never leaves a partial state. Retries with the same
-- idempotency keys return "duplicate"; terms already processed through another
-- key are reported "skipped". Batches of one mission are serialized.
-- No new tables; never reads or writes p37_catalog_events,
-- p36_dynamic_source_validation, submissions, terms, the P36 authorization
-- ledger or p36_metric_unit_catalog. Synthetic provenance only.

create function public.p38_demo_bulk_check_items(p_items jsonb, p_identity text) returns integer
language plpgsql immutable set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'missing arguments' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > 50 then raise exception 'a batch holds 1 to 50 terms' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) <> 'object'
      or nullif(x->>'idempotency_key', '') is null) then
    raise exception 'every batch item needs an idempotency key' using errcode = '22023'; end if;
  if (select count(distinct x->>'idempotency_key') from jsonb_array_elements(p_items) x) <> v_n then
    raise exception 'idempotency keys repeat within the batch' using errcode = '22023'; end if;
  if p_identity = 'term' and (select count(distinct (x->>'submission_id') || ':' || (x->>'term_id')) from jsonb_array_elements(p_items) x) <> v_n then
    raise exception 'a term appears twice in the batch' using errcode = '22023'; end if;
  if p_identity = 'decision' and (select count(distinct x->>'decision_event_id') from jsonb_array_elements(p_items) x) <> v_n then
    raise exception 'a decision appears twice in the batch' using errcode = '22023'; end if;
  return v_n;
end $$;

create function public.p38_demo_bulk_triage_accept_v1(p_mission_id text, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_item jsonb; v_out jsonb := '[]'::jsonb; v_r jsonb; v_sub uuid; v_term text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  perform public.p38_demo_bulk_check_items(p_items, 'term');
  perform 1 from public.p36_global_triage_writers w where w.user_id = v_uid and w.revoked_at is null;
  if not found then raise exception 'triage authorization required' using errcode = '42501'; end if;
  if public.p36_global_review_basis(p_mission_id, 'synthetic') is null then
    raise exception 'scope denied' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('p38-demo-bulk:' || p_mission_id, 0));
  for v_item in select x from jsonb_array_elements(p_items) x loop
    v_sub := (v_item->>'submission_id')::uuid;
    v_term := v_item->>'term_id';
    if v_term is null or v_term !~ '^ubt-[0-9a-f]{8}$' then raise exception 'invalid term identifier' using errcode = '22023'; end if;
    if not exists (select 1 from public.p37_demo_scope d
        join public.p36_dynamic_handoff_submissions h on h.submission_id = d.submission_id
        where d.submission_id = v_sub and d.term_id = v_term and h.mission_id = p_mission_id and h.provenance = 'synthetic') then
      v_r := jsonb_build_object('status', 'rejected', 'detail', 'this term is not in the owner-authorized synthetic demo scope of this mission');
    elsif not exists (select 1 from public.p36_global_triage_events e where e.idempotency_key = (v_item->>'idempotency_key')::uuid)
      and exists (select 1 from public.p36_global_triage_events e
        where e.submission_id = v_sub and e.term_id = v_term and e.action = 'ACCEPT_FOR_REVIEW'
          and not exists (select 1 from public.p36_global_triage_events n where n.previous_event_id = e.id)) then
      v_r := jsonb_build_object('status', 'skipped', 'detail', 'already accepted for scientific review');
    else
      v_r := public.p36_global_triage_append_v1(p_mission_id, 'synthetic', v_sub, v_term, 'ACCEPT_FOR_REVIEW', null, '{}'::text[],
        nullif(v_item->>'expected_previous_event_id', '')::uuid, (v_item->>'idempotency_key')::uuid);
      if v_r->>'status' = 'rejected' and v_r->>'detail' = 'already accepted for scientific review' then
        v_r := jsonb_build_object('status', 'skipped', 'detail', 'already accepted for scientific review'); end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('submission_id', v_sub, 'term_id', v_term) || v_r);
  end loop;
  return jsonb_build_object('mission_id', p_mission_id, 'results', v_out);
end $$;

create function public.p38_demo_bulk_decide_v1(p_mission_id text, p_acknowledgement text, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_item jsonb; v_out jsonb := '[]'::jsonb; v_r jsonb; v_sub uuid; v_term text;
  v_key uuid; v_prev uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  perform public.p38_demo_bulk_check_items(p_items, 'term');
  perform 1 from public.p37_scientific_approvers a where a.user_id = v_uid and a.revoked_at is null;
  if not found then raise exception 'scientific approval authorization required' using errcode = '42501'; end if;
  if public.p36_global_review_basis(p_mission_id, 'synthetic') is null then
    raise exception 'scope denied' using errcode = '42501'; end if;
  if p_acknowledgement is distinct from 'SYNTHETIC DEMO - NOT A SCIENTIFIC APPROVAL' then
    raise exception 'the synthetic demo acknowledgement is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('p38-demo-bulk:' || p_mission_id, 0));
  for v_item in select x from jsonb_array_elements(p_items) x loop
    v_sub := (v_item->>'submission_id')::uuid;
    v_term := v_item->>'term_id';
    v_key := (v_item->>'idempotency_key')::uuid;
    if v_term is null or v_term !~ '^ubt-[0-9a-f]{8}$' then raise exception 'invalid term identifier' using errcode = '22023'; end if;
    select e.idempotency_key into v_prev from public.p37_demo_catalog_events e
      where e.event_type = 'DEMO_DECIDE' and e.submission_id = v_sub and e.term_id = v_term;
    if found and v_prev <> v_key then
      v_r := jsonb_build_object('status', 'skipped', 'detail', 'this term already has a synthetic demo decision');
    else
      v_r := public.p37_demo_decide_v1(p_mission_id, v_sub, v_term, v_item->>'display_name', v_item->>'domain',
        p_acknowledgement, v_key);
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('submission_id', v_sub, 'term_id', v_term) || v_r);
  end loop;
  return jsonb_build_object('mission_id', p_mission_id, 'results', v_out);
end $$;

create function public.p38_demo_bulk_activate_v1(p_mission_id text, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_item jsonb; v_out jsonb := '[]'::jsonb; v_r jsonb; v_dec public.p37_demo_catalog_events;
  v_id uuid; v_key uuid; v_prev uuid; v_sha text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  perform public.p38_demo_bulk_check_items(p_items, 'decision');
  if not exists (select 1 from public.mission_memberships m
      join public.missions s on s.id = m.mission_id and s.status in ('planning','active')
      where m.mission_id = p_mission_id and m.user_id = v_uid and m.active and m.role = 'ground_medical') then
    raise exception 'synthetic demo activation requires active Ground Medical membership in the mission' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('p38-demo-bulk:' || p_mission_id, 0));
  for v_item in select x from jsonb_array_elements(p_items) x loop
    v_id := (v_item->>'decision_event_id')::uuid;
    v_key := (v_item->>'idempotency_key')::uuid;
    v_sha := v_item->>'expected_entry_sha256';
    if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then raise exception 'invalid proposal digest' using errcode = '22023'; end if;
    select * into v_dec from public.p37_demo_catalog_events e where e.id = v_id and e.event_type = 'DEMO_DECIDE';
    if not found or v_dec.mission_id <> p_mission_id then
      v_r := jsonb_build_object('status', 'rejected', 'detail', 'synthetic demo decision not found in this mission');
    elsif public.p37_catalog_activator_membership(v_dec.mission_id, v_dec.submission_id) is null then
      v_r := jsonb_build_object('status', 'rejected', 'detail', 'your Ground Medical membership does not cover this submission');
    else
      select a.idempotency_key into v_prev from public.p37_demo_catalog_events a
        where a.event_type = 'DEMO_ACTIVATE' and a.decision_event_id = v_id;
      if found and v_prev <> v_key then
        v_r := jsonb_build_object('status', 'skipped', 'detail', 'this synthetic demo decision is already activated');
      else
        v_r := public.p37_demo_activate_v1(v_id, v_sha, v_key);
      end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('decision_event_id', v_id, 'term_id', v_dec.term_id) || v_r);
  end loop;
  return jsonb_build_object('mission_id', p_mission_id, 'results', v_out);
end $$;

revoke all on function public.p38_demo_bulk_check_items(jsonb, text),
  public.p38_demo_bulk_triage_accept_v1(text, jsonb),
  public.p38_demo_bulk_decide_v1(text, text, jsonb),
  public.p38_demo_bulk_activate_v1(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.p38_demo_bulk_triage_accept_v1(text, jsonb) to authenticated;
grant execute on function public.p38_demo_bulk_decide_v1(text, text, jsonb) to authenticated;
grant execute on function public.p38_demo_bulk_activate_v1(text, jsonb) to authenticated;

comment on function public.p38_demo_bulk_decide_v1(text, text, jsonb) is
  'SYNTHETIC DEMO ONLY: bounded batch of p37_demo_decide_v1 calls; not a scientific approval or source validation.';
comment on function public.p38_demo_bulk_activate_v1(text, jsonb) is
  'SYNTHETIC DEMO ONLY: bounded batch of p37_demo_activate_v1 calls; never touches the production catalog.';
