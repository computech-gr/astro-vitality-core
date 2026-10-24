# Medical v3 — staging and dependency security recovery

This handoff is not permission to modify production or provision a paid service. The latest supplied status reports 526 tests passing, but no isolated Auth/Data API and no browser acceptance. Never use the shared Lovable preview or production backend as a substitute.

## Priority A: development dependency findings

Investigate the Trivy development-dependency findings for brace-expansion, launch-editor, nanoid, shell-quote, and vite, including transitive dependency parents. Resolve with supported upgrades and regenerate bun.lock using the project's normal package manager. The reported fixed versions are in docs/MEDICAL_V3_ISOLATED_EXECUTION_STATUS.md. Do not force incompatible overrides, disable scanning, or suppress advisories. Rerun full-scope Trivy (including dev dependencies), tests, typecheck, format, lint and production build; record remaining findings, severity, reachability and exceptions requiring owner approval. Production-only clean scan is not sufficient.

## Priority B: isolated browser acceptance

Only after explicit owner approval, provision a separate staging project with independent Auth, Data API, database, origin, secrets and test-only provider quota. No reuse of production credentials, project identifiers or production membership. Verify signed-in reviewer and crew-specific authorization against the actual isolated services; verify tenant isolation, token rejection, RLS, network egress and teardown. Run desktop 1280px and mobile 390px tests for consent, Q&A citations, export hash/timestamps, denial cases, quota and stale evidence. Record independently verifiable receipts and final commit SHA.

The accompanying read-only `scripts/verify-medical-v3-staging-target.mjs` performs only string-level target checks. Passing it does NOT establish independent infrastructure, valid token issuance, RLS or browser acceptance. Owner must review the staging architecture and cost cap before any provisioning.

## Keep blocked

Production migrations, production AI, real medical data, persistent approval activation, scientific gate changes, private restore evidence, owner risk acknowledgment and sealed submission evidence. Do not invent or bypass missing evidence. Report exact-commit GitHub Quality/Security results, not historical green commits.
