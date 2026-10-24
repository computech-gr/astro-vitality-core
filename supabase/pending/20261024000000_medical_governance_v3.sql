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
GRANT SELECT ON public.medical_advisor_review_events TO authenticated;
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
 OR p_draft IS NULL OR length(p_draft) NOT BETWEEN 1 AND 12000
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
 (prev.id IS NOT NULL AND ((p_type='approved' AND prev.event_type NOT IN ('draft_created','returned'))
 OR (p_type='returned' AND prev.event_type NOT IN ('draft_created','returned'))
 OR (p_type IN ('revoked','superseded') AND prev.event_type<>'approved')))
 THEN RAISE EXCEPTION 'invalid transition'; END IF;
 IF p_type IN ('approved','superseded') THEN
  SELECT canonical_text,source_ids INTO canonical,ids FROM public.medical_v3_authoritative_evidence(p_mission,p_crew);
  IF canonical IS NULL OR cardinality(ids)<1 THEN RAISE EXCEPTION 'authoritative evidence unavailable'; END IF;
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
GRANT EXECUTE ON FUNCTION public.medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text) TO authenticated;

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
 -- Global user before mission: deterministic lock ordering; quota commits BEFORE provider call.
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-ai-user:'||actor::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-ai-mission:'||p_mission,0));
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