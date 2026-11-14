# P38 bulk synthetic demo approval and activation (MITO_DEMO_2026, 209 terms)

- [x] Preflight of all 209 submitted terms from real metadata: 1 active, 66 eligible, 117 eligible after a domain choice, 2 conflicting identity, 6 existing catalog match, 17 ambiguous unit, 0 duplicate.
- [x] Pending SQL (bulk triage / decisions / activations, rollback) and generated 185-term owner scope authorization.
- [x] Server functions with deterministic retry keys; Researcher bulk UI (viewed live, read-only); Ground Medical bulk activation UI.
- [x] Isolated-database verification (103 assertions) on the actual metadata; 16 domain tests; earlier P36/P37 verifiers still pass.
- [x] Owner-approved install: bulk functions (0026, byte-identical) and 185-term scope (exact set) on 2026-11-07.
- [ ] Live bulk triage/decision/activation in Preview (owner performs manually).

# P37 one-biomarker synthetic demo (ubt-7b25ce69, MITO_DEMO_2026)

- [x] Read-only inspection: production P37 cannot run the test (no source receipt; and the label "25(OH) Vitamin D" already resolves in the base catalog as unit-review-required bone-019, so a production entry would be excluded on devices).
- [x] Prepared isolated synthetic demo lifecycle (pending SQL, rollback, scope authorization), demo signing key, device runtime, intake annotation, no-duplicate request rule, Researcher/Ground Medical panels; 19 domain tests, 126 disposable SQL assertions, existing P37 verifiers (84, 73) and 1,270 tests pass.
- [x] Owner-approved demo database change and one-term allow-list installed (byte-identical, hashes verified).
- [x] Live Preview test — owner recorded the Researcher demo decision and Ground Medical demo activation (demo catalog v2).
- [x] Automatic integration: activated demo entry recognized in normal intake, saved as labelled synthetic records, shown on Bone Health and in the Medical Report, offline from the signed snapshot, auto-refreshed online, sync re-validated server-side; revocation stops new recognition and keeps history. New-exam browser runs as Ground Medical and Crew Self passed (local device only).
- [ ] Live revocation and live cross-device sync of a demo record not exercised (would change shared state; covered by tests).

# P36 controlled Metadata Handoff activation

- [x] Recheck installed migration hashes, effective INSERT denials, function ownership/grants, RLS and both closed admissions.
- [x] Inspect published Scientific Review assets without submission; deployed server revision and actual runtime flag remain unattested.
- [ ] Controlled publication/activation authorized but stopped in Phase A: exact-commit Quality run 42353231090 failed Format check; Production build skipped. Successful replacement exact-commit CI and published runtime verification required. No publication, flag or admission changed.
- [ ] Manual 12-term then 197-term Ground Medical → Researcher acceptance waits for activation and user-controlled consent/submission from separate synthetic accounts; no requests uploaded.

# P36 narrow permission remediation

- [x] Read-only live ACL investigation: Step 1 committed; sandbox_exec receives direct SELECT/INSERT from postgres table defaults, not PUBLIC or an inherited parent role.
- [x] Prepare three-table INSERT-only revocation and separately approved restoration; 177 new disposable assertions plus 149 equivalence and 38 SQL regression checks pass.
- [x] Live INSERT revocation completed; effective API/executor direct writes denied and unaffected catalog fingerprint preserved.
- [x] Owner acknowledged the remediation trailing-LF discrepancy; Step 2 initialized exactly one closed singleton.
- [x] Step 3 remediation installed as 0019 with exact approved hash; effective table/column writes denied, preservation fingerprint matches and both admissions remain false.
- [x] Step 4 roster installed as 0020 with exact approved hash; postgres ownership, authenticated-only effective EXECUTE, active mission/crew filtering and unchanged table RLS verified. No activation or live submissions; fresh disposable/real-account runtime acceptance remains blocked by unavailable isolated services.
- [x] Independent Step 3 byte comparison confirms only one omitted trailing LF; exact two-table remediation passes 261 disposable assertions and 38 hardened RPC regression checks. Both live switches false; execution remains separately gated.

