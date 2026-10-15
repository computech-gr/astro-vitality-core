-- P36.8C rollback (MANUAL, owner-run only). Refuses if any research decision exists,
-- because removing the new statuses would destroy decision evidence.
do $$ begin
  if exists (select 1 from public.p36_biomarker_review_batches
             where status in ('accepted_for_research','rejected_for_research') or decision_idempotency_key is not null) then
    raise exception 'P36.8C rollback refused: research decisions exist (evidence must be preserved)';
  end if;
end $$;
revoke all on function public.p368_decide_ground_medical_batch(text, uuid, text, text, text, integer) from authenticated;
drop function if exists public.p368_decide_ground_medical_batch(text, uuid, text, text, text, integer);
drop trigger if exists p36_items_no_delete on public.p36_biomarker_review_items;
-- Then re-run the function bodies and constraints from governed migration 0006
-- (p36_validate_review_memberships, p36_record_quarantine_event, p36_validate_quarantine_event_insert,
-- status / receipt / review-state / event CHECKs) and drop p36_events_one_per_batch,
-- p36_decision_idempotency_format, p36_batches_decision_idempotency. New nullable columns may remain unused.
