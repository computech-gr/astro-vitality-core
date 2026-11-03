-- P36 Scientific Authorization & Independent Approval (PENDING — owner approval required before applying).
-- Additive only: one new append-only table and three caller-scoped functions plus a helper.
-- No existing table, policy, role, membership, function or record is changed. Nothing here
-- activates a catalog extension: activation stays in the code-reviewed catalog-extensions registry.
--
-- Security model
--  * Writes only through public.p36_sci_auth_append_v1 (SECURITY DEFINER, pinned search_path).
--    auth.uid() must be set. The stored actor is always auth.uid(); a payload actor that differs
--    is rejected. Client role claims are never trusted: the role is checked against ACTIVE
--    public.mission_memberships rows for the exact authority mission.
--      - kind 'decision' (APPROVE / REJECT / REQUEST_MORE_EVIDENCE): researcher membership only.
--      - kind 'recommendation': ground_medical or researcher membership (evidence, never approval).
--  * Independence: an APPROVE must reference a recommendation for the same mission and term,
--    authored by ANOTHER account, with the same canonical catalog ID, domain and exact unit text.
--  * Supersession: each decision must name the current latest decision for (mission, term) or none
--    if it is the first; anything else is reported 'stale'. Per-(mission, term) hash chain; a
--    unique prev_event_hash prevents forks under concurrency (plus a transaction advisory lock).
--  * Idempotent: (actor, submission_id) with identical payload bytes is 'duplicate'; different
--    bytes are a 'conflict' (reported, never overwritten).
--  * Append-only: no INSERT/UPDATE/DELETE/TRUNCATE grants; triggers reject UPDATE, DELETE and
--    TRUNCATE for every role, including service_role.
--  * Reads through RLS or public.p36_sci_auth_list_v1: active ground_medical or researcher
--    members of the authority mission only. Crew Self, operators, other missions and anon are denied.
--  * Content: reviewer declarations and catalog metadata only. No observation values, documents
--    or patient data. Payload bytes are verified with SHA-256 server-side.

create table public.p36_scientific_authorization_events (
  authority_mission_id text not null references public.missions(id),
  event_id text not null check (event_id ~ '^[0-9a-f]{64}$'),
  term_id text not null check (term_id ~ '^ubt-[0-9a-f]{8}$'),
  kind text not null check (kind in ('recommendation','decision')),
  action text not null check (action in ('RECOMMEND','APPROVE','REJECT','REQUEST_MORE_EVIDENCE')),
  submission_id uuid not null,
  payload_canonical text not null check (char_length(payload_canonical) between 2 and 32000),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  references_recommendation_id text check (references_recommendation_id is null or references_recommendation_id ~ '^[0-9a-f]{64}$'),
  supersedes_event_id text check (supersedes_event_id is null or supersedes_event_id ~ '^[0-9a-f]{64}$'),
  prev_event_hash text not null check (prev_event_hash = 'GENESIS' or prev_event_hash ~ '^[0-9a-f]{64}$'),
  event_hash text not null check (event_hash ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null,
  actor_role text not null check (actor_role in ('ground_medical','researcher')),
  received_at timestamptz not null default clock_timestamp(),
  received_seq bigint generated always as identity,
  primary key (authority_mission_id, event_id),
  unique (actor_user_id, submission_id),
  unique (authority_mission_id, term_id, prev_event_hash),
  unique (received_seq),
  check (event_id = payload_sha256),
  check ((kind = 'recommendation' and action = 'RECOMMEND' and references_recommendation_id is null and supersedes_event_id is null)
      or (kind = 'decision' and action in ('APPROVE','REJECT','REQUEST_MORE_EVIDENCE') and actor_role = 'researcher')),
  check (action = 'APPROVE' or references_recommendation_id is null),
  check (action <> 'APPROVE' or references_recommendation_id is not null)
);

comment on table public.p36_scientific_authorization_events is
  'P36 append-only scientific authorization ledger (recommendations + researcher final decisions). Never activates catalogs.';

create function public.p36_sci_auth_reject_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'p36 scientific authorization events are append-only' using errcode = '42501';
end $$;

create trigger p36_sci_auth_no_update before update on public.p36_scientific_authorization_events
  for each row execute function public.p36_sci_auth_reject_mutation();
create trigger p36_sci_auth_no_delete before delete on public.p36_scientific_authorization_events
  for each row execute function public.p36_sci_auth_reject_mutation();
create trigger p36_sci_auth_no_truncate before truncate on public.p36_scientific_authorization_events
  for each statement execute function public.p36_sci_auth_reject_mutation();

create function public.p36_sci_auth_has_role(p_mission_id text, p_roles text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.mission_memberships m
    where m.mission_id = p_mission_id and m.user_id = auth.uid() and m.active and m.role = any(p_roles))
$$;

create function public.p36_sci_auth_event_hash(p_prev text, p_sha text, p_actor uuid, p_role text, p_mission text, p_term text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(p_prev || '|' || p_sha || '|' || p_actor::text || '|' || p_role || '|' || p_mission || '|' || p_term, 'UTF8')), 'hex')
$$;

