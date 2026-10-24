-- OWNER AUTHORIZATION REQUIRED. Disable server synthetic capability first; wait >=35s.
-- Retain all fixtures/quota records and append-only history. No drops or deletions.
BEGIN;
REVOKE ALL ON FUNCTION public.medical_v3_fixture_snapshot() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.medical_v3_ai_evidence(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.medical_v3_reserve_ai(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON public.medical_advisor_review_events FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.medical_v3_authoritative_evidence(p_mission text,p_crew text)
RETURNS TABLE(canonical_text text,source_ids text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NULL::text,NULL::text[] WHERE false
$$;
REVOKE ALL ON FUNCTION public.medical_v3_authoritative_evidence(text,text) FROM PUBLIC,anon,authenticated,service_role;
-- Caller-owned release remains available for cleanup; no refund of consumed minute quotas.
COMMIT;