# P36 tool-compatible installation preparation

- [x] Preserve original SQL/rollback bytes; prepare three wrapper-free DDL copies and exact single-statement closed-admission initialization.
- [x] Validate catalog/security equivalence and failure safety (149 disposable assertions), existing replacement SQL suite (38 checks), and 1,199 regression tests.
- [x] Owner-authorized installation sequence completed through Step 4, including separately acknowledged historical newline discrepancies and exact-byte permission remediations; both admissions remain closed. See docs/P36_FINAL_INSTALLATION_CHECKPOINT_2026-11-07.md.

# P36 compact Scientific Review

- [x] Preserve complete dossiers/exports behind compact searchable, filtered, paginated tables; distinguish documentary, local and cloud inventory.
- [x] Diagnose live missing dynamic migrations and Researcher-excluding table policies; stage narrow roster RPC without applying it.
- [x] 1,199 tests, 38 disposable SQL checks, lint/security/format and 56 project gates pass; desktop/mobile table/drawer checks pass. Dependency audit and three external evidence gates remain blocked; managed compilation is OK, standalone production-build/exact-commit CI evidence is unavailable.
- [ ] Genuine two-account acceptance blocked until independently isolated auth/data services and approved staging migrations are available.

# P36 final blocker remediation

- [x] Fix crew roster, stale identity, Researcher local-data leak, cloud-aware summary statuses/batches, scoped duplicates, mission dropdown, registry fail-closed.
- [x] Staged SQL: closed-by-default admission, revocation row locks, receipt-bound approvals, rollback order guard; 33 disposable SQL checks.
- [x] Verifier/format/dependency fixes; full tests, typecheck, lint, build pass; one authoritative migration sequence.
- [ ] Two-account authenticated browser acceptance — blocked: no isolated auth/data services.
- [ ] Exact-commit CI and production ACL/history attestation — blocked: owner-provided synchronization/access.

# P36 final UX and release readiness

- [x] Authorized selectors: mission dropdown, searchable crew-name dropdown, governed provenance, verified-revision dropdown (fail-closed empty registry), technical IDs in expandable details.
- [x] Consolidated pending-requests summary grouped by mission/crew/provenance with batch expansion, statuses, receipts and non-destructive duplicate detection.
- [x] Role-aware workflows: Ground Medical preview/consent/submit; Researcher sees only submitted authorized cloud terms.
- [x] Validation: 1,184 tests, typecheck, lint (0 errors/12 warnings), security audit, production build, signed-out desktop/mobile browser check. Disposable SQL and two-account browser tests blocked: no isolated PostgreSQL socket or auth services in this environment.
- [x] Delivery: one source ZIP, one validation report, migration hashes, production activation checklist. No deploy, no production migration, no real-data upload.

# P36 unified implementation

- [x] Audit and preserve current baseline; stage metadata-only scope-bound cloud handoff and guarded rollback.
- [x] Explicit submission/receipts/retry and dynamic paginated review with safe bulk proposals.
- [x] Scoped scientific authorization and governed promotion preparation without activation; source receipts remain independently owner-provisioned.
- [ ] Disposable real-auth two-account browser acceptance and exact-revision CI blocked by absent isolated auth services/synchronized CI; production activation and local-record uploads are not authorized.
- [x] Disposable SQL/security/regression/public-browser validation and consolidated report/checklist/source ZIP.

# P36.8.1 date-only observation support

- [x] Integrate supplied partial source patch and explicit v2 calendar-date model across intake, encrypted storage, corrections, sync, projections and reports.
- [x] Verify exact catalog/unit eligibility, eligible-only selection, missing-data/source-unvalidated reasons and scientific boundaries.
- [x] 1136 tests, lint (0 errors/12 warnings), security boundary/format/project verifiers pass; managed compilation OK. Disposable real-SQL date/instant two-device checks pass; isolated synthetic local save/readback and actual searchable PDF/TXT desktop/mobile downloads pass. See docs/P36_8_1_IMPLEMENTATION_RESULTS.md.
- [ ] Original NASA PDF acceptance requires the actual report, which is not included in this patch archive.
- [ ] Live cross-device writes and production publication remain owner-gated; no live migration or stored-record changes.
- [ ] Genuine authorized intake saving requires a crew-scoped account; current owner has no authorized intake crew options. Standalone production build/exact-commit CI unavailable; dependency audit retains 4 moderate/1 low findings.

