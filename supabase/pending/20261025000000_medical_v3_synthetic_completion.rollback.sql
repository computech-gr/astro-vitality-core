-- Separate owner authorization required. Disable-first, retain all append-only history.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.medical_v3_fixture_snapshot() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.medical_v3_append_review(text,text,text,uuid,uuid,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.medical_v3_reserve_ai(text,text) FROM authenticated;
CREATE OR REPLACE FUNCTION public.medical_v3_authoritative_evidence(p_mission text,p_crew text)
RETURNS TABLE(canonical_text text,source_ids text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NULL::text,NULL::text[] WHERE false
$$;
-- History RPC still allows authorized readers to see stale/unverified retained events.
-- Revocation endpoint reauthorization, or restore/re-enable, requires separate reviewed SQL.
COMMIT;