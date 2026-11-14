-- PENDING: preparation only. Separate owner approval is required before any
-- production application. Tool-compatible (no explicit transaction wrapper),
-- idempotent (safe to re-apply). Requires only Supabase Auth's auth.uid().
--
-- P69/P71 public NASA live-demo workspaces (SYNTHETIC ONLY).
--   * Each workspace is an isolated synthetic copy (mission code
--     NASA-DEMO-304-001, subject "Alex Morgan — Synthetic Astronaut") seeded
--     deterministically from the owner-approved P63 synthetic examination.
--     It never reads or writes missions, crew_members, mission_memberships,
--     mission_events, observation sync, P36/P37 ledgers or any catalog.
--   * Demo identities are created only by the server after an admission check.
--     p69_demo_admit_v1, p69_demo_provision_v1 and p69_demo_claim_expired_v1
--     are executable by service_role only; no browser role can call them.
--   * Browser callers use caller-scoped RPCs bound to auth.uid() membership.
--     Role checks, expected-revision (stale) checks, idempotency keys, quotas
--     and expiry are enforced here; cross-workspace access is impossible.
--   * Records and all events are append-only: UPDATE/DELETE/TRUNCATE rejected.
--     Reset creates a new seeded epoch; restore returns to an earlier epoch;
--     nothing is deleted.
--   * A synthetic scientific assessment is not P36/P37 scientific
--     authorization or catalog activation; a synthetic medical review is not a
--     diagnosis, clinical clearance or medical approval.

create table if not exists public.p69_demo_admissions (
  id uuid primary key default gen_random_uuid(),
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  admitted_at timestamptz not null default clock_timestamp(),
  consumed_at timestamptz
);
create index if not exists p69_demo_admissions_client_idx on public.p69_demo_admissions (client_hash, admitted_at);
create index if not exists p69_demo_admissions_time_idx on public.p69_demo_admissions (admitted_at);

create table if not exists public.p69_demo_workspaces (
  id uuid primary key default gen_random_uuid(),
  mission_code text not null default 'NASA-DEMO-304-001' check (mission_code = 'NASA-DEMO-304-001'),
  crew_subject_id text not null default 'synthetic-alex-morgan' check (crew_subject_id = 'synthetic-alex-morgan'),
  provenance text not null default 'synthetic' check (provenance = 'synthetic'),
  join_code_sha256 text not null unique check (join_code_sha256 ~ '^[0-9a-f]{64}$'),
  seed_version text not null check (seed_version = 'p69-seed-v1'),
  epoch integer not null default 1 check (epoch >= 1),
  max_epoch integer not null default 1,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (max_epoch >= epoch and max_epoch <= 20),
  check (expires_at > created_at and expires_at <= created_at + interval '48 hours')
);

create table if not exists public.p69_demo_members (
  user_id uuid primary key,
  workspace_id uuid not null references public.p69_demo_workspaces(id),
  role text not null check (role in ('astronaut','researcher','medical')),
  admission_id uuid not null unique references public.p69_demo_admissions(id),
  joined_at timestamptz not null default clock_timestamp(),
  identity_released_at timestamptz
);
create index if not exists p69_demo_members_workspace_idx on public.p69_demo_members (workspace_id);

create table if not exists public.p69_demo_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.p69_demo_workspaces(id),
  epoch integer not null check (epoch >= 1),
  record_ref text not null check (record_ref ~ '^EXAM-[0-9]{4}$'),
  crew_subject_id text not null check (crew_subject_id = 'synthetic-alex-morgan'),
  observed_on date not null,
  submitted_role text not null check (submitted_role in ('astronaut','medical','seed')),
  submitted_by uuid,
  measurements jsonb not null check (jsonb_typeof(measurements) = 'array'),
  measurements_sha256 text not null check (measurements_sha256 ~ '^[0-9a-f]{64}$'),
  provenance text not null default 'synthetic' check (provenance = 'synthetic'),
  source_quality text not null check (source_quality in ('good','degraded','poor','unknown')),
  source_label text not null check (char_length(source_label) between 1 and 160),
  idempotency_key text check (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_sha256 text check (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, epoch, record_ref),
  unique (workspace_id, idempotency_key),
  check ((submitted_role = 'seed') = (submitted_by is null)),
  check ((submitted_role = 'seed') = (idempotency_key is null))
);
create index if not exists p69_demo_records_ws_idx on public.p69_demo_records (workspace_id, epoch);

create table if not exists public.p69_demo_record_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.p69_demo_workspaces(id),
  record_id uuid not null references public.p69_demo_records(id),
  revision integer not null,
  action text not null,
  from_state text,
  to_state text not null,
  actor_user_id uuid,
  actor_role text not null check (actor_role in ('astronaut','researcher','medical','seed')),
  outcome text not null,
  note text not null default '' check (char_length(note) <= 1000),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  idempotency_key text check (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_sha256 text check (request_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (record_id, revision),
  unique (workspace_id, idempotency_key),
  check ((actor_role = 'seed') = (actor_user_id is null)),
  check (
    (action = 'submitted' and revision = 1 and from_state is null and to_state = 'submitted'
      and actor_role in ('astronaut','medical','seed') and outcome = 'submitted')
    or (action = 'scientific_assessment_recorded' and revision = 2 and from_state = 'submitted'
      and to_state = 'scientific_assessment_recorded' and actor_role in ('researcher','seed')
      and outcome in ('consistent_with_synthetic_reference','requires_more_evidence','outside_synthetic_reference'))
    or (action = 'medical_review_recorded' and revision = 3 and from_state = 'scientific_assessment_recorded'
      and to_state = 'medical_review_recorded' and actor_role in ('medical','seed')
      and outcome in ('no_follow_up_needed','follow_up_recommended','repeat_measurement_requested'))
  )
);
create index if not exists p69_demo_record_events_record_idx on public.p69_demo_record_events (record_id, revision);

create table if not exists public.p69_demo_workspace_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.p69_demo_workspaces(id),
  action text not null check (action in ('created','joined','reset','restored')),
  actor_user_id uuid not null,
  actor_role text not null check (actor_role in ('astronaut','researcher','medical')),
  from_epoch integer,
  to_epoch integer not null,
  workspace_revision bigint not null,
  recorded_at timestamptz not null default clock_timestamp()
);
create index if not exists p69_demo_workspace_events_ws_idx on public.p69_demo_workspace_events (workspace_id, recorded_at);

