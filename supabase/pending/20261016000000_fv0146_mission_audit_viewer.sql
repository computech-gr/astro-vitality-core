-- FV-01.4.6 Secure Mission Audit Viewer — STAGED, owner approval required before production.
-- Forward-only and additive: one read-only function. No table, policy, grant on tables or data change.
-- Browser accounts have no SELECT grant on public.audit_events; this function is the only read path.
-- Authorization: active mission_operator membership in the requested mission (server-side).
-- Redaction: metadata is reduced to an allow-list of non-secret operational keys; actor IDs are never
-- returned (only "self" or a per-mission pseudonymous reference); no codes, hashes, emails, names or payloads.

create or replace function public.get_mission_audit_log(
  p_mission_id text,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_action text default null,
  p_outcome text default null,
  p_search text default null,
  p_limit integer default 25,
  p_before_at timestamptz default null,
  p_before_id uuid default null
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
  v_rows jsonb;
  v_more boolean;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_mission_id is null or not public.has_mission_role(p_mission_id, array['mission_operator']) then
    raise exception 'mission audit access denied';
  end if;
  if p_outcome is not null and p_outcome not in ('success', 'refused') then raise exception 'invalid outcome filter'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then raise exception 'invalid date range'; end if;
  if v_search is not null and length(v_search) > 80 then raise exception 'search text too long'; end if;
  if (p_before_at is null) <> (p_before_id is null) then raise exception 'invalid cursor'; end if;

  with base as (
    select a.id, a.occurred_at, a.action, a.target_type, a.target_id, a.actor_user_id, a.metadata,
      case when a.action ~ '(denied|rejected|refused)' or a.metadata ? 'reason' then 'refused' else 'success' end as outcome
    from public.audit_events a
    where a.mission_id = p_mission_id
      and (p_from is null or a.occurred_at >= p_from)
      and (p_to is null or a.occurred_at < p_to)
      and (p_action is null or a.action = p_action)
      and (p_before_at is null or (a.occurred_at, a.id) < (p_before_at, p_before_id))
      and (v_search is null
        or strpos(lower(a.action), lower(v_search)) > 0
        or strpos(lower(a.target_type), lower(v_search)) > 0)
  ), filtered as (
    select * from base where p_outcome is null or outcome = p_outcome
    order by occurred_at desc, id desc
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id,
      'occurred_at', f.occurred_at,
      'action', f.action,
      'outcome', f.outcome,
      'target_type', f.target_type,
      'actor', case when f.actor_user_id = v_uid then 'self'
        else 'member-' || left(encode(extensions.digest(p_mission_id || ':' || f.actor_user_id::text, 'sha256'), 'hex'), 8) end,
      'actor_role', (select string_agg(m.role, ',' order by m.role) from public.mission_memberships m
        where m.mission_id = p_mission_id and m.user_id = f.actor_user_id),
      'details', (select coalesce(jsonb_object_agg(k, f.metadata -> k), '{}'::jsonb)
        from jsonb_object_keys(f.metadata) k
        where k in ('previous_status', 'status', 'role', 'kind', 'classification', 'expires_in_hours',
                    'external_ref_present', 'bootstrap_one_time', 'creator_operator', 'reason', 'policy', 'outcome')
          and jsonb_typeof(f.metadata -> k) in ('string', 'number', 'boolean'))
    ) order by f.occurred_at desc, f.id desc), '[]'::jsonb)
  into v_rows
  from (select * from filtered order by occurred_at desc, id desc limit v_limit) f;

  select count(*) > v_limit into v_more from (
    select 1 from public.audit_events a
    where a.mission_id = p_mission_id
      and (p_from is null or a.occurred_at >= p_from)
      and (p_to is null or a.occurred_at < p_to)
      and (p_action is null or a.action = p_action)
      and (p_before_at is null or (a.occurred_at, a.id) < (p_before_at, p_before_id))
      and (v_search is null or strpos(lower(a.action), lower(v_search)) > 0 or strpos(lower(a.target_type), lower(v_search)) > 0)
      and (p_outcome is null or (case when a.action ~ '(denied|rejected|refused)' or a.metadata ? 'reason' then 'refused' else 'success' end) = p_outcome)
    limit v_limit + 1) x;

  return jsonb_build_object(
    'entries', coalesce(v_rows, '[]'::jsonb),
    'has_more', coalesce(v_more, false),
    'actions', (select coalesce(jsonb_agg(distinct a.action), '[]'::jsonb) from public.audit_events a where a.mission_id = p_mission_id),
    'timezone', 'UTC'
  );
end;
$$;

revoke all on function public.get_mission_audit_log(text, timestamptz, timestamptz, text, text, text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_mission_audit_log(text, timestamptz, timestamptz, text, text, text, integer, timestamptz, uuid) to authenticated;
comment on function public.get_mission_audit_log(text, timestamptz, timestamptz, text, text, text, integer, timestamptz, uuid)
  is 'FV-01.4.6: read-only, operator-only, mission-scoped, redacted audit log reader.';
