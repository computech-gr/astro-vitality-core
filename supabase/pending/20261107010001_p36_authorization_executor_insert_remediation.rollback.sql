-- PREPARATION ONLY: separate owner approval required; managed transaction.
-- Restores unsafe executor INSERT; never an automatic operational fallback.
-- Trusted readback must first confirm exactly one singleton and both flags false.
grant insert on table public.p36_dynamic_source_validation,
  public.p36_dynamic_authorization_events to sandbox_exec;