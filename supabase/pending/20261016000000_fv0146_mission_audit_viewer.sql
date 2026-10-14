-- FV-01.4.6 Secure Mission Audit Viewer — STAGED, owner approval required before production.
-- Forward-only and additive: one read-only function. No table, policy, grant on tables or data change.
-- Browser accounts have no SELECT grant on public.audit_events; this function is the only read path.
-- Authorization: active mission_operator membership in the requested mission (server-side).
-- Redaction (server-side, authoritative; the browser only repeats it as defense in depth):
--   * raw audit_events.id, target_id and actor_user_id are never returned. Entries carry an opaque
--     per-mission "ref" (HMAC) and actors are "self" or a per-mission pseudonym.
--   * metadata values are returned only when they belong to an explicitly enumerated value set
--     verified against every producer in supabase/migrations (no free text, no numbers outside range).
--   * action / target_type / actor_role are returned only when they are lower-case identifiers.
-- Pagination (revision 3): compact, versioned, HMAC-SHA256-authenticated cursor; no encryption.
--   Keyset order is (occurred_at desc, ref desc) where ref = HMAC(record id) is already the value shown
--   to the browser, so the cursor carries only data the caller can already see (timestamp + ref) and
--   no internal record identifier. Confidentiality is therefore not needed; integrity is.
--   Format: v3.<base64url(json{v,m,f,t,r})>.<hex HMAC>, bound to version, mission, a fingerprint of the
--   exact normalized filters and the position. Comparison of tags is over equal-length hex strings.
-- Keys: domain-separated HMAC keys (cursor, entry ref, actor pseudonym) derived from the mission's
--   server-only secret in public.mission_research_keys, which no browser role can read.
-- Revision 2: removed raw IDs, free-text reason and unconstrained kind/outcome keys.
-- Revision 3: replaced the custom deterministic-IV AES-CBC cursor with the HMAC cursor above and
--   replaced unkeyed SHA-256 actor pseudonyms with keyed HMAC pseudonyms.

