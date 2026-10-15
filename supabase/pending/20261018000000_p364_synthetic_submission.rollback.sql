-- P36.4 manual rollback (owner-run only, never automatic). Removes the P36.4 write path.
-- Order: revoke/drop function first so no new submissions can start.
-- WARNING: dropping columns/tables deletes submitted synthetic review rows; export first if needed.
-- audit_events rows written by P36.4 are append-only and intentionally retained.
revoke all on function public.p36_submit_synthetic_review_batch(text, text, date, text, text, jsonb, text, boolean) from authenticated;
drop function if exists public.p36_submit_synthetic_review_batch(text, text, date, text, text, jsonb, text, boolean);
drop trigger if exists p36_items_immutable on public.p36_biomarker_review_items;
drop function if exists public.p36_reject_item_mutation();
drop trigger if exists p36_submission_fields_frozen on public.p36_biomarker_review_batches;
drop function if exists public.p36_freeze_submission_fields();
drop index if exists public.p36_batches_idempotency;
alter table public.p36_biomarker_review_batches drop constraint if exists p36_idempotency_format;
alter table public.p36_biomarker_review_batches drop column if exists request_payload_hash, drop column if exists idempotency_key;
drop table if exists public.p36_metric_unit_catalog;
-- Optional full removal of the P36.2B10 schema as well (only if it was applied with P36.4):
-- drop table if exists public.p36_biomarker_review_events, public.p36_biomarker_review_items, public.p36_biomarker_review_batches;
-- drop function if exists public.p36_validate_review_memberships(), public.p36_record_quarantine_event(),
--   public.p36_reject_review_event_mutation(), public.p36_validate_quarantine_event_insert();
