# P20 video evidence closure

## Medical v3 schema / seed separation

- [x] Schema committed once as drizzle/migrations/0011_medical_v3_synthetic_schema_only.sql, journal id 12; verified five empty tables/RLS, 15 hardened functions, application-role CRUD/TRUNCATE denials, four-RPC allowlist, persistence trigger and quota definitions.
- [ ] STOPPED: submitted SQL accidentally added one leading space on lines 10 and 350; recorded SHA eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237 differs from approved SHA. Snapshot definition hash consequently differs and exact seed dependency check will refuse. No correction, rollback, seed or activation without new explicit owner authorization.
- [x] Prepare schema-only candidate, atomic exact-scope data seed and separately authorized non-destructive rollback/recovery; preserve approved originals.
- [x] Validate fingerprints, hostile production-default privileges, idempotency, missing prerequisites, failure rollback, quotas and existing security suites in disposable SQL: 863 SQL assertions and 565 tests pass.
- [x] Report exact artifacts/results and separate schema/seed approval scopes in docs/MEDICAL_V3_SPLIT_MIGRATION_AND_SEED.md; production execution and all activations remain unauthorized.
- [ ] Execute only after new separate owner approvals; seed transport acceptance of the exact atomic DO statement remains undocumented/unverified and must stop safely on rejection.

## Final permission hardening

- [x] Harden all five tables, owned sequences and v3 function allowlist against inherited production privileges; 252 disposable SQL assertions pass.
- [x] Test production-equivalent ACLs/rollback (252 assertions), existing governance/completion (81), 565 tests, lint/format/security, fresh zero-finding Trivy and 99/102 static checks; new hashes recorded in implementation handoff.
- [ ] Exact-final-hardening GitHub Quality/Security and typecheck/build: awaiting matching completed runs.
- [ ] Production migration, seeding, AI and deployment remain blocked pending explicit authorization.

## Production synthetic demonstration implementation

- [x] Implement exact-ID pending migration, default-off synthetic capability and session-only demonstration; no production writes or activation.
- [x] Validate candidate/rollback (48 disposable assertions), existing suites (386 SQL assertions), 565 tests, lint/format/security and 99/102 release verifiers; details in docs/MEDICAL_V3_PRODUCTION_SYNTHETIC_IMPLEMENTATION.md.
- [ ] Production migration, seeding, AI and deployment: blocked pending explicit owner authorization.

## Production synthetic demonstration readiness

- [x] Inspect existing v3 authority, quotas, authorization and live database prerequisites; 561 tests and 81 existing disposable SQL assertions pass. Production-shape reproduction confirms unchanged fixture SQL cannot resolve the existing mission.
- [x] Report exact proposed scope, risks, disable-first rollback and approval boundary in docs/MEDICAL_V3_PRODUCTION_SYNTHETIC_READINESS.md; no production migration, AI call or persistent approval.
- [ ] Production activation remains blocked by exact-commit typecheck/build and explicit owner migration/AI/deployment authorization; corrected candidate and rollback are disposable-validated, older pending SQL must not be combined with it.

## Unified intake bulk review selection

- [x] Add eligible-only bulk selection, counts and mandatory confirmation resets; 561 tests pass, desktop/390px selection and value-edit resets verified without saving, lint/format/security pass and 99/102 static verifiers pass (three existing owner-evidence blockers). Storage and authorization unchanged; exact-commit CI typecheck/build remains unverified.

## V3 final CI and synthetic demonstration

- [x] Verify supplied manifest, correct clean-checkout sample generation and exact-SHA reporting; 556 tests, 99/102 offline verifiers, formatting/lint/security and zero-finding full-scope Trivy completed.
- [x] Execute existing disposable SQL/server synthetic demonstration; 51 synthetic and 30 governance assertions plus FV01 passed; simulated Q&A explicitly distinguished from live AI and blocked browsers in docs/MEDICAL_V3_FINAL_SYNTHETIC_DEMO_AND_CI.md.
- [ ] Confirm exact-final-commit CI; blocked until matching synchronized GitHub runs exist.
- [ ] Owner-only release evidence and independent browser infrastructure remain required; no production activation.

## V3 final release diagnostics

- [x] Verify and apply both manifest files; regenerate the deterministic P20 sample with every existing sealed hash and byte count unchanged.
- [x] Correct diagnostic output regressions; 550 tests pass, 99/102 offline verifiers pass, lint/format/security pass and full-scope Trivy reports zero findings; results in docs/MEDICAL_V3_FINAL_DIAGNOSTICS_RESULTS.md.
- [ ] Owner evidence: BLOCKED until authentic P3663 restore evidence, P3664 explicit risk acknowledgment and P20 official-rules recheck are supplied.
- [ ] Isolated desktop/mobile acceptance: BLOCKED until independent Auth, Data API, database and application origin are independently verified.
- [ ] Exact-final-commit Quality, Security Scan, Medical release gate and typecheck/build: awaiting matching GitHub execution evidence.

## V3 staging and exact-commit release gate

