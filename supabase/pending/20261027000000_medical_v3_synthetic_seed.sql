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
-- DEPENDENCY_GUARD
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
