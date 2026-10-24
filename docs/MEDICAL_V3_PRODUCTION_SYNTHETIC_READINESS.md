# Medical Advisor v3 — production synthetic demonstration readiness

Checked: 2026-10-24T23:29:07Z. This is an assessment of the existing implementation, not activation authorization or browser acceptance.

## Decision

**Do not apply the current pending migrations unchanged or enable the governance flag.** A flag-only change would not work for the existing mission and would also expose persistent-review operations, which are not authorized. No production migration, feature flag, AI request, persistent approval, account, role, mission or observation was changed during this assessment.

The smallest safe solution reuses the existing **server synthetic fixture** panel and OpenAI integration, not the offline report's generation button. The two local reviewer-accepted observations remain encrypted offline records; matching their values does not confer server authority.

## Verified current production prerequisites

Read-only database inspection confirmed:

- Existing mission: `mission-9d8ce8f3e5554509a0885461f9ad2e1c`, code `MITO_DEMO_2026`, name `MITOCHONDRIA 2026 - Synthetic Demonstration`, status **planning**.
- Existing crew: `crew-9806e7e611f44dc38dac5e23f7740f1a`, display name **Alex Morgan — Synthetic Astronaut**, status active, assignment active.
- `marketing@computech.gr` has active `ground_medical` membership `63470171-3a22-4075-b197-ac85b90cb0ef`, linked to that exact crew.
- No Medical v3 review, fixture or quota tables, and no `medical_v3_*` functions, were returned by catalog inspection.
- A server-only `OPENAI_API_KEY` is configured by name; its value and validity were not examined. None of the Medical v3 activation flags appear in the configured secret-name inventory.

The current fixture SQL requires mission status `active` and display name exactly `Alex Morgan`. A disposable reproduction with the existing production mission/crew shape returned **unique approved synthetic scope unavailable**. Its seed inserted zero new rows. Do not rename the crew or activate the mission merely to satisfy test assumptions.

## Existing implementation to reuse

| Area              | Existing implementation                                                                 | Assessment                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Foundation        | `supabase/pending/20261024000000_medical_governance_v3.sql`                             | Caller-bound roles, append-only history, SHA-256, atomic quotas; not applied                                                |
| Fixture authority | `supabase/pending/20261025000000_medical_v3_synthetic_completion.sql`                   | Independently reconstructed canonical v2 fixture evidence; scope assumptions need correction                                |
| UI                | `src/components/synthetic-medical-review.tsx`                                           | Already separate from the encrypted observation store; currently includes persistent review controls                        |
| Draft API         | `src/routes/api.medical-ai-draft.ts`                                                    | Checks caller, synthetic provenance, authoritative evidence and quota; hardening still required                             |
| Q&A               | `src/lib/synthetic-evidence-qa.functions.ts`, `src/lib/synthetic-evidence-qa.server.ts` | Exact-fact citations, caller RPCs, post-provider authority recheck and fail-closed quota release; currently disposable-only |
| Offline review    | `src/components/medical-advisor-workbench.tsx`                                          | Session-only, but its generation action submits offline report rows; not the production fixture demonstration path          |

No pending P36 submission/history migrations are required for this feature. No new users, roles, assignments, public observation policies, uploads or AI provider are necessary.

## Exact proposed database footprint

Reusing both pending Medical v3 migrations entails **five new public tables**:

1. `medical_advisor_review_events` — synthetic review events, RLS scoped to active crew-linked ground-medical membership, immutable updates/deletes. Keep empty for this session-only demonstration.
2. `medical_ai_quota_reservations` — caller/mission reservations; no authenticated or anonymous direct table access.
3. `medical_v3_fixture_sources` — one immutable synthetic source, no browser table access.
4. `medical_v3_fixture_observations` — two immutable invented observations, no browser table access.
5. `medical_v3_fixture_receipts` — two explicitly non-human synthetic test receipts, no browser table access.

