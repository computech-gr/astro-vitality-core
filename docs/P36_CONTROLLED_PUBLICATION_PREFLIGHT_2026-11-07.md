# P36 controlled publication preflight — 7 November 2026

## Result: STOPPED before Phase B

The owner explicitly authorized conditional publication and handoff activation in `MITOCHONDRIA_P36_-_AUTHORIZE_CONTROLLED_pasted.md`. Phase A did not pass: the exact-commit Quality workflow failed its Format check and skipped Production build. No publication was requested, no configuration was changed and no admission was opened. This is not a deployment rollback: there was no deployment operation to roll back.

## Exact build candidate and CI evidence

Candidate HEAD: `5252c068ec84ded8233a790f4207593916c4350c` in `computech-gr/astro-vitality-core`.

Public GitHub Actions runs were queried for that exact SHA using pagination and newest-run selection, not a previous successful baseline.

- Quality run `42353231090`, attempt 1: completed / failure.
- Its job `128345648363`: foundation/domain verifiers, security boundary audit, domain/integration tests and permanent synthetic policy disposable SQL security passed.
- Typecheck step 29: success.
- Lint step 30: success.
- Format check step 31: failure.
- Production build step 32: skipped. Therefore production-build validation is **not established** for this candidate.
- Security Scan run `42353231150`, attempt 1: completed / success.
- Medical v3 Release Gate run `42353231072`: in progress at inspection; no completed success claimed.

No manual production build or typecheck was run; the project/platform requires managed exact-commit evidence. Newly recorded documentation after this inspection is not certified by those earlier runs.

## Fresh local and live checks

- Existing cloud handoff and crew-choice tests: 19 passed, zero failed.
- Existing dynamic handoff, pending-summary, scientific-authorization and verified-revision tests: 56 passed, zero failed.
- Local security boundary audit: PASS.
- Lint: zero errors, 12 warnings.
- Dependency audit: two moderate findings, in esbuild and minimatch dependency branches. No dependency changes were made.
- Fresh basic backend security scan: no issues found by completed basic checks; this did not perform deep code analysis. It is not an all-clear code audit.
- Live migration journal IDs 17–21 retain the verified installation hashes.
- All five dynamic tables retain RLS and deny effective executor INSERT, executor column INSERT, authenticated INSERT and anonymous INSERT.
- Final admission readback: exactly one singleton, `handoff_open=false`, `authorization_open=false`; submissions 0, handoff terms 0.

The current configuration uses the existing environment-driven generated client and custom authenticated bearer middleware; neither was changed. The expected Cloud backend remains the previously verified installation target. A new production bundle was not built or deployed, so this preflight does not attest its backend binding or published server compatibility.

## Published status and feature flags

- New deployment status: **not requested**.
- New published build identifier: **none**; candidate SHA above is not a deployment identifier.
- Actual published `P36_DYNAMIC_HANDOFF_ENABLED`, `P36_DYNAMIC_AUTHORIZATION_ENABLED` and `P36_CLOUD_SUBMISSION_ENABLED`: **unverified and unchanged**. Configured names or source defaults are not effective published values.
- Database handoff/scientific authorization: both **closed**, independently read back.
- No uploads, automatic submissions, mission/account/membership changes, scientific decisions or catalog promotion occurred.

## Required next sequence

1. Resolve the failed formatting gate without altering approved SQL bytes or historical migrations. Obtain successful Quality including Production build on the exact synchronized replacement commit and review the completed release/security results.
2. Only then resume the authorized closed-state publication: explicitly disabled handoff, authorization and legacy flags, with both database admissions false. Confirm actual published compatibility, effective flags and application health without any submission.
3. Only after that checkpoint, use the supported additional deployment for the handoff flag alone. Verify it on the published server before opening handoff admission. Keep authorization/legacy disabled. Close handoff on any subsequent verification failure.
4. Prepare separate existing synthetic Ground Medical and Researcher sessions; do not create or change accounts/memberships. Neither real session was tested in this turn.
5. On `/mission/scientific-review`, Ground Medical selects the intended synthetic mission/crew scope, previews the original 12-term request, explicitly consents and manually submits. Researcher refreshes the same authorized scope and verifies exact batch metadata/receipt.
6. Repeat separately for the original 197-term request. Verify batch counts rather than assuming unique aggregate count 209, preserve genuine cross-request duplicates, and confirm retries do not duplicate history or accept changed-payload conflicts.
7. Verify cross-scope denial, metadata-only payloads and audit history through both real sessions before claiming end-to-end acceptance. No scientific recommendation, approval or catalog promotion is authorized by these tests.

Manual acceptance details remain in `P36_METADATA_HANDOFF_ACTIVATION_CHECKPOINT_2026-11-07.md`. Ground Medical/Researcher acceptance readiness is **blocked by release and activation**, not PASS. No operation remains scheduled after this checkpoint.