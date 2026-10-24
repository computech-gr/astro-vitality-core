# Medical v3 — final synthetic demonstration and exact-commit CI

## Boundary

This handoff adds a read-only GitHub Actions status reporter. It DOES NOT grant production authorization, modify evidence, provision staging, apply migrations, or mark missing checks as passed.

## Run a truthful synthetic example

1. In the existing project, run `bun test tests/domain/synthetic-export-qa.test.ts tests/domain/medical-advisor-review.test.ts tests/domain/medical-v3-completion-fixture.test.ts` and retain the actual output.
2. Use the existing synthetic demonstration mission and synthetic crew. Confirm that the authorized reviewer sees only permitted evidence. No real astronaut records.
3. Demonstrate the evidence-based question: `What changes are observable in the two synthetic heart-rate observations? Cite the exact observation IDs and do not infer diagnosis or normal ranges.` Only show an AI answer if the existing isolated or authorized synthetic-only path actually generates one and the contract validator accepts all citations.
4. Demonstrate reviewer edit and rationale, stale-evidence invalidation, and authorized history JSON export if the active environment supports them. Otherwise show unit/integration evidence, explicitly labeled NOT BROWSER ACCEPTED.
5. Test 1280px and 390px browser widths ONLY on a verified independent Auth/Data API/database stack. Never use shared production backend as a staging substitute.
6. Confirm GitHub Quality, Security Scan and Medical v3 Release Gate conclusions on the exact same final SHA; a failed or missing gate must remain visible.

## Outstanding owner evidence

P3663: actual private isolated restore exercise and verifiable operator evidence.
P3664: genuine explicit owner risk decision; DO NOT accept potentially irrecoverable data loss on the owner's behalf.
P20-RULES-001: official 2026 submission source and actual rules recheck.
Independent staging: separate Auth issuer, Data API, database, origin and bounded test-only AI credential.

Do not weaken or skip private evidence verifiers. Separate synthetic research demonstration readiness from production clinical or release readiness.

## Executed results — 2026-10-24 UTC

**BLOCKED for release; code corrections and disposable synthetic checks completed.** Both supplied manifest fingerprints matched before copying: workflow `39b65e9bf3ba348de9a8d54d32d148f741cc21aa00f1714f285d760e039b70e4` (2166 bytes), document `bea0d02a5cffd5a134613b79c6189d9cd8a72565ffefb762bbf8643bc1411c1c` (2148 bytes).

Necessary integration deviations: formatted this supplied document; corrected workflow pagination and newest-run selection; added deterministic sample generation before checks/tests in Quality and Medical v3 Release Gate. The sample is intentionally ignored by Git, so the previous local passing tests did not prove clean-checkout success. Neither sealed expectations nor evidence verifiers were changed. Added regression tests for generation order, second-page runs, newer failures, missing/pending checks and the exact two-observation demonstration. No planning document was created.

- Full suite: **556 passed, 0 failed**, 117 files, 9392 assertions. Focused synthetic demonstration: **24 passed, 0 failed**, 88 assertions.
- Offline scientific/security verifiers: **99/102 passed**; authentic restore, owner-risk and official-rules gates remain blocked. Release workflow structure passes.
- Existing generator reproduced the P20 artifact: **868801 bytes**, SHA-256 `6997feae355887f1e1e56b5f0c533f5d365a67b5f89e765b1006c22d6153df8c`. All **15** sealed manifest hashes and byte counts independently match; no manifest regeneration or evidence promotion was needed.
- Lint: **0 errors / 13 existing warnings**. Repository formatting and security boundary audit: PASS.
- Fresh Trivy 0.66.0 filesystem scan, development dependencies included, vulnerability and secret scanners, all severities and unfixed findings included: **0 vulnerabilities / 0 secrets**.
- Disposable SQL synthetic completion: **51 assertions passed**; governance integration: **30 assertions passed**. Full FV01 disposable integration passed; no reliable aggregate count was retained, so none is claimed.
- Disposable server export integration passed canonical digest, retained revisions and UTC date checks. Real-data, missing-consent, cross-scope and injection requests were denied before provider access. **Zero live provider calls**; OpenAI generation was skipped without independently authorized test-only credentials. Existing provider credentials were not reused as isolated-test credentials.
- Independent browser preflight: **exit 2 / BLOCKED**. No independent Auth/Data API/application stack was verified. Desktop 1280px/mobile 390px acceptance, real sign-in/token validation and loaded browser interactions were **NOT EXECUTED**. Direct SQL tests use a test principal via database session claims, not real token verification.
- Manual typecheck/build are prohibited here and were not executed. Automatic preview reports build OK; that is not exact-commit GitHub typecheck/build verification. No application routes were changed.

