-- PENDING: separate owner approval required; schema only, no activation or fixture changes.
DO $$ BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'trusted owner required'; END IF;
 IF to_regprocedure('public.medical_v3_fixture_snapshot()') IS NULL THEN RAISE EXCEPTION 'synthetic schema prerequisite missing'; END IF;
END $$;
CREATE TABLE public.medical_demo_authorization (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 actor_id uuid NOT NULL, operator_id uuid NOT NULL, membership_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 evidence_sha text NOT NULL, enabled boolean NOT NULL DEFAULT false,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
 held_microusd bigint NOT NULL DEFAULT 0 CHECK (held_microusd BETWEEN 0 AND 1000000),
 active_attempt uuid, authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 disabled_at timestamptz, disabled_by uuid, authorization_ref text NOT NULL
);
GRANT ALL ON public.medical_demo_authorization TO postgres;
REVOKE ALL ON public.medical_demo_authorization FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.medical_demo_authorization ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.medical_demo_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL,
 nonce_sha text NOT NULL, evidence_sha text NOT NULL, quota_id uuid NOT NULL,
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(), dispatched_at timestamptz,
 finished_at timestamptz, hold_microusd bigint NOT NULL DEFAULT 100000 CHECK (hold_microusd=100000),
 usage_microusd bigint CHECK (usage_microusd BETWEEN 0 AND 100000),
 outcome text NOT NULL DEFAULT 'reserved' CHECK (outcome IN ('reserved','dispatched','complete','unknown','disabled'))
);
GRANT ALL ON public.medical_demo_attempts TO postgres;
REVOKE ALL ON public.medical_demo_attempts FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.medical_demo_attempts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.medical_demo_control_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), at timestamptz NOT NULL DEFAULT clock_timestamp(),
 action text NOT NULL, actor_id uuid, reference text NOT NULL
);
GRANT ALL ON public.medical_demo_control_audit TO postgres;
REVOKE ALL ON public.medical_demo_control_audit FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.medical_demo_control_audit ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.medical_demo_scope() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,extensions,pg_temp AS $$
 SELECT auth.uid()='22a72429-1674-4174-9b27-ba63db3c0279'::uuid AND EXISTS (
 SELECT 1 FROM public.mission_memberships WHERE id='63470171-3a22-4075-b197-ac85b90cb0ef'
 AND user_id=auth.uid() AND active AND role='ground_medical'
 AND mission_id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND crew_member_id='crew-9806e7e611f44dc38dac5e23f7740f1a')
$$;

-- Trusted SQL Editor only. Exactly one lifetime window; no resets/replenishment/reactivation.
CREATE FUNCTION public.medical_demo_authorize(p_start timestamptz,p_end timestamptz,p_operator uuid,p_ref text,p_sha text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE canonical text; ids text[];
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') OR p_operator IS NULL OR p_ref IS NULL OR length(p_ref)<10
 OR p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end)
 OR p_end-p_start<>interval '30 minutes' OR p_start<clock_timestamp() OR p_start>clock_timestamp()+interval '24 hours'
 THEN RAISE EXCEPTION 'invalid separately approved authorization'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('medical-demo-authorization',0));
 IF EXISTS(SELECT 1 FROM public.medical_demo_authorization) THEN RAISE EXCEPTION 'one lifetime authorization only'; END IF;
 LOCK TABLE public.mission_memberships IN SHARE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.mission_memberships WHERE id='63470171-3a22-4075-b197-ac85b90cb0ef'
 AND user_id='22a72429-1674-4174-9b27-ba63db3c0279' AND active AND role='ground_medical'
 AND mission_id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND crew_member_id='crew-9806e7e611f44dc38dac5e23f7740f1a')
 OR NOT EXISTS(SELECT 1 FROM public.mission_memberships WHERE user_id=p_operator AND active AND role='ground_medical'
 AND mission_id='mission-9d8ce8f3e5554509a0885461f9ad2e1c' AND crew_member_id='crew-9806e7e611f44dc38dac5e23f7740f1a')
 THEN RAISE EXCEPTION 'exact account/operator membership missing'; END IF;
 -- Caller-scoped reconstruction, never a browser digest attestation.
 PERFORM set_config('request.jwt.claim.sub','22a72429-1674-4174-9b27-ba63db3c0279',true);
 SELECT canonical_text,source_ids INTO canonical,ids FROM public.medical_v3_authoritative_evidence('mission-9d8ce8f3e5554509a0885461f9ad2e1c','crew-9806e7e611f44dc38dac5e23f7740f1a');
 IF canonical IS NULL OR ids IS DISTINCT FROM ARRAY['synthetic-v3-hr-001','synthetic-v3-hr-002']::text[]
 OR p_sha IS DISTINCT FROM 'sha256-'||encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex')
 OR EXISTS(SELECT 1 FROM public.medical_advisor_review_events)
 THEN RAISE EXCEPTION 'authoritative synthetic dependency mismatch'; END IF;
 INSERT INTO public.medical_demo_authorization(singleton,actor_id,operator_id,membership_id,starts_at,ends_at,evidence_sha,enabled,authorization_ref)
 VALUES(true,'22a72429-1674-4174-9b27-ba63db3c0279',p_operator,'63470171-3a22-4075-b197-ac85b90cb0ef',p_start,p_end,p_sha,true,p_ref);
 INSERT INTO public.medical_demo_control_audit(action,actor_id,reference) VALUES('authorized',p_operator,p_ref);