- [x] Verify and apply all three manifest files byte-identically before integration.
- [x] Harden release workflow pins/full-scope checks; 547 tests, 99/102 offline verifiers, lint and Trivy completed without bypassing evidence failures.
- [ ] Disposable stack/browser acceptance: BLOCKED by missing Docker/Podman, independent Auth/Data API and owner-approved alternative infrastructure.
- [x] Report integration deviations, checks and blockers in docs/MEDICAL_V3_STAGING_RELEASE_STATUS.md.
- [ ] Exact-final-commit CI, full typecheck/build and required-check enforcement: awaiting matching GitHub evidence.

## V3 staging security recovery

- [x] Verify and apply both additive patch fingerprints before integration.
- [x] Resolve all 8 prior HIGH/CRITICAL findings using compatible Bun updates; full-scope/all-severity Trivy reports zero vulnerabilities/secrets.
- [x] Prepare independent staging architecture and 19 tested fail-closed target checks; no provisioning before owner approval.
- [x] Run 545 tests, lint 0 errors/13 warnings, formatting and security/scientific checks; details in docs/MEDICAL_V3_STAGING_SECURITY_STATUS.md.
- [ ] Desktop/mobile acceptance: blocked by missing independent services, owner-approved target/budget and attestation.
- [ ] Exact-final-commit Quality/Security and production build/typecheck: awaiting matching GitHub workflow evidence.

## V3 isolated environment execution

- [x] Verify SHA-256 manifest and apply both additive handoff files byte-identically.
- [ ] Demonstrate genuine isolated application/auth/Data API, reviewer/evidence and bounded provider access: blocked by missing services/runtime and independent attestation; separate staging authorization required.
- [ ] Execute loaded desktop/mobile export and Q&A acceptance: blocked by genuine isolation, not run or simulated.
- [x] Run 526 tests, lint, targeted formatting, 98/101 executed verifiers and fresh security scans; report expanded development scan findings in docs/MEDICAL_V3_ISOLATED_EXECUTION_STATUS.md.
- [x] Resolve expanded development-dependency findings in staging security recovery; all 8 findings cleared by fresh full-scope Trivy.
- [ ] Exact-final-commit Quality/Security and full typecheck/build: blocked by unavailable matching public workflow evidence and managed synchronization.

## V3 isolated browser acceptance gate

- [x] Verify both additive patch fingerprints before applying.
- [ ] Prove an isolated app, authenticated disposable backend, test identity and bounded OpenAI budget: blocked by missing local auth/Data API services; never use the shared backend.
- [x] Stop browser/provider execution and deliver executable blocking preflight with precise infrastructure blockers in docs/MEDICAL_V3_ISOLATED_BROWSER_ACCEPTANCE_STATUS.md.
- [ ] Complete functional browser runner and loaded desktop/mobile acceptance: blocked by unproven isolation; preflight is not acceptance.
- [x] Run permitted regression/security checks: 526 tests, 97/100 verifiers, formatting, lint 0 errors/13 warnings, zero Trivy HIGH/CRITICAL/secrets; report blocked browser cases separately.
- [ ] Exact-final-commit Quality/Security and typecheck/build: blocked by unverified managed synchronization; latest public green observed at e06e35a3, not current implementation SHA.

## V3 export and isolated evidence Q&A

- [x] Verify both supplied baseline/after fingerprints and apply the patch.
- [x] Implement fresh caller-authorized export with server timestamps and validated current evidence digest; historic canonical bytes remain unavailable for independent old-hash recomputation.
- [x] Implement synthetic-only consented Q&A using existing OpenAI provider and real disposable atomic quotas; live isolated test returned 200/two valid citations.
- [x] Run 524 tests, 356 disposable assertions, formatting, lint, 96/99 verifiers/security and authenticated disabled-state desktop/mobile checks; report in docs/MEDICAL_V3_EXPORT_QA_IMPLEMENTATION_STATUS.md.
- [ ] Loaded export/Q&A browser acceptance blocked by lack of an isolated app connected to disposable SQL; production activation remains unauthorized.
- [ ] Exact-final-commit Quality/Security blocked by unverified GitHub synchronization; latest green observed at 13e940f8, not current managed HEAD.

## V3 synthetic completion implementation gate

- [x] Verify and apply both manifest files byte-identically.
- [x] Run 509 tests, 51 new-source and 305 existing disposable database assertions, formatting, lint, fresh security scan and 99 verifiers; record exact results in docs/MEDICAL_V3_SYNTHETIC_COMPLETION_STATUS.md.
- [x] Owner corrected fixture identifier to cv-001 / HR; stage synthetic source/RPCs, v2 canonical evidence, isolated review controls and disable-first rollback.
- [x] Report staged implementation and authenticated desktop/mobile disabled-state checks without claiming operational acceptance.
- [ ] Full AI/advisor browser acceptance: blocked by absence of an isolated application environment connected to the disposable database; production stays disabled.
- [ ] Production approval request: blocked by full acceptance, source/append race proof, authentic private evidence and exact-commit Quality/Security results.

## V3 verifier recovery and synthetic source decision

