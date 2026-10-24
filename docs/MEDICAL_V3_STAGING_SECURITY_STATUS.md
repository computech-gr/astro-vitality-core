# V3 staging security recovery status

## Applied patch and integration scope

Both additive manifest fingerprints matched before applying:

- `scripts/verify-medical-v3-staging-target.mjs`, 1731 bytes: `2512b484e09a0497e8b4a6bb7ebda3524cf7d73bfd45621a1b85ffc84b1a35a3`.
- `docs/MEDICAL_V3_STAGING_SECURITY_RECOVERY.md`, 2345 bytes: `3c4284eabe9a8d66a7de4583f349af729d8a004424f54cf979abc43b23773459`.

Both were initially copied byte-identically. The handoff remains byte-identical. Necessary guard hardening and formatting changed its SHA-256 to `1a4ecbd1cf2a8007641aa681022ba03152fe72695b9588983af2178126cc3160`: reject shared port 8080, forbidden apex/subdomains including trailing-dot forms, require explicit permission for both allowed loopback hosts, and reject IPv6 addresses pending separate documented review. These are fail-closed string checks, not service attestation. Nineteen observable regression tests exercise the target policy without contacting services or inheriting production credentials.

Beyond the two manifest files, the requested integration modifies `package.json`, `bun.lock`, `.github/workflows/security.yml`, `AGENTS.md`, `roadmap.md`; adds `tests/domain/staging-target.test.ts`, `docs/MEDICAL_V3_STAGING_ARCHITECTURE.md` and this status report. No scientific source, approval, mission record, authentication module, pending SQL, PDF, MP4 or sealed artifact changed.

## Compatible dependency remediation

Used targeted Bun updates, without lifecycle scripts or environment-file loading. No incompatible override or unrelated major upgrade was added. Vite remains on 8.1; all transitive major branches are preserved.

| Package | Before → after | Parent path / compatibility |
| --- | --- | --- |
| Vite | 8.1.5 → 8.1.6 | Direct dev dependency, compatible observed framework/plugin peer ranges |
| brace-expansion | 1.1.16 → 1.1.21 | ESLint → minimatch 3.1.5 → brace-expansion `^1.1.7` |
| brace-expansion | 5.0.8 → 5.0.12 | typescript-eslint → typescript-estree → minimatch 10.2.6 → brace-expansion `^5.0.8`; not forced to 1.x |
| launch-editor | 2.14.1 → 2.14.2 | framework Vite configuration → devtools-vite → devtools-bundler-core → launch-editor `^2.11.1` |
| nanoid | 3.3.16 → 3.3.20 | Vite → postcss 8.5.24 → nanoid `^3.3.16`; not forced to 5/6.x |
| shell-quote | 1.10.0 → 1.12.0 | launch-editor → shell-quote `^1.8.4` |
| picomatch | hoisted 4.0.5 → 4.0.7 | Resolver consequence of Vite's updated range; existing 4.0.5 branches retained under devtools-bundler-core, tinyglobby and unplugin |

The compatible resolver also removed redundant nested Vite/esbuild 0.27.7 entries and hoisted an existing 4.0.7 picomatch branch. These are lock-graph changes, not a manual lockfile rewrite. Earlier overrides and direct framework pins remain unchanged.

### Resolved inventory

All eight previously reported HIGH/CRITICAL findings no longer appear:

| Advisory | Previously affected package | Previous severity |
| --- | --- | --- |
| CVE-2026-102276 | brace-expansion 1.1.16 | HIGH |
| CVE-2026-102278 | brace-expansion 1.1.16 | HIGH |
| CVE-2026-14257 | brace-expansion 1.1.16 | HIGH |
| CVE-2026-69152 | brace-expansion 1.1.16 | HIGH |
| CVE-2026-112942 | launch-editor 2.14.1 | HIGH |
| CVE-2026-67213 | nanoid 3.3.16 | HIGH |
| CVE-2026-102422 | shell-quote 1.10.0 | CRITICAL |
| CVE-2026-112942 | Vite 8.1.5 | HIGH |

Fresh Trivy 0.66.0 filesystem vulnerability/secret scans explicitly include development dependencies, with no advisory suppression. HIGH/CRITICAL scan: **0 vulnerabilities / 0 secrets**. Additional all-severity scan (`UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL`) at 2026-10-24T22:06:18Z: **0 reported vulnerabilities / 0 secrets**. This is the scanner's current bun.lock inventory, not a universal guarantee of absence of security defects or exploitability proof. No remaining advisory exception is requested.

Security CI now explicitly sets `TRIVY_INCLUDE_DEV_DEPS=true` and `ignore-unfixed=false`. It retains the pinned scanner action, HIGH/CRITICAL threshold, vulnerability/secret scanners and failure exit code. The scope is strengthened, not reduced. Exact-commit execution is still required to verify the workflow in GitHub.

## Staging preparation versus execution

Architecture is documented in `MEDICAL_V3_STAGING_ARCHITECTURE.md`: independent app/origin, genuine Auth issuer/keys, JWT-verifying Data API, disposable database, synthetic reviewer/crew/evidence, separate server-only OpenAI credentials, numeric request/spend authorization, real caller RLS, network containment and deterministic teardown.

Only offline policy/test infrastructure was implemented safely. No staging deployment, account, database, provider secret or paid resource was provisioned. Shared preview and production backend were not used for acceptance. The environment lacks Docker/Podman and genuine GoTrue/PostgREST services; PostgreSQL alone is insufficient. Missing owner-approved target/budget, independent effective configuration, real authenticated services, enforced egress, dedicated provider credential and full browser runner remain blockers.

Both unconfigured staging guard and existing isolated preflight exit **2 / BLOCKED**. A safe-target string PASS does not establish service isolation or enable runtime execution. Desktop 1280px/mobile 390px synthetic Export/Q&A acceptance was **NOT EXECUTED**: consent, citations, downloaded SHA-256/timestamps, real token/cross-crew/revocation denial, quota concurrency, stale evidence and responsive behavior remain unverified in genuine staging. No simulated success or synthetic acceptance receipt was invented.

## Checks and limitations

- Full tests: **545 passed, 0 failed**, 114 files, 8611 assertions (526 existing plus 19 staging-policy regressions).
- Lint: **0 errors / 13 existing warnings**. Security boundary audit: PASS.
- Repository formatting and touched test/script formatting: PASS.
- Automatic validation reports `build OK`. Manual full typecheck/production build is prohibited by the sandbox workflow and was not run; require Quality on the exact synchronized commit, not preview output.
- Scientific/security static verifier totals and exact-final-commit CI are reported after the final checks. Runtime SQL/remote/provider verifiers are excluded because no safe isolated environment has been attested; historical results are not reused as new acceptance.
- Authentic private restore evidence, owner-risk acknowledgment and missing sealed `data/release/mission-day-127.synthetic.json` remain blocked; no bypass, replacement evidence or scientific activation.

Production migrations, real-data AI, persistent production approvals and source trust changes remain unauthorized and inactive. All scientific statuses including `PENDING_NIKOLAS_REVIEW` are unchanged. Staging provisioning requires separate owner approval of the architecture, target and cost cap; no production activation is requested.

Commits/synchronization are platform-managed. Final SHA and public Quality/Security results are checked after the last edit; prior green commits do not validate this update.