# P36.7 PDF intake candidate extraction

- [x] Inspect patch and reproduce pipe-separated PDF candidate failure.
- [x] Integrate candidate recognizer, preserving exact values/units and date-only metadata.
- [x] Focused tests (31), full suite (1123), lint/security/format/project verifiers and desktop/mobile representative PDF intake pass; automatic compilation is OK.
- [ ] Actual 11-page NASA report acceptance blocked: original PDF absent from uploads, project and uploaded archives.
- [ ] Complete bun run check including typecheck/production build blocked by platform execution restrictions; those steps were not manually run.

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
- [ ] Authorized Crew Self browser acceptance of real charts beside the demo — blocked: Crew Self accounts exist but none has synthetic data or owner approval for a test session (see P48).

## P47 Interactive multi-biomarker trends

- [x] Apply the P47 patch: three synthetic example series (resting heart rate, HRV, sleep) behind one metric selector; Crew Self time-window and evidence-source filters relative to the latest observation; read-only provenance table with original units, UTC times, quality and source.
- [x] Integration: filter-specific empty state, filters reset per crew scope, table header scopes, live count, singular/plural count, mobile table layout; 5 domain tests; browser check with stubbed Crew Self responses.
- [ ] Real signed-in Crew Self acceptance of the filters and table — blocked: Crew Self accounts exist but none has synthetic data or owner approval for a test session (see P48).

## P47.1 Companion accessibility & UX

- [x] Apply the P47.1 patch: four section titles as level-2 headings, 44px touch height and visible keyboard focus on the four console links and three guidance links.
- [x] Integration: the shared card title has no `asChild` option, so headings are plain h2 elements with the same card-title styling; focus outline uses the ring token.

## P48 Crew Self preflight (Stage A, read-only)

- [x] Add the P48 verifier and contract; verifier 6/6 PASS; findings in `docs/P48_PREFLIGHT_FINDINGS.md`.
- [x] Disposable-database isolation and revocation scenarios on live migrations: 25/25 PASS.
- [ ] Stage B synthetic Crew Self provisioning and signed-in acceptance — blocked: owner approval of environment, test accounts, synthetic mission and append-only synthetic events.
- [x] P48.1: returning to a hidden Companion tab reloads the page, re-checks Crew Self membership and clears revoked evidence (superseded by P48.2).
- [x] P48.2: focused fail-closed revalidation replaces the reload; generation-guarded controller in `src/domain/companion/crew-revalidation.ts`, 15 unit tests, stubbed browser acceptance in `tests/navigation/p482-focused-revalidation.browser.py`.
- [ ] P48.1/P48.2 signed-in acceptance with real synthetic Crew Self A/B accounts and operator revocation — blocked by Stage B approval above.
- [x] P48.3: Stage B readiness verifier 6/6 PASS; read-only plan in `docs/P48_3_STAGE_B_PLAN.md`.
- [ ] P48.3 Stage B execution — blocked: owner approvals (draft/environment, test accounts, mission/crew, permanent synthetic records, synthetic intake method).
- [x] P48 FINAL: default-off Crew Self synthetic intake, disposable-DB acceptance 14/14, P48.2-aware P48.1 verifier, older docs formatted, dependency review (`docs/P48_FINAL_STAGE_B_RESULTS.md`).
- [ ] P48 FINAL real authenticated Crew A/B demonstration — blocked: owner approvals listed in `docs/P48_FINAL_STAGE_B_RESULTS.md`.
- [x] P49: read-only canonical projection for unified-observation, handbook/manual entry and Bone formats; Crew A's 74 records now accounted (27 charted, 47 identical repeats listed); Bone page gains mission evidence; phone cards; 24 tests (`docs/P49_DEMO_READINESS_RESULTS.md`).
- [ ] P49 manual checks M1–M4 (branded browsers/phones, real tab switching, hand isolation, revocation) — blocked: physical devices and owner-approved membership change.

