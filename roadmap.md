# P36.5 Mission/astronaut report export

- [x] Authorized display-name cover and immutable IDs; exact sanitized PDF/TXT basename; separate Print and local-only A4 PDF generation.
- [x] Five export regressions / 794 full tests pass; lint 0 errors/12 warnings, security boundary audit passes. Actual desktop/mobile Chromium clicks download identical 15-page A4 PDFs and correctly named TXT; existing print regressions pass. See docs/P36_5_ACCEPTANCE_RESULTS.md.
- [ ] Genuine populated crew acceptance blocked by requesting account having no authorized crew; branded Chrome/Edge unavailable. Existing 2 moderate/1 low dependency advisories and 3 unrelated formatting failures remain.
- [ ] Exact-revision full typecheck/production-build CI requires managed synchronized execution; no migrations, RLS, AI, gate changes or publishing.

# P36 Automatic Hybrid AI Medical Document Extraction

- [x] One shared hybrid pipeline for all four health domains: deterministic local parsing first, automatic server-side AI assistance when incomplete/ambiguous; no AI button, no per-document approval, no auto-save of AI output.
- [x] Authenticated default-deny endpoint `/api/medical-document-extraction` with existing mission/crew access policy, provider/model allowlist (Lovable AI Gateway `openai/gpt-6-astra` or existing OpenAI contract), bounds, streaming provider call, content-free audit; master gate `P36_DOCUMENT_AI_ENABLED` and separate `P36_REAL_DOCUMENT_AI_ENABLED` are unset everywhere (endpoint answers 503, sends nothing).
- [x] Actual Challenge 02 PDF regression: deterministic parser 0 matches (trigger), live provider call returned all 5 expected synthetic immune values with collection date never promoted to observation time; validator/merge hold unknown catalogs, unit mismatches, conflicts and uncertainties.
- [x] 785 tests pass (35 new); typecheck clean; lint 0 errors on changed files; security audit PASS; desktop/mobile browser upload verified with synthetic adapters (unavailable path + stubbed-server wiring). See docs/P36_HYBRID_AI_EXTRACTION.md.
- [ ] Authenticated Crew Self/Ground Medical encrypted-storage acceptance, physical-device offline OCR and exact-revision GitHub CI remain unverified; P3663/P3664/P20 gates unchanged. No migrations, RLS, AI-configuration, gate changes or publishing.

# P35 Clinical Lab Parser and Access Audit

- [x] Actual clinical PDF: five exact Immune candidates, original Unicode units, source/page evidence, human-confirmed dates; P34/four-domain actual PDF uploads pass.
- [x] Read-only live-policy/service audit; Ground Medical import remains separately scoped, Crew-Self-only evidence panel no longer offers unsupported selections; owner-reported wording harmonized without approval/status changes.
- [x] 75 focused/750 full tests pass; lint 0 errors/12 existing warnings; security audit passes; desktop/mobile uploads pass. Latest automatic compilation build OK. See docs/P35_CLINICAL_LAB_RESULTS.md.
- [ ] Authenticated Ground Medical encrypted persistence blocked: requesting account is mission-operator only. Exact-revision GitHub full typecheck/production-build evidence and physical-device offline OCR unavailable. Three existing P22 source-pattern failures and P3663/P3664/P20 gates unchanged. No Cloud writes, migrations, AI, gate changes or publishing.

# P33 Universal Medical Document Intelligence

- [ ] Apply P33 patch (universal-document-rows, document-extraction, tests) and complete the full contract: PDF.js geometry reconstruction, header-aware tables, reviewed aliases only, unit validation without conversion, held-for-review ambiguity, diagnostics, page/source traceability.
- [ ] Regression fixtures: reconstructed P28 PDFs (Immune 5, Cardiovascular 5, Behavioral 4 — originals were never committed to the repository), P33 edge-case PDF, existing Bone fixture; unit + end-to-end PDF tests; browser upload tests in all four modules.
- [ ] Full checks: tests, typecheck, lint, format, security audit, build; document unverified items. No migrations, RLS, AI, release-gate or publishing changes.

# P20 video evidence closure

## P30 Medical Report and Advisor screen contrast

