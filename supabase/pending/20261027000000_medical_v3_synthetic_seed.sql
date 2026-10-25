-- OWNER SEED APPROVAL REQUIRED. Privileged data-only query tool; NEVER an app endpoint.
-- One DO statement is one atomic PostgreSQL transaction, including checks, locks and all inserts.
-- Schema SHA256: 2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc
DO $seed$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'trusted seed owner required'; END IF;
 PERFORM set_config('search_path','pg_catalog, public, extensions, pg_temp',true);
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-v3-production-candidate',0));
 LOCK TABLE public.missions,public.crew_members,public.mission_crew_assignments,public.mission_memberships IN SHARE MODE;
 IF NOT EXISTS (SELECT 1 FROM public.missions m JOIN public.mission_crew_assignments a ON a.mission_id=m.id
 JOIN public.crew_members c ON c.id=a.crew_member_id JOIN public.mission_memberships mm ON mm.mission_id=m.id AND mm.crew_member_id=c.id
 WHERE m.id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND m.code='MITO_DEMO_2026' AND m.name='MITOCHONDRIA 2026 - Synthetic Demonstration' AND c.id='crew-9806e7e611f44dc38dac5e23f7740f1a' AND c.display_name='Alex Morgan — Synthetic Astronaut' AND m.status='planning' AND a.status='active' AND c.status='active'
 AND mm.id='63470171-3a22-4075-b197-ac85b90cb0ef' AND mm.active AND mm.role='ground_medical')
 THEN RAISE EXCEPTION 'exact existing synthetic scope/membership prerequisite unavailable'; END IF;
 LOCK TABLE public.medical_v3_fixture_sources,public.medical_v3_fixture_observations,public.medical_v3_fixture_receipts,public.medical_ai_quota_reservations,public.medical_advisor_review_events IN EXCLUSIVE MODE;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'medical_v3_%')<>15
 OR EXISTS(SELECT 1 FROM (VALUES
 ('medical_v3_ai_evidence(text,text)','2a05f596a8f41bf01c83c746825c57e263bd66f7a1ab7b047d07479211814f3c'),
 ('medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text)','a51fded09798a5160266da717635f2caba39d0e976b1291eb4bc37c8076e4364'),
 ('medical_v3_authoritative_evidence(text,text)','1c8841cad5ea4b24b6e56b9a8b42235c8cb4b4b4d2a3f65b83651ce50477ee1b'),
 ('medical_v3_canonical_json(jsonb)','f9a132bc5ec06e2224ff7b445ebbaffca6510ef3852883ebbe76fcb7bebb7703'),
 ('medical_v3_demo_deny_persistence()','fc8af47f69fed63f79c4a01c7aa7cb8de1fdf57076782f529c4576a72ddb2d2a'),
 ('medical_v3_fixture_review_guard()','474873a8ee0526d169098c86b605cd12a28bfc0e80cb7c5888bae20b250609cb'),
 ('medical_v3_fixture_scope()','8386d985c574893fa585aa2e74a4dff1e512e2ef00c2161c41552d2eb5cad516'),
 ('medical_v3_fixture_snapshot()','acd4eb5c7bf3bb6495f3ebd78cdb1bf576c16ba71184bc226461f92c33e79259'),
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
 OR encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex')<>expected.sha
 OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE')
 OR has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM (p.proname IN ('medical_v3_fixture_snapshot','medical_v3_ai_evidence','medical_v3_reserve_ai','medical_v3_release_ai')))
 THEN RAISE EXCEPTION 'approved schema function fingerprint/permission dependency mismatch'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('medical_advisor_review_events','medical_ai_quota_reservations','medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts'))<>5
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) roles(name)
 WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('medical_advisor_review_events','medical_ai_quota_reservations','medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts') AND
 (c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity OR has_table_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
 THEN RAISE EXCEPTION 'approved schema table owner/RLS/permission dependency mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.medical_advisor_review_events'::regclass
 AND tgname='medical_v3_demo_deny_persistence' AND tgenabled='O' AND tgfoid='public.medical_v3_demo_deny_persistence()'::regprocedure)
 THEN RAISE EXCEPTION 'persistent denial dependency unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.medical_v3_fixture_sources) OR EXISTS(SELECT 1 FROM public.medical_v3_fixture_observations) OR EXISTS(SELECT 1 FROM public.medical_v3_fixture_receipts) OR EXISTS(SELECT 1 FROM public.medical_ai_quota_reservations) OR EXISTS(SELECT 1 FROM public.medical_advisor_review_events) THEN RAISE EXCEPTION 'seed requires empty approved tables; rerun or partial completion denied'; END IF;
