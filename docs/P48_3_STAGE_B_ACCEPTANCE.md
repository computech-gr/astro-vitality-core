# P48.3 — Authorized Synthetic Crew Self Stage B: readiness and acceptance

## Evidence from P48.2
The focused revalidation controller hides private readings on tab hide, return, auth change, and navigation, rejects stale responses, and preserves non-sensitive session state. This is not a real-user production acceptance result.

## Non-negotiable protections
- Do not reuse MISSION_TEST, FV01-TEST-A, FV01-TEST-B or MITO_DEMO_2026, or their existing accounts/readings.
- Treat all existing medical-sensitive records as private, regardless of mission names.
- Preview and production share a database: never assume preview is isolated.
- Prefer an isolated backend only if actually supported and verified; otherwise request explicit approval for permanent synthetic writes to the live database.
- Never bypass RLS, forge auth tokens, alter created_at timestamps, delete append-only evidence, or use privileged service keys in the browser.
- No test-account creation, invitations, missions, memberships, readings, migrations, RLS changes or publishing without separate approval.

## Stage B plan (approval gated)
1. Verify supported backend isolation options and report exact constraints without changing settings.
2. Present a precise inventory of proposed new mission, crew A/B, dedicated test accounts, consent/labeling and estimated append-only records.
3. Obtain explicit operator approval and verify test emails are controlled by the project team.
4. Use existing operator and normal crew onboarding workflows only.
5. Insert clearly labelled synthetic observations through the approved intake workflow, preserving provenance and units.
6. Verify crew A's own 7/30/90-day and source filters against stored records; confirm B's records are not returned through direct API requests.
7. Verify operator/researcher/signed-out access restrictions and revoke A through operator controls; verify new reads fail and tab-return clears stale view.
8. Test in Edge and a real phone, including permission behavior for browser notifications.
9. Record test evidence without copying sensitive values or credentials into repository logs.

## Remaining limitation
While the tab stays continuously visible, revocation is not immediately reflected in already rendered data. New server requests remain RLS-protected. Consider an independently reviewed, fail-closed active-session freshness policy before calling revocation immediate.

## Acceptance criteria
- Two dedicated test identities; no existing account repurposed.
- All synthetic data distinctly marked, no mixing with medical-sensitive records.
- RLS cross-crew isolation verified with real authenticated sessions.
- Revocation verified against real backend and visible UI.
- No unauthorized reads, migrations, security-policy changes, or publishing.
- Results and remaining limitations documented accurately.
