-- Rollback for 20261115000000_p726_global_researcher_read.sql: restores the four
-- read RPCs to their exact pre-P72.6 bodies, then removes the P72.6 objects.
-- The audit table is dropped only after the owner has exported it if needed.
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
  if not public.observation_sync_can_access(p_mission_id, p_crew_member_id) then
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
  if not public.review_sync_can_read(p_mission_id, p_crew_member_id) then
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
end $function$;

drop function if exists public.p726_global_research_scope_v1();
drop function if exists public.p726_global_research_can_read(text, text, text);
drop function if exists public.p726_is_global_research_reader();
drop table if exists public.p726_global_research_audit;
drop function if exists public.p726_reject_audit_mutation();
drop table if exists public.p726_global_research_readers;