- [x] Apply P30 report bytes exactly; advisor differs only by the matching primary class on the omitted acknowledgment button. Supplied screen colors are semantic CSS tokens; original stylesheet/print rules remain byte-identical.
- [x] 715 tests/10032 assertions pass after generating the existing sealed ignored synthetic sample; lint 0 errors/12 existing warnings, formatting/security/SEO/header checks pass. Synthetic desktop/mobile actual-component keyboard, disabled/enabled buttons and three textareas pass; 64 records/4 exclusions/60 long IDs in 15-page A4 exports. All 15 same-DOM before/after pages are pixel-identical; print styles/positions are identical.
- [ ] Exact-revision full typecheck/production-build validation is blocked by unavailable synchronized CI evidence; platform forbids manual execution. Automatic compilation reports build OK. Dependency audit retains 2 moderate/1 low advisory; authenticated encrypted-storage acceptance and manual print dialog remain unverified. No database, RLS, AI, release-gate or publishing changes. Detailed results: docs/P30_UI_CONTRAST_RESULTS.md.

## P29 Medical Report menu and A4 fit

- [x] Apply supplied navigation and report presentation changes; complete missing 17/10/16/12/13/32% history columns, cover/evidence classes, exclusion widths and lossless date line breaks. Semantic paper tokens replace supplied hardcoded utilities; fix dark-mode table contrast and overlapping fixed print furniture. Report logic is unchanged.
- [x] Real desktop Enter/mobile pointer navigation passes. Browser-only synthetic adapters render 64 included/4 excluded records into 15-page A4 PDFs from desktop and mobile; all 60 long IDs, Greek/English text, units and millisecond timestamps retained inside page bounds. No runtime errors; inspected first two rasterized PDF pages. This is Chromium PDF/presentation verification, not authenticated encrypted-storage acceptance or manual printer-dialog approval.
- [x] Full tests: 715 pass/10032 assertions/141 files. Lint: 0 errors/12 existing warnings. Formatting, security boundary audit, SEO/global header pass; offline package verifiers 55/59, with four pre-existing P22 source-pattern failures in unchanged files. Dependency audit reports two moderate/one low existing advisories; no dependencies changed. Managed preview compilation reports build OK.
- [ ] Exact-revision full typecheck and production build remain unverified: successful synchronized GitHub execution evidence is unavailable; platform disallows manual build/typecheck. No database, permission, AI, gate or publication changes.

## P22 visible verification and shared observation timestamp

- [x] Compare supplied replacement; preserve parsing/authorization fixes. Deviations: retain Verify All for empty/saved-only reviews, strictly reject invalid calendar timestamps, bind confirmation to current file/rows, and add pure-helper regression tests.
- [x] Focused tests: 29 pass; full tests: 686 pass/9897 assertions. Lint: 0 errors/13 existing warnings; security/formatting and Bone/SEO checks pass. Synthetic-adapter browser covers desktop/mobile, keyboard, shared-date confirmation, real two-page tab switching, no-flash review, remount reset and partial-save receipts; no page errors.
- [ ] Exact-revision typecheck/production-build CI and authenticated encrypted-storage acceptance remain unverified; managed CI evidence unavailable. Automatic compilation is OK; dependency audit retains 2 moderate/1 low advisory. Database, migrations, AI settings and release gates unchanged.

## Compact Bone import review

- [x] Compare both supplied replacements and integrate compact table/silent tab return; add shared existing-validation eligibility, explicit confirmation, accessible disclosures/keyboard table scrolling and save-time authorization-loss guards.
- [x] Focused tests: 26 pass; full tests: 679 pass/9867 assertions. Synthetic-adapter desktop/mobile keyboard, bulk verification, edit invalidation, no-flash refocus, remount approval reset, delayed denial, PDF/CSV/OCR and partial-save retry pass with no page errors. Lint: 0 errors/13 existing warnings; security/formatting and Bone/SEO verifiers pass; managed compilation reports build OK.
- [ ] Exact-revision typecheck/production-build CI and authenticated encrypted-storage acceptance remain unverified; managed execution evidence and independently authorized test services are unavailable. Dependency audit retains 2 moderate/1 low advisories. No database, migrations, AI configuration or release-gate changes.

## Bone corrected-text parsing and safe restoration

