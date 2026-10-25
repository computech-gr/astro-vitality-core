-- PENDING retaining-disable; separately authorized trusted SQL Editor only. Never drop/reset audit or holds.
DO $disable$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'trusted disable owner required'; END IF;
 UPDATE public.medical_demo_authorization SET enabled=false,disabled_at=COALESCE(disabled_at,clock_timestamp());
 INSERT INTO public.medical_demo_control_audit(action,reference) VALUES('retaining_disabled','owner-authorized retaining disable');
 REVOKE ALL ON FUNCTION public.medical_demo_reserve(text,text),public.medical_demo_dispatch(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
END $disable$;
