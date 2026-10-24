# Medical v3 final diagnostics — verified results

## Decision: BLOCKED, not production-complete

The reproducible P20 artifact is restored and matches its pre-existing sealed manifest exactly. No evidence status, manifest hash, scientific classification, role, production SQL, feature flag, observation store, PDF or video was changed. Production AI, migrations, persistent approvals and real-data transmission remain disabled. No new generic implementation plan was created.

## Patch verification and changed files

Both supplied files were verified before copying and initially applied byte-identically:

| File | Bytes | Supplied SHA-256 |
| --- | ---: | --- |
| `docs/MEDICAL_V3_FINAL_RELEASE_DECISION.md` | 2686 | `53ba0bddd6cb6cffaac7be2b0f85f1baf595dce435d4097fb5634d126f83cfdf` |
| `scripts/medical-v3-release-diagnostics.mjs` | 1874 | `e5327c143d1b9937f51cea55e4809631f9ee463d53529ef9a170ab8ba9f4e6f5` |

Necessary integration deviation: the diagnostics chose an empty stderr buffer over meaningful stdout, losing both private-evidence error messages. It now combines nonempty verifier streams and preserves full output instead of truncating it; removed an unused import and formatted only touched files. The supplied decision document is unchanged.

Additional files: generated `data/release/mission-day-127.synthetic.json`, three regression tests in `tests/submission/medical-v3-final-diagnostics.test.ts`, this results document, `AGENTS.md`, and `roadmap.md`. The controlled manifest regeneration produced no change. No dependency or workflow change was necessary.

## Actual execution

- `bun run sample:release`: PASS. Existing deterministic scenario `mission_day_127_fatigue_recovery`, fingerprint `f906c81a`, 868801 bytes, SHA-256 `6997feae355887f1e1e56b5f0c533f5d365a67b5f89e765b1006c22d6153df8c`. Tests check every observation's synthetic classification and tag.
- `bun run submission:manifest`: PASS, byte-identical regenerated manifest. All 15 existing entries independently match SHA-256 and byte count. No dummy artifact, re-sealing, changed expectations or evidence promotion.
- Full tests: **550 passed / 0 failed**, 116 files, 9365 assertions. The new synthetic-marker test initially used the wrong event shape; corrected to the actual observation envelope and reran the complete suite successfully.
- Offline verifier runner: **99 passed / 3 blocked** out of 102. P3663 lacks private restore evidence; P3664 lacks private acknowledgment; P20 now reaches the actual `P20-RULES-001: pending_external` blocker, not a missing artifact.
- Five runtime exclusions remain unexecuted: disposable PostgreSQL integration, governance database integration, synthetic database/provider integration, remote auth configuration and unconfigured staging target. Historical database/provider tests are not new results.
- Lint: **0 errors / 13 existing warnings**. Repository formatting: PASS. Security audit: PASS.
- Fresh Trivy **0.66.0**, full filesystem scan, vulnerability and secret scanners, all severities, development dependencies included, unfixed findings included: **0 reported vulnerabilities / 0 secrets**. Scan began `2026-10-24T22:32:58Z`, vulnerability database updated `2026-10-24T19:09:13Z`. This is a scanner result, not universal security certification.
- Diagnostics rerun at `2026-10-24T22:33:14.923Z`: exit 1, all three evidence gates BLOCKED with actual reasons. Raw output is retained in `/tmp/v3-final-diagnostics.json`; that execution named then-current managed SHA `b18412ffa9688fe6be38ef984120789ad0cd4c0f`, not the final documentation SHA.
- Independent isolation preflight: **exit 2 / BLOCKED**; browser acceptance NOT EXECUTED. No independent Auth or token-validating Data API is available, no Docker/Podman stack is available, and PostgreSQL tooling alone cannot supply authenticated acceptance. The only observed application is the shared preview; it was not used for acceptance. No shared credentials, synthetic upload, service startup, paid provisioning or teardown occurred.
- Content-route metadata inspection found no missing app-specific metadata in the inspected content heads, including index. No presentation changes were made.
- Manual full typecheck and production build are prohibited by the sandbox workflow and were not run. Automatic preview reports `build OK`; exact-final-commit GitHub typecheck/build must be reported separately, not inferred from preview.