END $$;

CREATE FUNCTION public.medical_demo_reserve(p_sha text,p_nonce text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE a public.medical_demo_authorization; q jsonb; id uuid; snapshot jsonb;
BEGIN
 IF public.medical_demo_scope() IS DISTINCT FROM true OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'scope denied'; END IF;
 SELECT * INTO a FROM public.medical_demo_authorization WHERE singleton FOR UPDATE;
 IF NOT FOUND OR NOT a.enabled OR clock_timestamp()<a.starts_at OR clock_timestamp()>=a.ends_at
 OR a.attempts>=10 OR a.held_microusd+100000>1000000 OR a.active_attempt IS NOT NULL THEN RETURN jsonb_build_object('allowed',false); END IF;
 snapshot:=public.medical_v3_fixture_snapshot();
 IF p_sha IS DISTINCT FROM a.evidence_sha OR snapshot->>'sha256' IS DISTINCT FROM a.evidence_sha THEN RAISE EXCEPTION 'evidence changed'; END IF;
 q:=public.medical_v3_reserve_ai('mission-9d8ce8f3e5554509a0885461f9ad2e1c','crew-9806e7e611f44dc38dac5e23f7740f1a');
 IF (q->>'allowed')::boolean IS DISTINCT FROM true THEN RETURN jsonb_build_object('allowed',false); END IF;
 INSERT INTO public.medical_demo_attempts(actor_id,nonce_sha,evidence_sha,quota_id)
 VALUES(auth.uid(),encode(extensions.digest(p_nonce,'sha256'),'hex'),p_sha,(q->>'reservationId')::uuid) RETURNING medical_demo_attempts.id INTO id;
 UPDATE public.medical_demo_authorization SET attempts=attempts+1,held_microusd=held_microusd+100000,active_attempt=id WHERE singleton;
 RETURN jsonb_build_object('allowed',true,'attemptId',id);
END $$;

CREATE FUNCTION public.medical_demo_dispatch(p_attempt uuid,p_sha text,p_nonce text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE a public.medical_demo_authorization; r public.medical_demo_attempts; snapshot jsonb;
BEGIN
 IF public.medical_demo_scope() IS DISTINCT FROM true THEN RAISE EXCEPTION 'scope denied'; END IF;
 SELECT * INTO a FROM public.medical_demo_authorization WHERE singleton FOR UPDATE;
 SELECT * INTO r FROM public.medical_demo_attempts WHERE id=p_attempt FOR UPDATE;
 IF a.enabled IS DISTINCT FROM true OR clock_timestamp()<a.starts_at OR clock_timestamp()>=a.ends_at
 OR a.active_attempt IS DISTINCT FROM p_attempt OR r.actor_id IS DISTINCT FROM auth.uid()
 OR r.nonce_sha IS DISTINCT FROM encode(extensions.digest(p_nonce,'sha256'),'hex')
 OR r.outcome IS DISTINCT FROM 'reserved' OR p_sha IS DISTINCT FROM a.evidence_sha THEN RETURN false; END IF;
 snapshot:=public.medical_v3_fixture_snapshot();
 IF snapshot->>'sha256' IS DISTINCT FROM a.evidence_sha THEN RETURN false; END IF;
 UPDATE public.medical_demo_attempts SET dispatched_at=clock_timestamp(),outcome='dispatched' WHERE id=p_attempt;
 RETURN true;
END $$;

CREATE FUNCTION public.medical_demo_finish(p_attempt uuid,p_usage bigint,p_nonce text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE a public.medical_demo_authorization; r public.medical_demo_attempts;
BEGIN
 IF auth.uid() IS DISTINCT FROM '22a72429-1674-4174-9b27-ba63db3c0279'::uuid THEN RAISE EXCEPTION 'actor denied'; END IF;
 SELECT * INTO a FROM public.medical_demo_authorization WHERE singleton FOR UPDATE;
 SELECT * INTO r FROM public.medical_demo_attempts WHERE id=p_attempt FOR UPDATE;
 IF r.actor_id IS DISTINCT FROM auth.uid() OR r.nonce_sha IS DISTINCT FROM encode(extensions.digest(p_nonce,'sha256'),'hex')
 OR r.finished_at IS NOT NULL THEN RETURN false; END IF;
 IF p_usage IS NOT NULL AND (p_usage<0 OR p_usage>100000) THEN
 UPDATE public.medical_demo_authorization SET enabled=false,disabled_at=clock_timestamp() WHERE singleton;
 p_usage:=NULL;
 END IF;
 UPDATE public.medical_demo_attempts SET finished_at=clock_timestamp(),usage_microusd=p_usage,
 outcome=CASE WHEN p_usage IS NULL THEN 'unknown' ELSE 'complete' END WHERE id=p_attempt;
 -- Unknown/crashed requests block further transmission forever until retaining-disable; lease expiry never unlocks.
 IF p_usage IS NOT NULL THEN UPDATE public.medical_demo_authorization SET active_attempt=NULL WHERE singleton AND active_attempt=p_attempt; END IF;
 PERFORM public.medical_v3_release_ai(r.quota_id);
 RETURN true;
END $$;

CREATE FUNCTION public.medical_demo_disable(p_ref text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE a public.medical_demo_authorization;
BEGIN
 SELECT * INTO a FROM public.medical_demo_authorization WHERE singleton FOR UPDATE;
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM a.operator_id THEN RAISE EXCEPTION 'operator denied'; END IF;
 IF p_ref IS NULL OR length(p_ref)<1 OR length(p_ref)>200 THEN RAISE EXCEPTION 'audit reference required'; END IF;
 UPDATE public.medical_demo_authorization SET enabled=false,disabled_at=COALESCE(disabled_at,clock_timestamp()),disabled_by=auth.uid() WHERE singleton;
 INSERT INTO public.medical_demo_control_audit(action,actor_id,reference) VALUES('emergency_disabled',auth.uid(),p_ref);
END $$;

DO $acl$ DECLARE f record; t text; BEGIN
 FOR t IN SELECT unnest(ARRAY['medical_demo_authorization','medical_demo_attempts','medical_demo_control_audit']) LOOP
 EXECUTE format('ALTER TABLE public.%I OWNER TO postgres',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
 FOR f IN SELECT oid,oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'medical_demo_%' LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.sig);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION public.medical_demo_reserve(text,text),public.medical_demo_dispatch(uuid,text,text),public.medical_demo_finish(uuid,bigint,text),public.medical_demo_disable(text) TO authenticated;
