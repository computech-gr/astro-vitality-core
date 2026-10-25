-- Separately authorized retaining-pause recovery. Never resurrect legacy v1 or refund holds.
DO $$ BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'trusted owner required'; END IF;
 PERFORM 1 FROM public.medical_research_policy WHERE singleton FOR UPDATE;
 UPDATE public.medical_research_policy SET enabled=false,revision=revision+1 WHERE singleton;
 INSERT INTO public.medical_research_audit(action,details) VALUES('retaining_pause',jsonb_build_object('hold_retained',true));
 REVOKE EXECUTE ON FUNCTION public.medical_research_reserve(text,text),public.medical_research_dispatch(uuid,text,text) FROM authenticated;
END $$;
