-- P36.4: staged, NEVER applied to the shared Cloud database without explicit owner approval.
-- Synthetic-only Crew Self submission path for the P36.2B10 review schema.
-- Depends on 20261017000000_p36_biomarker_review_foundation.sql (applied first).
-- Grants EXECUTE on ONE function to authenticated; tables stay forced-RLS deny-all
-- with no table grants. No storage bucket, no original documents, no approval path.

-- 1. Exact metric/unit allowlist (reference data from the P36.1 registry).
create table if not exists public.p36_metric_unit_catalog (
  metric_id text primary key check (char_length(metric_id) between 1 and 128),
  unit text not null check (char_length(unit) between 1 and 64)
);
alter table public.p36_metric_unit_catalog enable row level security;
alter table public.p36_metric_unit_catalog force row level security;
revoke all on public.p36_metric_unit_catalog from public, anon, authenticated;
drop policy if exists p36_catalog_deny_all on public.p36_metric_unit_catalog;
create policy p36_catalog_deny_all on public.p36_metric_unit_catalog
  as restrictive for all to public using (false) with check (false);
-- Generated from data/scientific/p36-biomarker-source-registry.v1.json sha256=ce2271260428b152778ad67d1cad36306a7913dd3a4442abe3aa11ea65297148 (96 metrics with a recorded unit)
insert into public.p36_metric_unit_catalog(metric_id, unit) values
  ('cv-001','bpm'),
  ('cv-002','bpm'),
  ('cv-003','bpm'),
  ('cv-004','bpm διαφορά'),
  ('cv-005','mmHg'),
  ('cv-006','mmHg'),
  ('cv-007','mmHg'),
  ('cv-008','mmHg'),
  ('cv-009','mL/beat'),
  ('cv-010','L/min'),
  ('cv-011','L/min/m²'),
  ('cv-012','dyn·s/cm⁵'),
  ('cv-013','mmHg'),
  ('cv-014','mL / % change'),
  ('cv-015','mL'),
  ('cv-016','L/min'),
  ('cv-017','mL'),
  ('cv-018','mL'),
  ('cv-019','g'),
  ('cv-020','μεθοδοεξαρτώμενο'),
  ('cv-021','%'),
  ('cv-022','ratio'),
  ('cv-023','ratio'),
  ('cv-024','waveform'),
  ('cv-025','ms'),
  ('cv-026','ms'),
  ('cv-027','ms'),
  ('cv-028','ms² ή normalized'),
  ('cv-029','ms² ή normalized'),
  ('cv-030','ms'),
  ('cv-031','ms'),
  ('cv-032','ms'),
  ('cv-033','% ή /day'),
  ('cv-034','% ή /day'),
  ('cv-035','% time'),
  ('cv-036','event'),
  ('cv-037','mm'),
  ('cv-038','mmHg'),
  ('cv-039','bpm'),
  ('cv-040','min/event'),
  ('cv-041','ms/mmHg'),
  ('cv-042','cm/s'),
  ('cv-043','categorical'),
  ('cv-044','mm'),
  ('cv-045','m/s'),
  ('cv-046','%'),
  ('cv-047','%/mmHg'),
  ('cv-048','Agatston'),
  ('cv-049','categorical'),
  ('cv-050','method-specific'),
  ('cv-051','forward/stagnant/reverse'),
  ('cv-052','cm/s'),
  ('cv-053','1–4'),
  ('cv-054','yes/no'),
  ('cv-055','grade'),
  ('cv-056','yes/no'),
  ('cv-057','mg/L FEU ή DDU'),
  ('cv-058','10⁹/L'),
  ('cv-059','g/L'),
  ('cv-060','s/INR'),
  ('cv-061','s'),
  ('cv-062','assay'),
  ('cv-063','mL/kg/min'),
  ('cv-064','W'),
  ('cv-065','%'),
  ('cv-066','mmHg'),
  ('cv-067','/min'),
  ('cv-068','mmHg'),
  ('cv-069','mmol/L'),
  ('cv-070','mmol/L'),
  ('cv-071','mmol/L'),
  ('cv-072','mmol/L'),
  ('cv-073','mmol/L'),
  ('cv-074','mmol/L'),
  ('cv-075','g/dL'),
  ('cv-076','%'),
  ('cv-077','assay-specific'),
  ('cv-078','assay-specific'),
  ('cv-079','assay-specific'),
  ('cv-080','pg/mL'),
  ('cv-081','pg/mL'),
  ('cv-082','assay-specific'),
  ('cv-083','mg/dL'),
  ('cv-084','μIU/mL'),
  ('cv-085','%'),
  ('cv-086','mg/dL'),
  ('cv-087','mg/dL'),
  ('cv-088','mg/dL'),
  ('cv-089','mg/dL'),
  ('cv-090','nmol/L ή mg/dL'),
  ('cv-091','mg/L'),
  ('cv-092','pg/mL'),
  ('cv-093','pg/mL'),
  ('cv-094','assay-specific'),
  ('cv-095','assay-specific'),
  ('cv-096','assay-specific')
