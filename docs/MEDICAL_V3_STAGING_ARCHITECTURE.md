# Medical v3 independent staging architecture — proposed, not provisioned

## Approval and current state

This design does not authorize provisioning, paid resources, production migrations or activation. The owner must approve the separate target and cost cap before provisioning. No stage is currently operational. The sandbox lacks a container runtime, genuine Auth and Data API services, an independently configured app deployment and separate test-only provider credentials. Its PostgreSQL SQL harness alone cannot satisfy browser acceptance. Existing fail-closed preflight is deliberately not an execution runner.

## Independent service boundaries

Use a disposable, owner-approved host or isolated container/network stack, never the shared preview or production project. All application source comes from one exact recorded commit. A clean source staging folder must exclude `.env`, `.git`, cached sessions, dependencies, generated outputs and production configuration; install dependencies from the reviewed lockfile with no production credential inheritance.

| Boundary | Proposed isolated responsibility |
| --- | --- |
| App | Dedicated TanStack Start deployment/origin, not port 8080; independent effective browser/server configuration |
| Auth | Genuine auth service, independently generated issuer/signing keys, audience, test accounts and redirect allowlist |
| Data API | Genuine JWT-verifying Data API attached only to disposable database; anon/authenticated roles and caller RLS |
| Database | Dedicated disposable `medical_v3_it`, no production connection, schema or records copied |
| Provider | Separate server-only OpenAI test credential/project; existing Responses contract, not a substituted gateway |
| Runner | Dedicated browser sessions at 1280px and 390px, independent authenticated synthetic identities |
| Network | Default-deny egress; app/Auth/Data API/database allowlist, narrowly approved provider destination |

For local execution, proposed app/Auth/Data API origins use distinct literal IPv4 loopback ports, each explicitly configured and never 8080. No values in this document are a running service endpoint. For externally hosted staging, require separate owner-approved HTTPS origins and independently verified DNS, certificate and service identity. Hostname matching is not attestation. The target guard is read-only string policy; its successful result cannot authorize credentials, provider calls or migration execution.

Keep generated application clients and authorization middleware unchanged. The independently built deployment must resolve its own effective public and server destinations; a runtime network capture must demonstrate that no inherited shared preview proxy is used. If those clients cannot be configured independently without changing managed files, stop and request a separately supported staging configuration rather than replacing authentication.

## Real identity, evidence and authorization

- Auth issues actual signed sessions; the existing server middleware revalidates the bearer against isolated Auth. No browser-ID-to-SQL claim shortcuts. Data API verifies signature, issuer/audience and expiration against staging signing keys. Invalid, expired and wrong-issuer tokens fail.
- Provision a disposable synthetic reviewer only inside staging, and exactly one demonstration crew association reproducing the approved mission/Alex Morgan synthetic scope. No production user, token, membership or privilege is copied or modified. Create separate denied test identities only within the independently approved environment.
- Stage pending SQL only in the disposable database under the existing approved disposable harness boundary; record SQL hashes, grants/RLS, source versions and rollback. No production application.
- Canonical server-controlled fixtures remain `cv-001 / HR`, synthetic-v3-hr-001 (62 bpm, 2026-10-01T10:00:00Z) and synthetic-v3-hr-002 (66 bpm, 2026-10-02T10:00:00Z). Preserve provenance, accepted-only eligibility, append-only corrections and canonical SHA-256 reconstruction. Browser/offline observations never become authority.
- Caller-scoped RPCs retain mission/crew checks, membership revocation, append-only revision integrity, current-evidence rechecks and atomic rate reservations/releases. Reviewer acknowledgment is neither licensure nor scientific approval.

## Provider budget and network kill switch

Before any provider use, obtain owner approval of an explicit numeric maximum request count and spend cap in an isolated manifest; missing/nonpositive values block execution. This proposal intentionally grants no numeric spend authorization. Enforce both the existing atomic caller quotas and an independent run-wide provider budget, including concurrent attempts. A provider-account spend cap alone is not a synchronous per-run enforcement mechanism. Consent must be given explicitly in the actual synthetic browser flow; no-consent makes zero provider calls.

Secrets are generated/provisioned independently, supplied only server-side and never copied from production or recorded in receipts. Real-data transmission remains disabled. Network policy must deny shared backend domains/IPs and shared preview even when DNS aliases or redirects are attempted; record effective destinations, not credentials or raw prompts. Restrict provider access to the approved service and disable it on failure, exhausted budget or teardown.

## Acceptance and receipts

Before launching the browser, independently attest service identities, database isolation, real token issuance/verification, effective app destinations, budget and enforced egress. Reachability or environment assertions are insufficient. Otherwise record BLOCKED and stop.

Execute sign-in/crew selection, consent/no-consent, exact observation-ID citations, invalid citation/unknown metric/invented range rejection, authorized JSON download with byte/schema/hash/server-UTC validation, anonymous/fake-token/cross-crew/revoked denial, stale evidence/corrections, atomic quota 429/concurrency and release failures. Verify keyboard/focus, overflow, console errors and downloads at both required widths. Test current authority/history rereads, not cached browser timestamps or hashes.

Retain only synthetic, redacted receipts: exact source SHA, service/configuration attestation, SQL hashes, assertion outcomes, sanitized screenshots, network destination summary, timing, request count, cost and teardown confirmation. Never include tokens, raw provider prompts, secrets or real medical records. Passing automated tests does not close independent scientific, flight, human-device or competition submission gates.

## Teardown and outstanding gates

Revoke provider access first; disable test flags, remove temporary identities, sessions, fixtures, database, services and runtime configuration. Verify listeners stop and credentials are revoked; keep only sanitized receipts. No production rollback is needed because production is untouched.

Required approvals/infrastructure still missing: owner-approved staging target and budget, genuine Auth/Data API stack, compatible dedicated app runtime/configuration, containment policy, independent test-only provider secret and full browser setup/teardown runner. Private restore evidence, owner-risk acknowledgment and sealed submission fixture remain separate authentic-evidence blockers.