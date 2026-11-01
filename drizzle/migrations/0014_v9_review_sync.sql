-- v9 Cloud Review Sync (PENDING — owner approval required before applying).
-- Additive only: two new append-only tables and three caller-scoped functions.
-- No existing table, policy, function or record is changed.
--
-- Security model
--  * Writes only through public.review_sync_append_v1 (SECURITY DEFINER, pinned search_path):
--    auth.uid() must be set; the caller must hold an ACTIVE ground_medical membership for the
--    exact mission (mission-wide or bound to this crew member) and the crew member must be
--    actively assigned to the mission. The stored actor is always auth.uid(); a payload actor
--    that differs is rejected. Client role claims are never trusted.
--  * Reads through RLS (direct SELECT) or public.review_sync_list_v1: Ground Medical as above, or
--    the crew member's own active crew_self membership. Researchers, operators and anon are denied.
--  * Append-only: no INSERT/UPDATE/DELETE/TRUNCATE grants; triggers reject UPDATE, DELETE and
--    TRUNCATE for every role, including service_role.
--  * Idempotent: the same event ID with identical content is a duplicate; different content is a
--    conflict (reported, never overwritten). One correction per original record per scope.
--  * Server timestamps: received_at (clock_timestamp) and a monotonically increasing received_seq
--    cursor; decided_at more than 5 minutes in the future is rejected.
--  * Metadata only: there are no columns for values, units, documents, excerpts or AI text.

create table public.review_sync_attestation_events (
  mission_id text not null references public.missions(id),
  crew_member_id text not null references public.crew_members(id),
  provenance text not null check (provenance in ('synthetic','real')),
  event_id text not null check (event_id ~ '^att-[0-9a-f]{8}$'),
  action text not null check (action in ('attest','revoke')),
  record_id text not null check (char_length(record_id) between 1 and 200),
  record_fingerprint text not null check (record_fingerprint ~ '^rfp-[0-9a-f]{8}$'),
  metric_id text not null check (char_length(metric_id) between 1 and 128),
  badge text not null check (badge in ('bone','immune','cardiovascular','behavioral','wearable','device')),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  decided_at timestamptz not null,
  batch_id text not null check (batch_id ~ '^atb-[0-9a-f]{8}$'),
  supersedes_event_id text check (supersedes_event_id is null or supersedes_event_id ~ '^att-[0-9a-f]{8}$'),
  actor_user_id uuid not null,
  received_at timestamptz not null default clock_timestamp(),
  received_seq bigint generated always as identity,
  primary key (mission_id, crew_member_id, provenance, event_id),
  unique (received_seq),
  check (action = 'attest' or supersedes_event_id is not null)
);

create table public.review_sync_correction_events (
  mission_id text not null references public.missions(id),
  crew_member_id text not null references public.crew_members(id),
  provenance text not null check (provenance in ('synthetic','real')),
  intent_id text not null check (intent_id ~ '^corr-[0-9a-f]{16}$'),
  original_record_id text not null check (char_length(original_record_id) between 1 and 200),
  corrected_record_id text not null check (char_length(corrected_record_id) between 1 and 200),
  metric_id text not null check (char_length(metric_id) between 1 and 128),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  decided_at timestamptz not null,
  actor_user_id uuid not null,
  received_at timestamptz not null default clock_timestamp(),
  received_seq bigint generated always as identity,
  primary key (mission_id, crew_member_id, provenance, intent_id),
  unique (mission_id, crew_member_id, provenance, original_record_id),
  unique (received_seq),
  check (original_record_id <> corrected_record_id)
);

-- Grants: read-only Data API access for signed-in users (rows further limited by RLS). No anon.
revoke all on public.review_sync_attestation_events from public, anon, authenticated;
revoke all on public.review_sync_correction_events from public, anon, authenticated;
grant select on public.review_sync_attestation_events to authenticated;
grant select on public.review_sync_correction_events to authenticated;
grant select on public.review_sync_attestation_events to service_role;
grant select on public.review_sync_correction_events to service_role;