create or replace function public.get_mission_audit_log(
  p_mission_id text,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_action text default null,
  p_outcome text default null,
  p_search text default null,
  p_limit integer default 25,
  p_cursor text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_secret bytea;
  v_mac_key bytea;
  v_ref_key bytea;
  v_actor_key bytea;
  v_fp text;
  v_before_at timestamptz;
  v_before_ref text;
  v_parts text[];
  v_payload jsonb;
  v_rows jsonb;
  v_more boolean;
  v_last_at timestamptz;
  v_last_ref text;
  v_body text;
  v_next text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_mission_id is null or not public.has_mission_role(p_mission_id, array['mission_operator']) then
    raise exception 'mission audit access denied';
  end if;
  if p_outcome is not null and p_outcome not in ('success', 'refused') then raise exception 'invalid outcome filter'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then raise exception 'invalid date range'; end if;
  if v_search is not null and length(v_search) > 80 then raise exception 'search text too long'; end if;
  if p_action is not null and p_action !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception 'invalid action filter'; end if;

  select k.pseudonym_salt into v_secret from public.mission_research_keys k where k.mission_id = p_mission_id;
  if v_secret is null then raise exception 'mission audit log unavailable'; end if;
  v_mac_key := extensions.digest(v_secret || convert_to('fv0146:cursor:mac', 'utf8'), 'sha256');
  v_ref_key := extensions.digest(v_secret || convert_to('fv0146:entry:ref', 'utf8'), 'sha256');
  v_actor_key := extensions.digest(v_secret || convert_to('fv0146:actor:pseudonym', 'utf8'), 'sha256');
  -- Filter fingerprint: a cursor is only valid for the mission and filters it was issued for.
  v_fp := encode(extensions.digest(concat_ws('|', 'v3', p_mission_id, coalesce(p_from::text, ''), coalesce(p_to::text, ''),
            coalesce(p_action, ''), coalesce(p_outcome, ''), coalesce(lower(v_search), '')), 'sha256'), 'hex');

  if p_cursor is not null then
    begin
      if length(p_cursor) > 400 then raise exception 'x'; end if;
      v_parts := string_to_array(p_cursor, '.');
      if array_length(v_parts, 1) <> 3 or v_parts[1] <> 'v3' or v_parts[3] !~ '^[0-9a-f]{64}$'
         or v_parts[2] !~ '^[A-Za-z0-9_-]+$' then raise exception 'x'; end if;
      if encode(extensions.hmac(convert_to('v3.' || v_parts[2], 'utf8'), v_mac_key, 'sha256'), 'hex') <> v_parts[3]
        then raise exception 'x'; end if;
      v_payload := convert_from(decode(rpad(translate(v_parts[2], '-_', '+/'),
                     ((length(v_parts[2]) + 3) / 4) * 4, '='), 'base64'), 'utf8')::jsonb;
      if v_payload ->> 'v' <> '3' or v_payload ->> 'm' <> p_mission_id or v_payload ->> 'f' <> v_fp
         or (v_payload ->> 'r') !~ '^[0-9a-f]{32}$' then raise exception 'x'; end if;
      v_before_at := (v_payload ->> 't')::timestamptz;
      v_before_ref := v_payload ->> 'r';
      if v_before_at is null then raise exception 'x'; end if;
    exception when others then
      raise exception 'invalid cursor';
    end;
  end if;

  with base as (
    select a.occurred_at,
      left(encode(extensions.hmac(convert_to(a.id::text, 'utf8'), v_ref_key, 'sha256'), 'hex'), 32) as ref, a.action, a.target_type, a.actor_user_id, a.metadata,
      case when a.action ~ '(denied|rejected|refused)' or a.metadata ? 'reason' then 'refused' else 'success' end as outcome
    from public.audit_events a
    where a.mission_id = p_mission_id
      and (p_from is null or a.occurred_at >= p_from)
      and (p_to is null or a.occurred_at < p_to)
      and (p_action is null or a.action = p_action)
      and (v_search is null
        or strpos(lower(a.action), lower(v_search)) > 0
        or strpos(lower(a.target_type), lower(v_search)) > 0)
  ), filtered as (
    select * from base where (p_outcome is null or outcome = p_outcome)
      and (v_before_at is null or (occurred_at, ref) < (v_before_at, v_before_ref))
    order by occurred_at desc, ref desc
    limit v_limit + 1
  ), page as (
    select *, row_number() over (order by occurred_at desc, ref desc) as rn from filtered
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'ref', f.ref,
      'occurred_at', f.occurred_at,
      'action', case when f.action ~ '^[a-z][a-z0-9_]{0,63}$' then f.action else 'other' end,
      'outcome', f.outcome,
      'target_type', case when f.target_type ~ '^[a-z][a-z0-9_]{0,63}$' then f.target_type else 'other' end,
      'actor', case when f.actor_user_id = v_uid then 'self'
        else 'member-' || left(encode(extensions.hmac(convert_to(f.actor_user_id::text, 'utf8'), v_actor_key, 'sha256'), 'hex'), 8) end,
      'actor_role', (select string_agg(m.role, ',' order by m.role) from public.mission_memberships m
        where m.mission_id = p_mission_id and m.user_id = f.actor_user_id
          and m.role in ('crew_self', 'ground_medical', 'mission_operator', 'researcher')),
      'details', (select coalesce(jsonb_object_agg(d.k, d.v), '{}'::jsonb) from (
          select k, f.metadata -> k as v from jsonb_object_keys(f.metadata) k
          where case
            when k in ('status', 'previous_status') then jsonb_typeof(f.metadata -> k) = 'string'
              and f.metadata ->> k in ('planning', 'active', 'completed', 'aborted', 'candidate', 'inactive')
            when k = 'role' then jsonb_typeof(f.metadata -> k) = 'string'
              and f.metadata ->> k in ('crew_self', 'ground_medical', 'mission_operator', 'researcher')
            when k = 'classification' then jsonb_typeof(f.metadata -> k) = 'string'
              and f.metadata ->> k in ('synthetic', 'deidentified', 'mission_sensitive', 'medical_sensitive')
            when k = 'policy' then jsonb_typeof(f.metadata -> k) = 'string'
              and f.metadata ->> k in ('fv01-v1', 'p28-v1')
            when k = 'reason' then jsonb_typeof(f.metadata -> k) = 'string'
              and f.metadata ->> k in ('approval_required', 'approver_cannot_be_recipient', 'crew_self_binding_conflict',
                'identifier_unavailable', 'invite_unavailable', 'inviter_cannot_approve', 'minimum_cohort_not_met',
                'minimum_event_volume_not_met', 'mission_not_closed', 'not_pending', 'recipient_cannot_approve',
                'recipient_mismatch', 'recipient_unbound', 'role_combination_not_permitted', 'self_issued_invite',
                'self_reactivation', 'snapshot_unavailable', 'wrong_recipient')
            when k = 'expires_in_hours' then jsonb_typeof(f.metadata -> k) = 'number'
              and (f.metadata ->> k)::numeric between 1 and 8760 and (f.metadata ->> k)::numeric = trunc((f.metadata ->> k)::numeric)
            when k in ('external_ref_present', 'bootstrap_one_time', 'creator_operator') then jsonb_typeof(f.metadata -> k) = 'boolean'
            else false
          end) d)
    ) order by f.occurred_at desc, f.ref desc) filter (where f.rn <= v_limit), '[]'::jsonb),
    count(*) > v_limit,
    (array_agg(f.occurred_at order by f.occurred_at desc, f.ref desc) filter (where f.rn <= v_limit))[v_limit],
    (array_agg(f.ref order by f.occurred_at desc, f.ref desc) filter (where f.rn <= v_limit))[v_limit]
  into v_rows, v_more, v_last_at, v_last_ref
  from page f;

  if coalesce(v_more, false) and v_last_ref is not null then
    v_body := translate(rtrim(replace(encode(convert_to(jsonb_build_object('v', '3', 'm', p_mission_id, 'f', v_fp,
                't', v_last_at, 'r', v_last_ref)::text, 'utf8'), 'base64'), E'\n', ''), '='), '+/', '-_');
    v_next := 'v3.' || v_body || '.' || encode(extensions.hmac(convert_to('v3.' || v_body, 'utf8'), v_mac_key, 'sha256'), 'hex');
  end if;

  return jsonb_build_object(
    'entries', coalesce(v_rows, '[]'::jsonb),
    'has_more', coalesce(v_more, false),
    'next_cursor', v_next,
    'actions', (select coalesce(jsonb_agg(distinct a.action), '[]'::jsonb) from public.audit_events a
                where a.mission_id = p_mission_id and a.action ~ '^[a-z][a-z0-9_]{0,63}$'),
    'timezone', 'UTC'
  );
end;
$$;

revoke all on function public.get_mission_audit_log(text, timestamptz, timestamptz, text, text, text, integer, text) from public, anon;
grant execute on function public.get_mission_audit_log(text, timestamptz, timestamptz, text, text, text, integer, text) to authenticated;
comment on function public.get_mission_audit_log(text, timestamptz, timestamptz, text, text, text, integer, text)
  is 'FV-01.4.6 r2: read-only, operator-only, mission-scoped, server-redacted audit log reader with versioned HMAC-authenticated cursor (r3).';
