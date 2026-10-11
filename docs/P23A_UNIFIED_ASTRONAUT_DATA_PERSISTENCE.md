# P23A — Unified Astronaut Data Persistence Foundation

## Scope and evidence

The repository **already has** `public.mission_events`, `public.missions`, `public.crew_members`, `public.mission_memberships`, an authenticated `ingest_mission_event` RPC, and offline encrypted records/sync infrastructure. Creating another canonical cloud event table would risk duplicate sources of truth.

P23A adds `public.crew_health_record_index`: a structured, per-mission/per-crew index for **all existing and future rows inserted into `mission_events`**, regardless of source (Camera PPG, wearables, manual lab/bone-health imports, environmental and cognitive events). Its trigger runs on the existing canonical ingestion path, and a one-time idempotent backfill indexes existing cloud records. It contains identifiers, time, event kind, source, classification and optional canonical metric code, **not health values or raw payloads**. It is append-only to browser users; direct writes are revoked. RLS allows mission ground-medical access and crew-self access only to their own rows. Researcher and operator roles are not granted clinical-index access by default.

## What this does NOT establish

- The presence of a module or a local encrypted record **does not prove it is synchronized** to `mission_events`. Verify every ingestion adapter end-to-end.
- The index is **not** a replacement for the original PDF/image, raw sensor samples, or encrypted offline store. Existing event payloads may contain sensitive values; review existing `mission_events` privacy controls separately.
- No automatic extraction of lab values from PDF, no clinical decision rules, no newly invented thresholds, no cloud encryption guarantee, and no actual deployment are claimed.
- A missing `metric_code` is preserved as NULL; do not guess a metric.
- This patch adds a database migration only; Lovable must apply it exactly once and validate with synthetic events and two separate authenticated crew accounts.

## Required acceptance checks after applying migration

1. Confirm RLS is enabled and forced, and `authenticated` has SELECT but no direct INSERT/UPDATE/DELETE on the index.
2. Ingest one synthetic event through the existing `ingest_mission_event` RPC. Verify exactly one index row, matching event, mission and crew identifiers.
3. Repeat ingestion with the same idempotency key. Verify no second canonical or index row.
4. Check that a crew-self account can read its own indexed events but not another crew member's; ground-medical access is mission-scoped; unauthenticated and unrelated accounts are denied.
5. Verify that Camera PPG, bone health, wearable and other adapters actually reach the existing RPC. Record coverage and failures explicitly; do not mark untested sources as integrated.
6. Verify existing offline records are unchanged, and a reconnect sync produces one canonical cloud event plus one index row.
7. Check that historical backfill row count equals the eligible `mission_events` count, and verify zero orphaned index rows.

## Follow-on P23B

Audit every adapter and connect any local-only streams to the existing governed sync pipeline; add encrypted original-document storage and structured per-variable clinical observation tables only after a reviewed privacy and authorization design. A database index alone is not full persistence coverage.
