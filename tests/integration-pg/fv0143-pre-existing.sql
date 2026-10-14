-- FV-01.4.3: invites that exist BEFORE the hardening migration (disposable DB only).
\set ON_ERROR_STOP 1
-- Disposable stub of the platform identity store: production auth.users already has these columns.
alter table auth.users add column if not exists email text, add column if not exists email_confirmed_at timestamptz;
update auth.users set email = right(id::text, 2) || '@fv.test', email_confirmed_at = now();
insert into public.mission_invites(mission_id, code_hash, role, crew_member_id, expires_at, created_by)
values
  ('m1', encode(extensions.digest('legacy-open-ground-medical-code', 'sha256'), 'hex'), 'ground_medical', null, now() + interval '24 hours', '00000000-0000-0000-0000-0000000000a1'),
  ('m1', encode(extensions.digest('legacy-claimed-ground-medical-code', 'sha256'), 'hex'), 'ground_medical', null, now() + interval '24 hours', '00000000-0000-0000-0000-0000000000a1'),
  ('m1', encode(extensions.digest('legacy-open-crew-self-code', 'sha256'), 'hex'), 'crew_self', 'c3', now() + interval '24 hours', '00000000-0000-0000-0000-0000000000a1');
update public.mission_invites set claimed_at = now(), claimed_by = '00000000-0000-0000-0000-0000000000a2', active = false
where code_hash = encode(extensions.digest('legacy-claimed-ground-medical-code', 'sha256'), 'hex');