- [x] Parse exact-ID/name report rows, tab/pipe tables and corrected CSV with explicit errors; preserve custom reported units without conversion or an invented unit whitelist.
- [x] Restore bounded synthetic queues after fresh scoped identity/crew reads; reset checked review, clear account/scope/sign-out state, preserve saved-row receipts and require file reselection.
- [x] 676 tests pass; synthetic-adapter desktop/mobile recheck, refocus/remount, denied restoration, OCR failure and partial-save-remount checks pass with no page errors. Lint: 0 errors/13 existing warnings; security/formatting and three Bone verifiers pass; managed compilation reports build OK. Dependency audit retains 2 moderate/1 low advisories.
- [ ] Exact-revision full typecheck/production-build CI and authenticated encrypted-storage acceptance remain unverified; physical-device offline OCR is not attested. No new latest-project attachment was found beyond the previous role-access patch; current clean project was preserved. No database, migrations, AI or gate changes.

## Bone import role access patch

- [x] Compare and apply the supplied import-access presentation patch without overwriting unrelated changes.
- [x] Synthetic-adapter browser checks pass for Crew Self/Ground Medical import before correction, explicit provenance, denied roles, crew isolation and scope/provenance queue reset; desktop/mobile, existing OCR/partial-save and correction runners pass.
- [x] 662 tests pass; lint reports 0 errors/13 existing warnings; security audit, formatting and Bone entry/import/document/SEO verifiers pass. Dependency audit retains 2 moderate/1 low advisories; automatic compilation reports build OK.
- [ ] Full typecheck/production-build evidence and authenticated role/encrypted-storage acceptance remain unverified; these require managed validation and authorized test sessions. No database, migrations, AI, deployment or release-gate changes.

## Unified Bone file import UX

- [x] Unified memory-only 10-file serial queue, cancellation/90-second timeout, independent OCR cache check and explicit per-measurement review; successful append-only saves receive stable-ID receipts and duplicates remain scope/provenance bound.
- [x] Desktop/mobile mixed-file selection, real CSV/PDF-text parsing, OCR failure, keyboard/cursors, correction safeguards and partial-save retry passed with synthetic history adapters; lint 0 errors/13 warnings, security/formatting and six affected verifiers passed. Automatic compilation reports build OK.
- [ ] Exact-revision CI typecheck/production build and authenticated encrypted-storage acceptance remain unverified; existing P22 coverage assumption, three dependency advisories and P3663/P3664/P20 owner-evidence blockers remain unchanged.

## Bone notes, cancellation and cursor UX

- [x] Compare supplied patch with latest source; retain original correction notes and add non-persisting Cancel beside Save correction, preserving scoped editable metadata.
- [x] 653 tests pass after regenerating the existing sealed synthetic fixture; isolated real-form browser verifies notes, cancellation without writes, failed-save ordering and desktop/mobile cursors. Lint: 0 errors/13 existing warnings; formatting, security audit, SEO and Bone entry checks pass; automatic compilation reports build OK.
- [ ] Full exact-revision typecheck/production-build validation requires CI evidence. Existing P22 coverage verifier assumption, two moderate/one low dependency advisories and P3663/P3664/P20 gates remain unchanged. Browser storage/identity were synthetic adapters, not authenticated encrypted-history acceptance.

## Health-domain navigation UX

- [x] Apply supplied navigation-only replacements; restore the missing Bone import and use Button-as-link controls with a verified 2px offset focus ring. All newer Bone fields and correction logic preserved.
- [x] Audit: Immune/Behavioral already use searchable reference pickers; Cardiovascular has a handbook reference but no equivalent picker. All three remain read-only and require domain-specific validation, documented catalog reconciliation and authorization before measurement entry.
- [x] 651 tests pass; four links, active states, keyboard/pointer navigation and focus verified at 1280px/390px with no overflow or runtime errors. Lint: 0 errors/13 existing warnings; formatting, security, catalog/freeze/Bone mapping and SEO checks pass; automatic compilation build OK.
- [ ] Full typecheck/production-build exact-revision CI remains unverified; no manual build/typecheck run under platform rules. Existing dependency audit findings (2 moderate/1 low) and P3663/P3664/P20 evidence blockers remain unchanged; no database, migrations, activation or publication.

## Bone reported metadata comboboxes

