-- v9.4 Cross-device observation sync (PENDING — owner approval required before applying).
-- Additive only: one new append-only table and four caller-scoped functions.
-- No existing table, policy, function or record (including the v9 review-sync tables) is changed.
--
-- Security model
--  * The database never receives plaintext observation payloads. The authenticated server function
--    (src/lib/observation-sync.functions.ts) encrypts each canonical observation event with
--    AES-256-GCM under a per-scope key derived (HKDF-SHA256) from a server-only master secret,
--    binding mission/crew/provenance/event/fingerprint as additional authenticated data. Only the
--    ciphertext, IV, key version and a keyed HMAC fingerprint are stored here. RLS and TLS are NOT
--    relied upon as at-rest payload encryption.
--  * Writes only through public.observation_sync_append_v1 (SECURITY DEFINER, pinned search_path):
--    auth.uid() must be set; the crew member must be actively assigned; the caller must hold an
--    ACTIVE crew_self membership for exactly this crew member, or an ACTIVE ground_medical
--    membership for this mission (mission-wide or bound to this crew member). Researchers,
--    mission operators and anon are refused. Closed missions (completed/aborted) refuse writes.
--    Real-provenance batches additionally require p_real_data_confirmed = true.
--  * Reads through RLS (direct SELECT of ciphertext rows) or public.observation_sync_list_v1, with
--    the same intentionally scoped reader set (own crew_self, scoped ground_medical). Reading a row
--    yields ciphertext only; decryption happens in the authenticated server function after a
--    second, server-side membership check.
--  * Append-only: no INSERT/UPDATE/DELETE/TRUNCATE grants for any API role (service_role included);
--    triggers reject UPDATE, DELETE and TRUNCATE for every role.
--  * Idempotent: the same event ID with the same fingerprint is a duplicate; a different fingerprint
--    is a conflict that is reported and never overwritten.
--  * Server timestamps: received_at (clock_timestamp) and a monotonically increasing received_seq
--    cursor for pagination. Every batch that inserts rows writes a content-free audit_events row.