grant select on public.p36_scientific_authorization_events to authenticated;
grant select on public.p36_scientific_authorization_events to service_role;
revoke insert, update, delete, truncate on public.p36_scientific_authorization_events from public, anon, authenticated, service_role;
alter table public.p36_scientific_authorization_events enable row level security;

create policy "p36 authorization readable by mission reviewers"
  on public.p36_scientific_authorization_events for select to authenticated
  using (public.p36_sci_auth_has_role(authority_mission_id, array['ground_medical','researcher']));

create function public.p36_sci_auth_append_v1(
  p_mission_id text, p_submission_id uuid, p_payload_canonical text, p_payload_sha256 text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_p jsonb;
  v_kind text; v_action text; v_term text; v_role text;
  v_sha text;
  v_existing public.p36_scientific_authorization_events;
  v_rec public.p36_scientific_authorization_events;
  v_rec_p jsonb;
  v_latest text;
  v_prev text;
  v_hash text;
  v_decided timestamptz;
  v_row public.p36_scientific_authorization_events;
  v_field text;
  v_rej text := null;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_mission_id is null or p_submission_id is null or p_payload_canonical is null then
    raise exception 'missing arguments' using errcode = '22023';
  end if;
  if char_length(p_payload_canonical) not between 2 and 32000 then raise exception 'payload size' using errcode = '22023'; end if;
  v_sha := encode(sha256(convert_to(p_payload_canonical, 'UTF8')), 'hex');
  if p_payload_sha256 is distinct from v_sha then raise exception 'payload digest mismatch' using errcode = '22023'; end if;
  begin
    v_p := p_payload_canonical::jsonb;
  exception when others then
    raise exception 'payload is not JSON' using errcode = '22023';
  end;
  if jsonb_typeof(v_p) <> 'object' then raise exception 'payload must be an object' using errcode = '22023'; end if;

  v_kind := v_p->>'kind'; v_action := v_p->>'action'; v_term := v_p->>'termId'; v_role := v_p->>'actorRole';
  if v_kind is null or v_kind not in ('recommendation','decision') then raise exception 'invalid kind' using errcode = '22023'; end if;

  -- Authorization first: derived only from auth.uid() and active memberships.
  if v_kind = 'decision' then
    if not public.p36_sci_auth_has_role(p_mission_id, array['researcher']) then
      raise exception 'final scientific decisions require an active researcher membership' using errcode = '42501';
    end if;
    if v_role is distinct from 'researcher' then v_rej := 'decision actorRole must be researcher'; end if;
  else
    if v_role is null or v_role not in ('ground_medical','researcher') or not public.p36_sci_auth_has_role(p_mission_id, array[v_role]) then
      raise exception 'recommendations require an active ground_medical or researcher membership' using errcode = '42501';
    end if;
  end if;

  -- Idempotency on (actor, submission)
  select * into v_existing from public.p36_scientific_authorization_events
    where actor_user_id = v_uid and submission_id = p_submission_id;
  if found then
    if v_existing.payload_sha256 = v_sha and v_existing.authority_mission_id = p_mission_id then
      return jsonb_build_object('status','duplicate','event_id',v_existing.event_id,'event_hash',v_existing.event_hash,
        'received_at',v_existing.received_at,'received_seq',v_existing.received_seq);
    end if;
    return jsonb_build_object('status','conflict','detail','submission id already used with different content');
  end if;

  -- Structural rules (the server function additionally validates against the bundled dossiers).
  if v_rej is null and v_p->>'schema' is distinct from 'mitochondria.p36-scientific-authorization.v1' then v_rej := 'unsupported schema'; end if;
  if v_rej is null and (v_term is null or v_term !~ '^ubt-[0-9a-f]{8}$') then v_rej := 'invalid term'; end if;
  if v_rej is null and v_p->>'actorUserId' is distinct from v_uid::text then v_rej := 'payload actor must equal auth.uid()'; end if;
  if v_rej is null and v_p->>'authorityMissionId' is distinct from p_mission_id then v_rej := 'payload mission mismatch'; end if;
  if v_rej is null and v_p->>'submissionId' is distinct from p_submission_id::text then v_rej := 'payload submission mismatch'; end if;
  if v_rej is null and (v_p->'researchOnly' is distinct from 'true'::jsonb or v_p->'activationApplied' is distinct from 'false'::jsonb) then
    v_rej := 'authorization events never activate catalogs'; end if;
  if v_rej is null and ((v_kind = 'recommendation' and v_action is distinct from 'RECOMMEND')
      or (v_kind = 'decision' and (v_action is null or v_action not in ('APPROVE','REJECT','REQUEST_MORE_EVIDENCE')))) then
    v_rej := 'action does not match kind'; end if;
  if v_rej is null then
    begin
      v_decided := (v_p->>'decidedAt')::timestamptz;
    exception when others then v_decided := null;
    end;
    if v_decided is null or abs(extract(epoch from (clock_timestamp() - v_decided))) > 600 then v_rej := 'decidedAt must be the current server time'; end if;
  end if;
  if v_rej is null then
    foreach v_field in array array['reviewerName','reviewerQualification','rationale','catalogVersion','sourceFingerprint','termDossierFingerprint'] loop
      if char_length(btrim(coalesce(v_p->>v_field, ''))) < 2 then v_rej := v_field || ' is required'; exit; end if;
    end loop;
  end if;
  if v_rej is null and char_length(btrim(coalesce(v_p->>'rationale',''))) < 20 then v_rej := 'rationale under 20 characters'; end if;
  if v_rej is null and (jsonb_typeof(v_p->'sourceRefs') is distinct from 'array' or jsonb_array_length(v_p->'sourceRefs') = 0) then
    v_rej := 'source evidence references required'; end if;
  if v_rej is null and (v_kind = 'recommendation' or v_action = 'APPROVE') then
    if char_length(btrim(coalesce(v_p->>'canonicalCatalogId',''))) = 0 or char_length(coalesce(v_p->>'validatedUnit','')) = 0
       or char_length(btrim(coalesce(v_p->>'domain',''))) = 0 then
      v_rej := 'canonical ID, domain and unit are required';
    elsif v_p->>'validatedUnit' is distinct from v_p->>'sourceUnit' then
      v_rej := 'unit must equal the exact source unit text';
    end if;
  end if;
  if v_rej is null and v_kind = 'recommendation' and (v_p->'recommendationEventId' <> 'null'::jsonb or v_p->'supersedesEventId' <> 'null'::jsonb) then
    v_rej := 'recommendations do not reference other events'; end if;
  if v_rej is null and v_kind = 'decision' then
    if v_p->'independenceConfirmed' is distinct from 'true'::jsonb then v_rej := 'independence must be confirmed';
    elsif char_length(btrim(coalesce(v_p->>'conflictOfInterestDeclaration',''))) < 10 then v_rej := 'conflict-of-interest declaration required';
    end if;
  end if;
  if v_rej is null and v_action = 'APPROVE' then
    foreach v_field in array array['specimenOrAcquisitionContext','methodOrInstrument','protocol','protocolVersion'] loop
      if char_length(btrim(coalesce(v_p->>v_field, ''))) < 3 then v_rej := v_field || ' is required for approval'; exit; end if;
    end loop;
    if v_rej is null and (jsonb_typeof(v_p->'validationEvidenceRefs') is distinct from 'array' or jsonb_array_length(v_p->'validationEvidenceRefs') = 0) then
      v_rej := 'validation evidence required for approval'; end if;
  end if;
  if v_rej is null and v_action <> 'APPROVE' and v_p->'recommendationEventId' <> 'null'::jsonb then
    v_rej := 'only approvals reference a recommendation'; end if;
  if v_rej is not null then
    return jsonb_build_object('status','rejected','detail',v_rej);
  end if;

  -- Serialize per (mission, term)
  perform pg_advisory_xact_lock(hashtext('p36_sci_auth|' || p_mission_id || '|' || v_term));

  if v_action = 'APPROVE' then
    select * into v_rec from public.p36_scientific_authorization_events
      where authority_mission_id = p_mission_id and event_id = v_p->>'recommendationEventId';
    if not found or v_rec.kind <> 'recommendation' or v_rec.term_id <> v_term then
      return jsonb_build_object('status','rejected','detail','approval must reference a recommendation for this term and mission');
    end if;
    if v_rec.actor_user_id = v_uid then
      return jsonb_build_object('status','rejected','detail','self-approval is not permitted');
    end if;
    v_rec_p := v_rec.payload_canonical::jsonb;
    if v_rec_p->>'canonicalCatalogId' is distinct from v_p->>'canonicalCatalogId'
       or v_rec_p->>'validatedUnit' is distinct from v_p->>'validatedUnit'
       or v_rec_p->>'domain' is distinct from v_p->>'domain' then
      return jsonb_build_object('status','rejected','detail','approval contradicts the referenced recommendation');
    end if;
  end if;

  if v_kind = 'decision' then
    select event_id into v_latest from public.p36_scientific_authorization_events
      where authority_mission_id = p_mission_id and term_id = v_term and kind = 'decision'
      order by received_seq desc limit 1;
    if (v_latest is null and v_p->'supersedesEventId' <> 'null'::jsonb)
       or (v_latest is not null and v_p->>'supersedesEventId' is distinct from v_latest) then
      return jsonb_build_object('status','stale','detail','another decision is current for this term','current_event_id',v_latest);
    end if;
  end if;

  select event_hash into v_prev from public.p36_scientific_authorization_events
    where authority_mission_id = p_mission_id and term_id = v_term order by received_seq desc limit 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  v_hash := public.p36_sci_auth_event_hash(v_prev, v_sha, v_uid, v_role, p_mission_id, v_term);

  insert into public.p36_scientific_authorization_events(
    authority_mission_id, event_id, term_id, kind, action, submission_id, payload_canonical, payload_sha256,
    references_recommendation_id, supersedes_event_id, prev_event_hash, event_hash, actor_user_id, actor_role)
  values (p_mission_id, v_sha, v_term, v_kind, v_action, p_submission_id, p_payload_canonical, v_sha,
    nullif(v_p->>'recommendationEventId',''), nullif(v_p->>'supersedesEventId',''), v_prev, v_hash, v_uid, v_role)
  on conflict (authority_mission_id, event_id) do nothing
  returning * into v_row;
  if v_row.event_id is null then
    return jsonb_build_object('status','conflict','detail','identical payload already recorded under another submission');
  end if;
  return jsonb_build_object('status','inserted','event_id',v_row.event_id,'event_hash',v_row.event_hash,
    'received_at',v_row.received_at,'received_seq',v_row.received_seq);
end $$;

create function public.p36_sci_auth_list_v1(p_mission_id text, p_after_seq bigint, p_limit int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_limit int := least(greatest(coalesce(p_limit, 500), 1), 1000);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not public.p36_sci_auth_has_role(p_mission_id, array['ground_medical','researcher']) then
    raise exception 'mission access denied' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.received_seq) from (
    select * from public.p36_scientific_authorization_events e
    where e.authority_mission_id = p_mission_id and e.received_seq > coalesce(p_after_seq, 0)
    order by e.received_seq limit v_limit) t), '[]'::jsonb);
end $$;

revoke all on function public.p36_sci_auth_append_v1(text, uuid, text, text) from public, anon;
revoke all on function public.p36_sci_auth_list_v1(text, bigint, int) from public, anon;
revoke all on function public.p36_sci_auth_has_role(text, text[]) from public, anon;
revoke all on function public.p36_sci_auth_reject_mutation() from public, anon, authenticated;
grant execute on function public.p36_sci_auth_append_v1(text, uuid, text, text) to authenticated;
grant execute on function public.p36_sci_auth_list_v1(text, bigint, int) to authenticated;
grant execute on function public.p36_sci_auth_has_role(text, text[]) to authenticated;
grant execute on function public.p36_sci_auth_event_hash(text, text, uuid, text, text, text) to authenticated;