Authenticated RPC surface in the existing implementation: `medical_v3_has_scope`, `medical_v3_append_review`, `medical_v3_review_history`, `medical_v3_reserve_ai`, `medical_v3_release_ai`, `medical_v3_ai_evidence`, `medical_v3_fixture_snapshot`.

Internal functions: `medical_v3_immutable`, `medical_v3_authoritative_evidence`, `medical_v3_canonical_json`, `medical_v3_fixture_scope`, `medical_v3_revoke_digest_guard`, `medical_v3_fixture_text_valid`, `medical_v3_fixture_review_guard`. These helpers do not need browser EXECUTE grants.

Triggers: `medical_v3_immutable` on review events; `medical_v3_fixture_immutable`, `medical_v3_fixture_observation_immutable`, `medical_v3_fixture_receipt_immutable` on fixture tables; `medical_v3_revoke_digest_guard` and `medical_v3_fixture_review_guard` on review inserts. One authenticated review SELECT policy: `medical_v3_scoped_read`. Explicit service-role table grants and RLS exist for every table.

The production-scoped candidate must preserve these controls while:

- Resolving only the exact existing mission/crew IDs above, with active membership, active assignment, active crew and explicitly approved **planning or active** status for this demonstration. Reject other/closed missions; do not change mission status or crew identity.
- Failing the migration transaction if scope, membership, expected empty namespace, fixture cardinality or required digest functions do not match; do not silently seed zero rows or accept conflicting existing rows.
- Seeding one source, exactly two observations and two clearly labelled test receipts, never reviews or approvals. Observation IDs: `synthetic-v3-hr-001` and `synthetic-v3-hr-002`; `cv-001`, cardiovascular, 62/66 bpm, at `2026-10-01T10:00:00Z` and `2026-10-02T10:00:00Z`. These are invented fixtures, not copies of the local records.
- Keeping `medical_v3_append_review` EXECUTE revoked for browser roles, and keeping production persistence controls disabled. A server feature flag alone is insufficient because authenticated callers can invoke database RPCs directly.

**The corrected production candidate has not been authored or validated.** The two existing pending files are not a reviewed production activation bundle. No owner should approve those files unchanged on the strength of disposable checks.

## Required default-off application corrections

These are prerequisites, not changes made by this assessment:

1. Separate synthetic source/AI capabilities from durable review activation. Do not enable `MITO_MEDICAL_GOVERNANCE_V3_ENABLED` as a blanket switch. Keep append/persistent approval disabled at both server and database boundaries.
2. Introduce a separately approved, default-off production-synthetic capability for the existing fixture draft/Q&A path. Preserve the disposable Q&A branch. Never label production `disposable` or set its isolated-test flag to bypass authorization.
3. Keep the offline report generation path blocked. Use only server-returned fixture evidence for the demonstration and keep any advisor acknowledgment session-only, bound to the fixture digest and current authorization.
4. Compare draft evidence by exact allowed fields rather than JSON object key order; preserve row ordering, cardinality and exact values.
5. Re-read draft authority after provider completion and withhold output if it changed or quota release cannot be confirmed, as Q&A already does.
6. Bound Q&A provider execution within the existing 35-second lease; the draft endpoint already aborts after 25 seconds. Add timeout, changed-source, release-failure, production-capability, scope and persistence-denial regression tests.
7. Clear stale answers/consents/acknowledgments on refreshed evidence or authorization changes. Any session export must be labelled session-only, not a persistent server review history.

## Quotas, privacy and operational risks