## v9 consolidated review bundle

- [x] Apply v8 TSX files (intake note, report attestation anchor) byte-identically.
- [x] Stored observations: Observation vs Ground Medical status columns, select-all-eligible, counters, Save selected approvals, per-row Attest/Revoke with reason, confirmation and audit history; per-record partial-failure reporting.
- [x] Append-only Edit/Save correction (Ground Medical only, exact catalog metric/unit, deterministic IDs, recoverable two-step write with Complete correction); Mark erroneous kept separate; report and domain views refresh automatically.
- [x] Explicit metadata-only cloud review sync with counts, retry and fail-closed "migration required"; deterministic append-only merge.
- [x] Pending migration + rollback + operator guide; disposable-PostgreSQL verifier 38/38 PASS.
- [ ] Apply `supabase/pending/20261101000000_v9_review_sync.sql` — blocked: owner approval.
- [x] Searchable text-based Download PDF (executive summary, separated sections, repeated headers, appendices); 90/360-row stress verified in browser; Print separate.
- [ ] Branded Chrome/Edge/Safari and physical-device PDF checks — blocked: real devices.

## P36 Global Scientific Researcher access

- [x] Inspected: no existing global reviewer capability; the 12- and 197-term cloud submissions are in MITO_DEMO_2026 (Alex Morgan), while the Researcher account is a member only of FV01 Security Test B.
- [x] Pending SQL + rollback + single-statement demo authorization prepared; disposable PostgreSQL verifier 105/105 PASS.
- [x] Scientific Review mission combo box and grouped read-only view; fails closed until the database change is installed.
- [x] Owner-approved schema installed byte-identically as migration 0021; demo reviewer grant and synthetic-only sharing for MITO_DEMO_2026 applied and audited.
- [x] Authenticated Researcher readback in Preview: 12 + 197 = 209 pending terms; dashboard, crew picker, search/filters/sort/pagination and per-term detail verified; unshared mission and direct table reads denied.
- [x] Triage database change, rollback and one-line Researcher grant staged; throwaway-database verifier 84/84 PASS (incl. true concurrent writes).
- [x] Triage form, history and separate triage/scientific counts in the review screen; fails closed until installed.
- [x] Synthetic lifecycle test: unknown → accepted → approved extension → recognized in a later intake; unit/context/ambiguity/revocation safeguards.
- [ ] Apply `supabase/pending/20261107040000_p36_global_triage.sql`, then `20261107040001_p36_global_triage_demo.authorize.sql` — blocked: explicit owner approval.
- [ ] Bridge from cloud scientific approval to a code-reviewed catalog-extensions entry; support new (non-alias) metrics; pass method/specimen from intake — blocked: owner design decision and scientific authorization (closed).

## P39 Permanent source-aware biomarker classification

- [x] Reusable section classifier for PDF, CSV, XLSX and text (exact label + unit + whole-heading section, page/line/row provenance, conflicts never guessed).
- [x] Value-free evidence registry for the cited synthetic report (SHA-256 bound; 364 rows across 4 sections, matching the declared counts).
- [x] Researcher screen: 115 high-confidence proposals (70 cardiovascular, 45 immune) with one explicit acceptance; Hydration intake and Sedentary time stay manual.
- [x] Later examinations: section-aware recognition; a conflicting section stays review-only; offline signed catalog unchanged.
- [x] 30 regression tests; 67 active entries preserved; no decisions, activations or production changes.
- [ ] Record the 115 demo decisions, then Ground Medical activation — blocked: the Researcher's and Ground Medical member's own actions in Preview.
- [ ] P1NP / CTX identity conflicts and the 17 ambiguous-unit terms — blocked: scientific choice and the 12-term submission's source documents.

## P40 Traceable biomarker interpretation lifecycle

