-- PREPARATION ONLY: requires separate owner execution approval.
-- Object-local revocation only; preserve platform SELECT and sequence access.
-- Run in the supported migration tool's managed transaction.
revoke insert on table public.p36_dynamic_admission,
  public.p36_dynamic_handoff_submissions,
  public.p36_dynamic_handoff_terms from sandbox_exec;