## Exact owner-only actions

### 1. Supply authentic P3663 restore evidence privately

Perform the actual isolated restore exercise and retain redacted logs, checksums, operator identity and outcome. Supply a private JSON file to `node scripts/verify-p3663-activation.mjs /private/path/restore-evidence.json` with these exact required fields:

- Nonempty strings: `cloudProjectId`, `supportReference`, `checkpointUtc`, `verifiedBy`, `restoreOperator`, `restoreProcedure`, `retentionUntilUtc`, `coverageConfirmation`.
- `checkpointUtc` and `retentionUntilUtc` must parse as dates; retention must still be in the future.
- `confirmedLovableCloud: true`, `baselineMigration: 13`, `ownerApproval: true`.

Keep identifiers and evidence private. This verifier checks the supplied schema and pending migration fingerprints only; its success is `OFFLINE_EVIDENCE_READY_LIVE_CHECKS_REQUIRED`, not an independently verified backup, staging acceptance or production authorization. Do not assert that an exercise occurred merely by populating fields.

### 2. Decide whether to provide the P3664 risk acknowledgment

Only after reviewing actual residual risk, supply a private JSON file to `node scripts/verify-p3664-owner-risk.mjs /private/path/acknowledgment.json` with:

- `mode: "OWNER_MANAGED_BACKUP_RISK_ACCEPTED"`.
- `ownerApproved: true`, `backupIndependentlyVerified: false`, `acceptsPotentialIrrecoverableDataLoss: true`, `authorizesMigrations14To16: true`, `syntheticOnly: true`, `baselineMigration: 13`, `externalSupabaseDeployDisabled: true`.
- `approvedAtUtc`: a parseable genuine approval timestamp.

**This explicitly accepts potentially irrecoverable data loss and authorizes migrations 14–16; do not provide those booleans unless that is genuinely your decision.** It does not authorize the separate medical-v3 pending migrations or activation. The verifier returns `OWNER_RISK_ACKNOWLEDGED_LIVE_CHECKS_REQUIRED`; it does not cryptographically validate a signature or prove live checks. No signature or acknowledgment has been invented.

Both existing verifiers still check all three pending migration fingerprints and required rollback files. Neither has been modified or bypassed. The diagnostic and current CI invoke them without evidence arguments; authentic evidence additionally needs an approved private execution/injection arrangement, not a public repository commit. No private-evidence wiring was invented or activated in this task.

### 3. Recheck official 2026 submission rules

Review the actual official submission form, judging instructions and rights requirements immediately before submission. Provide the official HTTPS source and genuine confirmations for `official2026SubmissionRules`: `status: "ready"`, `officialSourceUrl`, `submissionFieldsRechecked: true`, `judgingInstructionsRechecked: true`, `rightsRequirementsRechecked: true`, and actual `checkedAt`. Only then authorize updating P20-RULES-001 and controlled manifest regeneration. P20-VIDEO-001 remains ready; P20-RULES-001 remains pending_external.

### 4. Provide independent staging infrastructure and bounded test authorization

Provide/authorize a genuinely separate application origin, Auth issuer and keys, token-validating Data API, disposable database, synthetic-only reviewer/fixtures, enforced production-egress denial, test-only OpenAI credential and bounded budget. Prove isolation before runtime execution and exercise teardown. Then run 1280px/390px sign-in, consent, exact citations, authorized export, SHA-256/timestamps, cross-crew denial, reviewer revocation, quota contention/429 and stale-evidence acceptance. None of these loaded flows has been accepted in this final attempt.

## Exact-commit CI boundary

Before this patch, public GitHub main matched `15bc6b49110b1194566360532b2452bcb23e7f0f`: Quality run 265 and Security Scan run 252 succeeded; Medical v3 Release Gate run 1 failed at the offline evidence step, while its later tests/typecheck/lint/format/build/security steps succeeded. Those results do not certify this final update. Final managed SHA, public main and matching runs are checked after the last edit and reported in chat. No stateful Git action, workflow dispatch, branch-protection change or deployment was performed. Missing or queued matching runs mean unverified, not success.