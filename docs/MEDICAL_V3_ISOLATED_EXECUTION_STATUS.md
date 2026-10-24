# V3 isolated environment execution — BLOCKED

## Patch verification and scope

Both additive manifest entries matched before application; no existing target was overwritten:

| File | Bytes | Supplied SHA-256 |
| --- | ---: | --- |
| `scripts/verify-medical-v3-isolation-readiness.mjs` | 1035 | `1d8e658cb6d0978a48464ebe76fdea7e569af7863b63c90e667e696deea7a048` |
| `docs/MEDICAL_V3_ISOLATED_EXECUTION_HANDOFF.md` | 3344 | `5acd3a1c4b1494d61f4e80c022f4743f11ad56738afd0bc0f7b30987c898f30b` |

Both files were initially applied byte-identically. The archive supplies a contract and static readiness verifier, not executable authentication, Data API, application provisioning or browser automation. Formatting checks detected failures in both supplied files; only their formatting was subsequently normalized. Post-format SHA-256 values are respectively `5944a4c1364c650177d21757743f42d7741c1aafbafdc455a7a9109ce2494d5f` and `19d19994a8437d61b59d8cdaf9490537507b3984db663469f38bd94f3415ab5a`. No safeguard was removed.

Additional reporting files are this status document and `roadmap.md`. No application, authentication, SQL, fixture, scientific source, approval, mission record, media or sealed artifact was modified.

## Infrastructure findings and safe stop

Inspection on 2026-10-24 found PostgreSQL 17.9 and local PostgreSQL tooling, with an existing process under `/tmp/mito-pg` on port 55432. This is not a genuine authentication or HTTP Data API service, and its presence is not independent attestation of a disposable application environment. It was not mutated or reused for browser acceptance.

Missing infrastructure:

- No installed GoTrue-compatible authentication service or PostgREST Data API; neither service was running.
- No Docker, Podman, nerdctl, containerd or runc executable, nor Docker/Podman socket. The repository's Docker/local-service provisioning path cannot execute here as supplied.
- No local service-stack CLI and no dedicated isolated application deployment. The existing preview on 8080 is forbidden for this task. Observed TCP listeners were 8080 and sandbox service 3004, neither an isolated auth/Data API stack.
- No independently validated local issuer/token-verification setup, disposable synthetic reviewer and exact crew association, effective application destination attestation, network-denial receipts or deterministic teardown.
- No separately provisioned test-only provider credential with an explicit numeric request/spend cap. Production credentials were not inspected, copied or used.

The existing SQL test stub is not authentication. Translating browser identities into SQL claims, mocking the token middleware or using the shared preview would not satisfy the execution contract. No such substitution was made.

**Result: BLOCKED before runtime execution.** The existing preflight exits 2. The new static readiness verifier passes only repository prerequisites and explicitly does not assert browser acceptance. Provisioning native alternatives, authenticated runtime configuration and network containment was not demonstrated; missing binaries alone are not a claim that every conceivable external environment is impossible.

## Actual browser acceptance

No isolated browser was launched, no reviewer was provisioned, no database was changed and no provider call was made during this task. Desktop 1280px and mobile 390px cases are all **BLOCKED / NOT EXECUTED**:

- Sign-in, crew selection, consent/no-consent and exact-ID Q&A rendering.
- Unknown metrics, invented ranges and invalid-citation rejection.
- Authorized JSON export, downloaded byte/schema/SHA-256 checks and server UTC timestamps.
- Anonymous/fake-token, cross-crew and revoked-membership denial.
- Stale evidence, corrections, quota 429/concurrency and failed release.
- Keyboard/focus, responsive overflow, console errors and download behavior.

No screenshot, environment attestation or successful synthetic browser receipt exists. Unit checks and prior SQL/provider results are not relabeled as browser evidence.

## Validation executed

- Full unit suite: **526 passed, 0 failed**, across 113 files; 8589 assertions.
- Static isolation readiness: PASS. Executable infrastructure preflight: **exit 2 / BLOCKED**.
- Lint: **0 errors, 13 warnings**. Security boundary audit: PASS.
- Repository formatting and the touched readiness script: PASS after targeted formatting.
- No manual typecheck or production build was run: the sandbox workflow reserves those for automatic validation and exact-commit GitHub Actions. Automatic preview log reported `build OK`; this does not establish full production build/typecheck or acceptance.
- No disposable SQL test or live-provider verifier was rerun after the isolation stop. Prior SQL results are historical only.

The static scientific/security inventory, fresh scanner results and exact-final-commit public CI observation are recorded after their completion in the final validation section.

## Remaining gates and next environment

Production migrations, persistent approvals, production AI, real-data transfer, scientific approvals and private-evidence gates remain disabled or unchanged. Authentic restore evidence, owner-risk evidence and the sealed submission fixture remain separate blockers.

To resume, the owner must explicitly authorize a **separate staging environment**, not the shared backend, with genuine local authentication and Data API services, a disposable database, isolated application origin, independent configuration/network verification, synthetic-only setup/teardown and a bounded test-only provider budget. The complete browser runner and environment attestation must then be implemented and exercised before any acceptance claim. No production activation is requested.

Commits and synchronization are platform-managed; no stateful Git command or workflow dispatch was performed. The final observed SHA and matching public workflow status must be read after the last edit; a prior green commit does not validate this patch.