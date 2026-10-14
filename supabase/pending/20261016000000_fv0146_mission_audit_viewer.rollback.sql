-- FV-01.4.6 rollback (manual only). Removes the read-only audit reader; no data is touched.
drop function if exists public.get_mission_audit_log(text, timestamptz, timestamptz, text, text, text, integer, timestamptz, uuid);
