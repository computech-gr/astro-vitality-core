# MITOCHONDRIA v3 — release decision and staging execution

## Verified from supplied project snapshot

- 547 tests passed in Lovable's last report; this patch does not claim to rerun them.
- Medical v3 Release Gate is correctly RED because three actual evidence verifiers fail: P3663 activation/restore, P3664 owner risk, and sealed submission manifest.
- Quality green is not evidence that Medical v3 Release Gate is green.
- Disposable PostgreSQL tests are not a substitute for independent Auth, Data API and browser acceptance.
- Production synthetic AI and persistent approvals must remain disabled.

## Actionable completion order

1. Run `node scripts/medical-v3-release-diagnostics.mjs` and attach exact output. It must exit nonzero until the genuine evidence is supplied.
2. Owner performs an actual restore exercise on an isolated system, collects redacted logs/checksums/time and attests the outcome. Follow P3663 verifier's required schema; never invent evidence.
3. Owner reviews actual residual risks and explicitly signs/approves the P3664 artifact; do not manufacture a signature or claim approval.
4. Produce the P20 mission-day-127 synthetic artifact using the project's existing deterministic generator, then validate against the submission gate and required sealed manifest. Do not simply write a dummy JSON file or alter verifier expectations.
5. Obtain approval for a separate staging project with independent Auth, Data API, database, credentials and origin. Provision with the approved infrastructure tooling outside this restricted Lovable environment; validate isolation and teardown before browser tests.
6. Run 1280px and 390px synthetic-only reviewer sign-in, consent, Q&A exact citations, authorized export, 403 cross-crew denial, 429 quota, stale evidence and reviewer revocation tests against staging.
7. Confirm Quality, Security Scan and Medical v3 Release Gate on the same final SHA. Only then request separate approval for any production migration or synthetic feature activation.

## Explicit prohibitions

Do not bypass, mark optional, mock, or remove private evidence verifiers to make CI green. Do not use shared production services for staging. No real medical data, production migrations, new privileged accounts or paid provisioning without separate owner approval. No clinical certification claim.

## Required handoff

Report each of the three gate failures with exact required owner input, a reproducible staging setup command only if genuine infrastructure exists, security scan results, test results, and final SHA. If owner evidence or independent services remain unavailable, report BLOCKED rather than another generic handoff patch.
