-- PREPARATION ONLY: separate owner approval required; managed transaction.
-- Preserve SELECT, sequence access, RLS and existing caller-scoped functions.
revoke insert on table public.p36_dynamic_source_validation,
  public.p36_dynamic_authorization_events from sandbox_exec;