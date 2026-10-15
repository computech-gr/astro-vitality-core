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
