-- PENDING permanent synthetic research v2; schema only. Apply only with separate owner approval.
-- Managed execution must wrap the complete artifact in one transaction.
DO $preflight$ BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'trusted SQL owner required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-demo-authorization',0));
 IF to_regclass('public.medical_research_policy') IS NOT NULL THEN RAISE EXCEPTION 'policy already installed'; END IF;
 IF to_regprocedure('public.medical_demo_scope()') IS NULL OR to_regprocedure('public.medical_v3_fixture_snapshot()') IS NULL THEN RAISE EXCEPTION 'base prerequisites missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.medical_demo_authorization WHERE enabled OR active_attempt IS NOT NULL) THEN RAISE EXCEPTION 'legacy authorization must be paused and reconciled first'; END IF;
 IF EXISTS(SELECT 1 FROM public.medical_advisor_review_events) OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.medical_advisor_review_events'::regclass AND tgname='medical_v3_demo_deny_persistence' AND tgenabled='O') THEN RAISE EXCEPTION 'persistence denial prerequisite failed'; END IF;
 IF (SELECT count(*) FROM public.medical_v3_fixture_observations)<>2 OR EXISTS(SELECT 1 FROM public.medical_v3_fixture_observations WHERE (id,value,unit,observed_at) NOT IN (('synthetic-v3-hr-001','62','bpm','2026-10-01T10:00:00Z'),('synthetic-v3-hr-002','66','bpm','2026-10-02T10:00:00Z'))) THEN RAISE EXCEPTION 'exact fixture prerequisite failed'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
 ('medical_demo_scope()','cf418845a357b92412fdc65b73c715f2528ffe8d14e7ba4bdab2e8efa6587b64'),
 ('medical_demo_reserve(text,text)','f85339f472469895897965a96b705af4c58c5232270e676d005454d14fa67544'),
 ('medical_demo_dispatch(uuid,text,text)','191d289c09a812e7214d0f3e6ba8b1894f2090d65adb90c26099c0b65e58e418')) e(sig,sha) LEFT JOIN pg_proc p ON p.oid=to_regprocedure('public.'||e.sig) WHERE p.oid IS NULL OR encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex')<>e.sha OR p.proowner<>'postgres'::regrole) THEN RAISE EXCEPTION 'legacy fingerprint mismatch'; END IF;
END $preflight$;
CREATE TABLE public.medical_research_owners(user_id uuid PRIMARY KEY, granted_at timestamptz NOT NULL DEFAULT clock_timestamp());
GRANT ALL ON public.medical_research_owners TO postgres;
REVOKE ALL ON public.medical_research_owners FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.medical_research_owners ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.medical_research_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 budget_microusd bigint NOT NULL DEFAULT 0 CHECK(budget_microusd BETWEEN 0 AND 100000000000),
 rolling_limit integer NOT NULL DEFAULT 10 CHECK(rolling_limit BETWEEN 1 AND 10000),
 rolling_seconds integer NOT NULL DEFAULT 1800 CHECK(rolling_seconds BETWEEN 60 AND 2678400),
 evidence_sha text NOT NULL, active_attempt uuid, provider_project text,
 sync_required boolean NOT NULL DEFAULT false, revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
GRANT ALL ON public.medical_research_policy TO postgres;
REVOKE ALL ON public.medical_research_policy FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.medical_research_policy ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.medical_research_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, nonce_sha text NOT NULL UNIQUE,
 evidence_sha text NOT NULL, quota_id uuid NOT NULL, month date NOT NULL,
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(), dispatched_at timestamptz, finished_at timestamptz,
 hold_microusd bigint NOT NULL DEFAULT 100000 CHECK(hold_microusd=100000),
 estimated_usage_microusd bigint, input_tokens integer, output_tokens integer, provider_request_id text,
 outcome text NOT NULL DEFAULT 'reserved' CHECK(outcome IN ('reserved','dispatched','success','invalid_answer','credit_exhausted','spend_limit','rate_limit','provider_outage','unknown','cancelled')));
GRANT ALL ON public.medical_research_attempts TO postgres;
REVOKE ALL ON public.medical_research_attempts FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.medical_research_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX medical_research_attempt_month ON public.medical_research_attempts(month);
CREATE INDEX medical_research_attempt_actor_time ON public.medical_research_attempts(actor_id,reserved_at);
CREATE TABLE public.medical_research_provider_sync(
 month date PRIMARY KEY, project_id text NOT NULL, recorded_microusd bigint NOT NULL CHECK(recorded_microusd>=0),
 provider_input_tokens bigint NOT NULL, provider_output_tokens bigint NOT NULL, provider_requests bigint NOT NULL,
 synchronized_at timestamptz NOT NULL DEFAULT clock_timestamp());