- [x] Verify before/after manifest fingerprints, apply four patch files, and format only requested touched files and v3 contract.
- [x] Run recovered safeguards, full tests, formatting, security/scientific and disposable database checks.
- [x] Prepare authoritative synthetic source implementation plan (docs/MEDICAL_V3_SYNTHETIC_SOURCE_IMPLEMENTATION_PLAN.md); no implementation, transfers or activation.
- [ ] Private restore and owner-risk gates await authentic owner evidence; production migrations and source trust remain unapproved.
- [ ] Confirm final saved SHA and exact-commit Quality/Security results through managed synchronization and GitHub Actions.

## Medical governance v3 safe completion

- [x] Verify and apply only the two additive manifest files; preserve all release guards.
- [x] Investigate five verifier failures and document synthetic-only evidence adapter design in docs/MEDICAL_V3_SAFE_COMPLETION_REVIEW.md without introducing trust or transfers.
- [x] Run permitted tests, release gates, formatting, security/scientific checks and inspect automatic typecheck/build signals; report failures rather than bypassing them.
- [ ] Production migration, authoritative evidence source, transfers and activation require separate explicit owner approval.
- [ ] Verify final saved SHA and exact-commit GitHub CI; requires managed synchronization and Actions.

## Medical governance v3

- [x] Verify and apply supplied foundation; add fail-closed APIs and stricter AI validation (see v3 status report for incomplete operational features).
- [x] Prepare append-only review/RLS and atomic AI quota migration; validate in disposable PostgreSQL only.
- [x] Run tests, permitted scientific/security checks and authorized desktop/mobile checks; report unresolved verifiers and CI limitations.
- [ ] Production migration and authoritative evidence adapter require owner approval and a separately authorized server evidence source.
- [ ] Confirm exact-commit synchronization and Quality/Security workflows; requires managed synchronization and Actions.

## Website UX polish & evaluator onboarding

- [x] Apply the seven confirmed presentation fixes and Home evaluator links without changing access or evidence.
- [x] Verify affected pages at 1280px and 390px; run tests, scientific verifiers, integrity and security checks.
- [ ] Confirm exact-commit GitHub synchronization, Quality and Security Scan; requires managed synchronization and Actions.

- [x] Verify public video and record owner confirmation without closing official-rules evidence.
- [x] Regenerate and verify controlled manifest; update regression tests and run permitted checks.
- [ ] Confirm GitHub synchronization, Quality, Security Scan and exact-commit typecheck/build; awaiting managed synchronization and GitHub Actions execution.

## Official team integration

- [x] Add the public team page and preserve competition media.
- [x] Connect the existing menu and Project Guide Team section.
- [x] Update SEO coverage and regression tests.
- [x] Verify navigation, run permitted checks, and report commit/CI limitations.
- [ ] Confirm GitHub synchronization and successful typecheck/production build on the exact saved commit; awaiting managed synchronization and GitHub Actions execution.

## Development roadmap reconstruction

- [x] Centralized P0–P47 phase registry with subphases and missing-record list.
- [x] Searchable, filterable Project Guide roadmap; tests and documentation.
- [ ] Confirm GitHub synchronization plus Quality and Security Scan on the exact commit; awaiting managed sync and GitHub Actions.

## Astronaut data entry integrity & UX upgrade

- [x] Implement audit findings D1-D7 and R1-R12 across Bone Health, Readiness, Documents, Live and Operations.
- [x] Regression tests, full suite, typecheck, production build, verifiers and browser checks at 1280px/390px.
- [ ] Confirm GitHub synchronization plus Quality and Security Scan on the exact commit; awaiting managed sync and GitHub Actions.

## Unified health intelligence intake

- [x] Apply the foundation patch (classification module, plan doc, tests).
- [x] Versioned observation envelope, append-only encrypted store, /mission/intake review workspace, navigation and route.
- [x] Regression tests, full suite, typecheck (tsc), production build, verifiers, security audit and browser checks.
- [ ] Confirm GitHub synchronization plus Quality and Security Scan on the exact commit; awaiting managed sync and GitHub Actions.

## Astronaut health report & multi-file intake

- [x] Apply the Health Report & Batch Intake patch (report module, report page, batch intake, tests, docs).
- [x] /mission/health-report: deterministic evidence-linked research report, provenance-separated, print/text export, no cloud upload.
- [x] /mission/intake: multi-file batch import (20 files, 15 MB each, SHA-256 dedupe, per-file states, rows unchecked).
- [x] Mobile overflow fix on the intake save button; full tests, typecheck, build, verifiers and browser checks pass.
- [ ] Confirm GitHub synchronization plus Quality and Security Scan on the exact commit; awaiting managed sync and GitHub Actions.

## AI medical advisor review

- [x] Apply the AI Medical Advisor Review patch (5 files, manifest fingerprints verified).
- [x] /mission/health-report: AI draft capture and session-only advisor review workbench; ground-medical-only approval bound to an evidence fingerprint; no external AI calls, persistence or signed-opinion claims.
- [x] Full tests, typecheck, production build, scientific/security verifiers and desktop/mobile browser checks pass.
- [ ] Confirm GitHub synchronization plus Quality and Security Scan on the exact commit; awaiting managed sync and GitHub Actions.
