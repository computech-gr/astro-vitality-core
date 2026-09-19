-- P19 local release-candidate seed.
-- Synthetic/public fixture only. No real astronaut or medical data.

insert into public.missions (id, code, name, status, starts_at)
values (
  'synthetic-mission-127',
  'SYN-127',
  'Mission Day 127 Synthetic Demo',
  'active',
  '2026-09-19T08:00:00Z'::timestamptz
)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  status = excluded.status,
  starts_at = excluded.starts_at,
  updated_at = now();

insert into public.crew_members (id, external_ref, display_name, status)
values (
  'synthetic-crew-01',
  'synthetic-only',
  'Synthetic Crew 01',
  'active'
)
on conflict (id) do update set
  external_ref = excluded.external_ref,
  display_name = excluded.display_name,
  status = excluded.status,
  updated_at = now();

-- Auth users and mission memberships are intentionally not hard-coded in seed.sql.
-- Create local users through Supabase Auth, then assign mission membership through
-- an authorized development/admin path. This prevents shipping reusable passwords.
