-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper).
--
-- P72.6 Global Researcher read access across all missions (owner-requested,
-- 2026-11-15, NASA Space Apps presentation).
--   * The capability is an explicit SQL-provisioned row in
--     p726_global_research_readers (never inferred from mission membership,
--     an email address, a client claim or an application endpoint).
--   * It is READ-ONLY and SYNTHETIC-ONLY: it widens exactly four caller-scoped
--     read RPCs (encrypted observation list, review-metadata list, synthetic
--     demo catalog snapshot, demo alias snapshot) plus one new scope RPC.
--     Every write RPC, every table policy and every Ground Medical, Medical
--     approval, catalog activation and operator path is unchanged, so the
--     capability can never approve, attest, correct, import or activate.
--   * Applies to all existing and future missions; crew scopes require an
--     active crew assignment. REAL provenance is never reachable through it.
--   * No mission membership rows are created. Listing scopes appends an
--     immutable audit row.

create table public.p726_global_research_readers (
  user_id uuid primary key,
  authorization_ref text not null check (char_length(authorization_ref) between 8 and 200),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);
revoke all on public.p726_global_research_readers from public, anon, authenticated, service_role;
grant select on public.p726_global_research_readers to service_role;
alter table public.p726_global_research_readers enable row level security;

create table public.p726_global_research_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default clock_timestamp(),
  actor_id uuid not null,
  action text not null check (action in ('list_scopes')),
  mission_count integer not null default 0,
  crew_scope_count integer not null default 0
);
revoke all on public.p726_global_research_audit from public, anon, authenticated, service_role;
grant select on public.p726_global_research_audit to service_role;
alter table public.p726_global_research_audit enable row level security;
-- No direct application policies on either table.

create function public.p726_reject_audit_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'p726 audit is append-only' using errcode = '42501'; end $$;
create trigger p726_audit_no_update before update or delete on public.p726_global_research_audit
  for each row execute function public.p726_reject_audit_mutation();
create trigger p726_audit_no_truncate before truncate on public.p726_global_research_audit
  for each statement execute function public.p726_reject_audit_mutation();
revoke all on function public.p726_reject_audit_mutation() from public, anon, authenticated;

-- Platform executor: preserve read access, deny writes (object-local).
do $acl$ begin
  if exists (select 1 from pg_roles where rolname = 'sandbox_exec') then
    revoke insert, update, delete, truncate on public.p726_global_research_readers,
      public.p726_global_research_audit from sandbox_exec;
  end if;
end $acl$;

create function public.p726_is_global_research_reader() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.p726_global_research_readers r
    where r.user_id = auth.uid() and r.revoked_at is null)
$$;

-- Mission-level read (p_crew_member_id null) or exact active crew assignment; synthetic only.
create function public.p726_global_research_can_read(p_mission_id text, p_crew_member_id text, p_provenance text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_provenance = 'synthetic', false)
    and public.p726_is_global_research_reader()
    and exists (select 1 from public.missions m where m.id = p_mission_id)
    and (p_crew_member_id is null or exists (
      select 1 from public.mission_crew_assignments a
      where a.mission_id = p_mission_id and a.crew_member_id = p_crew_member_id and a.status = 'active'))
$$;

create function public.p726_global_research_scope_v1() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_missions jsonb; v_mc integer; v_cc integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not public.p726_is_global_research_reader() then
    return jsonb_build_object('granted', false, 'provenance', jsonb_build_array(), 'missions', jsonb_build_array());
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'mission_id', m.id, 'code', m.code, 'name', m.name, 'status', m.status,
      'crew', coalesce((select jsonb_agg(jsonb_build_object(
          'crew_member_id', c.id, 'display_name', c.display_name, 'external_ref', c.external_ref)
          order by c.display_name, c.id)
        from public.mission_crew_assignments a join public.crew_members c on c.id = a.crew_member_id
        where a.mission_id = m.id and a.status = 'active'), '[]'::jsonb))
      order by m.code, m.id), '[]'::jsonb),
    count(*)::integer
  into v_missions, v_mc from public.missions m;
  select count(*)::integer into v_cc from public.mission_crew_assignments a where a.status = 'active';
  insert into public.p726_global_research_audit(actor_id, action, mission_count, crew_scope_count)
    values (auth.uid(), 'list_scopes', v_mc, v_cc);
  return jsonb_build_object('granted', true, 'provenance', jsonb_build_array('synthetic'), 'missions', v_missions);
