# v9.4 Cross-device observation sync — operator instructions

Status: **staged, not applied.** `supabase/pending/20261102000000_v94_observation_sync.sql` has not been
run against the project database. Until the owner approves and applies it, and configures the server
settings below, the **Sync observations & reviews** button reports the observation step as unavailable
and keeps every observation on the device. The review step (v9, already applied) keeps working.

## What it adds (additive only)

| Object                             | Purpose                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `observation_sync_events`          | Append-only encrypted observation events (ciphertext + keyed fingerprint) |
| `observation_sync_can_access`      | Server-side scope check (exact crew_self, or scoped ground_medical)       |
| `observation_sync_append_v1`       | Caller-scoped write RPC (`auth.uid()` uploader, max 100 events)           |
| `observation_sync_list_v1`         | Caller-scoped cursor read (max 100 rows per page)                         |
| `observation_sync_reject_mutation` | Trigger function: rejects UPDATE, DELETE and TRUNCATE for every role      |

No existing table, policy, function or record is changed. The v9 review-sync tables are untouched.
Columns in plaintext: mission, crew member, provenance, event/observation ID, entry/status kind, key
version, IV, fingerprint, uploader and server time. **Value, unit, metric, timestamps, source metadata,
excerpts and correction details exist only inside the ciphertext.**

## Encryption and key handling

- AES-256-GCM, per-scope key derived with HKDF-SHA256 from a server-only master secret; the additional
  authenticated data binds algorithm, key version, mission, crew, provenance, event ID and fingerprint,
  so a row copied to another scope or edited in any way fails decryption.
- Fingerprints are HMAC-SHA256 under a separate derived key (not a plain hash), so database readers
  cannot guess small value ranges.
- Master secrets: `MITO_OBSERVATION_SYNC_KEY_V1` … `_V32`, each base64 of exactly 32 random bytes.
  New writes use the highest version present; reads use each row's stored version. Rotation = add the
  next version and keep the old ones; stored rows are never re-encrypted or rewritten. Losing a key
  makes its rows unreadable (reported as "key unavailable", never imported).
- Keys live only in the server runtime; never in the browser, the database or logs.
- **Limitation:** this is server-side envelope encryption, not end-to-end. The server runtime holding
  the key decrypts for callers who pass both the server and database authorization checks. TLS and
  RLS are additional layers, not the at-rest encryption.

## Authorization

- Server function (`src/lib/observation-sync.functions.ts`): verified bearer token, then the caller's
  own active membership for the exact mission and crew member (Crew Self for that crew member, or
  Ground Medical mission-wide or bound to that crew member), checked **before** any encryption or
  decryption. Researchers, mission operators and anonymous callers are refused.
- Database: the same rule plus an active crew assignment, re-derived from `auth.uid()`; closed
  missions refuse writes; REAL batches need `p_real_data_confirmed = true`.
- RLS limits direct SELECT to the same reader set; API roles (including `service_role`) have no
  INSERT/UPDATE/DELETE privileges, and triggers block UPDATE/DELETE/TRUNCATE.

## Server settings (all default-off)

| Setting                              | Effect                                                         |
| ------------------------------------ | -------------------------------------------------------------- |
| `MITO_OBSERVATION_SYNC_ENABLED=true` | Enables synthetic observation sync                             |
| `MITO_OBSERVATION_SYNC_KEY_V1`       | Required master key (base64, 32 bytes)                         |
| `MITO_OBSERVATION_SYNC_REAL_ENABLED` | Separately enables REAL provenance (plus per-run confirmation) |

## Verification (disposable PostgreSQL only)

`FV01_PG_SOCKET_DIR=<disposable socket dir> bun run verify:v94-observation-sync-pg` runs:

1. `scripts/verify-v94-observation-sync-pg.mjs` — 45 role/RLS/append-only/tamper scenarios, then the
   rollback (refuses with data; succeeds only with the explicit setting; v9 tables untouched).
2. `scripts/verify-v94-observation-sync-e2e-pg.ts` — two devices against the real SQL and the real
   encryption core: device A uploads 2 observations and 2 attestations, fresh device B imports both and
   shows them Attested with the same IDs and fingerprints, replays add nothing, ciphertext only in the
   database, researcher refused by both the server and the database.

Both refuse managed `PG*` variables, so they cannot reach the project database.

## Applying (owner approval required)

1. Apply the pending file byte-for-byte; do not edit it.
2. Configure the key and enable setting; leave REAL disabled unless separately approved.
3. Re-run the verifiers and the full check.

Rollback: `supabase/pending/20261102000000_v94_observation_sync.rollback.sql` refuses while rows exist.
Export the table first, then run it inside a transaction with
`set local observation_sync.allow_destructive_rollback = 'on';`.

## Legacy background upload (blocked for Unified Intake since v9.4.1)

The older background mission queue (`src/infrastructure/ground-research`) uploads locally saved
records to `mission_events` through `ingest_mission_event` as RLS-protected JSON (not
application-encrypted). Since v9.4.1, Unified Intake observations are never enqueued, and queue items
saved by earlier releases are refused by the transport before the RPC and held as `needs_review`
(blocked, never retried, never shown as synced). Other mission events keep the existing behavior.

Records uploaded before v9.4.1 (62 synthetic Unified Intake events for the demo mission) remain in
`mission_events` unchanged; that table is append-only, so any retention or removal decision needs a
separately approved governance procedure. See `docs/V9_4_1_SECURITY_ACTIVATION.md`.
