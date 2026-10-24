# Medical v3 production synthetic demonstration — implementation and approval boundary

Checked 2026-10-24T23:50:42Z. Implementation is prepared; **production migration, seeding, AI and deployment are not authorized and were not performed**. This is an implementation result, not another architecture assessment.

## Exact approval bundle

Apply only `supabase/pending/20261026000000_medical_v3_production_synthetic_demo.sql`, after explicit authorization, using the migration tool with its exact bytes. It is a standalone alternative containing the reused foundation and fixture implementation. **Do not apply the older 20261024 governance or 20261025 completion pending files alongside it.** The candidate refuses any existing v3 namespace, rather than overwriting authority; unexpected deployed state requires stopping, not force applying.

Rollback: `supabase/pending/20261026000000_medical_v3_production_synthetic_demo.rollback.sql`.

SHA-256 migration: `3370a34b95e5f8385d587481af4763c8e6541d80c8a0ee81b393cc62409b48cc`; rollback: `1f33ee387540ea8087d44cb3b86400316d6f5578d100505b6aa1cafeaabb97e7`.

The candidate requires the existing mission `mission-9d8ce8f3e5554509a0885461f9ad2e1c`, code `MITO_DEMO_2026`, exact name `MITOCHONDRIA 2026 - Synthetic Demonstration`, status **planning**; crew `crew-9806e7e611f44dc38dac5e23f7740f1a`, exact name **Alex Morgan — Synthetic Astronaut**, active crew/assignment; and active ground-medical membership `63470171-3a22-4075-b197-ac85b90cb0ef`. No identity, role, mission status or existing records change. Runtime rechecks active caller ground-medical membership scoped to that crew, plus the same exact mission/crew prerequisites. Later status/name changes fail closed.

## Production impact

- Five new RLS-enabled public tables: `medical_advisor_review_events`, `medical_ai_quota_reservations`, `medical_v3_fixture_sources`, `medical_v3_fixture_observations`, `medical_v3_fixture_receipts`.
- Fifteen distinct v3 functions, seven triggers, one scoped SELECT policy (no browser table grant). All five tables explicitly revoke ALL (including TRUNCATE) from PUBLIC, anon, authenticated and service_role after ownership normalization. No anonymous access; no direct authenticated table access. Caller-scoped security-definer RPCs are the only ordinary access path; no service-role AI client.
- Seed exactly one invented source, two observations and two **synthetic_test_fixture_not_human_review** receipts, never a human or scientific approval. The review-event table remains empty. The append RPC is revoked for browser/service roles and a deny-insert trigger prevents persistent review even via privileged ordinary inserts. Rollback retains this deny control.
- `synthetic-v3-hr-001`: cv-001, cardiovascular, **62 bpm**, `2026-10-01T10:00:00Z`; `synthetic-v3-hr-002`: **66 bpm**, `2026-10-02T10:00:00Z`. Catalog hash, source hash and compact sorted-key canonical v2 SHA-256 are server reconstructed. Local records are never uploaded or promoted into authority.
- Atomic quotas: **5/user/minute**, **20/mission/minute**, **one active user lease**, **35-second lease**; user-before-mission advisory locks. Release does not refund consumed minute requests. Only quota rows are written during AI usage; advisor reviews stay in memory.
- Migration holds prerequisite tables in SHARE mode during a short atomic transaction and serializes candidate application with an advisory lock. Existing writes can briefly wait. A prerequisite, namespace or exact seed validation failure rolls back the complete transaction.

## Final production permission hardening

The original fingerprints are superseded by the corrected hashes above. The standalone candidate and rollback explicitly override production default privileges; RLS alone cannot prevent TRUNCATE. Owner-only table access is intentional: no service-role client is needed by the demo.

All 15 v3 functions are owned by `postgres` with `search_path=pg_catalog, public, extensions, pg_temp`. PUBLIC/anon/authenticated/service_role EXECUTE is cleared, then only these four SECURITY DEFINER RPC signatures are granted to authenticated:

- `medical_v3_fixture_snapshot()`
- `medical_v3_ai_evidence(text,text)`
- `medical_v3_reserve_ai(text,text)`
- `medical_v3_release_ai(uuid)`

Helpers, review history, append-review, validation and trigger functions have no external EXECUTE grant. Rollback restores only release(uuid) access. The migration must run as trusted `postgres` or `supabase_admin` and pins object ownership to postgres; ordinary users cannot own these objects. Schema UUID defaults create **zero sequences**. The scoped owned-sequence guard revokes all privileges and normalizes ownership for any dependent sequence without changing unrelated sequences or global default ACLs.

The disposable verifier reproduces permissive production table/function/sequence defaults and additionally PUBLIC inheritance, proves the defaults actually grant TRUNCATE on an unrelated probe, then verifies both migration and rollback. Direct SELECT/INSERT/UPDATE/DELETE/TRUNCATE are denied with actual permission errors for all five tables under anon, authenticated and service_role. All function grants/ownership/search paths and preserved unrelated objects are checked. Caller-scoped evidence/quotas and persistent denial remain unchanged.

## Independent default-off application capability

Only the server setting `MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED=true` enables this candidate source and Q&A/draft path; it is currently unset. It does not enable the persistence switch. When this capability is on, persistence/history-export server functions explicitly remain disabled even if the older governance flag were mistakenly set. Leave `MITO_MEDICAL_GOVERNANCE_V3_ENABLED`, isolated QA flags and test-environment flags unset.