- [x] Versioned interpretation registry (416 records) generated reproducibly from hash-pinned Bone/Cardiovascular handbooks, the Immune/Behavioral domain catalog and the 186 activated synthetic demo entries; 0 approvals.
- [x] Researcher review screen on Scientific Review: per-entry edit, cite, draft, approve, revoke; automatic review tasks for new activations; approval package download; no bulk approval.
- [x] One verified snapshot drives module pages, Medical Report screen, PDF and TXT (status, citations, uncertainty, alerts); synthetic demo approvals never counted as validation.
- [x] 20 P40 tests; full suite 1,348 pass; lint 0 errors.
- [ ] Researcher writes the first interpretations — blocked: Nikolas's own review with real citations.
- [ ] Merge the first approval package into the shared registry — blocked: owner review of the downloaded package.

## P41 Dynamic scientific interpretation

- [x] Server-attested Researcher approvals/revocations (unattested device decisions shown as awaiting attestation, never applied or merged); draft rejection with reason.
- [x] Live literature retrieval (PubMed, NASA NTRS, Crossref) with retries, rate limits, cache, provenance and inspection level; concept-only privacy guard.
- [x] Evidence-aware AI drafts: verbatim-excerpt check, fabricated citations unresolved, threshold/diagnostic/causal/value-judgement wording rejected; loaded into the editor only by the Researcher.
- [x] Preflight inventory of the 416 records, resumable batch drafting (no batch approval), unknown-biomarker research candidates.
- [x] Examination-to-examination comparison (absolute and % change, repeats, precision, comparability) on screen, PDF and TXT; neutral display.
- [x] 28 P41 tests incl. synthetic end-to-end and offline rebuild.
- [ ] Researcher's first real review and approval — blocked: Nikolas's own review in Preview.
- [ ] Publish so the published app gets attestation and literature functions — blocked: owner decision.

## P41.1 Literature relevance and evidence safety

- [x] Reproduced the G-CSF failure live (10 references incl. atmospheric moisture, cosmic-ray electrons, intracranial CSF model, embryo transfer); stored verbatim as a test fixture.
- [x] No automatic reference selection; per-reference relevance (Relevant / Potentially relevant — manual review / Irrelevant / Insufficient information) with source-quoting reasons, shown apart from bibliographic existence and claim support.
- [x] Same gate in single drafts, 5/25 batch and the server; irrelevant sources never reach the AI; no usable source → "Insufficient relevant scientific evidence" and no AI call.
- [x] 15 P41.1 regression tests; approval still needs Researcher appraisal and server attestation.
- [ ] Nikolas's signed-in check of the updated panel — blocked: his Researcher session.

## P42 Universal medical document intelligence

- [x] Root cause found: numbered 4-column tables without per-row dates matched no parser; 200-row cap; "1,400" read as 1.4.
- [x] Header-role table reconstruction (any column order, English/Greek, multi-page, repeated headers, wrapped rows, OCR token fallback) with safe value normalization.
- [x] Alex Morgan PDF: 328/328 rows, 54/94/81/99 per section, page/row provenance, repeats kept; real OCR output fixture shows OCR limits.
- [x] Processing summary, actionable diagnostics, identity check (Ground Medical resolution), reviewer-applied examination time, filters, reject, bulk selection limited to safely matched rows, safe retry and interrupted-save recovery.
- [ ] "IMMUNE MONITORING" heading → Immune domain — blocked: governed P39 heading-rules update (sealed evidence uses v1).
- [ ] Bone unit-review rows (97) and 175 unknown terms — blocked: scientific decisions by the Researcher.

## P54 Unified astronaut health assessment

- [x] Per-biomarker status, previous comparable result, neutral change, interpretation, evidence and limitations on screen, PDF and TXT from one read model.
- [x] RED/AMBER/NORMAL only from verified exact-ID/unit/domain references or approved adverse rules; otherwise NEUTRAL with a reason; icon + text + colour.
- [x] Offline preliminary assessment; optional AI draft (Ground Medical, synthetic, default-off flag) with session-only clinician review.
- [x] P38 bulk workflow reused: counts, per-item results, failed-item reselection, link from Global Scientific Review.
- [ ] First verified reference intervals — blocked: independent verification evidence.
- [ ] Turn on AI preliminary assessment — blocked: owner decision on the server flag.
- [ ] Signed-in Ground Medical and Researcher checks of the new controls — blocked: their sessions.

