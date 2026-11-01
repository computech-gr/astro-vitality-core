# MITOCHONDRIA v9.4 — Cross-Device Observation Availability & Review Reconciliation

## Source-verified baseline

- `src/domain/health-intelligence/observation-store.ts`: local encrypted append-only `unified-intake` observations; `saveUnifiedObservation`, `listUnifiedObservations`, correction status events.
- `src/domain/health-intelligence/observation-envelope.ts`: canonical `UnifiedObservation`, `validateUnifiedObservation`, `isDomainReadable`.
- `src/domain/health-intelligence/review-sync.ts`: metadata-only attestation/correction sync. Do not change its metadata-only payload semantics.
- `src/lib/review-sync.functions.ts`: authenticated server RPC gateway.
- `src/components/stored-observations-review.tsx`: existing explicit review sync UI.
- Existing review-sync SQL: `supabase/pending/20261101000000_v9_review_sync.sql` and `drizzle/migrations/0014_v9_review_sync.sql`.

## Required deliverable (implement all, not merely documentation)

1. New append-only, mission+crew+provenance-scoped observation cloud event store. Preserve full canonical observation payload including value, unit, source metadata, correction/version events, timestamp, provenance and original IDs. Never silently overwrite, delete, downgrade or reinterpret a local observation. Store and transfer sensitive payload only with application-appropriate authenticated encryption and documented key handling. Do not rely on TLS or RLS alone as at-rest payload encryption.
2. New explicit authenticated server push/pull endpoints with strict input validation, bounded payload sizes, cursor pagination, idempotency keys, immutable-event fingerprint conflict detection, and no service-role bypass exposed to browser. Re-check exact mission/crew authorization on server, and separately enforce RLS in database. Explicit real-data confirmation and no automatic uploads. Ensure permitted reader roles are intentionally scoped, not assumed from Ground Medical role alone.
3. Sync orchestration: explicit button `Sync observations & reviews`; first upload/download observation events, then existing review metadata; reconcile by stable observation ID and fingerprint; never show Attested for absent/mismatched versions. Display separate Observation and Review pending/synced/failed/conflict counts and last-sync times. Partial failures are surfaced independently, with retry; no false success.
4. Cross-device import must be append-only to encrypted local store. Check scope, provenance, schema, catalog metric/unit, duplicates and fingerprints before persisting. Never overwrite local conflicts. Preserve correction chains and original historical entries. Importing an accepted record does not itself constitute Ground Medical attestation or scientific approval.
5. Refresh Unified Intake, Stored Observations, Health Intelligence and Unified Health Report after import. The same synthetic mission+crew+provenance should display matching observations and the two existing attestations in a fresh browser after sync. The source device must remain intact.
6. Stage additive SQL migration + rollback; do NOT apply to live DB or publish without explicit approval. Include least-privilege policies, immutability protections, role checks, and audit evidence. Avoid changes to existing v9 review-sync tables or previously stored records.
7. Tests: two-browser 2-attestation+2-observation scenario, no-observation cloud-only reviews, wrong mission/crew/provenance, anonymous access, forbidden roles, tampering, replay, duplicate, conflict, offline, pagination, correction and supersession, partial failure, no silent unit conversion, no AI/diagnosis, mobile UI and existing suite.
8. No mock-success: if encryption/key-sharing across devices cannot be implemented safely, report the blocker and keep sensitive observation upload disabled. Never downgrade to plaintext payload storage.

## Acceptance evidence

- Fresh browser starts with zero local observations, fetches the expected cloud observation records, and reconciles the two previously synced review events to Attested, with the same IDs and fingerprints.
- Repeating sync sends zero new duplicates.
- Cloud pull never changes an observation value or approval status silently.
- All tests pass, SQL staged, no production writes, no publish.
