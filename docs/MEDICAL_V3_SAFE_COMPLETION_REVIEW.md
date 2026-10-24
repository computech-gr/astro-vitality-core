# Medical Governance v3 safe completion review

## Scope and outcome

The two manifest files were applied byte-identically. No production migration, observation transfer, evidence adapter implementation, AI activation, persistent approval activation, role change or scientific approval occurred. The five existing verifiers were investigated, not overridden or edited. This report and `roadmap.md` are additional requested design/tracking deliverables outside the additive patch manifest.

Manifest SHA-256:

- `scripts/verify-medical-v3-release-gates.mjs`: `5b37ba6067b27167f15304202cc1842a59984725de88cca3f6ae4865d6687e55`
- `docs/MEDICAL_V3_SAFE_COMPLETION_HANDOFF.md`: `2043cdbff64d3ba7d849479dae82eaf03cbf66dae05aacad45316f246ec5d969`

The staged SQL remains unchanged at SHA-256 `a29e11adc7eb00c09b0c37b840d3f7546dea252e6819a383ae586257ac8c564c`.

## Five verifier investigations

| Gate | Actual evidence | Disposition |
| --- | --- | --- |
| P22 bone coverage | Script line 29 expects literal `BONE_HEALTH_VARIABLES.map`; manual entry derives `filteredVariables` from the full catalog and renders that at `bone-health-entry.tsx:169–175,383`. | Stale source assertion, not demonstrated missing metrics. Proposed future verifier change: assert catalog-derived options with search empty and filtered; do not change UI to fit the old string. Still failing. |
| P22 OCR fallback | Script line 15 expects an unbroken phrase; warning text is split by JSX whitespace at `bone-health-document-import.tsx:112–115`. | Proposed whitespace-tolerant assertion retaining the exact download caveat. Still failing; no physical-device readiness claim. |
| P23J permission copy | Required words span JSX formatting at `mission-identity.tsx:474–475`. Handoff document expresses equivalent bootstrap/permission limitations rather than the exact asserted phrase. | Proposed source-format-independent check of UI warning and documented authorization restrictions. Still failing; no permission bypass or bootstrap change. |
| P36.6.3 restore evidence | Script requires a genuine private restore-evidence JSON path; existing migration fingerprint and rollback-file checks do not supply that evidence. | Correctly blocked. Owner must provide genuine approved restore evidence; no placeholder generated. |
| P36.6.4 owner risk | Script requires a private owner-risk acknowledgment path. | Correctly blocked. Owner must supply explicit genuine acknowledgment; consent cannot be inferred. |

## Proposed authoritative synthetic evidence design — not approved or implemented

### Independent source and identity

Use a separately approved, server-controlled synthetic fixture source, with owner-approved literal data and independently auditable synthetic origin. It must not be populated from browser reports, user provenance labels, submitted hashes or real patient records. Existing P36 quarantine submissions are not automatically authoritative unified observations or accepted source records. No synchronization, backfill or upload is implied.

Define an immutable source manifest containing stable source IDs, fixture version/digest, explicit synthetic mission/crew scope, synthetic creation provenance and source ownership. Use only the exact synthetic mission and crew approved for that future source. Current encrypted offline observations remain local and cannot establish server truth.

### Server eligibility rules

1. Independently resolve exact mission/crew scope and active caller ground-medical membership. Never derive actor or authority from request fields.
2. Require server-attested synthetic provenance; reject unknown, mixed or real origin. Synthetic-only output must be derived from the approved source, not a browser consent checkbox.
3. Require authoritative accepted-review events plus explicit reviewer confirmation. Record reviewer identity/scope and acceptance timestamp in the future source ledger; acceptance remains row review, not clinical or scientific approval.
4. Resolve metric, domain and exact original unit through a pinned, approved server catalog eligibility policy. Unknown/ineligible/mismatched rows remain review-only. Catalog inclusion, local acceptance and `PENDING_NIKOLAS_REVIEW` must not imply independent scientific approval. Any use of pending catalog entries needs an explicit research-only eligibility decision; no status is changed.
5. Resolve append-only corrections by stable IDs, scope and revision. Exclude erroneous and superseded records; reject missing parents, cross-scope links, cycles, forks and ambiguous current versions. Preserve originals and correction lineage. Do not use browser array order or timestamps to select truth.
6. Fail closed if source availability, eligibility or lineage is uncertain or if no eligible observations remain. Return only independently reconstructed evidence, never a fallback client snapshot.

### SHA-256 and serialization contract

The current helper serializes, in order, `missionId`, `crewMemberId`, `provenance`, and observations as tuples `[id, metricId, value, originalUnit, observedAt, reviewState, status, supersedesId]`, sorted using `localeCompare`. Undefined tuple fields serialize as null. It omits source identity, domain, catalog version and reviewer identity. Therefore matching this digest alone is insufficient to bind all proposed authority semantics.

