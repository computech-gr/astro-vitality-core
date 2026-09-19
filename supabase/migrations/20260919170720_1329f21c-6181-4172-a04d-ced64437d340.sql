-- P16 Security & Safety Hardening — corrective: restore reachability of pgcrypto digest()
-- The shipped P16 search_path (public, pg_temp) excluded the extensions schema, so
-- digest() could not resolve and mission ingest/research export failed closed at runtime.
alter function public.ingest_mission_event(jsonb,text) set search_path = public, extensions, pg_temp;
alter function public.export_research_mission(text) set search_path = public, extensions, pg_temp;
alter function public.get_ground_mission_snapshot(text) set search_path = public, extensions, pg_temp;
alter function public.deidentify_research_jsonb(jsonb) set search_path = public, extensions, pg_temp;
alter function public.has_mission_role(text,text[]) set search_path = public, extensions, pg_temp;
alter function public.ensure_mission_research_key() set search_path = public, extensions, pg_temp;