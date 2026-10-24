# MITOCHONDRIA v3 — isolated browser acceptance execution handoff

## Source finding
The latest repository status says browser acceptance was **not executed**: the shared preview is connected to the shared backend, disposable PostgreSQL alone does not supply real authentication or a Data API, and no independent browser test identity or provider budget exists. Existing 526 unit tests do not replace functional browser evidence.

## Execution contract
1. **Do not use the shared preview or shared Supabase backend.** Provision a dedicated isolated application origin, real local authentication service and Data API bound to disposable `medical_v3_it` only. Preserve actual token verification and authorization middleware; no auth stubs or browser-ID-to-SQL-claim shortcuts.
2. Verify effective runtime configuration independently, not merely environment-variable declarations. Confirm app, auth and Data API destinations are loopback and distinct from shared preview port 8080. Deny outbound shared-backend traffic; retain network evidence.
3. Create a **disposable synthetic reviewer** and exactly one synthetic crew association inside the isolated environment. No production identities, tokens, roles or memberships may be copied or modified.
4. Seed only canonical `cv-001 / HR` synthetic fixtures through the approved server-authoritative path. Confirm accepted-observation provenance, SHA-256 and version/correction handling. Never promote local browser records into server authority.
5. Use a dedicated test-only server secret and explicit numeric request/spend cap; fail closed if missing. Keep real-data transmission disabled. No external AI call without explicit test consent.
6. Implement deterministic Playwright or equivalent browser automation at 1280px and 390px. Test authenticated crew selection, consent/no-consent, evidence Q&A with exact observation-ID citations, invalid citations, unknown metrics, no invented ranges, authorized JSON export with byte-level schema/hash/timestamp verification, 401/403, cross-crew denial, revoked membership, stale evidence, quota 429/concurrency, keyboard navigation, overflow and console errors.
7. Persist only synthetic acceptance receipts (commit SHA, environment attestation, exact assertions, redacted screenshots, network destination summary, timings and costs). Never include tokens, medical records, raw provider prompts or secret values.
8. Tear down disposable services, users, fixtures, browser sessions and provider access. If isolation cannot be demonstrated, return `BLOCKED` with exact missing dependencies; do not substitute a mock-only success.

## Release boundaries
No production migration, production AI activation, persistent production approvals, real-data transmission, role changes, scientific approvals or private-evidence gate bypass. The restore-evidence, owner-risk and sealed-submission gates remain independent and require genuine owner artifacts.

## Required reporting
State separately: (a) tests actually executed, (b) static/unit/SQL checks, (c) genuine isolated browser acceptance, (d) remaining blockers, (e) final commit SHA and Quality/Security results on that exact SHA. If the environment cannot host real local auth/Data API, ask the owner for an explicitly authorized **separate** staging environment; never silently use shared infrastructure.
