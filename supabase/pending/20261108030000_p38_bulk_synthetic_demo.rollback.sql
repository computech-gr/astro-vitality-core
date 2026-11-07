-- Rollback of 20261108030000_p38_bulk_synthetic_demo.sql. Removes only the batch
-- wrappers; every event they recorded was written by the existing per-term P36/P37
-- functions and stays in the append-only ledgers.
drop function public.p38_demo_bulk_activate_v1(text, jsonb);
drop function public.p38_demo_bulk_decide_v1(text, text, jsonb);
drop function public.p38_demo_bulk_triage_accept_v1(text, jsonb);
drop function public.p38_demo_bulk_check_items(jsonb, text);
