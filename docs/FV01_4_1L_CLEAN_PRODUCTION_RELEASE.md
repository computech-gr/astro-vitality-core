# FV-01.4.1L — Clean Production Release Gate

## Purpose

Publish the already-tested FV-01.4.1K diagnostic-removal build, without changing production data or mission permissions.

## Preconditions

- Verify the current working tree matches the owner-supplied FV-01.4.1K archive for application code; stop if unexpected differences exist.
- Confirm the canonical origin is `https://mitochondria.edocinfo.com`.
- Capture the current live asset filenames/fingerprint as a rollback reference; record the exact candidate commit SHA before publishing.
- Run `bun run check` and confirm 205 tests pass, or investigate any different count.
- Confirm `src/components/mission-rls-count-probe.tsx` and `tests/identity/fv0141h-rls-probe-guardrails.test.ts` are absent and `src/components/mission-identity.tsx` has no probe import/render.

## Authorized release scope

- Owner approval covers publication of the validated diagnostic-removal build only.
- Do not change Supabase, RLS, authentication settings, accounts, roles, invitations, missions, data, or production secrets.
- Do not run any probe or impersonate a user.
- Stop and ask if the candidate changes beyond the reviewed FV-01.4.1K removal or if deployment target is ambiguous.

## Post-publication verification

- Confirm canonical HTTPS route `/mission/identity` returns normally.
- Confirm the new production assets no longer contain the temporary diagnostic panel, test-account email literals, or STOP warning.
- Confirm the ordinary sign-in UI and conditional first-operator behavior are preserved; do not assert authenticated UI behavior without a real session.
- Record deployed commit SHA, live asset fingerprints, publish outcome, and any deviations.
- Request owner to refresh the page and confirm that the diagnostic has disappeared.

## Evidence and status

- Owner-supplied R1/R2/R3/R5 count-only results for TEST A and TEST B: PASS within the scope of those reads.
- R4 mission_events: INCONCLUSIVE while the table is empty.
- A3 and A7: owner-confirmed PASS; do not claim independent automated verification.
- Phase B: NOT APPROVED. FV-01-13: OPEN. Final FV-01 security approval: BLOCKED.

## Execution record (pre-publication)

- Candidate commit: `3a5c371b0a9acbed467dca1562a023a77e00a323` (FV-01.4.1K removal; only this document added since).
- Canonical origin: `https://mitochondria.edocinfo.com`.
- Rollback reference: prior live build served `app-shell-Dy5VDVsz.js`, `index-DREcC8Nj.js`, `client-CMf19Wv5.js`.
- Probe component, its wiring, its test and test-account email literals: absent from `src/` and `tests/`.
- `bun run check`: PASS, 205 pass / 0 fail.

## Execution record (post-publication)

- Published: candidate `3a5c371b0a9acbed467dca1562a023a77e00a323` plus this documentation-only file.
- `/mission/identity` on the canonical origin: HTTP 200.
- New asset fingerprints: `index-DvSGNpE7.js`, `mission.identity-DUYFqq3N.js`, `offline-CYxfTI6P.js` (previously `index-DREcC8Nj.js`, `mission.identity-BWo1kZO3.js`, `offline-B3C_TSA0.js`).
- Published bundle scan: 0 matches for the probe component, test-account email literals, removal marker or STOP warning; ordinary sign-in/invite UI present.
- Authenticated UI behaviour not asserted; owner refresh confirmation requested.
- A3, A7: owner-confirmed PASS. R1/R2/R3/R5: screenshot-evidenced PASS (TEST A and TEST B). R4: INCONCLUSIVE.
- Phase B NOT APPROVED. FV-01-13 OPEN. Final FV-01 security approval BLOCKED.
