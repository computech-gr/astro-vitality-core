-- PENDING rollback of P72.8. Refuses once any decision record exists, so
-- recorded rationale and audit history are never destroyed.
do $guard$ begin
  if exists (select 1 from public.p728_demo_review_records) then
    raise exception 'P72.8 decision records exist; rollback refused to preserve audit history' using errcode = '42501';
  end if;
end $guard$;
drop trigger if exists p728_demo_event_guard on public.p37_demo_catalog_events;
drop function if exists public.p728_demo_review_records_v1(text);
drop function if exists public.p728_demo_medical_decide_v1(text, text, text, jsonb);
drop function if exists public.p728_demo_researcher_decide_v1(text, text, text, jsonb, jsonb);
drop function if exists public.p728_evidence_refs(jsonb);
drop function if exists public.p728_demo_event_guard();
drop function if exists public.p728_demo_mission_problem(text);
drop table if exists public.p728_demo_review_records;
drop table if exists public.p728_demo_missions;