create table if not exists public.p69_demo_context_readings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.p69_demo_workspaces(id),
  epoch integer not null check (epoch >= 1),
  parameter_id text not null check (parameter_id in ('radiation_dose_rate','cabin_co2','cabin_air_temperature','body_temperature')),
  metric_code text check (metric_code in ('radiation.dose_rate','environment.co2','environment.temperature','phys.core_temperature')),
  value numeric,
  unit text not null,
  observed_at timestamptz not null,
  source_id text not null check (char_length(source_id) between 1 and 80),
  source_label text not null check (char_length(source_label) between 1 and 160),
  source_quality text not null check (source_quality in ('good','degraded','poor','unknown')),
  simulated boolean not null check (simulated),
  measurement_site text check (measurement_site in ('core_ingestible','rectal','esophageal','oral','tympanic','axillary','temporal_artery','skin')),
  measurement_method text check (char_length(measurement_method) <= 120),
  unique (workspace_id, epoch, parameter_id, observed_at, source_id),
  check ((parameter_id = 'body_temperature') = (measurement_site is not null)),
  check (parameter_id <> 'radiation_dose_rate' or unit in ('uSv/h','µSv/h')),
  check (parameter_id <> 'cabin_co2' or unit = 'ppm'),
  check (parameter_id not in ('cabin_air_temperature','body_temperature') or unit in ('°C','Cel','degC')),
  check (parameter_id <> 'body_temperature' or (case when measurement_site in ('core_ingestible','rectal','esophageal')
    then metric_code is not distinct from 'phys.core_temperature' else metric_code is null end))
);

-- Append-only and column guards -------------------------------------------
create or replace function public.p69_demo_reject_mutation() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  raise exception 'p69 demo history is append-only (% on %)', tg_op, tg_table_name using errcode = '42501';
end $fn$;

create or replace function public.p69_demo_workspace_guard() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' then raise exception 'p69 demo workspaces are never deleted' using errcode = '42501'; end if;
  if (new.id, new.mission_code, new.crew_subject_id, new.provenance, new.join_code_sha256, new.seed_version, new.created_at, new.expires_at)
     is distinct from (old.id, old.mission_code, old.crew_subject_id, old.provenance, old.join_code_sha256, old.seed_version, old.created_at, old.expires_at)
     or new.revision <> old.revision + 1 or new.max_epoch < old.max_epoch then
    raise exception 'p69 demo workspace identity is immutable' using errcode = '42501';
  end if;
  return new;
end $fn$;

create or replace function public.p69_demo_member_guard() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' then raise exception 'p69 demo memberships are never deleted' using errcode = '42501'; end if;
  if (new.user_id, new.workspace_id, new.role, new.admission_id, new.joined_at)
     is distinct from (old.user_id, old.workspace_id, old.role, old.admission_id, old.joined_at)
     or old.identity_released_at is not null or new.identity_released_at is null then
    raise exception 'p69 demo membership is immutable' using errcode = '42501';
  end if;
  return new;
end $fn$;

create or replace function public.p69_demo_admission_guard() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' then raise exception 'p69 demo admissions are never deleted' using errcode = '42501'; end if;
  if (new.id, new.client_hash, new.admitted_at) is distinct from (old.id, old.client_hash, old.admitted_at)
     or old.consumed_at is not null or new.consumed_at is null then
    raise exception 'p69 demo admission is single-use' using errcode = '42501';
  end if;
  return new;
end $fn$;

do $do$
declare t text;
begin
  foreach t in array array['p69_demo_records','p69_demo_record_events','p69_demo_workspace_events','p69_demo_context_readings'] loop
    execute format('drop trigger if exists p69_append_only on public.%I', t);
    execute format('create trigger p69_append_only before update or delete on public.%I for each row execute function public.p69_demo_reject_mutation()', t);
  end loop;
  foreach t in array array['p69_demo_admissions','p69_demo_workspaces','p69_demo_members','p69_demo_records','p69_demo_record_events','p69_demo_workspace_events','p69_demo_context_readings'] loop
    execute format('drop trigger if exists p69_no_truncate on public.%I', t);
    execute format('create trigger p69_no_truncate before truncate on public.%I for each statement execute function public.p69_demo_reject_mutation()', t);
  end loop;
end $do$;
drop trigger if exists p69_workspace_guard on public.p69_demo_workspaces;
create trigger p69_workspace_guard before update or delete on public.p69_demo_workspaces
  for each row execute function public.p69_demo_workspace_guard();
drop trigger if exists p69_member_guard on public.p69_demo_members;
create trigger p69_member_guard before update or delete on public.p69_demo_members
  for each row execute function public.p69_demo_member_guard();
drop trigger if exists p69_admission_guard on public.p69_demo_admissions;
create trigger p69_admission_guard before update or delete on public.p69_demo_admissions
  for each row execute function public.p69_demo_admission_guard();