- [x] Replace unit, specimen and method inputs with editable accessible pickers and authorized mission/crew/provenance/variable-scoped suggestions; preserve custom text and existing correction/save behavior.
- [x] 646 tests pass; actual-form controls and isolated synthetic keyboard/mouse, retention and authorization-loss checks pass without saving records. Lint has 0 errors/13 existing warnings; formatting/security audit pass; automatic compilation reports build OK.
- [x] Offline package verifiers: 58/60 pass; existing P22 coverage assumption and P20 submission gate fail unchanged. Private P3663/P3664/P20 evidence diagnostics remain BLOCKED. Dependency audit retains 2 moderate/1 low advisory; no dependencies, database or migrations changed.
- [ ] Exact-revision typecheck/production-build CI and authorized-history browser flow remain unverified: managed CI evidence unavailable and the restored requesting account has no authorized Bone Health mission membership.

## Bone correction time and lab suggestions

- [x] Apply supplied files with precise unchanged-instant retention and scoped editable source suggestions.
- [x] 635 tests pass, including UTC+2/UTC-5, unchanged precise instants, DST and failed/partial-save ordering; actual-form editable source controls and isolated synthetic keyboard/mouse suggestions pass without persistence.
- [x] Lint (0 errors/13 existing warnings), formatting and security audit pass; automatic preview compilation reports build OK. Offline verifiers remain 98/102 with existing P22 coverage/P3663/P3664/P20 failures; dependency audit retains two moderate/one low advisory.
- [ ] Full typecheck/production-build exact-revision CI and authorized saved-record browser correction remain unverified; no database, migration, provider or deployment changes performed.

## Scientific catalog UX and review trace

- [x] Compare and apply supplied files, preserving scientific source bytes and authorization.
- [x] Verify signed-in reference selection, keyboard/mouse controls and narrow-screen overflow without saving measurements.
- [x] 621 tests, signed-in keyboard/mouse checks at desktop/mobile sizes, lint (0 errors/13 existing warnings), formatting and security audit pass; automatic preview compilation reports build OK.
- [ ] Full typecheck/production-build exact-revision CI remains unverified. Offline verifiers report 98/102 pass: existing P22 coverage check expects the removed pre-combobox implementation; P3663/P3664/P20 remain blocked. Dependency audit reports two moderate/one low advisory; no dependency or gate changes authorized.

## Synthetic status presentation

- [x] Separate permanent-policy status from legacy guard status, sanitize access/service failures and identify revision metadata without changing admission.
- [x] 613 tests pass; 58 offline verifiers pass; security audit/P16 and formatting pass; lint has 0 errors/13 existing warnings; automatic compilation reports build OK. Existing moderate/low esbuild advisories remain; service-dependent checks and exact-revision CI are unverified.
- [x] Signed-in read-only response reports research mode and sanitized access_denied with null status; no raw database detail returned. P3663/P3664 and competition submission remain BLOCKED; no generation or deployment performed.

## Synthetic tab state patch

- [x] Compare the supplied component with current source and apply scoped restoration with account/hash isolation and synthetic-only storage safeguards.
- [x] 608 tests pass; lint has 0 errors/13 pre-existing warnings; security audit/P16 and formatting pass; automatic typecheck/build signal is build OK. Dependency audit reports existing moderate and low esbuild advisories; dependencies unchanged.
- [ ] Signed-in loaded restoration verification is blocked: the local preview returns Authoritative synthetic source unavailable for the requesting owner's session; no configuration changes or provider generation performed.

## First permanent synthetic provider failure

- [x] Inspect the failed attempt, published logs and request path; verify OpenAI model metadata without generation. Dispatch permission committed, but the broad exception path retained no provider HTTP status, error code or request ID.
- [x] Root cause reproduced in workerd: the global `fetch` was injected as an object property and invoked as a method, raising "Illegal invocation" before any socket opened (local stand-in received 0 requests; the wrapped call received 1). Fixed with a wrapper and global-receiver invocation; added sanitized structured diagnostics and 7 tests.
- [ ] Exact-revision Quality/Security CI on the diagnostic correction, then publish; awaiting managed GitHub synchronization.
- [ ] Provider settlement remains application-evidenced only (runtime reproduction, 40 ms failure, no request ID); OpenAI-side request/usage evidence for 2026-10-25 06:26 UTC is unavailable without the owner's OpenAI dashboard or an administrative usage credential. Retain the unresolved attempt and USD 0.10 hold, keep policy paused; do not resolve/resume or generate until supplied.

