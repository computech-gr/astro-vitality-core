-- OWNER APPROVAL REQUIRED. Stage after 20261024000000; disposable validation only.
-- New invented fixture literals; NEVER reads offline observations or accepts browser receipts.
CREATE TABLE public.medical_v3_fixture_sources (
 id text PRIMARY KEY, mission_id text NOT NULL REFERENCES public.missions(id),
 crew_member_id text NOT NULL REFERENCES public.crew_members(id),
 version text NOT NULL, provenance text NOT NULL CHECK(provenance='synthetic'),
 catalog_sha256 text NOT NULL, literal_document jsonb NOT NULL, source_sha256 text NOT NULL,
 UNIQUE(mission_id,crew_member_id)
);
GRANT ALL ON public.medical_v3_fixture_sources TO service_role;
ALTER TABLE public.medical_v3_fixture_sources ENABLE ROW LEVEL SECURITY;
-- No browser policies/grants: authenticated RPCs only.
CREATE TABLE public.medical_v3_fixture_observations (
 id text PRIMARY KEY, source_id text NOT NULL REFERENCES public.medical_v3_fixture_sources(id),
 metric_id text NOT NULL, domain text NOT NULL, value text NOT NULL, unit text NOT NULL,
 observed_at text NOT NULL, supersedes_id text REFERENCES public.medical_v3_fixture_observations(id),
 CHECK (id<>supersedes_id)
);
GRANT ALL ON public.medical_v3_fixture_observations TO service_role;
ALTER TABLE public.medical_v3_fixture_observations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.medical_v3_fixture_receipts (
 id text PRIMARY KEY, observation_id text NOT NULL REFERENCES public.medical_v3_fixture_observations(id),
 revision integer NOT NULL CHECK(revision>0), previous_id text REFERENCES public.medical_v3_fixture_receipts(id),
 decision text NOT NULL CHECK(decision IN ('accepted','rejected','revoked')),
 receipt_kind text NOT NULL CHECK(receipt_kind='synthetic_test_fixture_not_human_review'),
 source_sha256 text NOT NULL, catalog_sha256 text NOT NULL,
 reviewed_at text NOT NULL, UNIQUE(observation_id,revision)
);
GRANT ALL ON public.medical_v3_fixture_receipts TO service_role;
ALTER TABLE public.medical_v3_fixture_receipts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER medical_v3_fixture_immutable BEFORE UPDATE OR DELETE ON public.medical_v3_fixture_sources
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_immutable();
CREATE TRIGGER medical_v3_fixture_observation_immutable BEFORE UPDATE OR DELETE ON public.medical_v3_fixture_observations
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_immutable();
CREATE TRIGGER medical_v3_fixture_receipt_immutable BEFORE UPDATE OR DELETE ON public.medical_v3_fixture_receipts
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_immutable();

-- Only string/boolean/null and arrays/objects: ASCII key order, compact UTF-8.
CREATE FUNCTION public.medical_v3_canonical_json(p jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE t text:=jsonb_typeof(p); result text;
BEGIN
 IF t IN ('string','boolean','null') THEN RETURN p::text; END IF;
 IF t='array' THEN
  SELECT '['||coalesce(string_agg(public.medical_v3_canonical_json(value),',' ORDER BY ordinality),'')||']'
  INTO result FROM jsonb_array_elements(p) WITH ORDINALITY; RETURN result;
 END IF;
 IF t='object' THEN
  SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.medical_v3_canonical_json(value),',' ORDER BY key COLLATE "C"),'')||'}'
  INTO result FROM jsonb_each(p); RETURN result;
 END IF;
 RAISE EXCEPTION 'unsupported canonical value';
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_canonical_json(jsonb) FROM PUBLIC,anon,authenticated;