## P38 bulk Researcher section on Scientific Review

- [x] Anchored "Bulk Synthetic Demo Researcher Decisions" section and jump link on /mission/scientific-review, wrapping the existing P38 component for the selected authorized synthetic mission; full interface only with the Researcher capability and demo scope.
- [x] Reachability/visibility regression test; Researcher browser check (no decisions recorded).

## P55 Unified Researcher & Ground Medical bulk selection

- [x] Shared pure selection engine (stable IDs, Select All Filtered across pages, page, deselect, hidden-selection scope, counts, preflight, per-record outcomes, retry failed only).
- [x] Researcher: any-category selection in Global Scientific Review and P38; bulk accept for review, bulk evidence/unit clarification (existing triage RPC, server-side deterministic idempotency), synthetic demo decisions, session-only existing-match acknowledgement.
- [x] Ground Medical: domain + status filters, any-category selection, preflight, activation of eligible only, clarification note, already-active view, Researcher decision identity.
- [x] Tests, full checks, browser check of both roles without writes.

## P56 Concise longitudinal health assessment report

- [x] Pure assessment model over existing report read models: date-range first/last changes, trend direction, cross-domain pattern library (exact IDs), validated-only severity, finding-specific recommendations, "Why this conclusion?" evidence, identity from selected crew only.
- [x] Automatic analysis on report generation; existing authorized AI path used only within its scope, deterministic fallback otherwise.
- [x] Redesigned screen (2–4 page structure) with optional technical appendix; concise PDF (default) plus separate technical appendix PDF; prohibited name removed from exported text.
- [x] Tests, full checks, PDF render inspection, browser check.

## P56.1 Clinical interpretation, review prioritization and compact PDF

- [x] Root-cause audit of missing verified reference criteria (registry, handbooks, matrix, demo catalog, P41 records, source PDF).
- [x] Full longitudinal profile per series (first/last/min/max, peaks, troughs, reversals, intervals) and HbA1c plausibility.
- [x] Auditable review-priority rules (pending scientific review), separate from RED/AMBER/NORMAL/NEUTRAL; red text for validated adverse findings.
- [x] Cross-marker reasoning, finding-specific recommendations, single methodology note, missing-evidence provenance.
- [x] Compact PDF (≤4 pages, single-day without charts); screen and TXT parity.
- [x] Regression tests (Scenario A single-day, Scenario B multi-day), full checks, PDF visual and browser verification.
- [ ] Owner/scientific review of the review-triage rule values (50% change, 10% electrolyte change, 50% intermediate extreme, HbA1c 28-day interval) — waits on the owner.
- [ ] Verified reference intervals (registry still empty) — waits on independently verified sources.

## P57/P58 Scientific evidence registry, clinical reasoning and adaptive professional report

- [x] P57 versioned reference-criteria registry from verified source wording (ADA 2026 §2, NIDDK, NHLBI, KDIGO 2024, CDC/AHA hs-CRP); distinct criterion kinds; all pending Researcher review.
- [x] Researcher review queue (bulk by domain, individual exceptions, evidence preview, server-attested append-only decisions, mission applicability).
- [x] Evidence-aware classification: approved + fully applicable criteria only; exact units; data-quality holds; synthetic-demo separation.
- [x] P58 Preliminary Clinical Assessment — Pending Ground Medical Review (deterministic concern library; AI elaboration in the existing authorized scope; GM accept/amend/reject/add; separate audit records).
- [x] Evidence gaps listed in the report evidence trail with the Evidence ID; retrieval stays in the existing Researcher literature tool, never auto-promoted to rules.
- [x] Adaptive professional colour PDF (no page cap) with mandatory charts and single-measurement visuals; screen/TXT parity.
- [x] Preview-only reproducible sample PDF generated (existing competition sample untouched).
- [x] Regression tests, full checks, visual inspection of every PDF page, browser verification.
- [ ] Researcher approval of any P57 criterion — waits on the Researcher (none approved; nothing is coloured).
- [ ] Scientific review of the P58 concern-library text and P56.1 triage values — waits on the owner/Researcher.
- [ ] Replacing the published competition sample PDF — waits on owner approval.

