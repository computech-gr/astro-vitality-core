-- PENDING DATA AUTHORIZATION: separate explicit owner approval required.
-- Single statement for the atomic write tool, applied only after
-- 20261107030000_p36_global_scientific_review.sql is installed and verified.
-- Grants one global scientific reviewer and permits synthetic-only global
-- review of the MITOCHONDRIA 2026 Synthetic Demonstration mission.
-- No membership, admission, flag, catalog or submission row is changed.
with reviewer as (
  insert into public.p36_global_scientific_reviewers (user_id, authorization_ref)
  values ('33c9c6d0-3404-40e2-8aba-4e251db1be0e', 'owner-authorization:P36-GSR-2026-11-07')
  returning user_id
)
insert into public.p36_mission_scientific_sharing (mission_id, permitted_provenance, policy_ref)
select 'mission-9d8ce8f3e5554509a0885461f9ad2e1c', array['synthetic'], 'owner-policy:MITO_DEMO_2026-synthetic-global-review'
from reviewer;
