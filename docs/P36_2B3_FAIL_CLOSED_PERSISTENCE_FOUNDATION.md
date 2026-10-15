# P36.2B3 — Fail-closed biomarker persistence foundation

Source: astro-vital-spark (66)(2).zip. **This patch creates reserved database schema only, not a usable ingestion workflow.** The P36.2B2 local synthetic JSON export remains unchanged. No frontend route or menu change.

## Tables
- `p36_biomarker_review_batches`: mission and crew foreign keys, submitting user, source SHA-256 fingerprint, observation date, synthetic-only classification, pending/rejected/approved states, reviewer identity and timestamps.
- `p36_biomarker_review_items`: strict numeric values, units, source excerpts, unique metric per batch, disposition.

## Fail-closed security
Both tables have RLS enabled and forced, all public/anon/authenticated privileges revoked, and restrictive deny-all policies. There is **no ingest RPC, no direct client SELECT/INSERT, no approval function, no integration with mission_events or crew_health_record_index**. Migration is additive and does not rewrite prior data. `approved` is a reserved schema state, not an available action. Neither Supabase service role nor database owner is intended as a user-facing bypass. This schema must not be used for real health data.

## Future activation gate (NOT in this patch)
1. Independent security review of actual deployed schema and RLS, mission/crew association and revoked privileges; test cross-mission, cross-crew, revoked membership, role spoofing, malicious JSON, duplicates and race conditions.
2. Define authenticated, server-side synthetic-only submit function with hard server-side role and mission/crew checks, strict metric catalog and unit validation, source digest verification, size bounds and immutable audit events. A Crew Self user can submit but must not self-approve.
3. Define separate `ground_medical` scientific reviewer function with independent reviewer requirement, atomic review and audit history; reject mutation after approval; no real clinical authority implied.
4. Only after scientific and security gates, explicitly review whether any approved observation should be promoted to canonical history. No automatic promotion.
5. Add DB integration tests using two missions and two crew accounts. SQL source inspection is **not** equivalent to deployed RLS testing.

## Verification
`bun test tests/security/p362b3-schema.test.ts`; full `bun run check` in Lovable. Apply migration only in controlled development/staging, inspect privileges and policies before production. Do not publish or activate health-data ingestion.

**Gates:** FV-01-13 OPEN; P32 PENDING; P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.