## Permanent synthetic research AI

- [x] Correct attributable CI PostgreSQL 16/MAINTAIN mismatch by using an independent PostgreSQL 17 container; immutable SQL is unchanged and 588 tests/formatting pass. Replacement exact-revision CI remains pending synchronization.
- [x] Owner resolved the initial-generation contract: use only the existing predefined factual question/schema for the exact two observations; do not add interpretation or retry.
- [x] Implement versioned default-off policy, atomic rolling quotas/monthly reservations, owner administration, provider reconciliation and safe legacy transition.
- [x] Validate 588 tests, 156 permanent-policy disposable SQL assertions plus 593 legacy assertions, security/format/lint, zero-finding Trivy and signed-in browser denial; document rollout in docs/MEDICAL_V3_PERMANENT_SYNTHETIC_RESEARCH.md.
- [x] Exact implementation revision 076474dde1312113196285477bcc9d74211806e3 / tree 28b95cde8072cc173b52fd514d4be850bf3e90df synchronized to canonical main; Quality 40168449888 including PostgreSQL 17 SQL suites/typecheck/build and Security Scan 40168449890 passed. Fresh local 588 tests and 749 disposable SQL assertions passed.
- [x] Owner-authorized permanent schema applied once as 0013_medical_research_policy.sql; bytes match a6646b3ea160261a096038537778c0a89265062ac10d3932246593f5c95b535e and production journal id 14. Five empty RLS tables, all 11 independently matched functions, denied application TRUNCATE/legacy admission and unchanged exact fixtures/persistence denial verified.
- [ ] Authorized deployment/provisioning/activation and one factual generation stop at trusted provisioning transport: existing medical_research_provision requires postgres/supabase_admin; available data tools do not support privileged write-function SELECT execution, restricted shell cannot invoke it, and a migration or direct inserts cannot substitute. Owner SQL Editor execution of the existing provisioning function is required; no new endpoint/grant/bypass, deployment, activation or provider request occurred. Optional provider reporting may remain degraded as explicitly authorized.

## Synthetic research activation review

- [x] Implement owner-approved practical controls: version-matched guard/status, token bounds, enabled-path/race tests; 579 tests and 593 disposable SQL assertions, security audit/format/lint and zero-finding Trivy. Revised artifacts in MEDICAL_V3_COMPLETE_SYNTHETIC_ACTIVATION_GUARD.md; no production execution.
- [ ] Final exact-commit Quality/Security/typecheck/build require completed synchronized GitHub runs; prior green baseline is not certification.
- [x] Deliver one concrete production implementation/deployment checklist with exact artifacts, commit/CI evidence, verification SQL, retaining-disable recovery and four separate approval gates; no execution authorized. Actual pending guard defines six functions, correcting the report's seven-function count.
- [x] Read-only production verification: exact fixtures, scope membership, fifteen function fingerprints/allowlist, five RLS tables, persistence denial and existing minute quotas; pending lifetime/window/disable guard absent.
- [x] Verify current source SHA 853ba6a6bbf5d90b3a3bdfa648add44b4d692b84: Quality (including typecheck/production build) and Security Scan passed; published server revision and effective flag values remain unattested.
- [x] Plan reviewed and approved for default-off investigation only; 13 focused Bun tests passed. No application code, SQL, flags or provider requests changed.
- [ ] Production schema/recovery, deployment and final UTC activation/operator authorization remain separate; current provider model/pricing and deployed revision/configuration need approved verification. Owner-approved practical accounting/permit semantics supersede the prior absolute guarantees; no independent staging requirement.

## Complete synthetic AI activation guard

- [x] Final hardening: unconditional production transmission denial, both serialized SQL disable race orderings, accounting-failure shutdown, 577 tests/103 guard SQL assertions and refreshed security/fingerprints; no activation.

- [x] Prepare default-off pending schema, retaining-disable recovery, caller-scoped server integration and exact-scope authorization instructions; production and existing fixtures untouched.
- [x] Exercise attempts, cost holds, concurrency, expiry, emergency disable, authorization and recovery in disposable SQL and automated server tests.
- [x] Report immutable artifact fingerprints, security validation, unavailable final exact-commit CI and separate approvals in docs/MEDICAL_V3_COMPLETE_SYNTHETIC_ACTIVATION_GUARD.md.
- [x] Prior hard-guarantee policy superseded by explicit owner practical-control approval; final implementation/report below retain separate production authorizations.

