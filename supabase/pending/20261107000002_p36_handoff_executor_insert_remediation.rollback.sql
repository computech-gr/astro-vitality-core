-- PREPARATION ONLY: separate owner approval required; restores the unsafe
-- pre-remediation direct INSERT path. Not an automatic operational fallback.
-- Run in a managed transaction only after trusted-owner verification that
-- admission has zero rows or exactly one row with both switches false.
grant insert on table public.p36_dynamic_admission,
  public.p36_dynamic_handoff_submissions,
  public.p36_dynamic_handoff_terms to sandbox_exec;