Before implementation, choose and approve either exact v1 byte parity plus separately bound authoritative lineage/catalog receipts, or a versioned v2 canonical document covering those fields. Do not silently change the supplied helper or reinterpret prior digests. For v2, specify deterministic ID ordering independent of locale, exact field order, UTF-8 encoding/escaping, explicit nulls, exact reported value/unit strings, UTC timestamps, source IDs/digests, catalog revision, acceptance decision and correction revision. The server constructs bytes from its own source and hashes `convert_to(canonical,'UTF8')` with SHA-256. Browser hashes are comparison claims only, never attestations or signatures.

Add cross-runtime parity fixtures for Unicode, escaping, decimal commas/zeros, missing optional fields, ordering, timestamps, source/catalog revisions and correction changes. AI projection and durable review reconstruction must derive from the same authoritative effective records; client subset/order mismatches fail closed rather than being rewritten.

### Access, stale history and revocation

Keep authoritative source tables inaccessible to browser roles; expose only narrowly scoped caller-authenticated RPCs with fixed search paths and explicit execution grants. Do not add user roles or use service-role reads in normal request flow. Reconstruct authority on every approval, history read and AI request. Any changed source/catalog/correction receipt makes prior acknowledgment stale. Historical events remain append-only.

Recheck caller and original reviewer membership. Source outages deny current verification. Append explicit review revocation without requiring available/current evidence; preserve the existing revocation exception rather than making stale records impossible to revoke. Define display/export as research-only advisor acknowledgment, never licensure, clinical clearance or digital signature.

## Staged SQL review and remaining operational risks

- Review table creation includes grants followed by RLS. Authenticated users receive SELECT only, scoped by exact mission/crew ground-medical membership. Mutation triggers reject update/delete. Quota table has no browser grant/policy. Internal resolver execution is revoked from public/anonymous/authenticated callers.
- RPCs use fixed search paths, caller-derived identity, explicit execution grants, transactional scope checks, advisory locks, revision and idempotency checks. Concurrent quota reservations use user-then-mission locks. Proposed defaults remain 5/user/minute, 20/mission/minute, one live reservation/user, 35-second lease.
- Both authoritative reconstruction and AI projection deliberately return unavailable. Merely applying the SQL would not make approvals or AI operational.
- Current history JSON aggregation has no explicit ordering; a future UI must not depend on accidental row order. Full source/catalog revision binding is absent until the design above is approved.
- Privileged roles remain capable of bypassing ordinary RLS; operational permissions and direct privileged INSERT controls need review. No claim of immutable protection against database owners is made.
- No v3-specific rollback file or executed v3 rollback/restore drill exists. Reapplication and disposable concurrency tests are not rollback evidence. Define approved retention-safe rollback, disable-first procedure, function dependency handling and genuine restore drill before release. Do not drop durable history as a casual rollback.
- Quota cleanup/retention, source privacy/retention, reviewer revocation races, source snapshot locking, provider receipt metadata, durable save/revoke controls, verified export and actual HTTP 429/history-reload acceptance remain release work after separate authorization.

## Exact validation results

- **Tests:** 505 pass, 0 fail, 110 files, 8,512 assertions.
- **Release script:** all 11 static guards pass. This is not runtime, migration, provider privacy or clinical-validation proof.
- **Verifiers:** 91/96 pass, including security audit, scientific freeze, P38–P47 and SEO. The five failures above remain reported. Remote-auth-settings verification was not run; no hosted-settings claims.
- **Disposable PostgreSQL:** v3 30 assertions pass; existing integration harness 305 assertions pass on PostgreSQL 17.9. Both ran with `/tmp/mito-pg/socket` and explicit `FV0143_INCLUDE_PENDING=1`. Fixtures and authoritative replacement exist only inside disposable tests; production untouched.
- **Lint:** 0 errors, 13 warnings.
- **Project formatting command:** fails on the preserved, byte-identical `docs/MEDICAL_INTELLIGENCE_GOVERNANCE_V3.md`. No unapproved formatting rewrite made. Supplemental whole-tree check reports 348 nonconforming files; no mass rewrite attempted. The supplied release script is also intentionally byte-identical rather than reformatted.
- **Trivy filesystem vulnerability/secret scan:** 0 HIGH/CRITICAL vulnerabilities, 0 secrets; dependency manifest scan excluding generated output, node_modules and Git metadata. Not a claim of no lower-severity advisories.
- **Automatic preview validation:** latest observed log reports `build OK`. Manual typecheck/build commands were not run because this environment delegates them to automatic validation; no claim of exact-final-commit production-build validation.
- **GitHub observed baseline:** on `0a4602122bcb6e9ee87af3f1168b23239554d84e`, Quality run `40129840279` failed at Format check; tests, Typecheck and Lint passed; Production build was skipped. Security Scan run `40129840097` succeeded. This is not the final safe-completion commit, whose synchronization and CI remain unverified.
- No new browser/provider acceptance was attempted: this patch adds only documentation and a static script and authorization still excludes production activation. Prior disabled-flow browser evidence is not relabeled as v3 operational acceptance.

## Approval stop

Work stops before any production database or evidence-trust change. Required separate decisions are: the authoritative synthetic source/privacy/canonical design; source persistence or transfers, if any; exact reviewed SQL and rollback; and later AI/durable-approval activation. Genuine private restore evidence and owner-risk acknowledgment are still required. This report requests review, not blanket activation, and no approval is inferred from reading it.