alter table public.review_sync_attestation_events enable row level security;
alter table public.review_sync_correction_events enable row level security;

create or replace function public.review_sync_is_ground_medical(p_mission_id text, p_crew_member_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.mission_memberships m
      where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active
        and m.role = 'ground_medical'
        and (m.crew_member_id is null or m.crew_member_id = p_crew_member_id))
    and exists (
      select 1 from public.mission_crew_assignments a
      where a.mission_id = p_mission_id and a.crew_member_id = p_crew_member_id and a.status = 'active')
$$;

create or replace function public.review_sync_can_read(p_mission_id text, p_crew_member_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.review_sync_is_ground_medical(p_mission_id, p_crew_member_id)
    or (auth.uid() is not null and exists (
      select 1 from public.mission_memberships m
      where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active
        and m.role = 'crew_self' and m.crew_member_id = p_crew_member_id))
$$;

revoke all on function public.review_sync_is_ground_medical(text, text) from public, anon;
revoke all on function public.review_sync_can_read(text, text) from public, anon;
grant execute on function public.review_sync_is_ground_medical(text, text) to authenticated;
grant execute on function public.review_sync_can_read(text, text) to authenticated;

create policy review_sync_attestation_scoped_select on public.review_sync_attestation_events
  for select to authenticated using (public.review_sync_can_read(mission_id, crew_member_id));
create policy review_sync_correction_scoped_select on public.review_sync_correction_events
  for select to authenticated using (public.review_sync_can_read(mission_id, crew_member_id));

create or replace function public.review_sync_reject_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'review sync ledger is append-only' using errcode = '42501';
end $$;

create trigger review_sync_attestation_no_update before update or delete on public.review_sync_attestation_events
  for each row execute function public.review_sync_reject_mutation();
create trigger review_sync_attestation_no_truncate before truncate on public.review_sync_attestation_events
  for each statement execute function public.review_sync_reject_mutation();
create trigger review_sync_correction_no_update before update or delete on public.review_sync_correction_events
  for each row execute function public.review_sync_reject_mutation();
create trigger review_sync_correction_no_truncate before truncate on public.review_sync_correction_events
  for each statement execute function public.review_sync_reject_mutation();

create or replace function public.review_sync_append_v1(
  p_mission_id text, p_crew_member_id text, p_provenance text, p_attestations jsonb, p_corrections jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_existing public.review_sync_attestation_events;
  v_existing_c public.review_sync_correction_events;
  v_target public.review_sync_attestation_events;
  v_decided timestamptz;
  v_received timestamptz;
  v_detail text;
  v_inserted int := 0;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then raise exception 'invalid provenance' using errcode = '22023'; end if;
  if not public.review_sync_is_ground_medical(p_mission_id, p_crew_member_id) then
    raise exception 'ground medical membership required for this mission and crew member' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_attestations,'[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_corrections,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_attestations,'[]'::jsonb)) > 500 or jsonb_array_length(coalesce(p_corrections,'[]'::jsonb)) > 500 then
    raise exception 'invalid batch' using errcode = '22023';
  end if;
  -- Serialize writers for one scope so supersession checks see a stable history.
  perform pg_advisory_xact_lock(hashtext('review_sync:' || p_mission_id || ':' || p_crew_member_id || ':' || p_provenance));

  for v_item in select value from jsonb_array_elements(coalesce(p_attestations,'[]'::jsonb)) order by (value->>'decidedAt'), (value->>'action') loop
    v_detail := null;
    begin
      v_decided := (v_item->>'decidedAt')::timestamptz;
    exception when others then v_decided := null; end;
    if coalesce(v_item->>'eventId','') !~ '^att-[0-9a-f]{8}$' then v_detail := 'invalid event id';
    elsif (v_item->>'actorUserId') is distinct from v_uid::text then v_detail := 'actor must be the signed-in reviewer';
    elsif v_decided is null or v_decided > clock_timestamp() + interval '5 minutes' or v_decided < timestamptz '2020-01-01' then v_detail := 'invalid decision time';
    elsif coalesce(v_item->>'action','') not in ('attest','revoke') then v_detail := 'invalid action';
    elsif coalesce(v_item->>'recordFingerprint','') !~ '^rfp-[0-9a-f]{8}$' then v_detail := 'invalid record fingerprint';
    elsif char_length(btrim(coalesce(v_item->>'reason',''))) not between 10 and 500 then v_detail := 'reason must be 10-500 characters';
    end if;
    if v_detail is null and nullif(v_item->>'supersedesEventId','') is not null then
      select * into v_target from public.review_sync_attestation_events t
        where t.mission_id = p_mission_id and t.crew_member_id = p_crew_member_id and t.provenance = p_provenance
          and t.event_id = v_item->>'supersedesEventId';
      if not found then v_detail := 'superseded event is not in the cloud ledger for this scope (sync it first)';
      elsif v_target.record_id <> v_item->>'recordId' then v_detail := 'superseded event belongs to another record';
      elsif (v_item->>'action') = 'revoke' and v_target.action <> 'attest' then v_detail := 'only an attestation can be revoked';
      end if;
    elsif v_detail is null and (v_item->>'action') = 'revoke' then v_detail := 'revocation must supersede an attestation';
    end if;
    if v_detail is not null then
      v_out := v_out || jsonb_build_object('kind','attestation','id',coalesce(v_item->>'eventId',''),'status','rejected','received_at',null,'detail',v_detail);
      continue;
    end if;
    select * into v_existing from public.review_sync_attestation_events t
      where t.mission_id = p_mission_id and t.crew_member_id = p_crew_member_id and t.provenance = p_provenance and t.event_id = v_item->>'eventId';
    if found then
      if v_existing.action = v_item->>'action' and v_existing.record_id = v_item->>'recordId'
         and v_existing.record_fingerprint = v_item->>'recordFingerprint' and v_existing.metric_id = v_item->>'metricId'
         and v_existing.badge = v_item->>'badge' and v_existing.actor_user_id = v_uid and btrim(v_existing.reason) = btrim(v_item->>'reason')
         and v_existing.decided_at = v_decided and v_existing.batch_id = v_item->>'batchId'
         and v_existing.supersedes_event_id is not distinct from nullif(v_item->>'supersedesEventId','') then
        v_out := v_out || jsonb_build_object('kind','attestation','id',v_existing.event_id,'status','duplicate','received_at',v_existing.received_at,'detail',null);
      else
        v_out := v_out || jsonb_build_object('kind','attestation','id',v_existing.event_id,'status','conflict','received_at',v_existing.received_at,'detail','same event id with different content');
      end if;
      continue;
    end if;
    begin
      insert into public.review_sync_attestation_events(mission_id, crew_member_id, provenance, event_id, action, record_id,
        record_fingerprint, metric_id, badge, reason, decided_at, batch_id, supersedes_event_id, actor_user_id)
      values (p_mission_id, p_crew_member_id, p_provenance, v_item->>'eventId', v_item->>'action', v_item->>'recordId',
        v_item->>'recordFingerprint', v_item->>'metricId', v_item->>'badge', btrim(v_item->>'reason'), v_decided,
        v_item->>'batchId', nullif(v_item->>'supersedesEventId',''), v_uid)
      returning received_at into v_received;
      v_inserted := v_inserted + 1;
      v_out := v_out || jsonb_build_object('kind','attestation','id',v_item->>'eventId','status','inserted','received_at',v_received,'detail',null);
    exception when check_violation or not_null_violation or foreign_key_violation then
      v_out := v_out || jsonb_build_object('kind','attestation','id',v_item->>'eventId','status','rejected','received_at',null,'detail','failed server validation');
    end;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_corrections,'[]'::jsonb)) loop
    v_detail := null;
    begin
      v_decided := (v_item->>'decidedAt')::timestamptz;
    exception when others then v_decided := null; end;
    if coalesce(v_item->>'intentId','') !~ '^corr-[0-9a-f]{16}$' then v_detail := 'invalid intent id';
    elsif (v_item->>'actorUserId') is distinct from v_uid::text then v_detail := 'actor must be the signed-in reviewer';
    elsif v_decided is null or v_decided > clock_timestamp() + interval '5 minutes' or v_decided < timestamptz '2020-01-01' then v_detail := 'invalid decision time';
    elsif char_length(btrim(coalesce(v_item->>'reason',''))) not between 10 and 500 then v_detail := 'reason must be 10-500 characters';
    end if;
    if v_detail is not null then
      v_out := v_out || jsonb_build_object('kind','correction','id',coalesce(v_item->>'intentId',''),'status','rejected','received_at',null,'detail',v_detail);
      continue;
    end if;
    select * into v_existing_c from public.review_sync_correction_events t
      where t.mission_id = p_mission_id and t.crew_member_id = p_crew_member_id and t.provenance = p_provenance
        and (t.intent_id = v_item->>'intentId' or t.original_record_id = v_item->>'originalRecordId')
      order by (t.intent_id = v_item->>'intentId') desc limit 1;
    if found then
      if v_existing_c.intent_id = v_item->>'intentId' and v_existing_c.original_record_id = v_item->>'originalRecordId'
         and v_existing_c.corrected_record_id = v_item->>'correctedRecordId' and v_existing_c.metric_id = v_item->>'metricId'
         and v_existing_c.actor_user_id = v_uid and btrim(v_existing_c.reason) = btrim(v_item->>'reason') and v_existing_c.decided_at = v_decided then
        v_out := v_out || jsonb_build_object('kind','correction','id',v_existing_c.intent_id,'status','duplicate','received_at',v_existing_c.received_at,'detail',null);
      else
        v_out := v_out || jsonb_build_object('kind','correction','id',v_item->>'intentId','status','conflict','received_at',v_existing_c.received_at,
          'detail', case when v_existing_c.intent_id = v_item->>'intentId' then 'same intent id with different content' else 'original record already corrected by intent ' || v_existing_c.intent_id end);
      end if;
      continue;
    end if;
    begin
      insert into public.review_sync_correction_events(mission_id, crew_member_id, provenance, intent_id, original_record_id,
        corrected_record_id, metric_id, reason, decided_at, actor_user_id)
      values (p_mission_id, p_crew_member_id, p_provenance, v_item->>'intentId', v_item->>'originalRecordId',
        v_item->>'correctedRecordId', v_item->>'metricId', btrim(v_item->>'reason'), v_decided, v_uid)
      returning received_at into v_received;
      v_inserted := v_inserted + 1;
      v_out := v_out || jsonb_build_object('kind','correction','id',v_item->>'intentId','status','inserted','received_at',v_received,'detail',null);
    exception when check_violation or not_null_violation or foreign_key_violation then
      v_out := v_out || jsonb_build_object('kind','correction','id',v_item->>'intentId','status','rejected','received_at',null,'detail','failed server validation');
    end;
  end loop;

  if v_inserted > 0 then
    insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
    values (p_mission_id, v_uid, 'review_sync_appended', 'review_sync', p_crew_member_id,
      jsonb_build_object('provenance', p_provenance, 'inserted', v_inserted));
  end if;
  return v_out;
end $$;

create or replace function public.review_sync_list_v1(
  p_mission_id text, p_crew_member_id text, p_provenance text, p_kind text, p_after_seq bigint, p_limit int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
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
end $$;

revoke all on function public.review_sync_append_v1(text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.review_sync_list_v1(text, text, text, text, bigint, int) from public, anon;
revoke all on function public.review_sync_reject_mutation() from public, anon, authenticated;
grant execute on function public.review_sync_append_v1(text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.review_sync_list_v1(text, text, text, text, bigint, int) to authenticated;