- Existing atomic limits: **5 reservations per user/minute**, **20 per mission/minute**, **one active lease per user**, **35-second lease**. User lock precedes mission lock; reservation commits before provider invocation. Release does not refund the minute window.
- These are request-rate limits, not an absolute financial cap. Continued consenting usage can incur continuing OpenAI charges; choose a bounded activation window and provider-side spending limit before enabling.
- Only approved invented evidence values, metric/unit/time and observation IDs go to the provider. Q&A also sends user-entered question text, which can itself contain sensitive information. The narrow input filter is not a general privacy guarantee; demonstration questions must contain no real health data or identifiers.
- `store: false` is used but is not a guarantee of zero provider retention. No provider call or retention audit was performed.
- Database fixture test receipts are not actual human review, scientific acceptance, clinical validation, licensure or legal signatures. All scientific approval states and `PENDING_NIKOLAS_REVIEW` remain unchanged.
- Existing review-table SELECT grants expose the full authorized row, not only the history RPC's stripped fields. Keep that table empty and consider revoking its authenticated SELECT for the session-only production candidate.
- Source reads and external provider calls are separate transactions. Rechecking after generation detects intervening changes, not a permanent immutable authorization guarantee; production hardening must address revocation and request duration explicitly.

## Rollback

Disable the new synthetic source/AI capability first and stop in-flight requests. An owner-approved SQL transaction should revoke authenticated fixture snapshot, AI evidence, reserve and append execution, and restore the empty fail-closed authority resolver. Retain quota rows, fixtures and all append-only history; do not delete local observations, erase audits or drop tables. Leave caller-owned quota release available for cleanup.

The existing `20261025000000_medical_v3_synthetic_completion.rollback.sql` is a useful disable-first template but is not the complete revised production rollback. It revokes snapshot/append/reserve and empties authority; it does not remove tables or refunds already incurred provider costs. Its existing disposable test asserts empty authority, not every privilege/history invariant. A production candidate needs explicit rollback privilege and retained-row assertions.

## Actual validation results

- **561 tests passed, 0 failed**, 118 files, 9,417 assertions.
- Existing disposable governance SQL suite: **30 assertions passed**.
- Existing disposable authoritative synthetic completion suite: **51 assertions passed**.
- Additional production-shape reproduction: unchanged fixture SQL failed closed; transaction rolled back. This confirms a blocker, not a working production demonstration.
- Lint: **0 errors, 13 existing warnings**. Formatting: passed. Security audit: passed.
- Offline scientific/security verifiers: **99 passed, 3 failed**, 5 service-dependent checks excluded. Failures remain genuine P3663 private restore evidence, P3664 private owner-risk acknowledgment and P20 official-rules confirmation; no evidence gates were altered.
- New Trivy scan with cached Trivy 0.66.0/database updated 2026-10-24 19:09 UTC: **0 vulnerabilities, 0 secrets**, including development dependencies. This was an offline scan with cached intelligence, not a freshly downloaded advisory database.
- Manual typecheck and production build are prohibited by this environment and were not run. No exact-commit GitHub Actions validation was obtained; the running preview is not production-build proof.
- No live AI, production SQL, persistent review or successful authenticated production demonstration was executed. Local/disposable checks are not full browser acceptance.

Logs: `/tmp/readonly-quality-fresh/`, `/tmp/medical-investigation-governance.log`, `/tmp/medical-investigation-completion.log`, `/tmp/production-synthetic-readiness/scope-reproduction.log`.

## Explicit approval boundary

There is **no safe one-switch approval available now**. First prepare the corrected default-off application changes, an exact production-scoped SQL candidate and disable-first rollback, validate them against the planning-status/suffixed-name fixture shape and obtain permitted exact-commit typecheck/build checks. Return their exact SQL and checks for review before applying anything.

Only then request approval for: **adding the five scoped tables and caller RPCs; seeding the one invented source/two observations/two non-human test receipts for the specified mission/crew; enabling only a bounded synthetic AI source/draft/Q&A demonstration through the existing OpenAI integration; permitting quota writes; and verifying the authorized session-only workflow.**

That approval must explicitly exclude local observation uploads, other missions/crew, role changes, mission activation, real-data AI, persistent advisor acknowledgments, clinical/scientific activation and automatic publication. Deployment/publishing permission and the demonstration usage window are separate necessary activation decisions.