## P59 Premium Health Intelligence Report (Revision 2)

- [x] Add the package files unchanged; fix only genuine type errors.
- [x] Owner-directed synthetic demonstration: provisional literature mode on by default for synthetic reports (clear label), off/absent for real data.
- [x] Re-verified synthetic identity mappings (exact + criterion-scoped) used only in the synthetic demonstration, with provenance.
- [x] Five warning categories (red high-priority review, amber monitoring, purple data check, green, neutral) kept separate from clinical class, with documented priority rationale.
- [x] Premium export button + demonstration checkbox in the Medical Report; P58 export kept ("Previous-format PDF").
- [x] AI claim guard added to P58 AI validation.
- [x] Read-only identity census: readable Cloud records hold only October values; the November exam PDF has no catalog IDs — owner-local records remain uncensused.
- [x] Real jsPDF tests and rendered PDFs (Alex full, small normal, complex abnormal, provisional off) inspected page by page.
- [x] Alex Morgan premium PDF (test reconstruction) delivered; browser export verified.
- [ ] Researcher review of provisional criteria, mappings and WP-1..WP-5 priority rules — waits on the Researcher.
- [ ] Small-normal report is 6 pages vs package target of 5 — owner decision whether to tighten.

## P60 Premium Report Upgrade (package applied as-is)

- [x] Baseline matched P59 exactly; patch applied (14 files, all checksums match).
- [x] Typecheck, lint, full suite, targeted suites, build, real-font PDF renders and geometry check.
- [x] UI: demonstration checkbox only for synthetic; census identical with demonstration on/off.
- [x] Results-table "HIGH" review flag vs pattern "MONITORING" wording; purple "5 further findings" panel; chart caption/badge details — corrected in P60.1 (owner-approved).
- [ ] Census of the owner's stored November records vs fixture digest — needs the owner's own device.
- [ ] Researcher review of the P60 pattern library; owner approval of visual baselines; census TXT button decision.

## P60.1 Priority consistency, readability and production release (owner-authorized)

- [x] One medical-review priority per result shared by page 1, charts, assessments and the results table; TREND REVIEW and observation-level CHECK separate; pattern-level DATA CHECK marked † without becoming a measurement error.
- [x] Mixed page-1 overflow panel neutral; chart title/badge spacing, band captions, non-negative axes, untruncated map cards, page-1 cards, overview answers and footer; body-system tiles kept together.
- [x] 25 regression tests; full suite, typecheck, lint, security audit, project checks, build, real-font renders (Alex on/off, small normal, complex, missing context, large) and geometry check.
- [x] Signed-in Ground Medical browser export (demonstration on/off, real) — empty test-browser store only.
- [ ] Publish verified build and check the live site.
- [ ] Static public sample PDF still shows the earlier P60 labels; replacement needs owner approval.

## P61 Automated multi-date bulk import (Preview only)

- [x] Per-row examination dates from row dates, date columns and examination headings; ambiguity/conflict exception queue; consolidated preview, reconciliation and bulk confirmation; source-aware duplicate blocking; P60 report integration (synthetic reconstructed fixture: 304 observations, 38 series, 8 dates).
- [x] P61 final acceptance with the owner-supplied PDF and CSV (exact bytes pinned by tests): 304/304 rows, 8 dates, identical tuples, 200 matched / 104 unresolved.
- [x] P61.2: five exact-unit synthetic aliases (pending Researcher review), CSV context kept as unverified provenance, P60 wording/date/chart-label corrections, deterministic PDF/CSV ordering; owner fixtures now 240 accepted / 64 unresolved (8 series).
- [ ] Researcher decision on the 8 still-unresolved series (Bicarbonate, Chloride, BUN: no catalog entry; Body temperature "deg C" vs "°C" and Platelets "10^9/L" vs catalog "10⁹/L" / demo "10^3/μL": unit notation; Creatinine: specimen; Sleep duration: definition; HRV SDNN: governed alias needed) and review of the five P61.2 aliases.
- [ ] Owner approval of P61/P61.2 before publishing.

