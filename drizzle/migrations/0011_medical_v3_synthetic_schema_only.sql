-- OWNER APPROVAL REQUIRED: schema-only alternative; never combine with older pending bundles.
-- No production execution authorized. Tool supplies the atomic transaction; seed is separate.
-- Serialize candidate applications; hold scope prerequisites through fixture creation.
SELECT pg_advisory_xact_lock(hashtextextended('medical-v3-production-candidate',0));
LOCK TABLE public.missions,public.crew_members,public.mission_crew_assignments,public.mission_memberships IN SHARE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND (c.relname LIKE 'medical_v3_%' OR c.relname IN ('medical_advisor_review_events','medical_ai_quota_reservations')))
 OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'medical_v3_%')
  THEN RAISE EXCEPTION 'v3 namespace must be empty; do not overwrite existing authority'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.missions m JOIN public.mission_crew_assignments a ON a.mission_id=m.id
 JOIN public.crew_members c ON c.id=a.crew_member_id JOIN public.mission_memberships mm ON mm.mission_id=m.id AND mm.crew_member_id=c.id
 WHERE m.id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND m.code='MITO_DEMO_2026' AND m.name='MITOCHONDRIA 2026 - Synthetic Demonstration' AND c.id='crew-9806e7e611f44dc38dac5e23f7740f1a' AND c.display_name='Alex Morgan — Synthetic Astronaut' AND m.status='planning' AND a.status='active' AND c.status='active'
 AND mm.id='63470171-3a22-4075-b197-ac85b90cb0ef' AND mm.active AND mm.role='ground_medical')
 THEN RAISE EXCEPTION 'exact existing synthetic scope/membership prerequisite unavailable'; END IF;
 PERFORM extensions.digest(convert_to('preflight','UTF8'),'sha256');
END $$;
-- Medical governance v3: OWNER APPROVAL REQUIRED. Disposable harness only.
-- No authoritative source adapter exists for encrypted offline unified observations.
-- The resolver deliberately returns NULL: durable approvals and AI transfer fail closed.
CREATE TABLE IF NOT EXISTS public.medical_advisor_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL REFERENCES public.missions(id),
  crew_member_id text NOT NULL REFERENCES public.crew_members(id),
  provenance text NOT NULL DEFAULT 'synthetic' CHECK (provenance = 'synthetic'),
  actor_user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('draft_created','returned','approved','revoked','superseded')),
  revision integer NOT NULL CHECK (revision > 0),
  previous_event_id uuid REFERENCES public.medical_advisor_review_events(id),
  request_id uuid NOT NULL,
  request_sha256 text NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^sha256-[a-f0-9]{64}$'),
  canonical_evidence text,
  source_record_ids text[] NOT NULL DEFAULT '{}',
  draft_text text NOT NULL CHECK (length(draft_text) BETWEEN 1 AND 12000),
  final_text text NOT NULL CHECK (length(final_text) <= 12000),
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  model_metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE (actor_user_id, request_id),
  UNIQUE (mission_id, crew_member_id, provenance, revision)
);
REVOKE ALL ON public.medical_advisor_review_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.medical_advisor_review_events TO service_role;
ALTER TABLE public.medical_advisor_review_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.medical_v3_has_scope(p_mission text, p_crew text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.mission_memberships
 WHERE user_id=auth.uid() AND active AND role='ground_medical'
 AND mission_id=p_mission AND crew_member_id=p_crew)
