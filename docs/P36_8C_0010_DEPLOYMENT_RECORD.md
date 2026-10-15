# P36.8C migration 0010 — deployment record

Deployed once to Lovable Cloud through the governed migration process on 2026-10-15 (UTC). This is NOT evidence of live acceptance. Backup status: `OWNER_MANAGED_BACKUP_RISK_ACCEPTED` (owner waiver, not a verified backup).

- Migration identifier: `drizzle/migrations/0010_p368c_research_decisions.sql` (history 10 → 11 entries).
- SHA-256: `7a233de35794684da7dfc4ffd7b657c3a545bf0f96a1d6f86733853bae4f07f1`, byte-identical to `supabase/pending/20261021000000_p368c_research_decisions.sql`.

## Pre-deployment preflight (read-only)

History 10 entries ending at 0009; decision RPC, new columns and `p36_items_no_delete` absent; six existing P36 triggers; 1 synthetic `pending_review` batch, 8 items, 0 events; 3 missions, 10 memberships, 212 audit events.

## Post-deployment verification (read-only)

- `p368_decide_ground_medical_batch(text,uuid,text,text,text,integer)`: security definer, `search_path=public, pg_temp`, EXECUTE authenticated only; anonymous REST call refused (42501).
- New constraints present: status superset, receipt/review-state consistency, decision idempotency format, `p36_events_one_per_batch`. Trigger `p36_items_no_delete` added; other six triggers retained.
- All P36 tables forced RLS, zero anon/authenticated table grants; anonymous REST read refused.
- Existing batch still `pending_review`, synthetic, no decision key; 8 items with unchanged content fingerprint; 0 review events; 0 `p36.review_decision` audit rows.
- Missions 3, memberships 10 (FV01-TEST-B membership fingerprint unchanged), audit 212, mission events 77, health index 77.
- No live decision executed. Not published.

## P36.8D independent reviewer acceptance — preparation (not performed)

1. Owner publishes the app (P36.8B/C UI) after this record is reviewed.
2. A FV01-TEST-B Crew Self account submits a NEW synthetic batch at `/mission/documents`. The original pending batch must stay untouched.
3. marketing@computech.gr (active Ground Medical, not the submitter) opens `/mission/ground`, selects FV01-TEST-B, refreshes, views the NEW batch, and chooses Accept or Reject for research with confirmation.
4. Expected: receipt shown once; repeating the same view replays the same receipt; the batch leaves the queue; values unchanged.
5. Crew Self, Operator and Researcher accounts see no decision controls for that batch.
6. Afterwards a read-only check confirms exactly one decision event and one privacy-safe audit row for the new batch, and the original batch still pending.

Standing gates unchanged: FV-01.13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical features DISABLED.