on conflict (metric_id) do nothing;

-- 2. Idempotency + request fingerprint on batches (nullable: additive only).
alter table public.p36_biomarker_review_batches
  add column if not exists idempotency_key text,
  add column if not exists request_payload_hash text;
alter table public.p36_biomarker_review_batches drop constraint if exists p36_idempotency_format;
alter table public.p36_biomarker_review_batches add constraint p36_idempotency_format check (
  (idempotency_key is null and request_payload_hash is null)
  or (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$' and request_payload_hash ~ '^[a-f0-9]{64}$'));
create unique index if not exists p36_batches_idempotency
  on public.p36_biomarker_review_batches(submitted_by_membership_id, idempotency_key)
  where idempotency_key is not null;

-- Submission fingerprints are as immutable as the B10 provenance columns.
create or replace function public.p36_freeze_submission_fields()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.idempotency_key is distinct from old.idempotency_key
     or new.request_payload_hash is distinct from old.request_payload_hash then
    raise exception 'P36 submission idempotency evidence is immutable';
  end if;
  return new;
end $$;
revoke all on function public.p36_freeze_submission_fields() from public, anon, authenticated;
drop trigger if exists p36_submission_fields_frozen on public.p36_biomarker_review_batches;
create trigger p36_submission_fields_frozen before update on public.p36_biomarker_review_batches
  for each row execute function public.p36_freeze_submission_fields();

-- Items are write-once: no edits or deletes after submission.
create or replace function public.p36_reject_item_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'P36 submitted review items are immutable';
end $$;
revoke all on function public.p36_reject_item_mutation() from public, anon, authenticated;
drop trigger if exists p36_items_immutable on public.p36_biomarker_review_items;
create trigger p36_items_immutable before update on public.p36_biomarker_review_items
  for each row execute function public.p36_reject_item_mutation();

-- 3. The ONLY write path. Identity = auth.uid() from the verified JWT; never a parameter.
create or replace function public.p36_submit_synthetic_review_batch(
  p_mission_id text,
  p_crew_member_id text,
  p_observed_on date,
  p_source_filename text,
  p_source_sha256 text,
  p_items jsonb,
  p_idempotency_key text,
  p_synthetic_attestation boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_member public.mission_memberships%rowtype;
  v_mission_status text;
  v_existing public.p36_biomarker_review_batches%rowtype;
  v_batch uuid;
  v_item jsonb;
  v_seen text[] := '{}';
  v_count int;
  v_hash text;
  v_canonical jsonb;
begin
  if v_uid is null then
    raise exception 'P36 submission requires an authenticated user' using errcode = '42501';
  end if;
  if p_synthetic_attestation is distinct from true then
    raise exception 'P36 synthetic-only attestation is required' using errcode = '22023';
  end if;
  if p_mission_id is null or p_crew_member_id is null or p_observed_on is null
     or p_observed_on > current_date or p_observed_on < date '2000-01-01' then
    raise exception 'P36 mission, crew member and a valid observation date are required' using errcode = '22023';
  end if;
  if p_source_filename is null or char_length(p_source_filename) not between 1 and 255
     or p_source_filename ~ '[\x00-\x1f/\\]' then
    raise exception 'P36 invalid source filename' using errcode = '22023';
  end if;
  if p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'P36 invalid source SHA-256' using errcode = '22023';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'P36 invalid idempotency key' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'P36 between 1 and 100 observations are required' using errcode = '22023';
  end if;

  -- Current Crew Self authority for exactly this mission + crew member.
  -- FOR SHARE serializes with concurrent revocation (revocation-first => refused).
  select * into v_member from public.mission_memberships
    where mission_id = p_mission_id and crew_member_id = p_crew_member_id
      and user_id = v_uid and role = 'crew_self' and active
    for share;
  if not found then
    raise exception 'P36 active crew_self membership for this mission and crew member is required' using errcode = '42501';
  end if;
  select status into v_mission_status from public.missions where id = p_mission_id for share;
  if v_mission_status is null or v_mission_status in ('completed', 'aborted') then
    raise exception 'P36 mission is not open for submissions' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mission_crew_assignments
                 where mission_id = p_mission_id and crew_member_id = p_crew_member_id
                   and status = 'active') then
    raise exception 'P36 crew member is not actively assigned to this mission' using errcode = '42501';
  end if;

  -- Exact metric/unit validation against the catalog; no conversion, no ranges.
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(v_item) k)
          <> array['metricId','sourceExcerpt','unit','value']
       or jsonb_typeof(v_item->'metricId') <> 'string' or jsonb_typeof(v_item->'value') <> 'string'
       or jsonb_typeof(v_item->'unit') <> 'string' or jsonb_typeof(v_item->'sourceExcerpt') <> 'string' then
      raise exception 'P36 observation shape is invalid' using errcode = '22023';
    end if;
    if (v_item->>'value') !~ '^[+-]?(\d+(\.\d+)?|\.\d+)$' or char_length(v_item->>'value') > 32 then
      raise exception 'P36 observation value must be a plain decimal number' using errcode = '22023';
    end if;
    if char_length(v_item->>'sourceExcerpt') not between 1 and 500 then
      raise exception 'P36 source excerpt is required (max 500 characters)' using errcode = '22023';
    end if;
    if (v_item->>'metricId') = any(v_seen) then
      raise exception 'P36 duplicate metric in one submission' using errcode = '23505';
    end if;
    if not exists (select 1 from public.p36_metric_unit_catalog c
                   where c.metric_id = v_item->>'metricId' and c.unit = v_item->>'unit') then
      raise exception 'P36 metric/unit pair is not in the exact catalog' using errcode = '22023';
    end if;
    v_seen := v_seen || (v_item->>'metricId');
  end loop;

  v_canonical := jsonb_build_object('mission', p_mission_id, 'crew', p_crew_member_id,
    'observedOn', p_observed_on, 'filename', p_source_filename, 'sha256', p_source_sha256,
    'items', p_items);
  v_hash := encode(extensions.digest(v_canonical::text, 'sha256'), 'hex');

  -- Idempotency: one transaction per (membership, key) at a time.
  perform pg_advisory_xact_lock(hashtextextended('p36:' || v_member.id::text || ':' || p_idempotency_key, 0));
  select * into v_existing from public.p36_biomarker_review_batches
    where submitted_by_membership_id = v_member.id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_payload_hash = v_hash then
      return jsonb_build_object('status', 'replayed', 'batch_id', v_existing.id,
        'review_status', v_existing.status, 'item_count',
        (select count(*) from public.p36_biomarker_review_items where batch_id = v_existing.id));
    end if;
    raise exception 'P36 idempotency key reused with a different payload' using errcode = '23505';
  end if;

  begin
    insert into public.p36_biomarker_review_batches(
      mission_id, crew_member_id, submitted_by_membership_id, submitted_by_user_snapshot,
      source_fingerprint, source_filename, observation_date, idempotency_key, request_payload_hash)
    values (p_mission_id, p_crew_member_id, v_member.id, v_uid,
      p_source_sha256, p_source_filename, p_observed_on, p_idempotency_key, v_hash)
    returning id into v_batch;
  exception when unique_violation then
    raise exception 'P36 duplicate synthetic submission for this source and date' using errcode = '23505';
  end;

  insert into public.p36_biomarker_review_items(batch_id, metric_id, measured_value, unit, source_excerpt)
  select v_batch, e->>'metricId', (e->>'value')::numeric, e->>'unit', e->>'sourceExcerpt'
  from jsonb_array_elements(p_items) e;
  get diagnostics v_count = row_count;

  -- Audit provenance in the same transaction (no filename, values or excerpts).
  insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_mission_id, v_uid, 'p36_synthetic_batch_submitted', 'p36_review_batch', v_batch::text,
    jsonb_build_object('classification', 'synthetic', 'item_count', v_count,
      'membership_id', v_member.id, 'crew_member_id', p_crew_member_id,
      'request_payload_hash', v_hash, 'review_status', 'pending_review'));

  return jsonb_build_object('status', 'submitted', 'batch_id', v_batch,
    'review_status', 'pending_review', 'item_count', v_count);
end $$;
revoke all on function public.p36_submit_synthetic_review_batch(text, text, date, text, text, jsonb, text, boolean) from public, anon;
grant execute on function public.p36_submit_synthetic_review_batch(text, text, date, text, text, jsonb, text, boolean) to authenticated;
comment on function public.p36_submit_synthetic_review_batch(text, text, date, text, text, jsonb, text, boolean) is
  'P36.4 staged synthetic-only Crew Self submission. Creates pending_review batches only; never approves, imports or promotes observations.';