create table public.observation_sync_events (
  mission_id text not null references public.missions(id),
  crew_member_id text not null references public.crew_members(id),
  provenance text not null check (provenance in ('synthetic','real')),
  event_id text not null check (event_id ~ '^[A-Za-z0-9][A-Za-z0-9-]{7,127}:(entry|status)$'),
  observation_id text not null check (observation_id ~ '^[A-Za-z0-9][A-Za-z0-9-]{7,127}$'),
  event_kind text not null check (event_kind in ('entry','status')),
  cipher_alg text not null check (cipher_alg = 'A256GCM-HKDF-SHA256-v1'),
  key_version int not null check (key_version between 1 and 32),
  iv text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  ciphertext text not null check (char_length(ciphertext) between 24 and 24000 and ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$'),
  fingerprint text not null check (fingerprint ~ '^ofp-[0-9a-f]{64}$'),
  uploaded_by uuid not null,
  received_at timestamptz not null default clock_timestamp(),
  received_seq bigint generated always as identity,
  primary key (mission_id, crew_member_id, provenance, event_id),
  unique (received_seq),
  check (event_id = observation_id || ':' || event_kind)
);

-- Least privilege: only SELECT (rows further limited by RLS). Inherited/default privileges are removed.
revoke all on public.observation_sync_events from public, anon, authenticated, service_role;
grant select on public.observation_sync_events to authenticated;
grant select on public.observation_sync_events to service_role;

alter table public.observation_sync_events enable row level security;

create or replace function public.observation_sync_can_access(p_mission_id text, p_crew_member_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.mission_crew_assignments a
      where a.mission_id = p_mission_id and a.crew_member_id = p_crew_member_id and a.status = 'active')
    and exists (
      select 1 from public.mission_memberships m
      where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active
        and ((m.role = 'crew_self' and m.crew_member_id = p_crew_member_id)
          or (m.role = 'ground_medical' and (m.crew_member_id is null or m.crew_member_id = p_crew_member_id))))
$$;

revoke all on function public.observation_sync_can_access(text, text) from public, anon;
grant execute on function public.observation_sync_can_access(text, text) to authenticated;

create policy observation_sync_scoped_select on public.observation_sync_events
  for select to authenticated using (public.observation_sync_can_access(mission_id, crew_member_id));

create or replace function public.observation_sync_reject_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'observation sync ledger is append-only' using errcode = '42501';
end $$;

create trigger observation_sync_no_update before update or delete on public.observation_sync_events
  for each row execute function public.observation_sync_reject_mutation();
create trigger observation_sync_no_truncate before truncate on public.observation_sync_events
  for each statement execute function public.observation_sync_reject_mutation();

create or replace function public.observation_sync_append_v1(
  p_mission_id text, p_crew_member_id text, p_provenance text, p_events jsonb, p_real_data_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_existing public.observation_sync_events;
  v_received timestamptz;
  v_detail text;
  v_inserted int := 0;
  v_status text;
  v_event_id text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_provenance is null or p_provenance not in ('synthetic','real') then raise exception 'invalid provenance' using errcode = '22023'; end if;
  if p_provenance = 'real' and p_real_data_confirmed is not true then
    raise exception 'explicit real-data confirmation required' using errcode = '42501';
  end if;
  if not public.observation_sync_can_access(p_mission_id, p_crew_member_id) then
    raise exception 'observation sync access denied for this mission and crew member' using errcode = '42501';
  end if;
  select m.status into v_status from public.missions m where m.id = p_mission_id for share;
  if v_status in ('completed','aborted') then raise exception 'mission closed for new events' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_events,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_events,'[]'::jsonb)) > 100 then
    raise exception 'invalid batch' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('observation_sync:' || p_mission_id || ':' || p_crew_member_id || ':' || p_provenance));

  for v_item in select value from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) loop
    v_detail := null;
    v_event_id := coalesce(v_item->>'eventId','');
    if jsonb_typeof(v_item) <> 'object' then v_detail := 'invalid item';
    elsif v_event_id !~ '^[A-Za-z0-9][A-Za-z0-9-]{7,127}:(entry|status)$' then v_detail := 'invalid event id';
    elsif v_event_id <> coalesce(v_item->>'observationId','') || ':' || coalesce(v_item->>'eventKind','') then v_detail := 'event id does not match observation id and kind';
    elsif coalesce(v_item->>'fingerprint','') !~ '^ofp-[0-9a-f]{64}$' then v_detail := 'invalid fingerprint';
    elsif coalesce(v_item->>'cipherAlg','') <> 'A256GCM-HKDF-SHA256-v1' then v_detail := 'unsupported cipher';
    end if;
    if v_detail is not null then
      v_out := v_out || jsonb_build_object('id', v_event_id, 'status','rejected','fingerprint',null,'received_at',null,'detail',v_detail);
      continue;
    end if;
    select * into v_existing from public.observation_sync_events t
      where t.mission_id = p_mission_id and t.crew_member_id = p_crew_member_id and t.provenance = p_provenance and t.event_id = v_event_id;
    if found then
      v_out := v_out || jsonb_build_object('id', v_event_id,
        'status', case when v_existing.fingerprint = v_item->>'fingerprint' then 'duplicate' else 'conflict' end,
        'fingerprint', v_existing.fingerprint, 'received_at', v_existing.received_at,
        'detail', case when v_existing.fingerprint = v_item->>'fingerprint' then null else 'same event id with different content; cloud event kept' end);
      continue;
    end if;
    begin
      insert into public.observation_sync_events(mission_id, crew_member_id, provenance, event_id, observation_id, event_kind,
        cipher_alg, key_version, iv, ciphertext, fingerprint, uploaded_by)
      values (p_mission_id, p_crew_member_id, p_provenance, v_event_id, v_item->>'observationId', v_item->>'eventKind',
        v_item->>'cipherAlg', (v_item->>'keyVersion')::int, v_item->>'iv', v_item->>'ciphertext', v_item->>'fingerprint', v_uid)
      returning received_at into v_received;
      v_inserted := v_inserted + 1;
      v_out := v_out || jsonb_build_object('id', v_event_id, 'status','inserted','fingerprint', v_item->>'fingerprint','received_at', v_received,'detail',null);
    exception when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation or numeric_value_out_of_range then
      v_out := v_out || jsonb_build_object('id', v_event_id, 'status','rejected','fingerprint',null,'received_at',null,'detail','failed server validation');
    end;
  end loop;

  if v_inserted > 0 then
    insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
    values (p_mission_id, v_uid, 'observation_sync_appended', 'observation_sync', p_crew_member_id,
      jsonb_build_object('provenance', p_provenance, 'inserted', v_inserted));
  end if;
  return v_out;
end $$;

create or replace function public.observation_sync_list_v1(
  p_mission_id text, p_crew_member_id text, p_provenance text, p_after_seq bigint, p_limit int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
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
end $$;

revoke all on function public.observation_sync_append_v1(text, text, text, jsonb, boolean) from public, anon;
revoke all on function public.observation_sync_list_v1(text, text, text, bigint, int) from public, anon;
revoke all on function public.observation_sync_reject_mutation() from public, anon, authenticated;
grant execute on function public.observation_sync_append_v1(text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.observation_sync_list_v1(text, text, text, bigint, int) to authenticated;