-- Deterministic seed (must equal buildP69SeedDocument() in src/domain/public-demo/catalog.ts)
create or replace function public.p69_demo_seed_document() returns jsonb
language sql immutable set search_path = '' as $fn$
  select $seed${"seedVersion":"p69-seed-v1","missionCode":"NASA-DEMO-304-001","crewSubject":{"id":"synthetic-alex-morgan","name":"Alex Morgan — Synthetic Astronaut"},"catalog":[{"metricId":"demo:ubt-e1140df3","label":"Systolic blood pressure","unit":"mmHg","domain":"cardiovascular"},{"metricId":"demo:ubt-5d16fcaf","label":"Diastolic blood pressure","unit":"mmHg","domain":"cardiovascular"},{"metricId":"demo:ubt-f4b8be7b","label":"Respiratory rate","unit":"breaths/min","domain":"cardiovascular"},{"metricId":"demo:ubt-12f6e490","label":"SpO2","unit":"%","domain":"cardiovascular"},{"metricId":"demo:ubt-33eb23f7","label":"ECG QTc interval","unit":"ms","domain":"cardiovascular"},{"metricId":"demo:ubt-5c1e9b1d","label":"Ejection fraction","unit":"%","domain":"cardiovascular"},{"metricId":"demo:ubt-40eb55be","label":"Stroke volume","unit":"mL","domain":"cardiovascular"},{"metricId":"demo:ubt-a65dfc7c","label":"NT-proBNP","unit":"pg/mL","domain":"cardiovascular"},{"metricId":"demo:ubt-508e453f","label":"Troponin I","unit":"ng/L","domain":"cardiovascular"},{"metricId":"demo:ubt-26a9a98e","label":"LDL cholesterol","unit":"mg/dL","domain":"cardiovascular"},{"metricId":"demo:ubt-300b410b","label":"Neutrophils","unit":"%","domain":"immune"},{"metricId":"demo:ubt-323bb129","label":"Lymphocytes","unit":"%","domain":"immune"},{"metricId":"demo:ubt-b4f34c19","label":"Monocytes","unit":"%","domain":"immune"},{"metricId":"demo:ubt-4000bbfc","label":"CD4/CD8 ratio","unit":"ratio","domain":"immune"},{"metricId":"demo:ubt-c87840cb","label":"IgG","unit":"mg/dL","domain":"immune"},{"metricId":"demo:ubt-ead50a31","label":"IgA","unit":"mg/dL","domain":"immune"},{"metricId":"demo:ubt-068660b8","label":"Complement C3","unit":"mg/dL","domain":"immune"},{"metricId":"demo:ubt-91ab6b12","label":"Neopterin","unit":"nmol/L","domain":"immune"},{"metricId":"demo:ubt-60942680","label":"Serum phosphate","unit":"mg/dL","domain":"bone"},{"metricId":"demo:ubt-d71e8b4d","label":"Ionized Calcium","unit":"mmol/L","domain":"bone"},{"metricId":"demo:ubt-7419a93b","label":"Serum albumin","unit":"g/dL","domain":"bone"},{"metricId":"demo:ubt-12c22152","label":"Osteocalcin","unit":"ng/mL","domain":"bone"},{"metricId":"demo:ubt-7d17696e","label":"Urinary Magnesium","unit":"mg/day","domain":"bone"},{"metricId":"demo:ubt-da887734","label":"Urinary Citrate","unit":"mg/day","domain":"bone"},{"metricId":"demo:ubt-14cbc5f0","label":"Urine pH","unit":"pH","domain":"bone"},{"metricId":"demo:ubt-b4ce4929","label":"DXA femoral neck, T-score","unit":"SD","domain":"bone"},{"metricId":"demo:ubt-db1ff862","label":"Hydration intake","unit":"L/day","domain":"behavioral"},{"metricId":"demo:ubt-dfd7c929","label":"Sedentary time","unit":"hours/day","domain":"behavioral"},{"metricId":"demo:ubt-efe7e2fb","label":"Sleep efficiency","unit":"%","domain":"behavioral"},{"metricId":"demo:ubt-c5a76e59","label":"Total sleep time, last night","unit":"h","domain":"behavioral"}],"examinations":[{"recordRef":"EXAM-0001","observedOn":"2026-11-15","sourceQuality":"good","sourceLabel":"Seed copy of the owner-approved P63 synthetic examination","measurements":[{"metricId":"demo:ubt-e1140df3","value":"118","unit":"mmHg"},{"metricId":"demo:ubt-5d16fcaf","value":"76","unit":"mmHg"},{"metricId":"demo:ubt-f4b8be7b","value":"14","unit":"breaths/min"},{"metricId":"demo:ubt-12f6e490","value":"98","unit":"%"},{"metricId":"demo:ubt-33eb23f7","value":"412","unit":"ms"},{"metricId":"demo:ubt-5c1e9b1d","value":"61","unit":"%"},{"metricId":"demo:ubt-40eb55be","value":"72","unit":"mL"},{"metricId":"demo:ubt-a65dfc7c","value":"48","unit":"pg/mL"},{"metricId":"demo:ubt-508e453f","value":"3","unit":"ng/L"},{"metricId":"demo:ubt-26a9a98e","value":"104","unit":"mg/dL"},{"metricId":"demo:ubt-300b410b","value":"58","unit":"%"},{"metricId":"demo:ubt-323bb129","value":"31","unit":"%"},{"metricId":"demo:ubt-b4f34c19","value":"7","unit":"%"},{"metricId":"demo:ubt-4000bbfc","value":"1.8","unit":"ratio"},{"metricId":"demo:ubt-c87840cb","value":"1050","unit":"mg/dL"},{"metricId":"demo:ubt-ead50a31","value":"210","unit":"mg/dL"},{"metricId":"demo:ubt-068660b8","value":"118","unit":"mg/dL"},{"metricId":"demo:ubt-91ab6b12","value":"6.1","unit":"nmol/L"},{"metricId":"demo:ubt-60942680","value":"3.6","unit":"mg/dL"},{"metricId":"demo:ubt-d71e8b4d","value":"1.22","unit":"mmol/L"},{"metricId":"demo:ubt-7419a93b","value":"4.3","unit":"g/dL"},{"metricId":"demo:ubt-12c22152","value":"18","unit":"ng/mL"},{"metricId":"demo:ubt-7d17696e","value":"110","unit":"mg/day"},{"metricId":"demo:ubt-da887734","value":"640","unit":"mg/day"},{"metricId":"demo:ubt-14cbc5f0","value":"6.1","unit":"pH"},{"metricId":"demo:ubt-b4ce4929","value":"-0.4","unit":"SD"},{"metricId":"demo:ubt-db1ff862","value":"2.4","unit":"L/day"},{"metricId":"demo:ubt-dfd7c929","value":"9.5","unit":"hours/day"},{"metricId":"demo:ubt-efe7e2fb","value":"88","unit":"%"},{"metricId":"demo:ubt-c5a76e59","value":"6.8","unit":"h"}],"scientific":{"outcome":"consistent_with_synthetic_reference","note":"Deterministic seed history: illustrative synthetic entry, not a human scientific review."},"medical":{"outcome":"no_follow_up_needed","note":"Deterministic seed history: illustrative synthetic entry, not a human medical review."}}],"context":[{"parameterId":"radiation_dose_rate","metricCode":"radiation.dose_rate","value":17.2,"unit":"uSv/h","observedAt":"2026-11-15T07:55:00Z","sourceId":"synthetic-habitat-dosimeter","sourceLabel":"Synthetic habitat dosimeter (seed)","sourceQuality":"good","measurementSite":null,"measurementMethod":null},{"parameterId":"cabin_co2","metricCode":"environment.co2","value":2600,"unit":"ppm","observedAt":"2026-11-15T07:55:00Z","sourceId":"synthetic-cabin-gateway","sourceLabel":"Synthetic cabin environment gateway (seed)","sourceQuality":"good","measurementSite":null,"measurementMethod":null},{"parameterId":"cabin_air_temperature","metricCode":"environment.temperature","value":22.4,"unit":"°C","observedAt":"2026-11-15T07:55:00Z","sourceId":"synthetic-cabin-gateway","sourceLabel":"Synthetic cabin environment gateway (seed)","sourceQuality":"good","measurementSite":null,"measurementMethod":null},{"parameterId":"body_temperature","metricCode":null,"value":36.7,"unit":"°C","observedAt":"2026-11-15T07:40:00Z","sourceId":"synthetic-crew-thermometer","sourceLabel":"Synthetic crew oral thermometer (seed)","sourceQuality":"good","measurementSite":"oral","measurementMethod":"Synthetic oral digital thermometer reading"}]}$seed$::jsonb
