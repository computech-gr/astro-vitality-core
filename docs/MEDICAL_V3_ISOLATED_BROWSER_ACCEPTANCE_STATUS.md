# Isolated browser acceptance — stopped at infrastructure gate

## Patch

Both supplied SHA-256 values matched before copying the two additive files:

- `scripts/verify-medical-v3-browser-acceptance-gate.mjs`: `b03116d3749b4cd710173cc3d4b0d171725fe8d0b2deae4e178b37b841632262`.
- `docs/MEDICAL_V3_ISOLATED_BROWSER_ACCEPTANCE.md`: `f3980114c86d0d2f7facaa8f9a444e5cad450a72c69ae3ac96bfc60ce71f09fb`.

The supplied patch contains only a contract and static text-marker verifier, not an isolated application or browser runner. Both were copied byte-identically, then touched-file formatting was permitted. Additional files implement an executable fail-closed infrastructure preflight, regression tests and this report; no application or authorization code changed.

## Safe stop and actual browser results

**Desktop 1280px and mobile 390px loaded functional acceptance: BLOCKED, not executed.** No browser was navigated to the shared app during this task, and no hidden production controls were counted as acceptance.

- The only running app is the existing preview on port 8080 with the shared configured backend. It cannot be used for this acceptance.
- Disposable PostgreSQL exists under `/tmp/mito-pg/socket` with `medical_v3_it`. It is a SQL test harness, not a complete authenticated data service.
- No local authentication or Data API listeners were found on 54321–54323. No Docker, GoTrue or PostgREST executable is available in the current setup.
- `tests/integration-pg/stub.sql` creates only `auth.users(id)` and a session-setting-backed `auth.uid()`. It does not implement genuine authentication, browser sessions or an HTTP Data API.
- The real generated application middleware revalidates caller tokens through the auth service. Replacing it with a stub or translating arbitrary browser IDs to SQL claims would bypass the boundary being tested, not validate it.
- No independent browser test identity, test-only provider credential, local app configuration evidence or bounded browser OpenAI budget is provisioned. No production session was copied into a test origin. No OpenAI call was made in this task.

`python3 scripts/medical-v3-isolated-browser-preflight.py` exits **2 / BLOCKED** when configuration is absent. It never reads project secrets, enables flags, mutates SQL, starts an app or calls the provider. It rejects the shared 8080 origin and non-loopback URLs. A future temporary JSON configuration can supply `schema: mitochondria.isolated-browser-preflight.v1`, dedicated `appOrigin`, `authOrigin`, `dataOrigin`, `/tmp/` `socketDir`, and `database: medical_v3_it`; probes disable proxies. Reachability alone still fails closed pending independent effective-config/identity/budget validation. This is **not a complete executable acceptance runner** and cannot produce a PASS receipt.

## Acceptance matrix

All requested functional browser cases remain **BLOCKED**: authorized JSON download and response-byte comparison; server UTC timestamps/current SHA-256; no-consent zero-provider call; consented exact-ID answer rendering; anonymous/fake-session and unrelated-origin denial; cross-crew/revoked access; real/nonauthoritative input denial; invented claims/citations rejection; source/export races and review invalidation; quota 429/Retry-After and concurrency; failed release; keyboard/focus/mobile download; overflow, console and transcript-storage checks.

Prior unit/SQL/provider evidence is retained in `MEDICAL_V3_EXPORT_QA_IMPLEMENTATION_STATUS.md` but is not relabeled as current browser acceptance. No screenshots exist for a loaded isolated flow because no safe flow was available.

## Preconditions to resume

Provision a dedicated local TanStack app and genuine isolated auth/Data API services attached only to disposable SQL, with independently demonstrated configuration and network containment. Preserve generated auth boundaries. Supply a test-only authenticated reviewer identity reproducing the approved synthetic scope without production membership changes, authoritative fixture/receipt setup, server-only test secrets and a documented numeric provider-call/spend budget. Then implement deterministic setup/teardown and the complete observed browser runner. Delete local sessions/transcripts and disable local flags on teardown. Do not request production activation as a workaround.

The private restore-evidence and owner-risk gates remain blocked, as does the missing sealed submission fixture. No source evidence, scientific approval, mission record, pending SQL, role, authentication setting, PDF or MP4 was altered.

## Changed files

- Supplied contract and static verifier (two files above).
- `scripts/medical-v3-isolated-browser-preflight.py`.
- `tests/domain/isolated-browser-preflight.test.ts`.
- `docs/MEDICAL_V3_ISOLATED_BROWSER_ACCEPTANCE_STATUS.md`.
- `AGENTS.md` and `roadmap.md`.

## Validation results

- Full unit suite: **526 pass / 0 fail**, 113 files, including two new infrastructure stop-gate regressions. No loaded browser scenario was executed.
- Static browser contract gate and all 11 static medical release guards pass; neither proves runtime acceptance.
- Scientific/security verifier inventory: **97/100 pass**. `verify-p3663-activation`, `verify-p3664-owner-risk` and `verify-submission-gate` remain blocked by existing authentic/private or missing sealed evidence; no bypass.
- Repository formatting passes; lint **0 errors / 13 existing warnings**. Security audit passes; fresh Trivy **0 HIGH/CRITICAL vulnerabilities / 0 secrets**.
- Preflight exits **2 / BLOCKED** as intended. Disposable SQL was not rerun or mutated in this task after the infrastructure stop. Previous 356 SQL assertions are historical evidence, not a new run.
- Automatic preview validation reports **build OK**. Manual typecheck and production build are prohibited by the sandbox workflow and were not run. Exact-commit GitHub Quality is required to establish them.
- Public GitHub Quality and Security Scan both succeeded at **`e06e35a3ba7d48a1e18e6070571dcc0dfc732535`**. No workflow matched the managed implementation SHA observed during this task; exact-final-commit sync/CI is unverified. No Git state or workflow dispatch was changed.

The final observed managed SHA is reported in chat after the last documentation update. The platform manages commits and subsequent synchronization; no local result substitutes for exact-commit CI.
