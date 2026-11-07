-- PENDING DATA AUTHORIZATION: separate explicit owner approval required.
-- Single statement for the atomic write tool, applied only after
-- 20261107040000_p36_global_triage.sql is installed and verified.
-- Grants triage-write permission (accept for review, request more evidence,
-- reject review request) to one Researcher. Reading scope is unchanged and
-- still limited by the existing mission sharing policy. No scientific
-- approval, catalog, membership, admission or flag is changed.
insert into public.p36_global_triage_writers (user_id, authorization_ref)
values ('33c9c6d0-3404-40e2-8aba-4e251db1be0e', 'owner-authorization:P36-TRIAGE-2026-11-07');