### Concise executable demonstration (NOT BROWSER ACCEPTED)

1. Existing disposable SQL fixture resolves the demonstration mission and Alex Morgan test crew; exact owner-authorized fixture facts are `synthetic-v3-hr-001`, **62 bpm**, `2026-10-01T10:00:00Z`, and `synthetic-v3-hr-002`, **66 bpm**, `2026-10-02T10:00:00Z`, both `cv-001 / HR`. Synthetic receipts explicitly say they are not human review.
2. The two-observation server-contract test asks for recorded values. Its **simulated provider response**, not live AI output, is accepted only with these exact statements:

   ```text
   cv-001 recorded 62 bpm at 2026-10-01T10:00:00Z. [synthetic-v3-hr-001]
   cv-001 recorded 66 bpm at 2026-10-02T10:00:00Z. [synthetic-v3-hr-002]
   ```

   The contract deliberately does not infer trends, diagnoses or normal ranges. Invented IDs, values, biomarkers and ranges are rejected, not rewritten.

3. Session-review tests accept the exact cited text with reviewer identity and research-only rationale, reject empty rationale and invalidate acknowledgment when evidence changes. Existing edit behavior remains tested separately. No automated test constitutes human medical acceptance.
4. Real disposable SQL tests append draft/approval/revocation revisions, enforce predecessor and concurrent-review rules, invalidate approval after source changes and verify quota contention and rollback. Authorized export reads real disposable history with server dates and a independently recomputed canonical SHA-256. No production persistent approval is activated.

Reproduce the fallback with the three focused test files above, then `FV01_PG_SOCKET_DIR=/tmp/mito-pg/socket FV0143_INCLUDE_PENDING=1 node scripts/verify-medical-v3-synthetic-completion.mjs` and `FV01_PG_SOCKET_DIR=/tmp/mito-pg/socket FV0143_INCLUDE_PENDING=1 bun scripts/verify-medical-v3-export-qa.ts` **only against that independently local disposable PostgreSQL server**. The SQL completion verifier recreates its test database; never substitute a managed/shared database. SQL/server logs are retained under `/tmp/final-ci-results/`.

### Exact-commit CI and owner-only actions

The latest public read-only lookup found no Quality, Security Scan or Medical v3 Release Gate runs for the then-saved managed SHA; public GitHub main differed. Final saved SHA and matching conclusions are checked after the final edit and reported in chat. The new reporter shows actual missing/failed/pending status; its own success does not imply release readiness. No Git push, workflow dispatch, production migration, role change or activation was performed.

Only the following external actions remain:

1. Supply authentic private **P3663 isolated restore evidence** and an approved private verifier execution arrangement; required fields and exact command are already listed in `MEDICAL_V3_FINAL_DIAGNOSTICS_RESULTS.md`. Populating fields cannot prove a restore.
2. Make the genuine **P3664 owner risk decision**, including whether to accept potentially irrecoverable data loss and authorize the separate migrations 14–16. This task does not assume that consent or authorize medical-v3 activation.
3. Recheck actual official 2026 rules, form, judging and rights requirements; supply the official source and confirmations before authorizing P20-RULES-001 closure and controlled resealing.
4. Provide/authorize independently isolated Auth, Data API, database, application origin, test-only AI credentials and bounded budget, with isolation proof and teardown, before live AI and browser acceptance.
5. Synchronize the final saved changes to GitHub and run all three workflows on that exact SHA. Missing matching runs are **UNVERIFIED**, not passed.

Production AI, migrations, persistent approvals, real-data transmission and scientific activation remain disabled; sealed evidence, catalog statuses, authentication, mission data and competition assets are unchanged.
