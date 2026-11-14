-- PENDING ROLLBACK for 20261114000000_p69_public_demo_workspaces.sql.
-- Owner-approved use only. DESTRUCTIVE for SYNTHETIC public-demo data: removes
-- the P69 demo workspaces, their append-only synthetic history and all demo
-- RPCs. It touches no other table. Demo auth identities are not removed here;
-- delete them separately through the server-side cleanup before running this.
drop function if exists public.p69_demo_claim_expired_v1(integer);
drop function if exists public.p69_demo_provision_v1(uuid, uuid, text, text);
drop function if exists public.p69_demo_admit_v1(text);
drop function if exists public.p69_demo_restore_v1(integer, bigint);
drop function if exists public.p69_demo_reset_v1(bigint);
drop function if exists public.p69_demo_transition_v1(uuid, text, text, text, integer, text);
drop function if exists public.p69_demo_submit_examination_v1(date, jsonb, text, text);
drop function if exists public.p69_demo_context_v1();
drop function if exists public.p69_demo_records_v1();
drop function if exists public.p69_demo_session_v1();
drop table if exists public.p69_demo_context_readings;
drop table if exists public.p69_demo_workspace_events;
drop table if exists public.p69_demo_record_events;
drop table if exists public.p69_demo_records;
drop table if exists public.p69_demo_members;
drop table if exists public.p69_demo_workspaces;
drop table if exists public.p69_demo_admissions;
drop function if exists public.p69_demo_caller(boolean);
drop function if exists public.p69_demo_my_workspace();
drop function if exists public.p69_demo_seed_epoch(uuid, integer);
drop function if exists public.p69_demo_check_measurements(jsonb);
drop function if exists public.p69_demo_sha256(text);
drop function if exists public.p69_demo_seed_document();
drop function if exists public.p69_demo_admission_guard();
drop function if exists public.p69_demo_member_guard();
drop function if exists public.p69_demo_workspace_guard();
drop function if exists public.p69_demo_reject_mutation();