$$;
REVOKE ALL ON FUNCTION public.medical_v3_has_scope(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.medical_v3_has_scope(text,text) TO authenticated;
DROP POLICY IF EXISTS medical_v3_scoped_read ON public.medical_advisor_review_events;
CREATE POLICY medical_v3_scoped_read ON public.medical_advisor_review_events
FOR SELECT TO authenticated USING (public.medical_v3_has_scope(mission_id,crew_member_id));

CREATE OR REPLACE FUNCTION public.medical_v3_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 RAISE EXCEPTION 'append-only history: mutation denied'; END $$;
DROP TRIGGER IF EXISTS medical_v3_immutable ON public.medical_advisor_review_events;
CREATE TRIGGER medical_v3_immutable BEFORE UPDATE OR DELETE ON public.medical_advisor_review_events
FOR EACH ROW EXECUTE FUNCTION public.medical_v3_immutable();

-- Internal contract: an approved adapter must reconstruct exact canonicalEvidence UTF-8
-- and source IDs from immutable reviewer-accepted records, checking classification,
-- provenance, revocations, corrections and current versions. NEVER accept client snapshots.
CREATE OR REPLACE FUNCTION public.medical_v3_authoritative_evidence(p_mission text,p_crew text)
RETURNS TABLE(canonical_text text, source_ids text[]) LANGUAGE sql STABLE
SECURITY DEFINER SET search_path=public AS $$
 SELECT NULL::text, NULL::text[] WHERE false
$$;
REVOKE ALL ON FUNCTION public.medical_v3_authoritative_evidence(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.medical_v3_append_review(
 p_mission text,p_crew text,p_type text,p_previous uuid,p_request uuid,
 p_sha text,p_draft text,p_final text,p_rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE actor uuid:=auth.uid(); prev public.medical_advisor_review_events; prior public.medical_advisor_review_events;
 canonical text; ids text[]; server_sha text; payload_sha text; receipt public.medical_advisor_review_events;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 PERFORM 1 FROM public.mission_memberships WHERE user_id=actor AND active AND role='ground_medical'
 AND mission_id=p_mission AND crew_member_id=p_crew FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'mission/crew authorization required'; END IF;
 IF p_type IS NULL OR p_type NOT IN ('draft_created','returned','approved','revoked','superseded')
 OR p_request IS NULL OR p_sha IS NULL OR p_sha !~ '^sha256-[a-f0-9]{64}$'
 OR p_draft IS NULL OR length(trim(p_draft)) NOT BETWEEN 1 AND 12000
 OR p_final IS NULL OR length(p_final)>12000 OR p_rationale IS NULL OR length(trim(p_rationale)) NOT BETWEEN 1 AND 2000
 THEN RAISE EXCEPTION 'invalid review input'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-review:'||p_mission||':'||p_crew,0));
 payload_sha:=encode(extensions.digest(convert_to(jsonb_build_array(p_mission,p_crew,p_type,p_previous,p_sha,p_draft,p_final,p_rationale)::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM public.medical_advisor_review_events WHERE actor_user_id=actor AND request_id=p_request;
 IF FOUND THEN
  IF prior.request_sha256<>payload_sha THEN RAISE EXCEPTION 'idempotency conflict'; END IF;
  RETURN to_jsonb(prior); END IF;
 SELECT * INTO prev FROM public.medical_advisor_review_events WHERE mission_id=p_mission AND crew_member_id=p_crew ORDER BY revision DESC LIMIT 1;
 IF prev.id IS DISTINCT FROM p_previous THEN RAISE EXCEPTION 'stale revision'; END IF;
 IF (prev.id IS NULL AND p_type<>'draft_created') OR
 (prev.id IS NOT NULL AND ((p_type='draft_created' AND prev.event_type NOT IN ('revoked','superseded'))
 OR (p_type='approved' AND (prev.event_type NOT IN ('draft_created','returned') OR length(trim(p_final))=0))
 OR (p_type='returned' AND prev.event_type NOT IN ('draft_created','returned'))
 OR (p_type IN ('revoked','superseded') AND prev.event_type<>'approved')))
 THEN RAISE EXCEPTION 'invalid transition'; END IF;
 IF p_type <> 'revoked' THEN
  SELECT canonical_text,source_ids INTO canonical,ids FROM public.medical_v3_authoritative_evidence(p_mission,p_crew);
  IF canonical IS NULL OR coalesce(cardinality(ids),0)<1 THEN RAISE EXCEPTION 'authoritative evidence unavailable'; END IF;
  server_sha:='sha256-'||encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex');
  IF server_sha<>p_sha THEN RAISE EXCEPTION 'stale or tampered evidence'; END IF;
 END IF;
 INSERT INTO public.medical_advisor_review_events(mission_id,crew_member_id,actor_user_id,event_type,revision,previous_event_id,
 request_id,request_sha256,evidence_sha256,canonical_evidence,source_record_ids,draft_text,final_text,rationale)
 VALUES(p_mission,p_crew,actor,p_type,coalesce(prev.revision,0)+1,p_previous,p_request,payload_sha,p_sha,canonical,coalesce(ids,'{}'),p_draft,p_final,p_rationale)
 RETURNING * INTO receipt;
 RETURN to_jsonb(receipt);
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text) FROM authenticated,service_role;

CREATE OR REPLACE FUNCTION public.medical_v3_review_history(p_mission text,p_crew text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE canonical text; current_sha text;
BEGIN
 IF NOT public.medical_v3_has_scope(p_mission,p_crew) THEN RAISE EXCEPTION 'access denied'; END IF;
 SELECT canonical_text INTO canonical FROM public.medical_v3_authoritative_evidence(p_mission,p_crew);
 current_sha:='sha256-'||encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex');
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(e)-'canonical_evidence'-'model_metadata'-'request_sha256' || jsonb_build_object(
 'verified_current',coalesce(e.event_type='approved' AND e.evidence_sha256=current_sha
 AND EXISTS(SELECT 1 FROM public.mission_memberships m WHERE m.user_id=e.actor_user_id AND m.active AND m.role='ground_medical'
 AND m.mission_id=p_mission AND m.crew_member_id=p_crew)
 AND e.revision=(SELECT max(revision) FROM public.medical_advisor_review_events WHERE mission_id=p_mission AND crew_member_id=p_crew),false)))
 FROM public.medical_advisor_review_events e WHERE e.mission_id=p_mission AND e.crew_member_id=p_crew),'[]');
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_review_history(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.medical_v3_review_history(text,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.medical_ai_quota_reservations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid NOT NULL,
 mission_id text NOT NULL REFERENCES public.missions(id), crew_member_id text NOT NULL REFERENCES public.crew_members(id),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(), released_at timestamptz,
 lease_until timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '35 seconds')
);
GRANT ALL ON public.medical_ai_quota_reservations TO service_role;
ALTER TABLE public.medical_ai_quota_reservations ENABLE ROW LEVEL SECURITY;
-- No client table grants or policies: only caller-authenticated RPCs.
CREATE OR REPLACE FUNCTION public.medical_v3_reserve_ai(p_mission text,p_crew text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); receipt uuid; t timestamptz:=clock_timestamp();
BEGIN
 IF NOT public.medical_v3_has_scope(p_mission,p_crew) THEN RAISE EXCEPTION 'access denied'; END IF;
 PERFORM 1 FROM public.mission_memberships WHERE user_id=actor AND active AND role='ground_medical' AND mission_id=p_mission AND crew_member_id=p_crew FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope revoked'; END IF;
 PERFORM canonical_text FROM public.medical_v3_authoritative_evidence(p_mission,p_crew);
 IF NOT FOUND THEN RAISE EXCEPTION 'authoritative evidence unavailable'; END IF;
 -- Global user before mission: deterministic lock ordering; quota commits BEFORE provider call.
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-ai-user:'||actor::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-ai-mission:'||p_mission,0));
 t:=clock_timestamp();
 IF (SELECT count(*) FROM public.medical_ai_quota_reservations WHERE actor_user_id=actor AND reserved_at>t-interval '1 minute')>=5
 OR (SELECT count(*) FROM public.medical_ai_quota_reservations WHERE mission_id=p_mission AND reserved_at>t-interval '1 minute')>=20
 OR EXISTS(SELECT 1 FROM public.medical_ai_quota_reservations WHERE actor_user_id=actor AND released_at IS NULL AND lease_until>t)
 THEN RETURN jsonb_build_object('allowed',false,'retryAfter',60); END IF;
 INSERT INTO public.medical_ai_quota_reservations(actor_user_id,mission_id,crew_member_id) VALUES(actor,p_mission,p_crew) RETURNING id INTO receipt;
 RETURN jsonb_build_object('allowed',true,'reservationId',receipt);
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_reserve_ai(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.medical_v3_reserve_ai(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.medical_v3_release_ai(p_reservation uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.medical_ai_quota_reservations SET released_at=clock_timestamp()
 WHERE id=p_reservation AND actor_user_id=auth.uid() AND released_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.medical_v3_release_ai(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.medical_v3_release_ai(uuid) TO authenticated;

-- Caller-scoped AI projection; unavailable until a separately approved source adapter
-- can attest synthetic provenance and exact metric/value/unit/time from accepted records.
CREATE OR REPLACE FUNCTION public.medical_v3_ai_evidence(p_mission text,p_crew text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.medical_v3_has_scope(p_mission,p_crew) THEN RAISE EXCEPTION 'access denied'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_ai_evidence(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.medical_v3_ai_evidence(text,text) TO authenticated;
-- OWNER APPROVAL REQUIRED. Stage after 20261024000000; disposable validation only.
-- New invented fixture literals; NEVER reads offline observations or accepts browser receipts.
CREATE TABLE IF NOT EXISTS public.medical_v3_fixture_sources (
 id text PRIMARY KEY, mission_id text NOT NULL REFERENCES public.missions(id),
 crew_member_id text NOT NULL REFERENCES public.crew_members(id),
 version text NOT NULL, provenance text NOT NULL CHECK(provenance='synthetic'),
 catalog_sha256 text NOT NULL, literal_document jsonb NOT NULL, source_sha256 text NOT NULL,
 UNIQUE(mission_id,crew_member_id)
);
GRANT ALL ON public.medical_v3_fixture_sources TO service_role;
ALTER TABLE public.medical_v3_fixture_sources ENABLE ROW LEVEL SECURITY;
-- No browser policies/grants: authenticated RPCs only.
CREATE TABLE IF NOT EXISTS public.medical_v3_fixture_observations (
 id text PRIMARY KEY, source_id text NOT NULL REFERENCES public.medical_v3_fixture_sources(id),
 metric_id text NOT NULL, domain text NOT NULL, value text NOT NULL, unit text NOT NULL,
 observed_at text NOT NULL, supersedes_id text REFERENCES public.medical_v3_fixture_observations(id),
 CHECK (id<>supersedes_id)
);
GRANT ALL ON public.medical_v3_fixture_observations TO service_role;
ALTER TABLE public.medical_v3_fixture_observations ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.medical_v3_fixture_receipts (
 id text PRIMARY KEY, observation_id text NOT NULL REFERENCES public.medical_v3_fixture_observations(id),
 revision integer NOT NULL CHECK(revision>0), previous_id text REFERENCES public.medical_v3_fixture_receipts(id),
 decision text NOT NULL CHECK(decision IN ('accepted','rejected','revoked')),
 receipt_kind text NOT NULL CHECK(receipt_kind='synthetic_test_fixture_not_human_review'),
 source_sha256 text NOT NULL, catalog_sha256 text NOT NULL,
 reviewed_at text NOT NULL, UNIQUE(observation_id,revision)
);
GRANT ALL ON public.medical_v3_fixture_receipts TO service_role;
ALTER TABLE public.medical_v3_fixture_receipts ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS medical_v3_fixture_immutable ON public.medical_v3_fixture_sources;
CREATE TRIGGER medical_v3_fixture_immutable BEFORE UPDATE OR DELETE ON public.medical_v3_fixture_sources
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_immutable();
DROP TRIGGER IF EXISTS medical_v3_fixture_observation_immutable ON public.medical_v3_fixture_observations;
CREATE TRIGGER medical_v3_fixture_observation_immutable BEFORE UPDATE OR DELETE ON public.medical_v3_fixture_observations
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_immutable();
DROP TRIGGER IF EXISTS medical_v3_fixture_receipt_immutable ON public.medical_v3_fixture_receipts;
CREATE TRIGGER medical_v3_fixture_receipt_immutable BEFORE UPDATE OR DELETE ON public.medical_v3_fixture_receipts
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_immutable();

-- Only string/boolean/null and arrays/objects: ASCII key order, compact UTF-8.
CREATE OR REPLACE FUNCTION public.medical_v3_canonical_json(p jsonb) RETURNS text
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
CREATE OR REPLACE FUNCTION public.medical_v3_fixture_scope() RETURNS TABLE(mission_id text,crew_member_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF (SELECT count(*) FROM public.missions m JOIN public.mission_crew_assignments a ON a.mission_id=m.id
 JOIN public.crew_members c ON c.id=a.crew_member_id
 WHERE m.id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND m.code='MITO_DEMO_2026' AND m.name='MITOCHONDRIA 2026 - Synthetic Demonstration' AND c.id='crew-9806e7e611f44dc38dac5e23f7740f1a' AND c.display_name='Alex Morgan — Synthetic Astronaut'
 AND m.status='planning' AND a.status='active' AND c.status='active')<>1
 THEN RAISE EXCEPTION 'unique approved synthetic scope unavailable'; END IF;
 RETURN QUERY SELECT m.id,c.id FROM public.missions m JOIN public.mission_crew_assignments a ON a.mission_id=m.id
 JOIN public.crew_members c ON c.id=a.crew_member_id
 WHERE m.id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND m.code='MITO_DEMO_2026' AND m.name='MITOCHONDRIA 2026 - Synthetic Demonstration' AND c.id='crew-9806e7e611f44dc38dac5e23f7740f1a' AND c.display_name='Alex Morgan — Synthetic Astronaut'
 AND m.status='planning' AND a.status='active' AND c.status='active' AND public.medical_v3_has_scope(m.id,c.id);
 IF NOT FOUND THEN RAISE EXCEPTION 'synthetic mission/crew authorization required'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_fixture_scope() FROM PUBLIC,anon,authenticated;

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
  IF o.supersedes_id IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.literal_document) x
   WHERE x->>'id'=o.id AND x->>'metric'=o.metric_id AND x->>'domain'=o.domain
   AND x->>'value'=o.value AND x->>'unit'=o.unit AND x->>'time'=o.observed_at)
  THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.medical_v3_fixture_observations WHERE supersedes_id=o.id)>1 THEN RETURN; END IF;
  lineage:=ARRAY[o.id]; current_id:=o.supersedes_id;
  WHILE current_id IS NOT NULL LOOP
   IF current_id=ANY(lineage) THEN RETURN; END IF;
   SELECT * INTO parent FROM public.medical_v3_fixture_observations WHERE id=current_id;
   IF NOT FOUND OR parent.source_id<>s.id OR parent.metric_id<>o.metric_id THEN RETURN; END IF;
   lineage:=array_append(lineage,current_id); current_id:=parent.supersedes_id;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.literal_document) x WHERE x->>'id'=lineage[cardinality(lineage)])
  THEN RETURN; END IF;
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

CREATE OR REPLACE FUNCTION public.medical_v3_fixture_snapshot() RETURNS jsonb
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
CREATE OR REPLACE FUNCTION public.medical_v3_revoke_digest_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.event_type='revoked' AND NOT EXISTS(SELECT 1 FROM public.medical_advisor_review_events p
 WHERE p.id=NEW.previous_event_id AND p.event_type='approved' AND p.evidence_sha256=NEW.evidence_sha256)
 THEN RAISE EXCEPTION 'revocation must bind previous approval digest'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS medical_v3_revoke_digest_guard ON public.medical_advisor_review_events;
CREATE TRIGGER medical_v3_revoke_digest_guard BEFORE INSERT ON public.medical_advisor_review_events
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_revoke_digest_guard();
REVOKE ALL ON FUNCTION public.medical_v3_revoke_digest_guard() FROM PUBLIC,anon,authenticated;

-- Direct authenticated append RPC calls must enforce the same strict fixture citation vocabulary.
CREATE OR REPLACE FUNCTION public.medical_v3_fixture_text_valid(p_text text,p_canonical text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE line text; observation jsonb; ids text[]; token text; remainder text;
BEGIN
 IF p_canonical IS NULL OR length(trim(p_text))=0 THEN RETURN false; END IF;
 SELECT array_agg(o->>'id') INTO ids FROM jsonb_array_elements(p_canonical::jsonb->'observations') o;
 FOR line IN SELECT unnest(string_to_array(p_text,E'\n')) LOOP
  IF trim(line)='' THEN CONTINUE; END IF;
  IF line !~ '\[[a-zA-Z0-9:_-]+(\s*[,;]\s*[a-zA-Z0-9:_-]+)*\]' THEN RETURN false; END IF;
  FOR token IN SELECT unnest(string_to_array(regexp_replace(m[1],'\s','','g'),','))
   FROM regexp_matches(line,'\[([^\]]+)\]','g') m LOOP
   IF NOT token=ANY(ids) THEN RETURN false; END IF;
  END LOOP;
  remainder:=regexp_replace(line,'\[[^\]]+\]','','g');
  FOR observation IN SELECT value FROM jsonb_array_elements(p_canonical::jsonb->'observations') LOOP
   IF position('['||(observation->>'id')||']' IN line)>0 THEN
    remainder:=replace(remainder,observation->>'metric','');
    remainder:=replace(remainder,(observation->>'value')||' '||(observation->>'unit'),'');
    remainder:=replace(remainder,observation->>'time','');
   END IF;
  END LOOP;
  -- Deliberately narrow controlled vocabulary. Unknown biomarkers/ranges/claims fail closed.
  remainder:=regexp_replace(lower(remainder),'\m(recorded|at|on|value|observation|fixture|synthetic|research|only|unverified|ai|generated|not|clinically|approved|and|is|was|the|evidence|requires|independent|advisor|review)\M','','g');
  IF remainder ~ '[a-z0-9]' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_fixture_text_valid(text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.medical_v3_fixture_review_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.event_type<>'revoked' AND (
 NOT public.medical_v3_fixture_text_valid(NEW.draft_text,NEW.canonical_evidence)
 OR (length(trim(NEW.final_text))>0 AND NOT public.medical_v3_fixture_text_valid(NEW.final_text,NEW.canonical_evidence)))
 THEN RAISE EXCEPTION 'unsupported fixture statement or invalid citation'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.medical_v3_fixture_review_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS medical_v3_fixture_review_guard ON public.medical_advisor_review_events;
CREATE TRIGGER medical_v3_fixture_review_guard BEFORE INSERT ON public.medical_advisor_review_events
 FOR EACH ROW EXECUTE FUNCTION public.medical_v3_fixture_review_guard();
-- Production demo has no persistent medical review capability, even for direct SQL callers.
CREATE FUNCTION public.medical_v3_demo_deny_persistence() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'persistent Medical Advisor reviews disabled for synthetic demo'; END $$;
REVOKE ALL ON FUNCTION public.medical_v3_demo_deny_persistence() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER medical_v3_demo_deny_persistence BEFORE INSERT ON public.medical_advisor_review_events
FOR EACH ROW EXECUTE FUNCTION public.medical_v3_demo_deny_persistence();
REVOKE ALL ON FUNCTION public.medical_v3_immutable() FROM PUBLIC,anon,authenticated;
-- Schema commit intentionally contains no authoritative fixtures. RPCs fail closed until separate seed approval.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.medical_v3_fixture_sources) OR EXISTS(SELECT 1 FROM public.medical_v3_fixture_observations) OR EXISTS(SELECT 1 FROM public.medical_v3_fixture_receipts) OR EXISTS(SELECT 1 FROM public.medical_ai_quota_reservations) OR EXISTS(SELECT 1 FROM public.medical_advisor_review_events) THEN RAISE EXCEPTION 'seed requires empty approved tables; rerun or partial completion denied'; END IF;
END $$;
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
-- Only these four authenticated SECURITY DEFINER RPCs are exposed; helpers/history/append are internal.
GRANT EXECUTE ON FUNCTION public.medical_v3_fixture_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.medical_v3_ai_evidence(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.medical_v3_reserve_ai(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.medical_v3_release_ai(uuid) TO authenticated;