end $$;

revoke all on function public.p726_is_global_research_reader() from public, anon;
revoke all on function public.p726_global_research_can_read(text, text, text) from public, anon;
revoke all on function public.p726_global_research_scope_v1() from public, anon;
grant execute on function public.p726_is_global_research_reader() to authenticated;
grant execute on function public.p726_global_research_can_read(text, text, text) to authenticated;
grant execute on function public.p726_global_research_scope_v1() to authenticated;

-- ---- Widened READ RPCs (bodies identical to the live definitions except the added global-read clause) ----

CREATE OR REPLACE FUNCTION public.observation_sync_list_v1(p_mission_id text, p_crew_member_id text, p_provenance text, p_after_seq bigint, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then raise exception 'invalid provenance' using errcode = '22023'; end if;
  if not (public.observation_sync_can_access(p_mission_id, p_crew_member_id)
      or public.p726_global_research_can_read(p_mission_id, p_crew_member_id, p_provenance)) then
    raise exception 'observation sync access denied for this mission and crew member' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.received_seq) from (
    select e.mission_id, e.crew_member_id, e.provenance, e.event_id, e.observation_id, e.event_kind, e.cipher_alg,
      e.key_version, e.iv, e.ciphertext, e.fingerprint, e.uploaded_by, e.received_at, e.received_seq
    from public.observation_sync_events e
    where e.mission_id = p_mission_id and e.crew_member_id = p_crew_member_id and e.provenance = p_provenance
      and e.received_seq > coalesce(p_after_seq, 0)
    order by e.received_seq limit v_limit) t), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.review_sync_list_v1(p_mission_id text, p_crew_member_id text, p_provenance text, p_kind text, p_after_seq bigint, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then raise exception 'invalid provenance' using errcode = '22023'; end if;
  if not (public.review_sync_can_read(p_mission_id, p_crew_member_id)
      or public.p726_global_research_can_read(p_mission_id, p_crew_member_id, p_provenance)) then
    raise exception 'mission access denied' using errcode = '42501';
  end if;
  if p_kind = 'attestation' then
    return coalesce((select jsonb_agg(to_jsonb(t) order by t.received_seq) from (
      select * from public.review_sync_attestation_events e
      where e.mission_id = p_mission_id and e.crew_member_id = p_crew_member_id and e.provenance = p_provenance
        and e.received_seq > coalesce(p_after_seq, 0)
      order by e.received_seq limit v_limit) t), '[]'::jsonb);
  elsif p_kind = 'correction' then
    return coalesce((select jsonb_agg(to_jsonb(t) order by t.received_seq) from (
      select * from public.review_sync_correction_events e
      where e.mission_id = p_mission_id and e.crew_member_id = p_crew_member_id and e.provenance = p_provenance
        and e.received_seq > coalesce(p_after_seq, 0)
      order by e.received_seq limit v_limit) t), '[]'::jsonb);
  end if;
  raise exception 'invalid kind' using errcode = '22023';
end $function$;

CREATE OR REPLACE FUNCTION public.p37_demo_catalog_snapshot_v1(p_mission_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_entries jsonb; v_version bigint;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  if not (exists (select 1 from public.mission_memberships m where m.mission_id = p_mission_id and m.user_id = v_uid and m.active)
      or public.p36_global_review_basis(p_mission_id, 'synthetic') is not null
      or public.p726_global_research_can_read(p_mission_id, null, 'synthetic')) then
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
end $function$;

CREATE OR REPLACE FUNCTION public.p615_demo_alias_snapshot_v1(p_mission_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_entries jsonb; v_version bigint;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null then raise exception 'missing arguments' using errcode = '22023'; end if;
  if not (exists (select 1 from public.mission_memberships m where m.mission_id = p_mission_id and m.user_id = v_uid and m.active)
      or public.p36_global_review_basis(p_mission_id, 'synthetic') is not null
      or public.p726_global_research_can_read(p_mission_id, null, 'synthetic')) then
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
end $function$;