GRANT ALL ON public.medical_research_provider_sync TO postgres;
REVOKE ALL ON public.medical_research_provider_sync FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.medical_research_provider_sync ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.medical_research_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),at timestamptz NOT NULL DEFAULT clock_timestamp(),actor_id uuid,action text NOT NULL,details jsonb NOT NULL);
GRANT ALL ON public.medical_research_audit TO postgres;
REVOKE ALL ON public.medical_research_audit FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.medical_research_audit ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.medical_research_is_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM public.medical_research_owners WHERE user_id=auth.uid()) $$;
-- Trusted SQL-only provisioning, separate activation approval, never inferred from a mission role.
CREATE FUNCTION public.medical_research_provision(p_owner uuid,p_sha text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE snap jsonb; BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') OR p_owner IS NULL OR EXISTS(SELECT 1 FROM public.medical_research_policy) THEN RAISE EXCEPTION 'trusted once-only provisioning required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mission_memberships WHERE user_id=p_owner AND active AND role='ground_medical' AND mission_id='mission-9d8ce8f3e5554509a0885461f9ad2e1c') THEN RAISE EXCEPTION 'owner identity missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub','22a72429-1674-4174-9b27-ba63db3c0279',true);
 snap:=public.medical_v3_fixture_snapshot();
 IF snap->>'sha256' IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'authoritative digest mismatch'; END IF;
 INSERT INTO public.medical_research_owners(user_id) VALUES(p_owner);
 INSERT INTO public.medical_research_policy(evidence_sha) VALUES(p_sha);
 INSERT INTO public.medical_research_audit(actor_id,action,details) VALUES(p_owner,'provisioned_paused',jsonb_build_object('sha',p_sha));
END $$;
CREATE FUNCTION public.medical_research_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE p public.medical_research_policy; held bigint; recorded bigint; synced timestamptz; requests bigint; failures bigint; it bigint; ot bigint; m date:=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date; scoped boolean; used bigint; BEGIN
 scoped:=public.medical_demo_scope();
 IF scoped IS DISTINCT FROM true AND NOT public.medical_research_is_owner() THEN RAISE EXCEPTION 'scope denied'; END IF;
 SELECT * INTO p FROM public.medical_research_policy WHERE singleton;
 SELECT coalesce(sum(hold_microusd),0),count(*),count(*) FILTER(WHERE outcome NOT IN ('success','reserved','dispatched')),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0) INTO held,requests,failures,it,ot FROM public.medical_research_attempts WHERE month=m;
 SELECT recorded_microusd,synchronized_at INTO recorded,synced FROM public.medical_research_provider_sync WHERE month=m AND project_id=p.provider_project;
 -- Deliberately additive: delayed/external provider spend never refunds irreversible holds.
 used:=held+coalesce(recorded,0);
 RETURN jsonb_build_object('version','synthetic-research-v2','owner',public.medical_research_is_owner(),'enabled',coalesce(p.enabled,false),
 'eligible',coalesce(scoped AND p.enabled AND p.active_attempt IS NULL AND used+100000<=p.budget_microusd AND (NOT p.sync_required OR synced>clock_timestamp()-interval '1 hour') AND (SELECT count(*) FROM public.medical_research_attempts WHERE actor_id=auth.uid() AND reserved_at>clock_timestamp()-make_interval(secs=>p.rolling_seconds))<p.rolling_limit,false),
 'attempts',requests,'heldMicrousd',held,'budgetMicrousd',coalesce(p.budget_microusd,0),'remainingMicrousd',greatest(0,coalesce(p.budget_microusd,0)-used),'recordedMicrousd',recorded,'synchronizedAt',synced,'inputTokens',it,'outputTokens',ot,'failures',failures,'rollingLimit',p.rolling_limit,'rollingSeconds',p.rolling_seconds,'providerProject',p.provider_project,'syncRequired',p.sync_required,'activeAttempt',p.active_attempt,'revision',p.revision,'month',m);
