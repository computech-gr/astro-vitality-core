-- OWNER AUTHORIZATION REQUIRED. Disable server synthetic capability first; wait >=35s.
-- Retain all fixtures/quota records and append-only history. No drops or deletions.
DO $rollback_guard$ BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'trusted rollback owner required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-v3-production-candidate',0));
 LOCK TABLE public.missions,public.crew_members,public.mission_crew_assignments,public.mission_memberships IN SHARE MODE;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('medical_advisor_review_events','medical_ai_quota_reservations','medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts'))<>5 OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'medical_v3_%')<>15 THEN RAISE EXCEPTION 'incomplete schema; stop and investigate'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'medical_v3_%')<>15
 OR EXISTS(SELECT 1 FROM (VALUES
 ('medical_v3_ai_evidence(text,text)','2a05f596a8f41bf01c83c746825c57e263bd66f7a1ab7b047d07479211814f3c'),
 ('medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text)','a51fded09798a5160266da717635f2caba39d0e976b1291eb4bc37c8076e4364'),
 ('medical_v3_authoritative_evidence(text,text)','1c8841cad5ea4b24b6e56b9a8b42235c8cb4b4b4d2a3f65b83651ce50477ee1b'),
 ('medical_v3_canonical_json(jsonb)','f9a132bc5ec06e2224ff7b445ebbaffca6510ef3852883ebbe76fcb7bebb7703'),
 ('medical_v3_demo_deny_persistence()','fc8af47f69fed63f79c4a01c7aa7cb8de1fdf57076782f529c4576a72ddb2d2a'),
 ('medical_v3_fixture_review_guard()','474873a8ee0526d169098c86b605cd12a28bfc0e80cb7c5888bae20b250609cb'),
 ('medical_v3_fixture_scope()','8386d985c574893fa585aa2e74a4dff1e512e2ef00c2161c41552d2eb5cad516'),
 ('medical_v3_fixture_snapshot()','cf2b070aa6f7e899efebbc976c2ba08bd1d56e6d277d416b02f0e3d8d82e5795'),
 ('medical_v3_fixture_text_valid(text,text)','66aaa98209b6b28c57769ab33ca13331df140b0ce56a17cf337e5d4ccd81188f'),
 ('medical_v3_has_scope(text,text)','c148287452342ef3a77128b87b2687283bfc24829361b76edaca1ac9d482b4d3'),
 ('medical_v3_immutable()','38dc4f0f9925cce745796c163c5a2ee189cf5d99e29c668c0541f6de39d7c9b4'),
 ('medical_v3_release_ai(uuid)','72158ae5041f85cd33a0bd426589a103b569eec572b24ef3e922817a077089e0'),
 ('medical_v3_reserve_ai(text,text)','a3eb019ac109de2be781e3c934db6b89ad418bef81675d07cb617c17ef952d92'),
 ('medical_v3_review_history(text,text)','ebfce4dc7e4fe9f5f48d05df4734f1d5e5434ff61a7d42f9b2d69c8906c17e1a'),
 ('medical_v3_revoke_digest_guard()','57da107c15b5142bc954d520b463ae4043391c528ac17da3c1a633f4c2b63da4')
 ) expected(signature,sha) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
 WHERE p.oid IS NULL OR p.proowner<>'postgres'::regrole
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, extensions, pg_temp']
 OR (encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex')<>expected.sha
 AND NOT (p.proname='medical_v3_authoritative_evidence' AND encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex')='976002bb31a7874cf6ca0c002a6e503765bcbd7cd4e812cbcff8c078ad57ade2'))
 OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE')
 )
 THEN RAISE EXCEPTION 'approved schema function fingerprint/permission dependency mismatch'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('medical_advisor_review_events','medical_ai_quota_reservations','medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts'))<>5
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) roles(name)
 WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('medical_advisor_review_events','medical_ai_quota_reservations','medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts') AND
 (c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity OR has_table_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
 THEN RAISE EXCEPTION 'approved schema table owner/RLS/permission dependency mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.medical_advisor_review_events'::regclass
 AND tgname='medical_v3_demo_deny_persistence' AND tgenabled='O' AND tgfoid='public.medical_v3_demo_deny_persistence()'::regprocedure)
 THEN RAISE EXCEPTION 'persistent denial dependency unavailable'; END IF;
END $rollback_guard$;
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
