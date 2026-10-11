-- P23A: append-only, crew/mission-scoped structured index for EXISTING mission_events.
-- No medical values are copied into this index; mission_events remains the canonical
-- persisted cloud event table. Never replace encrypted offline records with this index.
create table if not exists public.crew_health_record_index (
  event_id text primary key references public.mission_events(id) on delete restrict,
  mission_id text not null references public.missions(id) on delete restrict,
  crew_member_id text not null references public.crew_members(id) on delete restrict,
  kind text not null,
  metric_code text,
  source_id text not null,
  observed_at timestamptz not null,
  classification text not null,
  indexed_at timestamptz not null default now()
);
create index if not exists crew_health_record_index_crew_time
  on public.crew_health_record_index (mission_id, crew_member_id, observed_at desc);
create index if not exists crew_health_record_index_metric_time
  on public.crew_health_record_index (mission_id, crew_member_id, metric_code, observed_at desc);

alter table public.crew_health_record_index enable row level security;
alter table public.crew_health_record_index force row level security;
revoke all on public.crew_health_record_index from public, anon;
revoke insert, update, delete on public.crew_health_record_index from authenticated;
grant select on public.crew_health_record_index to authenticated;

create policy crew_health_record_index_scoped_read on public.crew_health_record_index
  for select to authenticated using (
    public.has_mission_role(mission_id, array['ground_medical'])
    or exists (
      select 1 from public.mission_memberships m
      where m.mission_id = crew_health_record_index.mission_id
        and m.crew_member_id = crew_health_record_index.crew_member_id
        and m.user_id = auth.uid() and m.active and m.role = 'crew_self'
    )
  );

create or replace function public.index_mission_health_event()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_metric text;
begin
  -- ObservationEnvelope and RawSignalChunk are both supported; missing metric
  -- is preserved as NULL rather than guessed from a free-text label.
  v_metric := coalesce(
    nullif(new.payload #>> '{observation,metric,code}', ''),
    nullif(new.payload #>> '{metric,code}', ''),
    nullif(new.payload ->> 'metricCode', '')
  );
  insert into public.crew_health_record_index
    (event_id, mission_id, crew_member_id, kind, metric_code, source_id, observed_at, classification)
  values
    (new.id, new.mission_id, new.crew_member_id, new.kind, v_metric,
     new.source_id, new.event_timestamp, new.classification);
  return new;
end;
$$;
revoke all on function public.index_mission_health_event() from public, anon, authenticated;

drop trigger if exists trg_index_mission_health_event on public.mission_events;
create trigger trg_index_mission_health_event
  after insert on public.mission_events
  for each row execute function public.index_mission_health_event();

-- Existing mission events are indexed without modifying the source records.
insert into public.crew_health_record_index
  (event_id, mission_id, crew_member_id, kind, metric_code, source_id, observed_at, classification)
select e.id, e.mission_id, e.crew_member_id, e.kind,
  coalesce(nullif(e.payload #>> '{observation,metric,code}', ''),
           nullif(e.payload #>> '{metric,code}', ''),
           nullif(e.payload ->> 'metricCode', '')),
  e.source_id, e.event_timestamp, e.classification
from public.mission_events e
on conflict (event_id) do nothing;