$fn$;

create or replace function public.p69_demo_sha256(p text) returns text
language sql immutable set search_path = '' as $fn$
  select encode(pg_catalog.sha256(convert_to(p, 'UTF8')), 'hex')
$fn$;

-- Exact catalog IDs/units, plain numeric text, no duplicates, 1..30 entries.
create or replace function public.p69_demo_check_measurements(p jsonb) returns void
language plpgsql stable set search_path = '' as $fn$
declare m jsonb; v_seen text[] := '{}'; v_unit text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 30 then
    raise exception 'measurements must be an array of 1 to 30 entries' using errcode = '22023'; end if;
  for m in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(m) <> 'object' or (select array_agg(k order by k) from jsonb_object_keys(m) k) <> array['metricId','unit','value']
       or jsonb_typeof(m->'metricId') <> 'string' or jsonb_typeof(m->'unit') <> 'string' or jsonb_typeof(m->'value') <> 'string' then
      raise exception 'each measurement needs exactly metricId, value and unit' using errcode = '22023'; end if;
    select c->>'unit' into v_unit from jsonb_array_elements(public.p69_demo_seed_document()->'catalog') c
      where c->>'metricId' = m->>'metricId';
    if v_unit is null then raise exception 'unknown demo parameter %', m->>'metricId' using errcode = '22023'; end if;
    if v_unit <> m->>'unit' then raise exception 'unit for % must be exactly %', m->>'metricId', v_unit using errcode = '22023'; end if;
    if (m->>'value') !~ '^-?[0-9]{1,7}([.][0-9]{1,4})?$' then
      raise exception 'value for % must be a plain number', m->>'metricId' using errcode = '22023'; end if;
    if (m->>'metricId') = any(v_seen) then raise exception 'duplicate measurement %', m->>'metricId' using errcode = '22023'; end if;
    v_seen := v_seen || (m->>'metricId');
  end loop;
end $fn$;

create or replace function public.p69_demo_seed_epoch(p_workspace uuid, p_epoch integer) returns void
language plpgsql security definer set search_path = '' as $fn$
declare d jsonb := public.p69_demo_seed_document(); e jsonb; c jsonb; v_rec uuid; v_ev jsonb; v_sha text;
begin
  for e in select value from jsonb_array_elements(d->'examinations') loop
    v_sha := public.p69_demo_sha256((e->'measurements')::text);
    insert into public.p69_demo_records (workspace_id, epoch, record_ref, crew_subject_id, observed_on, submitted_role,
        measurements, measurements_sha256, source_quality, source_label)
      values (p_workspace, p_epoch, e->>'recordRef', d->'crewSubject'->>'id', (e->>'observedOn')::date, 'seed',
        e->'measurements', v_sha, e->>'sourceQuality', e->>'sourceLabel')
      returning id into v_rec;
    v_ev := jsonb_build_object('provenance','synthetic','sourceQuality',e->>'sourceQuality',
      'measurementCount', jsonb_array_length(e->'measurements'), 'measurementsSha256', v_sha);
    insert into public.p69_demo_record_events (workspace_id, record_id, revision, action, from_state, to_state, actor_role, outcome, note, evidence) values
      (p_workspace, v_rec, 1, 'submitted', null, 'submitted', 'seed', 'submitted', '', v_ev),
      (p_workspace, v_rec, 2, 'scientific_assessment_recorded', 'submitted', 'scientific_assessment_recorded', 'seed', e->'scientific'->>'outcome', e->'scientific'->>'note', v_ev),
      (p_workspace, v_rec, 3, 'medical_review_recorded', 'scientific_assessment_recorded', 'medical_review_recorded', 'seed', e->'medical'->>'outcome', e->'medical'->>'note', v_ev);
  end loop;
  for c in select value from jsonb_array_elements(d->'context') loop
    insert into public.p69_demo_context_readings (workspace_id, epoch, parameter_id, metric_code, value, unit, observed_at,
        source_id, source_label, source_quality, simulated, measurement_site, measurement_method)
      values (p_workspace, p_epoch, c->>'parameterId', c->>'metricCode', (c->>'value')::numeric, c->>'unit',
        (c->>'observedAt')::timestamptz, c->>'sourceId', c->>'sourceLabel', c->>'sourceQuality', true,
        c->>'measurementSite', c->>'measurementMethod');
  end loop;