## Medical v3 schema / seed separation

- [x] Persist only the independently attested snapshot dependency hash in the seed and retaining-disable artifacts; keep original approved and actual committed schema fingerprints distinct.
- [x] Validate persisted artifacts: 568 tests; 484 production-equivalent, 30 governance and 51 completion SQL assertions; security/lint and zero-finding Trivy pass; 99/102 scientific/security verifiers with three unchanged release blockers.
- [ ] Exact-final-preparation CI requires matching synchronized GitHub runs; managed one-statement seed transport and trusted execution identity remain undocumented/unverified without a production probe, so seed execution is NO-GO.
- [x] Schema committed once as drizzle/migrations/0011_medical_v3_synthetic_schema_only.sql, journal id 12; verified five empty tables/RLS, 15 hardened functions, application-role CRUD/TRUNCATE denials, four-RPC allowlist, persistence trigger and quota definitions.
- [x] Reconciled the historical two-space submission deviation without changing either schema artifact or journal; only the explicitly attested snapshot dependency pin changed in pending seed/disable. Production seed, rollback and activation still require separate approval and verified transport.
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
- [x] P33 universal medical document intelligence: geometry PDF parsing, header-aware catalog matching, 14/14 synthetic P28 rows recognized, fail-closed unsupported layouts, 737 tests, browser upload regression for all four domains. Original P28/P32 PDFs unavailable — fixtures are synthetic reconstructions. OCR offline-device proof, authenticated storage acceptance and exact-revision CI remain open.

## P45 Daily Health Companion

- [x] Apply the P45 patch: `/mission/companion` route, Mission Console menu entry, five environments, session-only checklist, Crew Self read-only trends, data-quality colors, guidance links.
- [x] Integration: semantic quality color tokens, router links, time-proportional chart, explicit 0/1/2+ and empty states, search keywords, noindex route; 8 tests.
- [ ] Real signed-in Crew Self browser acceptance (owner account lacks a Crew Self membership; verified with stubbed membership/evidence responses).

## P46 Foreground reminders

- [x] Apply the P46 patch: optional user-chosen reminder intervals (1-minute demo), Start/Stop, in-page notice, optional browser notification permission, reset on reload; no persistence, schedules or background delivery.
- [ ] Physical-device and branded Chrome/Edge notification acceptance (blocked: only bundled Chromium in sandbox).

## P46.1 Synthetic trends demo

- [x] Apply the P46.1 patch: opt-in Show/Hide synthetic resting-heart-rate example under Dynamic health trends, clearly labelled, never stored, exported or fetched; real Crew Self charts unchanged.
- [ ] Authorized Crew Self browser acceptance of real charts beside the demo — blocked: no account with a Crew Self membership.

## P47 Interactive multi-biomarker trends

- [x] Apply the P47 patch: three synthetic example series (resting heart rate, HRV, sleep) behind one metric selector; Crew Self time-window and evidence-source filters relative to the latest observation; read-only provenance table with original units, UTC times, quality and source.
- [x] Integration: filter-specific empty state, filters reset per crew scope, table header scopes, live count, singular/plural count, mobile table layout; 5 domain tests; browser check with stubbed Crew Self responses.
- [ ] Real signed-in Crew Self acceptance of the filters and table — blocked: no account with a Crew Self membership.

## P47.1 Companion accessibility & UX

- [x] Apply the P47.1 patch: four section titles as level-2 headings, 44px touch height and visible keyboard focus on the four console links and three guidance links.
- [x] Integration: the shared card title has no `asChild` option, so headings are plain h2 elements with the same card-title styling; focus outline uses the ring token.

## P48 Crew Self preflight (Stage A, read-only)

- [x] Add the P48 verifier and contract; verifier 6/6 PASS; findings in `docs/P48_PREFLIGHT_FINDINGS.md`.
- [x] Disposable-database isolation and revocation scenarios on live migrations: 25/25 PASS.
- [ ] Stage B synthetic Crew Self provisioning and signed-in acceptance — blocked: owner approval of environment, test accounts, synthetic mission and append-only synthetic events.
- [ ] Optional: re-check Crew Self membership on page refocus so revocation clears an open companion page — awaiting approval.
