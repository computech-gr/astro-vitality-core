# Medical v3 staging and release gate — execution status

## Manifest and integration deviations

All three archive entries matched both SHA-256 and byte count before copying. All were initially applied byte-identically:

| File | Bytes | Supplied SHA-256 |
| --- | --- | --- |
| `scripts/verify-medical-v3-release-gate.mjs` | 870 | `2984675a4402238bd7260512ef187b422b7ed7ef4cc48d3fd3fdaa6c0a7e3a2f` |
| `.github/workflows/medical-v3-release-gate.yml` | 1302 | `5c3f3e4f60195057e88db5fade81b9b509829746b9f355d42b94fa4d46325ecc` |
| `docs/MEDICAL_V3_STAGING_AND_RELEASE_EXECUTION.md` | 1968 | `3a43204c7d289f459dec359f39ee593fcf5a4a75f679ca9a4fcca44afa7eb7ca` |

The supplied static structure verifier remains byte-identical. Necessary deviations: format the supplied handoff; replace mutable workflow actions and the unsafe old Trivy reference with the repository's immutable checkout/Trivy pins and setup-bun v2.2.0 commit; pin Bun 1.4.4; disable persisted checkout credentials; run individual validation steps after failures (without ignoring their failures); add complete offline verifier execution and tests. No dependency change was necessary.

The old `trivy-action@0.33.1` conflicts with the repository's documented compromised-tag supply-chain safeguards. The replacement is the existing `v0.36.0` immutable commit. No vulnerable action was executed.

## Release gate implemented, not certified

The workflow runs on main pushes, pull requests and manual dispatch, with read-only repository permissions and a frozen lockfile. It retains `bun run check` and separately runs all offline verifiers, tests, full typecheck, lint, formatting, production build and the supplied release guard. Separate steps use `!cancelled()` so early code/evidence failures do not prevent later validation or Trivy; failures still fail the job.

Full-scope Trivy explicitly includes development dependencies, unfixed findings, vulnerability and secret scanners, HIGH/CRITICAL severity and failure exit code 1. The summary records `GITHUB_SHA`; success cannot attest staging, scientific approval, private evidence, deployment or production authorization.

`scripts/medical-v3-static-checks.mjs` executes every current offline `verify-*.mjs` with an explicit five-script runtime exclusion list and no inherited provider/backend credential variables. Its two regression tests ensure service-dependent scripts are excluded and authentic private/ sealed-evidence gates retained. New verifiers selected by this runner must be reviewed for side effects. The supplied structure verifier checks strings and file existence only; it does not attest GitHub execution or service isolation.

Required branch protection, matching GitHub Quality/Security/Medical release results and synchronization remain **unverified**. No repository settings, workflow dispatch or stateful Git operation was performed. Final observed managed SHA and exact-commit public API outcome are reported in chat after the last edit. A prior green commit is not evidence for this update.

## Disposable staging: BLOCKED and stopped

Read-only infrastructure inspection found no Docker or Podman executable/socket and no GoTrue, PostgREST or independent local Auth/Data API services. PostgreSQL executable availability does not provide a complete authenticated stack. No owner-approved independent external target or paid budget is available. The supplied handoff itself states that it does not provision a stack and requires stopping when these prerequisites are absent.

Therefore no stack was started, no synthetic identity or fixture was uploaded, and no shared preview/backend, production credential, managed auth session or real medical data was used for acceptance. No new deployment, production migration, production AI, persistence activation or paid resource was provisioned. No teardown was executed because this task created no staging service or database.

Existing architecture and isolation preflight remain the resumption contract: genuine independent JWT issuer/keys, Auth and token-validating Data API, disposable PostgreSQL, dedicated application origin and effective browser/server configuration, canonical approved synthetic fixture scope, enforced production-egress denial, owner-approved limited OpenAI credential/budget, deterministic setup and teardown, and independently verified acceptance runner. The current preflight intentionally cannot certify full acceptance and exits **2 / BLOCKED** without those prerequisites.

**Desktop 1280px/mobile 390px acceptance NOT EXECUTED.** Sign-in, consent, exact observation-ID citations, authorized JSON export, SHA-256/timestamps, cross-crew denial, reviewer revocation, quota contention/429, stale evidence and responsive behavior remain unverified against genuine staging. No simulated screenshots, receipt or PASS was created. Safe teardown is documented architecture only, not an exercised stack lifecycle.

## Actual local checks

- **547 tests passed, 0 failed**, 115 files / 8613 assertions, including two new release-boundary regressions.
- **102 offline verifiers executed: 99 passed / 3 genuine evidence failures**. The runner exits 1 rather than bypassing them.
- Unchanged failures: `verify-p3663-activation.mjs` (authentic activation/restore evidence), `verify-p3664-owner-risk.mjs` (authentic owner-risk/live-check evidence), `verify-submission-gate.mjs` (missing sealed `data/release/mission-day-127.synthetic.json`). No fabricated evidence or manifest regeneration.
- Five explicitly unexecuted service-dependent scripts: disposable PG integration, medical governance v3 database integration, synthetic completion database/provider integration, remote auth configuration and unconfigured staging target. Historical disposable test results are not counted as new results.
- Supplied medical release structure guard: PASS, static only.
- Isolation preflight: exit 2 / BLOCKED; no browser/provider/database mutation.
- Lint: **0 errors / 13 existing warnings**. Formatting: supplied handoff corrected; final format check performed after this report.
- Trivy 0.66.0 full-scope, all-severity filesystem scan: **0 reported vulnerabilities / 0 secrets**, including dev dependencies. Scanner database results are not a universal security guarantee.
- Manual full typecheck and production build are prohibited by sandbox workflow and were not run. The automatic preview reports `build OK`; exact-commit GitHub full typecheck/build remain required and unverified.

## Changed files and unchanged safeguards

The three manifest files plus `scripts/medical-v3-static-checks.mjs`, `tests/domain/medical-v3-static-checks.test.ts`, this report, `AGENTS.md` and `roadmap.md` are the complete intended change scope.

Scientific catalogs and source fingerprints, `PENDING_NIKOLAS_REVIEW`, encrypted offline append-only history, mission isolation, auth and roles, privacy/private-evidence gates, pending and production SQL, competition PDFs and MP4 are unchanged. Real-data AI and production persistent approvals remain disabled. Staging readiness is BLOCKED; release workflow is implemented but exact-commit execution and required-check enforcement are not verified.