## P61.3 Final scientific mapping and report quality (Preview only)

- [x] Typographic unit-notation rules (synthetic only, closed list) with original unit preserved; decision register for the 8 unresolved series + 5 provisional aliases, shown in the import queue and Scientific Review.
- [x] "Associated with HIGH PRIORITY pattern" for results whose own class is not RED.
- [x] Full crew name in the running page header for short and long names.
- [x] P61.3 regression tests; full suite, typecheck, lint, format, security, build.
- [x] Owner-file acceptance (PDF + CSV) in tests and signed-in browser; P60 report rendered and every page inspected.
- [ ] Researcher decisions on the 7 held names, the 5 aliases and the UN-1 notation rule (blocked: Researcher).
- [x] Owner production-release authorization received (P61.3 FINAL PRODUCTION RELEASE).
- [x] Release gates re-run, safety gates, published 2026-11-11, production smoke tests (read-only).
- [ ] Owner's manual Alex Morgan PDF acceptance on production (blocked: owner).

## P61.4 Scientific mapping governance & exception recovery (Preview only)

- [x] Architecture/gap assessment of P613 register, P36/P37/P38 lifecycle, P61 import and duplicate detection.
- [x] Pure mapping-governance module: per-proposal safeguards, closed definitions, decision preflight (approve/reject/request evidence/defer) and live governance stage over the existing triage + synthetic demo lifecycle.
- [x] Scientific Review: actionable Researcher workflow routed only through existing triage and synthetic demo decision RPCs; aliases + UN-1 exposed read-only; history.
- [x] Import exception queue: why held, missing evidence, status, next role, link to Scientific Review; newly-eligible recovery count.
- [x] Two-day reconstructed fixture + tests (seven categories, unverified notes, roles, pending/rejected/inactive held, active eligible, real-mode isolation, 62 duplicates, no auto-save, dates, append-only).
- [x] Full checklist and signed-in Preview browser acceptance; no publishing.
- [x] Owner's original two-day PDF acceptance (SHA-256 27d75069…d02a; automated test + Preview: 76/38/2, 62/14/0, re-import 62 duplicates).
- [ ] Live mapping chain per name: Ground Medical P36 submission → owner demo-scope authorization → Researcher decision → Ground Medical activation (blocked: owner/Researcher).
- [x] Owner-authorized publication of revision 7f8e666 (2026-11-11 ~21:56 UTC); read-only live smoke checks passed.

## P61.5 Simplified Researcher biomarker authorization (Preview only)

- [x] Pending SQL (supabase/pending/20261112000000_p615_researcher_demo_scope.sql + rollback): Researcher scope authorization, alias decide/activate/revoke, identity guard, governance + alias snapshot reads.
- [x] Server functions, signed snapshot with aliases, device recognition of activated aliases (exact unit only).
- [x] Scientific Review: Authorize for Synthetic Demo (row + bulk), possible existing biomarker surfacing, identity review dialog; Ground console alias activation panel.
- [x] Tests (31 unit, 157 disposable PostgreSQL assertions), full suite, typecheck, lint, format, security, build; signed-in Researcher browser check (read-only).
- [ ] Apply the pending SQL to the backend (blocked: owner approval of the exact file).
- [ ] Identity/alias review of the 3 flagged Bone terms, then decisions/activation (blocked: Researcher/Ground Medical, after the SQL is applied).

## P62 Observation sync repair and evaluator demo prep

- [x] Root cause: sync input check lacked catalogBasis; fixed with strict exact-key schema, specific reasons, accurate Failed counts.
- [x] Regression tests, full suite, typecheck, lint, format, security, build.
- [x] Read-only MITO_DEMO_2026 inventory, cleanup design, walkthrough (docs/P62_OBSERVATION_SYNC_AND_DEMO_PREPARATION.md).
- [ ] Publish the fix (blocked: owner authorization).
- [ ] Sync the 192 device observations (blocked: publication + owner authorization of the Cloud write).
- [ ] Evaluator crew record and rehearsal (blocked: owner choice and approval).
