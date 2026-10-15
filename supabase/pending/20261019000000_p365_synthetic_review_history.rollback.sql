-- P36.5 rollback (owner-run, manual only). Removes the read-only history function; no data touched.
drop function if exists public.p36_list_synthetic_review_history(text, text);
