# P36.4 — Controlled Synthetic Cloud Submission Foundation

Source baseline: `astro-vital-spark (78)(3).zip`.

## Delivered

- Prominent, accessible `Upload Laboratory Report` button activates the existing local file input; existing Crew Self and consent gates remain.
- Explicit locked cloud-submission section, explaining why a signed-in Crew Self cannot yet persist to the shared Cloud database.
- Strict synthetic-only handoff data contract and validation tests; this is **not** a deployed writer.
- Original PDFs stay in browser; no new network request, database migration, storage bucket or endpoint.

## Activation decision and implementation boundary

The P36.2B10 review schema exists only under `supabase/pending/`. The shared Lovable Cloud database is also used by the live application. Authentication alone does not create missing tables or grant safe write privileges. No shared database migration or live persistence is authorized by this patch. Do not apply the pending SQL without explicit owner approval of the exact deployment scope and a rollback plan.

Next implement and validate a server-side authenticated, synthetic-only submission path in a disposable environment, using the P36.2B10 schema. Recheck current Crew Self membership, mission/crew scope, metric registry and units, synthetic classification, source SHA-256, duplicate fingerprint/date, idempotency, audit and transaction rollback. Keep independent scientific approval disabled and separate from submission. Do not use a browser-side service-role key. Only after disposable acceptance and an explicit owner decision may staged schema and the write path be activated on the shared Cloud database. Restrict access to synthetic data and document operational owner-role risks.

Outstanding: FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.

## P36.4 implementation addendum (staged, not activated)

- Staged SQL `supabase/pending/20261018000000_p364_synthetic_submission.sql` (requires the P36.2B10 file first) and manual rollback `…p364_synthetic_submission.rollback.sql`.
- Single write path `p36_submit_synthetic_review_batch` (security definer, `EXECUTE` to `authenticated` only). Identity is `auth.uid()`; active `crew_self` membership for exactly that mission and crew member is `FOR SHARE`-locked; mission must be open and crew actively assigned; exact metric/unit catalog (96 registry pairs with a recorded unit), plain decimals only, 1–100 unique markers; synthetic attestation; SHA-256 + date duplicate prevention; per-membership idempotency key with payload hash (replay vs. conflict); audit event in the same transaction without filename, values or excerpts. Batches start `pending_review`; no approval.
- Server function `src/lib/p36-cloud-submission.functions.ts` uses the signed-in user's bearer (no service role) and is disabled unless `P36_CLOUD_SUBMISSION_ENABLED=true`. Browser sends only a SHA-256 fingerprint and reviewed values.
- Disposable PostgreSQL 17.9: 155 existing + 50 P36.4 assertions (authorization, isolation, validation, idempotency, concurrency K1–K5, revocation, rollback, undo + re-apply).

### Activation steps (owner approval required)

1. Owner approves the exact SQL of both staged files and the rollback plan.
2. Apply `20261017000000_p36_biomarker_review_foundation.sql`, then `20261018000000_p364_synthetic_submission.sql`, as governed migrations 14 and 15, once.
3. Read-only post-check: tables forced-RLS with no browser grants, function grants, catalog = 96 rows, zero batches.
4. Set server secret `P36_CLOUD_SUBMISSION_ENABLED=true`; publish.
5. Signed-in Crew Self acceptance with a synthetic report on a test mission (not MISSION_TEST unless separately approved).
   Rollback: unset the flag (immediate stop), then owner-run rollback SQL; audit rows are retained.