-- Resolve unique existing owner-approved scope from server database. Names are not supplied by clients.
CREATE FUNCTION public.medical_v3_fixture_scope() RETURNS TABLE(mission_id text,crew_member_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF (SELECT count(*) FROM public.missions m JOIN public.mission_crew_assignments a ON a.mission_id=m.id
 JOIN public.crew_members c ON c.id=a.crew_member_id
 WHERE m.name='MITOCHONDRIA 2026 - Synthetic Demonstration' AND c.display_name='Alex Morgan'
 AND m.status='active' AND a.status='active' AND c.status='active')<>1
 THEN RAISE EXCEPTION 'unique approved synthetic scope unavailable'; END IF;
 RETURN QUERY SELECT m.id,c.id FROM public.missions m JOIN public.mission_crew_assignments a ON a.mission_id=m.id
 JOIN public.crew_members c ON c.id=a.crew_member_id
 WHERE m.name='MITOCHONDRIA 2026 - Synthetic Demonstration' AND c.display_name='Alex Morgan'
 AND m.status='active' AND a.status='active' AND c.status='active' AND public.medical_v3_has_scope(m.id,c.id);
 IF NOT FOUND THEN RAISE EXCEPTION 'synthetic mission/crew authorization required'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_fixture_scope() FROM PUBLIC,anon,authenticated;

-- No users, assignments or roles are created. Missing existing scope yields no source.
WITH scope AS (
 SELECT m.id mission,c.id crew FROM public.missions m JOIN public.mission_crew_assignments a ON a.mission_id=m.id
 JOIN public.crew_members c ON c.id=a.crew_member_id
 WHERE m.name='MITOCHONDRIA 2026 - Synthetic Demonstration' AND c.display_name='Alex Morgan'
 AND m.status='active' AND c.status='active' AND a.status='active'
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
FROM public.medical_v3_fixture_sources s CROSS JOIN LATERAL jsonb_array_elements(s.literal_document) x;
INSERT INTO public.medical_v3_fixture_receipts
SELECT o.id||'-test-receipt-1',o.id,1,NULL,'accepted','synthetic_test_fixture_not_human_review',
 s.source_sha256,s.catalog_sha256,'2026-10-24T21:06:00Z'
FROM public.medical_v3_fixture_observations o JOIN public.medical_v3_fixture_sources s ON s.id=o.source_id;

CREATE OR REPLACE FUNCTION public.medical_v3_authoritative_evidence(p_mission text,p_crew text)
RETURNS TABLE(canonical_text text,source_ids text[]) LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE scope record; s public.medical_v3_fixture_sources; o record; r public.medical_v3_fixture_receipts;
 items jsonb:='[]'; ids text[]:='{}'; lineage text[]; current_id text; parent record; doc jsonb;
BEGIN
 SELECT * INTO scope FROM public.medical_v3_fixture_scope();
 IF p_mission IS DISTINCT FROM scope.mission_id OR p_crew IS DISTINCT FROM scope.crew_member_id
 THEN RAISE EXCEPTION 'scope mismatch'; END IF;
 SELECT * INTO s FROM public.medical_v3_fixture_sources WHERE mission_id=p_mission AND crew_member_id=p_crew;
 IF NOT FOUND OR s.provenance<>'synthetic' OR s.version<>'mitochondria.synthetic-fixture.v1'
 OR s.catalog_sha256<>'ce2271260428b152778ad67d1cad36306a7913dd3a4442abe3aa11ea65297148'
 OR s.source_sha256<>'sha256-'||encode(extensions.digest(convert_to(public.medical_v3_canonical_json(s.literal_document),'UTF8'),'sha256'),'hex')
 THEN RETURN; END IF;
 -- Full graph validation, including excluded rows. Unknown/forked/cross-source graphs fail closed.
 FOR o IN SELECT * FROM public.medical_v3_fixture_observations WHERE source_id=s.id LOOP
  IF o.metric_id<>'cv-001' OR o.domain<>'cardiovascular' OR o.unit<>'bpm'
  OR o.value!~'^[0-9]+(\.[0-9]+)?$' OR o.observed_at!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$'
  THEN RETURN; END IF;
  PERFORM o.observed_at::timestamptz;
  IF (SELECT count(*) FROM public.medical_v3_fixture_observations WHERE supersedes_id=o.id)>1 THEN RETURN; END IF;
  lineage:=ARRAY[o.id]; current_id:=o.supersedes_id;
  WHILE current_id IS NOT NULL LOOP
   IF current_id=ANY(lineage) THEN RETURN; END IF;
   SELECT * INTO parent FROM public.medical_v3_fixture_observations WHERE id=current_id;
   IF NOT FOUND OR parent.source_id<>s.id OR parent.metric_id<>o.metric_id THEN RETURN; END IF;
   lineage:=array_append(lineage,current_id); current_id:=parent.supersedes_id;
  END LOOP;
  -- Every append-only review receipt must have contiguous, same-observation ancestry.
  IF EXISTS(SELECT 1 FROM public.medical_v3_fixture_receipts x LEFT JOIN public.medical_v3_fixture_receipts p ON p.id=x.previous_id
   WHERE x.observation_id=o.id AND ((x.revision=1 AND x.previous_id IS NOT NULL)
   OR (x.revision>1 AND (p.id IS NULL OR p.observation_id<>x.observation_id OR p.revision<>x.revision-1))))
  THEN RETURN; END IF;
  SELECT * INTO r FROM public.medical_v3_fixture_receipts WHERE observation_id=o.id ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND OR r.source_sha256<>s.source_sha256 OR r.catalog_sha256<>s.catalog_sha256
   OR r.receipt_kind<>'synthetic_test_fixture_not_human_review' THEN RETURN; END IF;
 END LOOP;
 -- Latest effective accepted leaves only. Revoking a correction never resurrects its parent.
 FOR o IN SELECT * FROM public.medical_v3_fixture_observations x WHERE source_id=s.id
 AND NOT EXISTS(SELECT 1 FROM public.medical_v3_fixture_observations c WHERE c.supersedes_id=x.id) ORDER BY id COLLATE "C" LOOP
  SELECT * INTO r FROM public.medical_v3_fixture_receipts WHERE observation_id=o.id ORDER BY revision DESC LIMIT 1;
  IF r.decision<>'accepted' THEN CONTINUE; END IF;
  WITH RECURSIVE chain AS (SELECT o.id id,o.supersedes_id supersedes_id,0 n
   UNION ALL SELECT p.id,p.supersedes_id,c.n+1 FROM chain c JOIN public.medical_v3_fixture_observations p ON p.id=c.supersedes_id)
  SELECT array_agg(id ORDER BY n) INTO lineage FROM chain;
  items:=items||jsonb_build_array(jsonb_build_object('id',o.id,'metric',o.metric_id,'domain',o.domain,'value',o.value,
   'unit',o.unit,'time',o.observed_at,'supersedesId',o.supersedes_id,'lineage',to_jsonb(lineage),
   'reviewReceipt',jsonb_build_object('id',r.id,'decision',r.decision,'kind',r.receipt_kind,'reviewedAt',r.reviewed_at)));
  ids:=array_append(ids,o.id);
 END LOOP;
 IF cardinality(ids)=0 THEN RETURN; END IF;
 doc:=jsonb_build_object('schema','mitochondria.synthetic-evidence.v2','missionId',p_mission,'crewMemberId',p_crew,
 'provenance','synthetic','sourceId',s.id,'sourceVersion',s.version,'sourceSha256',s.source_sha256,
 'catalogSha256',s.catalog_sha256,'observations',items);
 RETURN QUERY SELECT public.medical_v3_canonical_json(doc),ids;
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_authoritative_evidence(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.medical_v3_ai_evidence(p_mission text,p_crew text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE canonical text; result jsonb;
BEGIN
 SELECT canonical_text INTO canonical FROM public.medical_v3_authoritative_evidence(p_mission,p_crew);
 IF canonical IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',o->>'id','metric',o->>'metric','domain',o->>'domain',
 'value',o->>'value','unit',o->>'unit','time',o->>'time') ORDER BY o->>'id' COLLATE "C") INTO result
 FROM jsonb_array_elements(canonical::jsonb->'observations') o;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_ai_evidence(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.medical_v3_ai_evidence(text,text) TO authenticated;

CREATE FUNCTION public.medical_v3_fixture_snapshot() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE scope record; canonical text;
BEGIN
 SELECT * INTO scope FROM public.medical_v3_fixture_scope();
 SELECT canonical_text INTO canonical FROM public.medical_v3_authoritative_evidence(scope.mission_id,scope.crew_member_id);
 IF canonical IS NULL THEN RAISE EXCEPTION 'authoritative synthetic source unavailable'; END IF;
 RETURN jsonb_build_object('missionId',scope.mission_id,'crewMemberId',scope.crew_member_id,'canonical',canonical,
 'sha256','sha256-'||encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex'),
 'evidence',public.medical_v3_ai_evidence(scope.mission_id,scope.crew_member_id));
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_fixture_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.medical_v3_fixture_snapshot() TO authenticated;

-- Revoke must preserve the approved digest even when current source is unavailable.
CREATE FUNCTION public.medical_v3_revoke_digest_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.event_type='revoked' AND NOT EXISTS(SELECT 1 FROM public.medical_advisor_review_events p
 WHERE p.id=NEW.previous_event_id AND p.event_type='approved' AND p.evidence_sha256=NEW.evidence_sha256)
 THEN RAISE EXCEPTION 'revocation must bind previous approval digest'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER medical_v3_revoke_digest_guard BEFORE INSERT ON public.medical_advisor_review_events
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_revoke_digest_guard();
REVOKE ALL ON FUNCTION public.medical_v3_revoke_digest_guard() FROM PUBLIC,anon,authenticated;