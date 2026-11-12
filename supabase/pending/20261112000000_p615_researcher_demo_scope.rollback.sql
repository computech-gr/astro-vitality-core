-- Rollback of the PENDING P61.5 Researcher synthetic demo scope and alias functions.
-- Run only on a disposable database, or with separate owner approval. Removes the
-- P61.5 functions, the identity guard trigger and the two P61.5 tables. Scope rows
-- added through p615_demo_scope_authorize_v1 stay in p37_demo_scope (append-only,
-- immutable by design); remove the grant foreign key first so they remain valid.
drop trigger if exists p615_demo_identity_guard on public.p37_demo_catalog_events;
drop function if exists public.p615_demo_alias_snapshot_v1(text);
drop function if exists public.p615_demo_governance_v1(text);
drop function if exists public.p615_demo_alias_revoke_v1(uuid, text, uuid);
drop function if exists public.p615_demo_alias_activate_v1(uuid, text, uuid);
drop function if exists public.p615_demo_alias_decide_v1(text, uuid, text, text, text, text, uuid);
drop function if exists public.p615_demo_scope_authorize_v1(text, jsonb);
drop function if exists public.p615_demo_identity_guard();
drop function if exists public.p615_active_keys(text);
drop function if exists public.p615_latest_triage(uuid, text);
drop function if exists public.p615_unit_problem(text);
drop table if exists public.p615_demo_alias_events;
drop table if exists public.p615_demo_scope_grants;
