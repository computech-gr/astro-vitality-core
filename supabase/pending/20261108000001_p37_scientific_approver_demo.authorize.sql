-- PENDING DATA AUTHORIZATION: separate explicit owner approval required.
-- Single statement for the atomic write tool, applied only after
-- 20261108000000_p37_catalog_activation.sql is installed and verified.
-- Grants the P37 SCIENTIFIC APPROVER capability (final scientific decision on
-- new biomarkers) to the owner-designated Researcher nikolasilvestros@gmail.com.
-- The authorization reference is the qualification record cited by every
-- approval this account makes. It does not grant catalog activation, does not
-- change mission sharing, triage, memberships, admissions, flags or catalogs,
-- and approvals still require an independently provisioned source-verification
-- receipt, triage acceptance and an approver who is neither the verifier nor
-- the submitter.
insert into public.p37_scientific_approvers (user_id, authorization_ref)
values ('33c9c6d0-3404-40e2-8aba-4e251db1be0e', 'owner-authorization:P37-SCIENTIFIC-APPROVER-2026-11-08');
