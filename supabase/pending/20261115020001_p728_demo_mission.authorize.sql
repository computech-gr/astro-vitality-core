-- PENDING: separate owner approval required. Classifies MITO_DEMO_2026 as a
-- synthetic demonstration mission for the P72.8 direct demo scientific
-- decision. Grants no role, membership, approval or activation.
insert into public.p728_demo_missions(mission_id, authorization_ref)
select m.id, 'owner-authorization:p728-synthetic-demo-mission-2026-11-15'
  from public.missions m where m.code = 'MITO_DEMO_2026'
on conflict (mission_id) do nothing;
