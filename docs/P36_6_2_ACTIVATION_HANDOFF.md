# P36.6.2 — Synthetic Cloud Saving activation handoff

This is an operational handoff, not proof of activation. The owner has authorized P36.2B10, P36.4 and P36.5 migrations **conditionally on a verified release-specific restore checkpoint**. Never infer recovery capability from the separate Supabase project. Do not create new missions or alter MISSION_TEST.

## Current verified owner-reported state

- Canonical GitHub: `computech-gr/astro-vitality-core`, `main`, commit `5233a57d384ff750a2d1680cab5cb6cefeefdd8e` (reconfirm before deployment).
- Quality PASS; Trivy PASS with zero HIGH/CRITICAL and zero detected secrets; separate Supabase Preview SKIPPED after production deploy and automatic branching were disabled.
- Lovable Cloud P36 migrations NOT APPLIED; synthetic saving OFF; Crew Self acceptance PENDING.

## Required independent restore evidence — HARD STOP

Request from Lovable Support or an authorized Cloud operator: exact Lovable Cloud project identity, checkpoint timestamp (UTC), coverage of this specific pre-migration state, retention/expiry, who can execute recovery, restoration steps, and any known data-loss/availability implications. A screenshot of another Supabase project's backup is **not sufficient**. If recovery cannot be confirmed, STOP; do not use row counts, SQL exports, or an old FV-01.4.3 confirmation as substitutes.

## Deployment sequence after restore proof

1. Capture the recovery evidence in private operator records, not in GitHub. Confirm live project identity, latest schema/migration history, no conflicting P36 objects and baseline counts; run `node scripts/verify-p366-cloud-release.mjs` and independently review SQL.
2. Apply exactly the staged P36.2B10 foundation → P36.4 synthetic submission → P36.5 history using governed Lovable Cloud migration mechanism. Record IDs and hashes; STOP on discrepancy. Do not run migrations through the external Supabase integration.
3. Verify forced RLS, direct table access denied to client roles, RPC grants limited to authenticated, mission/crew isolation, 96 catalogue metric/unit pairs, and baseline synthetic batch counts. On failure keep flag OFF.
4. Set server-only `P36_CLOUD_SUBMISSION_ENABLED=true` **only after** all checks pass. Do not commit secrets, credentials, backups, or private evidence.
5. Owner manually signs in as Crew Self in `FV01-TEST-B`, uploads synthetic PDF, Select All, confirms review, Save, retries Save, checks one persisted batch and date-sorted history. Record screenshots without personal information. If not completed, report ACCEPTANCE PENDING and do not claim production acceptance.
6. Confirm GitHub sync/CI and publish only with an explicit verified release result. Report exact live deployment and feature flag state. Disable flag immediately if an access/isolation anomaly is detected.

## Rollback

Feature flag OFF first. Rollback SQL only with explicit operator approval and preservation plan; P36.4 rollback can destroy synthetic records. No automatic rollback and no guarantee of reversibility.

## Unchanged gates

FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED. Synthetic pending_review records are not clinically approved data.