END $$;
CREATE FUNCTION public.medical_research_configure(p_enabled boolean,p_budget bigint,p_limit integer,p_seconds integer,p_project text,p_sync boolean,p_revision bigint,p_ref text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE p public.medical_research_policy; BEGIN
 IF NOT public.medical_research_is_owner() OR p_ref IS NULL OR length(p_ref) NOT BETWEEN 1 AND 200 OR p_enabled IS NULL OR p_sync IS NULL OR p_budget IS NULL OR p_limit IS NULL OR p_seconds IS NULL THEN RAISE EXCEPTION 'owner and valid configuration required'; END IF;
 SELECT * INTO p FROM public.medical_research_policy WHERE singleton FOR UPDATE;
 IF NOT FOUND OR p.revision IS DISTINCT FROM p_revision OR (p_enabled AND p.active_attempt IS NOT NULL) OR (p_sync AND (p_project IS NULL OR p_project !~ '^proj_[A-Za-z0-9_-]+$')) OR (p.provider_project IS NOT NULL AND p_project IS DISTINCT FROM p.provider_project) THEN RAISE EXCEPTION 'stale revision, unresolved attempt or immutable project mismatch'; END IF;
 UPDATE public.medical_research_policy SET enabled=p_enabled,budget_microusd=p_budget,rolling_limit=p_limit,rolling_seconds=p_seconds,provider_project=p_project,sync_required=p_sync,revision=revision+1,updated_at=clock_timestamp() WHERE singleton;
 INSERT INTO public.medical_research_audit(actor_id,action,details) VALUES(auth.uid(),CASE WHEN p_enabled THEN 'configured_resumed' ELSE 'configured_paused' END,jsonb_build_object('reference',p_ref,'budget',p_budget,'limit',p_limit,'seconds',p_seconds));
END $$;
CREATE FUNCTION public.medical_research_pause(p_ref text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$ BEGIN
 IF NOT public.medical_research_is_owner() OR p_ref IS NULL OR length(p_ref) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'owner required'; END IF;
 PERFORM 1 FROM public.medical_research_policy WHERE singleton FOR UPDATE;
 UPDATE public.medical_research_policy SET enabled=false,revision=revision+1 WHERE singleton;
 INSERT INTO public.medical_research_audit(actor_id,action,details) VALUES(auth.uid(),'emergency_paused',jsonb_build_object('reference',p_ref));
END $$;
CREATE FUNCTION public.medical_research_reserve(p_sha text,p_nonce text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE p public.medical_research_policy; s jsonb; q jsonb; id uuid; BEGIN
 IF public.medical_demo_scope() IS DISTINCT FROM true OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'synthetic actor denied'; END IF;
 SELECT * INTO p FROM public.medical_research_policy WHERE singleton FOR UPDATE;
 IF NOT FOUND OR (public.medical_research_status()->>'eligible')::boolean IS DISTINCT FROM true THEN RETURN jsonb_build_object('allowed',false); END IF;
 s:=public.medical_v3_fixture_snapshot(); IF p_sha IS DISTINCT FROM p.evidence_sha OR s->>'sha256' IS DISTINCT FROM p.evidence_sha THEN RAISE EXCEPTION 'evidence changed'; END IF;
 q:=public.medical_v3_reserve_ai('mission-9d8ce8f3e5554509a0885461f9ad2e1c','crew-9806e7e611f44dc38dac5e23f7740f1a');
 IF (q->>'allowed')::boolean IS DISTINCT FROM true THEN RETURN jsonb_build_object('allowed',false); END IF;
 INSERT INTO public.medical_research_attempts(actor_id,nonce_sha,evidence_sha,quota_id,month) VALUES(auth.uid(),encode(extensions.digest(p_nonce,'sha256'),'hex'),p_sha,(q->>'reservationId')::uuid,date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date) RETURNING medical_research_attempts.id INTO id;
 UPDATE public.medical_research_policy SET active_attempt=id WHERE singleton;
 INSERT INTO public.medical_research_audit(actor_id,action,details) VALUES(auth.uid(),'reserved',jsonb_build_object('attempt',id,'hold',100000));
 RETURN jsonb_build_object('allowed',true,'attemptId',id);
END $$;
CREATE FUNCTION public.medical_research_dispatch(p_attempt uuid,p_sha text,p_nonce text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE p public.medical_research_policy; r public.medical_research_attempts; BEGIN
 IF public.medical_demo_scope() IS DISTINCT FROM true THEN RAISE EXCEPTION 'scope denied'; END IF;
 SELECT * INTO p FROM public.medical_research_policy WHERE singleton FOR UPDATE;
 SELECT * INTO r FROM public.medical_research_attempts WHERE id=p_attempt FOR UPDATE;
 IF p.enabled IS DISTINCT FROM true OR p.active_attempt IS DISTINCT FROM p_attempt OR r.actor_id IS DISTINCT FROM auth.uid() OR r.outcome IS DISTINCT FROM 'reserved' OR p_nonce IS NULL OR r.nonce_sha IS DISTINCT FROM encode(extensions.digest(p_nonce,'sha256'),'hex') OR p_sha IS DISTINCT FROM p.evidence_sha OR r.month<>date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date OR clock_timestamp()>r.reserved_at+interval '30 seconds' OR public.medical_v3_fixture_snapshot()->>'sha256' IS DISTINCT FROM p.evidence_sha THEN RETURN false; END IF;
 IF p.sync_required AND NOT EXISTS(SELECT 1 FROM public.medical_research_provider_sync WHERE month=r.month AND project_id=p.provider_project AND synchronized_at>clock_timestamp()-interval '1 hour') THEN RETURN false; END IF;
 IF (SELECT coalesce(sum(hold_microusd),0) FROM public.medical_research_attempts WHERE month=r.month)+coalesce((SELECT recorded_microusd FROM public.medical_research_provider_sync WHERE month=r.month AND project_id=p.provider_project),0)>p.budget_microusd THEN RETURN false; END IF;
 UPDATE public.medical_research_attempts SET dispatched_at=clock_timestamp(),outcome='dispatched' WHERE id=p_attempt;
 INSERT INTO public.medical_research_audit(actor_id,action,details) VALUES(auth.uid(),'dispatch_permitted',jsonb_build_object('attempt',p_attempt)); RETURN true;
END $$;
CREATE FUNCTION public.medical_research_finish(p_attempt uuid,p_usage bigint,p_input integer,p_output integer,p_outcome text,p_request text,p_nonce text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE p public.medical_research_policy; r public.medical_research_attempts; known boolean; BEGIN
 IF auth.uid() IS DISTINCT FROM '22a72429-1674-4174-9b27-ba63db3c0279'::uuid THEN RAISE EXCEPTION 'actor denied'; END IF;
 SELECT * INTO p FROM public.medical_research_policy WHERE singleton FOR UPDATE;
 SELECT * INTO r FROM public.medical_research_attempts WHERE id=p_attempt FOR UPDATE;
 IF r.actor_id IS DISTINCT FROM auth.uid() OR p_nonce IS NULL OR r.nonce_sha IS DISTINCT FROM encode(extensions.digest(p_nonce,'sha256'),'hex') OR r.finished_at IS NOT NULL OR p.active_attempt IS DISTINCT FROM p_attempt OR r.outcome NOT IN ('reserved','dispatched') THEN RETURN false; END IF;
 known:=coalesce(r.outcome='dispatched' AND p_usage BETWEEN 0 AND 76440 AND p_input BETWEEN 0 AND 6144 AND p_output BETWEEN 0 AND 1500 AND p_usage=(p_input+p_output)::bigint*10 AND p_outcome IN ('success','invalid_answer'),false);
 IF NOT known THEN UPDATE public.medical_research_policy SET enabled=false,revision=revision+1 WHERE singleton; END IF;
 UPDATE public.medical_research_attempts SET finished_at=clock_timestamp(),estimated_usage_microusd=CASE WHEN known THEN p_usage END,input_tokens=CASE WHEN known THEN p_input END,output_tokens=CASE WHEN known THEN p_output END,provider_request_id=left(p_request,200),outcome=CASE WHEN known THEN p_outcome WHEN p_outcome IN ('credit_exhausted','spend_limit','rate_limit','provider_outage') THEN p_outcome ELSE 'unknown' END WHERE id=p_attempt;
 IF known THEN UPDATE public.medical_research_policy SET active_attempt=NULL WHERE singleton; END IF;
 PERFORM public.medical_v3_release_ai(r.quota_id);
 INSERT INTO public.medical_research_audit(actor_id,action,details) VALUES(auth.uid(),'finished',jsonb_build_object('attempt',p_attempt,'known',known,'hold_retained',true)); RETURN true;
END $$;
-- Owner explicitly closes an unknown attempt without refunding holds or inventing usage.
CREATE FUNCTION public.medical_research_resolve(p_attempt uuid,p_ref text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE p public.medical_research_policy; r public.medical_research_attempts; BEGIN
 IF NOT public.medical_research_is_owner() OR p_ref IS NULL OR length(p_ref) NOT BETWEEN 10 AND 200 THEN RAISE EXCEPTION 'owner recovery reference required'; END IF;
 SELECT * INTO p FROM public.medical_research_policy WHERE singleton FOR UPDATE;
 SELECT * INTO r FROM public.medical_research_attempts WHERE id=p_attempt FOR UPDATE;
 IF p.enabled OR p.active_attempt IS DISTINCT FROM p_attempt OR r.reserved_at>clock_timestamp()-interval '2 minutes' THEN RAISE EXCEPTION 'pause and wait for in-flight settlement first'; END IF;
 UPDATE public.medical_research_policy SET active_attempt=NULL,revision=revision+1 WHERE singleton;
 IF r.outcome='reserved' THEN UPDATE public.medical_research_attempts SET finished_at=clock_timestamp(),outcome='cancelled' WHERE id=p_attempt; END IF;
 PERFORM public.medical_v3_release_ai(r.quota_id);
 INSERT INTO public.medical_research_audit(actor_id,action,details) VALUES(auth.uid(),'unresolved_hold_retained',jsonb_build_object('attempt',p_attempt,'reference',p_ref));
END $$;
-- Caller is verified owner; only server invokes this with provider metadata, never browser input.
CREATE FUNCTION public.medical_research_record_sync(p_month date,p_project text,p_cost bigint,p_input bigint,p_output bigint,p_requests bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$ BEGIN
 IF NOT public.medical_research_is_owner() OR p_month IS NULL OR p_month<>date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date OR p_cost IS NULL OR p_cost<0 OR p_input IS NULL OR p_input<0 OR p_output IS NULL OR p_output<0 OR p_requests IS NULL OR p_requests<0 THEN RAISE EXCEPTION 'invalid owner synchronization'; END IF;
 PERFORM 1 FROM public.medical_research_policy WHERE singleton AND provider_project=p_project FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'project mismatch'; END IF;
 INSERT INTO public.medical_research_provider_sync(month,project_id,recorded_microusd,provider_input_tokens,provider_output_tokens,provider_requests) VALUES(p_month,p_project,p_cost,p_input,p_output,p_requests) ON CONFLICT(month) DO UPDATE SET recorded_microusd=greatest(medical_research_provider_sync.recorded_microusd,excluded.recorded_microusd),provider_input_tokens=excluded.provider_input_tokens,provider_output_tokens=excluded.provider_output_tokens,provider_requests=excluded.provider_requests,synchronized_at=clock_timestamp();
 INSERT INTO public.medical_research_audit(actor_id,action,details) VALUES(auth.uid(),'provider_synchronized',jsonb_build_object('project',p_project,'month',p_month,'recorded_microusd',p_cost));
END $$;
CREATE FUNCTION public.medical_research_audit_log() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$ BEGIN
 IF NOT public.medical_research_is_owner() THEN RAISE EXCEPTION 'owner denied'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.at DESC) FROM (SELECT at,actor_id,action,details FROM public.medical_research_audit ORDER BY at DESC LIMIT 100) x),'[]'::jsonb);
END $$;
DO $acl$ DECLARE r record; BEGIN
 FOR r IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'medical_research_%' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',r.sig); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.sig); END LOOP;
 FOR r IN SELECT oid::regclass sig FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'medical_research_%' AND relkind='r' LOOP EXECUTE format('ALTER TABLE %s OWNER TO postgres',r.sig); EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',r.sig); END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION public.medical_research_is_owner(),public.medical_research_status(),public.medical_research_configure(boolean,bigint,integer,integer,text,boolean,bigint,text),public.medical_research_pause(text),public.medical_research_reserve(text,text),public.medical_research_dispatch(uuid,text,text),public.medical_research_finish(uuid,bigint,integer,integer,text,text,text),public.medical_research_resolve(uuid,text),public.medical_research_audit_log() TO authenticated;
-- Metadata writes are privileged server work after caller-scoped ownership verification.
GRANT EXECUTE ON FUNCTION public.medical_research_record_sync(date,text,bigint,bigint,bigint,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.medical_demo_authorize(timestamptz,timestamptz,uuid,text,text),public.medical_demo_reserve(text,text),public.medical_demo_dispatch(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
