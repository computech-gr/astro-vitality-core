# Medical v3 — isolated staging and exact-commit release gate

## Scope

This patch installs an independent GitHub Actions release gate and an offline verifier. It does NOT provision an isolated staging stack or certify browser acceptance.

## Reproducible staging requirement

Use a separate, disposable Supabase local stack or an owner-approved independent staging project with its own PostgreSQL, GoTrue Auth, PostgREST Data API, keys, origins, users and synthetic fixtures. No shared Lovable Cloud backend, production Supabase credentials, production datasets or production migration execution. Never run browser tests against shared preview. Docker/Podman and a Supabase CLI or equivalent must be available; if absent, report BLOCKED.

Before any test, independently verify that the browser and server resolve to the staging origin, JWT issuer and keys; verify no production endpoint in effective runtime config, disable production egress, and confirm synthetic-only fixtures. Use a dedicated limited-budget staging AI key if approved. Do not log JWTs, API keys or medical data.

Test 1280px and 390px: authenticated reviewer, unauthorized/other crew, explicit consent, exact observation-ID citations, append-only export integrity and SHA-256, quota contention and 429, revoked reviewer, stale evidence and responsive layout. Preserve private-evidence gates. No fabricated screenshots or results.

## CI and approvals

The workflow `medical-v3-release-gate.yml` runs on push/PR and reports the exact SHA. Its success means code validation, not staging acceptance, migration approval, medical validation, or production authorization. Verify required check is enabled in branch protection separately. Do not claim exact-commit pass before the actual workflow completes.

No production migrations, role grants, real-data AI or persistent production approvals are authorized by this patch. Separate owner authorization required for staging provisioning and any spend.