end $fn$;

-- Caller resolution: authenticated, active member, unexpired workspace.
create or replace function public.p69_demo_my_workspace() returns uuid
language sql stable security definer set search_path = '' as $fn$
  select m.workspace_id from public.p69_demo_members m
    where m.user_id = auth.uid() and m.identity_released_at is null
$fn$;

create or replace function public.p69_demo_caller(p_lock boolean default false)
returns table (workspace_id uuid, role text, epoch integer, max_epoch integer, revision bigint, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); v_ws uuid; v_role text; w public.p69_demo_workspaces;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select m.workspace_id, m.role into v_ws, v_role from public.p69_demo_members m
    where m.user_id = v_uid and m.identity_released_at is null;
  if v_ws is null then raise exception 'not a demo workspace member' using errcode = '42501'; end if;
  if p_lock then select * into w from public.p69_demo_workspaces x where x.id = v_ws for update;
  else select * into w from public.p69_demo_workspaces x where x.id = v_ws; end if;
  if w.expires_at <= clock_timestamp() then raise exception 'demo workspace expired' using errcode = 'MDEXP'; end if;
  return query select w.id, v_role, w.epoch, w.max_epoch, w.revision, w.expires_at;
end $fn$;

-- Caller-scoped reads ------------------------------------------------------
create or replace function public.p69_demo_session_v1() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare c record; d jsonb := public.p69_demo_seed_document();
begin
  select * into c from public.p69_demo_caller(false);
  return jsonb_build_object(
    'workspaceId', c.workspace_id, 'role', c.role, 'missionCode', d->>'missionCode',
    'crewSubjectId', d->'crewSubject'->>'id', 'crewSubjectName', d->'crewSubject'->>'name',
    'provenance', 'synthetic', 'seedVersion', d->>'seedVersion',
    'epoch', c.epoch, 'maxEpoch', c.max_epoch, 'workspaceRevision', c.revision, 'expiresAt', c.expires_at,
    'members', (select jsonb_build_object(
      'astronaut', count(*) filter (where m.role = 'astronaut'),
      'researcher', count(*) filter (where m.role = 'researcher'),
      'medical', count(*) filter (where m.role = 'medical'))
      from public.p69_demo_members m where m.workspace_id = c.workspace_id and m.identity_released_at is null),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('action', we.action, 'actorRole', we.actor_role,
        'fromEpoch', we.from_epoch, 'toEpoch', we.to_epoch, 'workspaceRevision', we.workspace_revision,
        'recordedAt', we.recorded_at) order by we.recorded_at, we.workspace_revision), '[]'::jsonb)
      from public.p69_demo_workspace_events we where we.workspace_id = c.workspace_id));
end $fn$;

create or replace function public.p69_demo_records_v1() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare c record;
begin
  select * into c from public.p69_demo_caller(false);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'recordRef', r.record_ref, 'epoch', r.epoch, 'crewSubjectId', r.crew_subject_id,
      'observedOn', r.observed_on, 'submittedRole', r.submitted_role, 'sourceQuality', r.source_quality,
      'sourceLabel', r.source_label, 'provenance', r.provenance, 'measurements', r.measurements,
      'measurementsSha256', r.measurements_sha256, 'createdAt', r.created_at,
      'state', (select e.to_state from public.p69_demo_record_events e where e.record_id = r.id order by e.revision desc limit 1),
      'revision', (select max(e.revision) from public.p69_demo_record_events e where e.record_id = r.id),
      'events', (select jsonb_agg(jsonb_build_object(
          'id', e.id, 'revision', e.revision, 'action', e.action, 'fromState', e.from_state, 'toState', e.to_state,
          'actorRole', e.actor_role,
          'outcome', case when c.role = 'astronaut' and e.action = 'scientific_assessment_recorded' then null else e.outcome end,
          'note', case when c.role = 'astronaut' and e.action = 'scientific_assessment_recorded' then null else e.note end,
          'redacted', c.role = 'astronaut' and e.action = 'scientific_assessment_recorded',
          'recordedAt', e.recorded_at, 'evidence', e.evidence) order by e.revision)
        from public.p69_demo_record_events e where e.record_id = r.id)
    ) order by r.record_ref), '[]'::jsonb)
    from public.p69_demo_records r where r.workspace_id = c.workspace_id and r.epoch = c.epoch);
end $fn$;

create or replace function public.p69_demo_context_v1() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare c record;
begin
  select * into c from public.p69_demo_caller(false);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'parameterId', x.parameter_id, 'metricCode', x.metric_code, 'value', x.value, 'unit', x.unit,
      'observedAt', x.observed_at, 'sourceId', x.source_id, 'sourceLabel', x.source_label,
      'quality', x.source_quality, 'simulated', x.simulated,
      'availability', case when x.value is null then 'unavailable' else 'available' end,
      'measurementSite', x.measurement_site, 'measurementMethod', x.measurement_method
    ) order by x.parameter_id, x.observed_at), '[]'::jsonb)
    from public.p69_demo_context_readings x where x.workspace_id = c.workspace_id and x.epoch = c.epoch);
end $fn$;

