# MITOCHONDRIA v3 — Isolated browser acceptance gate

Baseline: supplied archive `astro-vital-spark - 2026-10-25T003846.988.zip`; read `docs/MEDICAL_V3_EXPORT_QA_IMPLEMENTATION_STATUS.md` before changes.

## Objective
Implement and execute repeatable desktop (1280px) and mobile (390px) browser acceptance for the existing synthetic review history export and Evidence Q&A, attached to an isolated app and disposable database. The hosted/shared production backend must remain disabled. Do not treat a hidden control on production as a successful functional test.

## Preconditions (fail closed)
1. Isolated app origin, disposable DB, test-only secrets and flags explicitly documented and proven distinct from published/shared backend. Never point an isolated test at production Supabase.
2. Existing authorized synthetic ground-medical account and exactly one synthetic crew scope; no privilege creation or changes to production memberships.
3. Server-controlled synthetic fixture using canonical `cv-001 / HR` with bpm, accepted provenance, stable observation IDs and canonical SHA-256; no browser-supplied authority.
4. Staged SQL validated and applied ONLY to disposable DB. Production migration remains pending owner approval.
5. Browser test identity, OpenAI cost cap and test environment cleanup are documented; never log credentials, keys or private evidence.

## Required automated and observed scenarios
- Authenticated reviewer: load approved synthetic scope; history export downloads valid JSON with server UTC export time, scope, ordered append-only revisions, actor, timestamp and SHA-256; compare downloaded bytes to server response. Historical hashes are not independently reverified unless canonical historical bytes are available.
- Consent: Q&A without consent is denied, zero provider calls; with consent, valid synthetic question produces only contract-permitted fact statements citing exact observation IDs; verify actual UI rendering at both widths.
- Negative tests: anonymous/fake session 401; unrelated origin 403; cross-crew and revoked reviewer 403; real provenance and nonauthoritative evidence denied; unknown citations, invented values, unsupported medical interpretation rejected; no content displayed on denial.
- Race tests: source changes between snapshot and response/export; review invalidation; quota 429 and Retry-After; failed quota release withholds output; quota cannot be bypassed by concurrent requests.
- Browser: no horizontal overflow, no console exceptions, correct focus/keyboard navigation, download accessible on mobile, no secret or identity leaks to provider; no client-side storage of transcript.
- Preserve existing private-evidence gates as blocked until authentic owner artifacts exist. Do not fabricate sealed files or mark blocked tests passed.

## Delivery and stop conditions
Add browser tests and harness with deterministic isolated setup/teardown, avoid touching unrelated code. Run full unit suite, disposable SQL assertions, typecheck, lint, formatting, production build, security/scientific verifiers, plus GitHub Quality and Security Scan on the EXACT final SHA. Report passed, failed, blocked separately with screenshots/logs sanitized and final SHA.

If isolated app/backend cannot be provisioned safely, STOP; deliver executable harness and precise blockers, do not enable shared production flags or apply migrations. Do not enable real medical data, scientific approval or legally signed medical opinions. Request owner approval separately for production activation only after successful acceptance.