-- No users, assignments or roles are created. Missing existing scope yields no source.
WITH scope AS (
 SELECT m.id mission,c.id crew FROM public.missions m JOIN public.mission_crew_assignments a ON a.mission_id=m.id
 JOIN public.crew_members c ON c.id=a.crew_member_id
 WHERE m.id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND m.code='MITO_DEMO_2026' AND m.name='MITOCHONDRIA 2026 - Synthetic Demonstration' AND c.id='crew-9806e7e611f44dc38dac5e23f7740f1a' AND c.display_name='Alex Morgan — Synthetic Astronaut'
 AND m.status='planning' AND c.status='active' AND a.status='active'
), literal AS (
 SELECT '[{"id":"synthetic-v3-hr-001","metric":"cv-001","domain":"cardiovascular","value":"62","unit":"bpm","time":"2026-10-01T10:00:00Z"},{"id":"synthetic-v3-hr-002","metric":"cv-001","domain":"cardiovascular","value":"66","unit":"bpm","time":"2026-10-02T10:00:00Z"}]'::jsonb doc
)
INSERT INTO public.medical_v3_fixture_sources
SELECT 'synthetic-v3-owner-fixture',scope.mission,scope.crew,'mitochondria.synthetic-fixture.v1','synthetic',
 'ce2271260428b152778ad67d1cad36306a7913dd3a4442abe3aa11ea65297148',literal.doc,
 'sha256-'||encode(extensions.digest(convert_to(public.medical_v3_canonical_json(literal.doc),'UTF8'),'sha256'),'hex')
FROM scope CROSS JOIN literal WHERE (SELECT count(*) FROM scope)=1;
INSERT INTO public.medical_v3_fixture_observations
SELECT x->>'id',s.id,x->>'metric',x->>'domain',x->>'value',x->>'unit',x->>'time',NULL
FROM public.medical_v3_fixture_sources s CROSS JOIN LATERAL jsonb_array_elements(s.literal_document) x WHERE s.id='synthetic-v3-owner-fixture' AND s.mission_id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND s.crew_member_id='crew-9806e7e611f44dc38dac5e23f7740f1a';
INSERT INTO public.medical_v3_fixture_receipts
SELECT o.id||'-test-receipt-1',o.id,1,NULL,'accepted','synthetic_test_fixture_not_human_review',
 s.source_sha256,s.catalog_sha256,'2026-10-24T21:06:00Z'
FROM public.medical_v3_fixture_observations o JOIN public.medical_v3_fixture_sources s ON s.id=o.source_id WHERE s.id='synthetic-v3-owner-fixture' AND s.mission_id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND s.crew_member_id='crew-9806e7e611f44dc38dac5e23f7740f1a';

 IF (SELECT count(*) FROM public.medical_v3_fixture_sources)<>1
 OR (SELECT count(*) FROM public.medical_v3_fixture_observations)<>2
 OR (SELECT count(*) FROM public.medical_v3_fixture_receipts)<>2
 OR NOT EXISTS(SELECT 1 FROM public.medical_v3_fixture_sources WHERE id='synthetic-v3-owner-fixture'
 AND mission_id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND crew_member_id='crew-9806e7e611f44dc38dac5e23f7740f1a'
 AND provenance='synthetic' AND source_sha256='sha256-'||encode(extensions.digest(convert_to(public.medical_v3_canonical_json(literal_document),'UTF8'),'sha256'),'hex'))
 OR EXISTS(SELECT 1 FROM public.medical_v3_fixture_observations WHERE source_id<>'synthetic-v3-owner-fixture'
 OR metric_id<>'cv-001' OR domain<>'cardiovascular' OR unit<>'bpm' OR supersedes_id IS NOT NULL
 OR NOT ((id='synthetic-v3-hr-001' AND value='62' AND observed_at='2026-10-01T10:00:00Z')
 OR (id='synthetic-v3-hr-002' AND value='66' AND observed_at='2026-10-02T10:00:00Z')))
 OR EXISTS(SELECT 1 FROM public.medical_v3_fixture_receipts r JOIN public.medical_v3_fixture_observations o ON o.id=r.observation_id
 JOIN public.medical_v3_fixture_sources s ON s.id=o.source_id WHERE r.id<>o.id||'-test-receipt-1' OR r.revision<>1
 OR r.reviewed_at<>'2026-10-24T21:06:00Z' OR r.previous_id IS NOT NULL OR r.decision<>'accepted' OR r.receipt_kind<>'synthetic_test_fixture_not_human_review'
 OR r.source_sha256<>s.source_sha256 OR r.catalog_sha256<>s.catalog_sha256)
 OR EXISTS(SELECT 1 FROM public.medical_advisor_review_events)
 THEN RAISE EXCEPTION 'unexpected fixture cardinality or persistent review'; END IF;
END $seed$;
