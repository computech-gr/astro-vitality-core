-- PENDING rollback for 20261107030000_p36_global_scientific_review.sql.
-- Removes only the global review objects. Dynamic handoff submissions, terms,
-- authorization events, memberships and research keys are untouched.
-- WARNING: dropping p36_global_review_audit discards its read history; export
-- it first if the owner requires retention.
drop function if exists public.p36_global_review_list_v1(text, text, bigint, integer);
drop function if exists public.p36_global_review_missions_v1(text);
drop function if exists public.p36_global_review_basis(text, text);
drop table if exists public.p36_mission_scientific_sharing;
drop table if exists public.p36_global_scientific_reviewers;
drop table if exists public.p36_global_review_audit;
drop function if exists public.p36_global_review_record_change();
drop function if exists public.p36_global_review_reject_mutation();