-- Caller-scoped writes -----------------------------------------------------
create or replace function public.p69_demo_submit_examination_v1(
  p_observed_on date, p_measurements jsonb, p_source_quality text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare c record; v_uid uuid := auth.uid(); v_req text; v_existing public.p69_demo_records; v_count integer;
  v_total integer; v_ref text; v_id uuid; v_sha text;
begin
  select * into c from public.p69_demo_caller(true);
  if c.role not in ('astronaut','medical') then
    raise exception 'role not permitted to submit examinations' using errcode = '42501'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'invalid idempotency key' using errcode = '22023'; end if;
  v_req := public.p69_demo_sha256(jsonb_build_object('observedOn', p_observed_on, 'measurements', p_measurements,
    'sourceQuality', p_source_quality)::text);
  select * into v_existing from public.p69_demo_records r
    where r.workspace_id = c.workspace_id and r.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_req and v_existing.submitted_by = v_uid then
      return jsonb_build_object('recordId', v_existing.id, 'recordRef', v_existing.record_ref, 'revision', 1, 'replay', true); end if;
    raise exception 'idempotency key reused with a different request' using errcode = 'MDIDM';
  end if;
  if p_observed_on is null or p_observed_on < date '2000-01-01' or p_observed_on > (clock_timestamp() at time zone 'UTC')::date + 1 then
    raise exception 'examination date out of range' using errcode = '22023'; end if;
  if p_source_quality is null or p_source_quality not in ('good','degraded','poor','unknown') then
    raise exception 'invalid source quality' using errcode = '22023'; end if;
  perform public.p69_demo_check_measurements(p_measurements);
  select count(*) into v_count from public.p69_demo_records r where r.workspace_id = c.workspace_id and r.epoch = c.epoch;
  select count(*) into v_total from public.p69_demo_records r where r.workspace_id = c.workspace_id and r.submitted_role <> 'seed';
  if v_count >= 26 or v_total >= 120 then raise exception 'demo workspace examination quota reached' using errcode = 'MDQUO'; end if;
  v_ref := 'EXAM-' || lpad((v_count + 1)::text, 4, '0');
  v_sha := public.p69_demo_sha256(p_measurements::text);
  insert into public.p69_demo_records (workspace_id, epoch, record_ref, crew_subject_id, observed_on, submitted_role, submitted_by,
      measurements, measurements_sha256, source_quality, source_label, idempotency_key, request_sha256)
    values (c.workspace_id, c.epoch, v_ref, 'synthetic-alex-morgan', p_observed_on, c.role, v_uid, p_measurements, v_sha,
      p_source_quality,
      case c.role when 'astronaut' then 'Astronaut self-submitted synthetic examination' else 'Ground Medical entered synthetic examination' end,
      p_idempotency_key, v_req)
    returning id into v_id;
  insert into public.p69_demo_record_events (workspace_id, record_id, revision, action, from_state, to_state, actor_user_id, actor_role, outcome, evidence)
    values (c.workspace_id, v_id, 1, 'submitted', null, 'submitted', v_uid, c.role, 'submitted',
      jsonb_build_object('provenance','synthetic','sourceQuality',p_source_quality,
        'measurementCount', jsonb_array_length(p_measurements), 'measurementsSha256', v_sha));
  return jsonb_build_object('recordId', v_id, 'recordRef', v_ref, 'revision', 1, 'replay', false);
end $fn$;

create or replace function public.p69_demo_transition_v1(
  p_record_id uuid, p_action text, p_outcome text, p_note text, p_expected_revision integer, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare c record; v_uid uuid := auth.uid(); v_rec public.p69_demo_records; v_last public.p69_demo_record_events;
  v_existing public.p69_demo_record_events; v_req text; v_role text; v_from text; v_note text := coalesce(btrim(p_note), '');
begin
  select * into c from public.p69_demo_caller(false);
  if p_action = 'scientific_assessment_recorded' then v_role := 'researcher'; v_from := 'submitted';
  elsif p_action = 'medical_review_recorded' then v_role := 'medical'; v_from := 'scientific_assessment_recorded';
  else raise exception 'unknown workflow action' using errcode = '22023'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'invalid idempotency key' using errcode = '22023'; end if;
  select * into v_rec from public.p69_demo_records r
    where r.id = p_record_id and r.workspace_id = c.workspace_id and r.epoch = c.epoch for update;
  if not found then raise exception 'record not found in your demo workspace' using errcode = '42501'; end if;
  if c.role <> v_role then raise exception 'role not permitted for this transition' using errcode = '42501'; end if;
  v_req := public.p69_demo_sha256(jsonb_build_object('recordId', p_record_id, 'action', p_action, 'outcome', p_outcome,
    'note', v_note, 'expectedRevision', p_expected_revision)::text);
  select * into v_existing from public.p69_demo_record_events e
    where e.workspace_id = c.workspace_id and e.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_sha256 = v_req and v_existing.actor_user_id = v_uid then
      return jsonb_build_object('recordId', v_existing.record_id, 'revision', v_existing.revision, 'state', v_existing.to_state, 'replay', true); end if;
    raise exception 'idempotency key reused with a different request' using errcode = 'MDIDM';
  end if;
  select * into v_last from public.p69_demo_record_events e where e.record_id = p_record_id order by e.revision desc limit 1;
  if p_expected_revision is distinct from v_last.revision then
    raise exception 'stale revision: record is at revision %', v_last.revision using errcode = 'MDSTA'; end if;
  if v_last.to_state <> v_from then
    raise exception 'transition not allowed from state %', v_last.to_state using errcode = 'MDSTT'; end if;
  if char_length(v_note) > 1000 then raise exception 'note too long' using errcode = '22023'; end if;
  if p_outcome is null or not (
    (p_action = 'scientific_assessment_recorded' and p_outcome in ('consistent_with_synthetic_reference','requires_more_evidence','outside_synthetic_reference'))
    or (p_action = 'medical_review_recorded' and p_outcome in ('no_follow_up_needed','follow_up_recommended','repeat_measurement_requested'))) then
    raise exception 'invalid outcome' using errcode = '22023'; end if;
  insert into public.p69_demo_record_events (workspace_id, record_id, revision, action, from_state, to_state, actor_user_id, actor_role,
      outcome, note, evidence, idempotency_key, request_sha256)
    values (c.workspace_id, p_record_id, v_last.revision + 1, p_action, v_from, p_action, v_uid, c.role,
      p_outcome, v_note, v_last.evidence || jsonb_build_object('previousEventId', v_last.id), p_idempotency_key, v_req);
  return jsonb_build_object('recordId', p_record_id, 'revision', v_last.revision + 1, 'state', p_action, 'replay', false);
end $fn$;

create or replace function public.p69_demo_reset_v1(p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare c record; v_epoch integer;
begin
  select * into c from public.p69_demo_caller(true);
  if p_expected_revision is distinct from c.revision then
    raise exception 'stale workspace revision %', c.revision using errcode = 'MDSTA'; end if;
  if c.max_epoch >= 20 then raise exception 'demo workspace reset quota reached' using errcode = 'MDQUO'; end if;
  v_epoch := c.max_epoch + 1;
  update public.p69_demo_workspaces set epoch = v_epoch, max_epoch = v_epoch, revision = revision + 1 where id = c.workspace_id;
  perform public.p69_demo_seed_epoch(c.workspace_id, v_epoch);
  insert into public.p69_demo_workspace_events (workspace_id, action, actor_user_id, actor_role, from_epoch, to_epoch, workspace_revision)
    values (c.workspace_id, 'reset', auth.uid(), c.role, c.epoch, v_epoch, c.revision + 1);
  return jsonb_build_object('epoch', v_epoch, 'maxEpoch', v_epoch, 'workspaceRevision', c.revision + 1);
end $fn$;

create or replace function public.p69_demo_restore_v1(p_epoch integer, p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare c record;
begin
  select * into c from public.p69_demo_caller(true);
  if p_expected_revision is distinct from c.revision then
    raise exception 'stale workspace revision %', c.revision using errcode = 'MDSTA'; end if;
  if p_epoch is null or p_epoch < 1 or p_epoch > c.max_epoch or p_epoch = c.epoch then
    raise exception 'invalid workspace version' using errcode = '22023'; end if;
  update public.p69_demo_workspaces set epoch = p_epoch, revision = revision + 1 where id = c.workspace_id;
  insert into public.p69_demo_workspace_events (workspace_id, action, actor_user_id, actor_role, from_epoch, to_epoch, workspace_revision)
    values (c.workspace_id, 'restored', auth.uid(), c.role, c.epoch, p_epoch, c.revision + 1);
  return jsonb_build_object('epoch', p_epoch, 'maxEpoch', c.max_epoch, 'workspaceRevision', c.revision + 1);
end $fn$;

-- Server-only provisioning (service_role) ------------------------------------
create or replace function public.p69_demo_admit_v1(p_client_hash text) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare v_id uuid;
begin
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid client hash' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('p69_demo_admit_v1'));
  if (select count(*) from public.p69_demo_admissions a
      where a.client_hash = p_client_hash and a.admitted_at > clock_timestamp() - interval '1 hour') >= 12 then
    raise exception 'demo entry rate limit reached for this client' using errcode = 'MDRAT'; end if;
  if (select count(*) from public.p69_demo_admissions a where a.admitted_at > clock_timestamp() - interval '1 hour') >= 240 then
    raise exception 'demo entry global rate limit reached' using errcode = 'MDRAT'; end if;
  insert into public.p69_demo_admissions (client_hash) values (p_client_hash) returning id into v_id;
  return v_id;
end $fn$;

create or replace function public.p69_demo_provision_v1(p_admission_id uuid, p_user_id uuid, p_role text, p_join_code text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare a public.p69_demo_admissions; w public.p69_demo_workspaces; v_code text; v_norm text; v_members integer;
begin
  if p_role is null or p_role not in ('astronaut','researcher','medical') then
    raise exception 'invalid demo role' using errcode = '22023'; end if;
  if p_user_id is null then raise exception 'missing demo identity' using errcode = '22023'; end if;
  select * into a from public.p69_demo_admissions x where x.id = p_admission_id for update;
  if not found or a.consumed_at is not null or a.admitted_at < clock_timestamp() - interval '10 minutes' then
    raise exception 'admission invalid or already used' using errcode = '22023'; end if;
  if exists (select 1 from public.p69_demo_members m where m.user_id = p_user_id) then
    raise exception 'identity already provisioned' using errcode = '22023'; end if;
  if p_join_code is null or btrim(p_join_code) = '' then
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 12));
    v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
    insert into public.p69_demo_workspaces (join_code_sha256, seed_version, expires_at)
      values (public.p69_demo_sha256(v_code), public.p69_demo_seed_document()->>'seedVersion', clock_timestamp() + interval '24 hours')
      returning * into w;
    perform public.p69_demo_seed_epoch(w.id, 1);
    insert into public.p69_demo_members (user_id, workspace_id, role, admission_id) values (p_user_id, w.id, p_role, a.id);
    insert into public.p69_demo_workspace_events (workspace_id, action, actor_user_id, actor_role, from_epoch, to_epoch, workspace_revision)
      values (w.id, 'created', p_user_id, p_role, null, 1, 1);
  else
    v_norm := upper(btrim(p_join_code));
    if v_norm !~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then
      raise exception 'demo workspace code not recognised' using errcode = 'MDJIN'; end if;
    select * into w from public.p69_demo_workspaces x where x.join_code_sha256 = public.p69_demo_sha256(v_norm) for update;
    if not found or w.expires_at <= clock_timestamp() then
      raise exception 'demo workspace code not recognised' using errcode = 'MDJIN'; end if;
    select count(*) into v_members from public.p69_demo_members m where m.workspace_id = w.id;
    if v_members >= 9 then raise exception 'demo workspace member quota reached' using errcode = 'MDQUO'; end if;
    insert into public.p69_demo_members (user_id, workspace_id, role, admission_id) values (p_user_id, w.id, p_role, a.id);
    insert into public.p69_demo_workspace_events (workspace_id, action, actor_user_id, actor_role, from_epoch, to_epoch, workspace_revision)
      values (w.id, 'joined', p_user_id, p_role, null, w.epoch, w.revision);
    v_code := null;
  end if;
  update public.p69_demo_admissions set consumed_at = clock_timestamp() where id = a.id;
  return jsonb_build_object('workspaceId', w.id, 'role', p_role, 'joinCode', v_code, 'expiresAt', w.expires_at,
    'missionCode', w.mission_code);
end $fn$;

-- Marks identities of long-expired workspaces released (data is retained) and
-- returns their user IDs so the server can delete those demo auth users.
create or replace function public.p69_demo_claim_expired_v1(p_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_ids jsonb;
begin
  with picked as (
    select m.user_id from public.p69_demo_members m join public.p69_demo_workspaces w on w.id = m.workspace_id
      where m.identity_released_at is null and w.expires_at < clock_timestamp() - interval '1 hour'
      order by w.expires_at limit least(greatest(coalesce(p_limit, 0), 0), 20)
      for update of m skip locked),
  upd as (update public.p69_demo_members m set identity_released_at = clock_timestamp()
      from picked where m.user_id = picked.user_id returning m.user_id)
  select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_ids from upd;
  return v_ids;
end $fn$;

-- Access control -------------------------------------------------------------
revoke all on table public.p69_demo_admissions, public.p69_demo_workspaces, public.p69_demo_members,
  public.p69_demo_records, public.p69_demo_record_events, public.p69_demo_workspace_events,
  public.p69_demo_context_readings from public, anon, authenticated, service_role;
grant select on table public.p69_demo_admissions, public.p69_demo_workspaces, public.p69_demo_members,
  public.p69_demo_records, public.p69_demo_record_events, public.p69_demo_workspace_events,
  public.p69_demo_context_readings to service_role;
grant select (id, mission_code, crew_subject_id, provenance, seed_version, epoch, max_epoch, revision, created_at, expires_at)
  on table public.p69_demo_workspaces to authenticated;
grant select (user_id, workspace_id, role, joined_at) on table public.p69_demo_members to authenticated;
grant select on table public.p69_demo_records, public.p69_demo_context_readings to authenticated;

alter table public.p69_demo_admissions enable row level security;
alter table public.p69_demo_workspaces enable row level security;
alter table public.p69_demo_members enable row level security;
alter table public.p69_demo_records enable row level security;
alter table public.p69_demo_record_events enable row level security;
alter table public.p69_demo_workspace_events enable row level security;
alter table public.p69_demo_context_readings enable row level security;

drop policy if exists p69_ws_member_read on public.p69_demo_workspaces;
create policy p69_ws_member_read on public.p69_demo_workspaces for select to authenticated
  using (id = public.p69_demo_my_workspace());
drop policy if exists p69_member_self_read on public.p69_demo_members;
create policy p69_member_self_read on public.p69_demo_members for select to authenticated
  using (user_id = auth.uid() and identity_released_at is null);
drop policy if exists p69_records_member_read on public.p69_demo_records;
create policy p69_records_member_read on public.p69_demo_records for select to authenticated
  using (workspace_id = public.p69_demo_my_workspace());
drop policy if exists p69_context_member_read on public.p69_demo_context_readings;
create policy p69_context_member_read on public.p69_demo_context_readings for select to authenticated
  using (workspace_id = public.p69_demo_my_workspace());

revoke all on function public.p69_demo_reject_mutation(), public.p69_demo_workspace_guard(), public.p69_demo_member_guard(),
  public.p69_demo_admission_guard(), public.p69_demo_seed_document(), public.p69_demo_sha256(text),
  public.p69_demo_check_measurements(jsonb), public.p69_demo_seed_epoch(uuid, integer), public.p69_demo_my_workspace(),
  public.p69_demo_caller(boolean), public.p69_demo_session_v1(), public.p69_demo_records_v1(), public.p69_demo_context_v1(),
  public.p69_demo_submit_examination_v1(date, jsonb, text, text),
  public.p69_demo_transition_v1(uuid, text, text, text, integer, text),
  public.p69_demo_reset_v1(bigint), public.p69_demo_restore_v1(integer, bigint),
  public.p69_demo_admit_v1(text), public.p69_demo_provision_v1(uuid, uuid, text, text),
  public.p69_demo_claim_expired_v1(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.p69_demo_my_workspace() to authenticated;
grant execute on function public.p69_demo_session_v1() to authenticated;
grant execute on function public.p69_demo_records_v1() to authenticated;
grant execute on function public.p69_demo_context_v1() to authenticated;
grant execute on function public.p69_demo_submit_examination_v1(date, jsonb, text, text) to authenticated;
grant execute on function public.p69_demo_transition_v1(uuid, text, text, text, integer, text) to authenticated;
grant execute on function public.p69_demo_reset_v1(bigint) to authenticated;
grant execute on function public.p69_demo_restore_v1(integer, bigint) to authenticated;
grant execute on function public.p69_demo_admit_v1(text) to service_role;
grant execute on function public.p69_demo_provision_v1(uuid, uuid, text, text) to service_role;
grant execute on function public.p69_demo_claim_expired_v1(integer) to service_role;

comment on table public.p69_demo_workspaces is
  'SYNTHETIC PUBLIC DEMO ONLY: isolated per-visitor workspace (NASA-DEMO-304-001); never linked to real missions, crew or accounts.';
comment on table public.p69_demo_record_events is
  'SYNTHETIC PUBLIC DEMO ONLY: append-only examination workflow; not scientific authorization, catalog activation, diagnosis or clinical clearance.';