The existing **Load authorized synthetic fixture** panel uses server evidence, not the offline report AI button. Production draft generation deliberately reuses the hardened Q&A server function (not the older draft API): 25-second provider timeout, existing OpenAI Responses contract, `store:false`, exact-template citations, pre/post authority reads and fail-closed quota release. Only three predefined synthetic questions are transmitted; no arbitrary personal text or mission/crew/reviewer identity is sent. No auto retries. Consent is consumed per request.

Advisor editing/rationale/acknowledgment remains session-only. It re-reads authorization and evidence before acknowledgment, validates claims, clears on edits, refresh, generation, errors or identity changes, and has no save/export-persistence control in this mode. It is not licensure, legal signature, clinical advice or scientific approval. Independent loaded-browser acceptance is not claimed.

## Validation actually executed

- **565 tests passed**, 0 failed, 9,434 assertions, including four new capability/exact-scope/privacy/provider tests and existing stale-evidence/release-failure/citation/consent tests.
- New candidate/rollback: **252 disposable SQL assertions**, covering wrong-shape atomic abort, exact IDs/62/66 values/hash, RLS/direct table denials, crew/anonymous/cross-mission denial, persistent RPC denial, changed membership/status/name/assignment, tampered evidence, quota limits, reapplication refusal and rollback retention.
- Genuine disposable SQL → caller-scoped server → atomic quota → **simulated provider** → two exact citations → authority recheck → quota release passed. No live AI credential used, no network provider call.
- Fresh existing foundation **30** and synthetic completion **51** SQL assertions passed alongside the hardened candidate (333 fresh assertions total). Prior FV01 integration **305** SQL assertions passed; not rerun in this hardening pass. The generic harness excludes this standalone alternative; its dedicated verifier alone applies it to exact production-shaped disposable fixtures.
- Lint: **0 errors / 13 existing warnings**; formatting, security audit and SEO passed.
- All static scientific/security release verifiers: **99/102 passed**. Remaining failures: P3663 authentic restore evidence, P3664 owner-risk acknowledgment and P20 official-rules confirmation. No verifier, seal or scientific status weakened.
- Fresh Trivy 0.66 full-scope development/unfixed vulnerability and secret scans: **0 vulnerabilities / 0 secrets**.
- Automatic preview validation reported **build OK**, after correcting an exact-optional-property typing issue. Manual project typecheck/build execution is prohibited here and was not run. This does not replace exact-commit GitHub Actions validation.
- Public signed-out health-report page rendered with correct title and no horizontal overflow. This is not authenticated synthetic browser acceptance; production activation and real Auth/Data API isolated acceptance were not attempted.

Reproduce only against the existing independently local disposable socket:

```sh
FV01_PG_SOCKET_DIR=/tmp/mito-pg/socket FV0143_INCLUDE_PENDING=1 node scripts/verify-medical-v3-production-synthetic.mjs
bun test
bun run lint
bun run format:check
bun run security:audit
node scripts/medical-v3-static-checks.mjs
```

The SQL verifier recreates `medical_v3_it`; never substitute a shared/production connection. Logs are under `/tmp/production-synthetic/` and `/tmp/production-synthetic/quality/`.

## Risks and rollback

AI usage incurs provider costs; rate quotas are not a lifetime spending cap. Approve a UTC start/end window, maximum paid requests/provider spending limit, and an operator responsible for switching it off. `store:false` does not guarantee zero provider retention. Synthetic test receipts must never be represented as human scientific acceptance. Migration is intentionally not idempotent over an existing authority namespace.

1. Disable/remove `MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED` first and stop new usage; leave all other Medical activation flags off.
2. Wait at least **35 seconds** for in-flight leases; then apply the exact rollback SQL only with owner authorization.
3. Rollback revokes snapshot, evidence, reserve and append access, installs an empty authority resolver, keeps RLS/deny-persistence controls and preserves all five tables/fixtures/quota records. Only caller-owned quota release remains available for cleanup; every other v3 function is revoked from browser/service roles. No delete/drop, no cost refund.
4. Verify authenticated snapshot/evidence/reserve denials, empty authority, unchanged 1/2/2 fixtures and retained quota/history counts. Re-enabling after rollback requires separately reviewed SQL; do not rerun the creation candidate.

## Explicit approval instructions — no action until approved

After exact-final-commit Quality/typecheck/build and Security Scan validation, the owner may authorize in separate steps:

1. **Migration only:** “I approve applying only the exact 20261026000000 production synthetic demo candidate, creating the five listed tables/functions/controls and seeding one invented source, two observations and two non-human test receipts for the exact existing mission/crew; quota writes only. Persistent approvals, real-data AI, local uploads, role/mission changes and scientific activation remain prohibited.”
2. **AI activation separately:** “I approve enabling only MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED for [UTC start/end], with [request/spending cap], using the existing OpenAI provider, exact synthetic fixtures and session-only review. Keep all governance/test switches off.”
3. **Publish/deployment separately**, if needed to make application changes live; preparation is not deployment authorization. After activation, run the real signed-in synthetic walkthrough under that bounded permission and report results, not assumed acceptance.

No production approval has been requested or granted through a tool. The existing P3663/P3664/P20 gates remain blocking overall release; this candidate does not close them. Pre-hardening SHA `da96a9017d747473b66efb8f3c1703dae7f5bf8f` was synchronized and Quality/Security passed, including typecheck/build; Medical Release Gate failed solely at the three evidence verifiers. Those results cannot attest this corrected migration. Exact-final-hardening SHA Quality/Security/typecheck/build must be checked after managed synchronization; no manual build/typecheck is claimed.
