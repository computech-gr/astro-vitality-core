-- OWNER AUTHORIZATION REQUIRED. Disable server synthetic capability first; wait >=35s.
-- Retain all fixtures/quota records and append-only history. No drops or deletions.
BEGIN;
REVOKE ALL ON FUNCTION public.medical_v3_fixture_snapshot() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.medical_v3_ai_evidence(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.medical_v3_reserve_ai(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON public.medical_advisor_review_events FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.medical_v3_authoritative_evidence(p_mission text,p_crew text)
RETURNS TABLE(canonical_text text,source_ids text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
 SELECT NULL::text,NULL::text[] WHERE false
$$;
REVOKE ALL ON FUNCTION public.medical_v3_authoritative_evidence(text,text) FROM PUBLIC,anon,authenticated,service_role;
-- Caller-owned release remains available for cleanup; no refund of consumed minute quotas.
-- Final capability allowlist overrides production default ACLs (RLS does not guard TRUNCATE).
DO $permissions$
DECLARE obj record;
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN
  RAISE EXCEPTION 'trusted migration owner required'; END IF;
 FOR obj IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('medical_advisor_review_events','medical_ai_quota_reservations',
 'medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts') LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO postgres',obj.relname);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',obj.relname);
 END LOOP;
 -- UUID defaults create no sequences. Restrict any sequence owned by these tables, never unrelated sequences.
 FOR obj IN SELECT DISTINCT s.oid,s.relname FROM pg_class s JOIN pg_namespace n ON n.oid=s.relnamespace
 JOIN pg_depend d ON d.objid=s.oid JOIN pg_class t ON t.oid=d.refobjid
 WHERE n.nspname='public' AND s.relkind='S' AND d.deptype IN ('a','i')
 AND t.relname IN ('medical_advisor_review_events','medical_ai_quota_reservations',
 'medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts') LOOP
  EXECUTE format('ALTER SEQUENCE public.%I OWNER TO postgres',obj.relname);
  EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC,anon,authenticated,service_role',obj.relname);
 END LOOP;
 FOR obj IN SELECT p.oid,p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'medical_v3_%' LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',obj.signature);
  EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog, public, extensions, pg_temp',obj.signature);
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',obj.signature);
 END LOOP;
END $permissions$;
-- Cleanup only: authenticated caller can release only their own reservation; no new leases.
GRANT EXECUTE ON FUNCTION public.medical_v3_release_ai(uuid) TO authenticated;
COMMIT;
