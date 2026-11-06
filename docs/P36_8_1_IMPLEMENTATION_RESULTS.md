# P36.8.1 implementation and verification

## Delivered

Date-only observations use `mitochondria.unified-observation.v2` with explicit `datePrecision: "date"`. Their `observedAt` remains the exact ISO calendar date, not UTC midnight. Existing v1 zoned observations remain readable and are not rewritten. Recording/audit timestamps remain real instants; date-only offline transport ordering uses `recordedAt`, independently of the observation date.

CSV, first-sheet XLSX ISO text cells, plain JSON, supported FHIR effective dates and PDF/text laboratory rows feed the same review workflow. Explicit timestamps take precedence over separate collection dates, and separate source collection dates are retained. Impossible dates fail validation; Excel serial dates, locale-date interpretation, time and unit conversions are not introduced.

Selection uses the current P36/existing governed-extension match, exact unit, finite numeric value and a valid date or instant. Missing time alone does not exclude a date-only row. Select All selects eligible rows only. Source rows explicitly marked `Unvalidated` stay in Unknown Biomarker Review with a source-validation reason, even if their catalog ID/unit match. Source flags cannot be removed by editing the value, unit or date.

The same precision travels through encrypted local storage, duplicate identity, append-only correction, encrypted cloud payload validation/import, canonical domain projections, scientific evidence, Companion, Medical Report, searchable PDF and TXT. Calendar-date filtering does not invent instants; exact intraday report boundaries exclude untimed records. Mixed precision and repeated same-date readings do not authorize ordered physiological first/last comparisons. Calendar charts use ordinal positions when precision is mixed/date-only, not elapsed-time spacing.

Scientific catalogs, approvals and the governed extension registry are unchanged. Documentation and Nikolas's pending handbooks/reconciliation dossiers do not activate mappings. The current P36 registry audit finds 96 exact-unit Cardiovascular mappings and 63 review-only entries; no current Bone/Immune/Behavioral intake eligibility was fabricated. All four report/projection domains support date-only envelopes, but this does not create missing approved intake mappings.

## Verification actually performed

- Focused intake/storage/sync/correction/report tests: 131 passed before additional date-only regressions; new date-only plus sync files: 36 passed. Final complete suite: **1,136 passed, 0 failed, 184 files**, 12,357 assertions.
- Every permitted step of the project's check script passed, including project/science/security verifiers, full tests, lint and formatting. Lint: **0 errors, 12 existing warnings**. Security boundary audit: PASS.
- Automatic managed compilation/type diagnostics ended with **build OK**. `bun run check` was not executed literally because it includes manual typecheck/production-build commands prohibited by the platform. Standalone production build and exact-synchronized-commit CI are **not verified**; they must not be inferred from preview compilation.
- Dependency audit reports **5 findings: 4 moderate, 1 low**, in esbuild, minimatch and qs transitive paths. No dependency changes were made. Boundary-audit PASS is not a clean dependency audit.
- Existing observation-sync SQL tested on an isolated local PostgreSQL service: **45 scenarios passed**, plus refusal-to-rollback-with-data and clean rollback, preserving v9 review objects. Timestamped and date-only real-SQL/server-crypto two-device tests both passed: unchanged observation envelopes, ciphertext-only storage, exact Ground Medical fingerprint reconciliation, idempotent retries and independent SQL Researcher denial. These are disposable-service tests, not live cross-browser acceptance.
- Signed-in owner browser `/mission/intake`, desktop 1280×1800 and mobile 375×812: imported five synthetic CSV rows; **2 eligible, 3 review-only, 0 missing dates, 0 invalid dates**, Select All selected exactly 2. The source `2026-11-05` date and `2026-11-05T08:17:23+02:00` timestamp remained literal. The real account had **no authorized intake crew options**, so genuine scoped saving was not tested.
- Separate isolated Chromium browser, external service calls blocked, explicitly synthetic identity adapter: generated representative **11-page substitute PDF**, not the original NASA report. **22 extracted candidates, 22 catalog matches, 11 eligible, 11 held/review-only because the source said Unvalidated, 0 missing/invalid dates**. Unsupported noncandidate content is not classified as an observation; original-report skipped/rejected counts are unavailable.
- Substitute browser import initially had **0 stored observations**. Only an explicit Select All, human confirmation and Save created 11 encrypted local observations; reload read them back with exact dates, precision, source excerpts and SHA-256 file fingerprint. No automatic saving, attestation or sync occurred. The 11 held rows were never saved. Browser contexts were discarded afterward; no production records were changed.
- Actual Medical Report Download PDF and TXT buttons downloaded correctly named files from those isolated local observations. PDF: **8 A4 pages**, searchable text verified by extraction; dates and uncertainty survived, no invented `T00:00:00` collection timestamps. First-page visual inspection passed. A 90-row date-only searchable multipage PDF regression and existing 90/360 timestamp stress tests passed. Desktop/mobile saved rows showed literal dates without timezone shift under America/Los_Angeles; no horizontal page overflow or page exceptions.

## Blockers and limitations

1. `NASA_Astronaut_Simulated_Medical_Report.pdf` is absent from the project, mounted uploads and uploaded ZIP entries. Its exact extracted/classified/eligible/held/rejected/skipped counts and actual-report browser acceptance remain **NOT TESTED**. Attach the original PDF; the substitute does not satisfy this gate.
2. The requesting account has no authorized Crew Self/Ground Medical intake crew scope. Real authorized local saving and two-live-browser observation/review sync remain **NOT TESTED**. No permanent live test rows were created.
3. Bone, Immune and Behavioral intake mappings remain blocked by existing catalog/unit/scientific governance gaps, not by missing time. Qualified independent scientific approval and a separate governed activation patch are required; this task did not approve them.
4. Full standalone typecheck/production-build and exact-commit hosted CI remain unavailable under platform execution constraints. No publication, deployment, live migration, key/flag change, live sync or production data modification occurred.
5. Existing server-side rather than end-to-end encryption, key-rotation/retry fingerprint conflicts, legacy plaintext cloud records and the separate Bone legacy upload path remain unchanged and are not claimed resolved.

## Database and compatibility

No new SQL migration is needed: the existing v9.4 table stores ciphertext, IV, keyed fingerprint and scoped event identifiers; it has no observation-date column or payload-date SQL constraint. Existing SQL and rollback files remain unchanged. The separate timestamp-based mission index never receives date-only Unified Intake records because the legacy plaintext queue block remains intact.

Older deployed clients may reject v2 envelopes until an explicitly approved publication updates them. They must never coerce dates to v1 midnight timestamps. No live application update was published here.

## Source-patch deviations

The ZIP explicitly supplied a partial metadata-only patch. Its supplied test was copied byte-identically. The parser/workspace source changes were integrated and expanded as the binding contract required, rather than described as byte-identical complete replacements. Calendar validation uses arithmetic instead of `new Date(dateOnly)`. Additional consumers and regression tests were necessarily changed for end-to-end precision support. The root contract is documented here rather than copied as a second standalone root contract.

## Exact changed files

- `AGENTS.md`
- `roadmap.md`
- `src/domain/health-intelligence/AGENTS.md`
- `src/domain/health-intelligence/observation-date.ts` (new)
- `src/domain/health-intelligence/observation-envelope.ts`
- `src/domain/health-intelligence/observation-store.ts`
- `src/domain/health-intelligence/universal-intake-parser.ts`
- `src/domain/health-intelligence/universal-intake-adapters.ts`
- `src/domain/health-intelligence/intake-review-selection.ts`
- `src/domain/health-intelligence/observation-sync.ts`
- `src/lib/observation-sync.functions.ts`
- `src/domain/health-intelligence/stored-observation-review.ts`
- `src/domain/health-intelligence/canonical-projection.ts`
- `src/domain/health-intelligence/live-evidence.ts`
- `src/domain/health-intelligence/unified-health-report.ts`
- `src/domain/health-intelligence/health-history-report.ts`
- `src/domain/health-intelligence/scientific-findings.ts`
- `src/domain/health-intelligence/researcher-interpretation.ts`
- `src/domain/health-intelligence/report-text-pdf.ts`
- `src/domain/health-intelligence/unknown-biomarker-review.ts`
- `src/domain/companion/daily-companion.ts`
- `src/components/unified-intake-workspace.tsx`
- `src/components/stored-observations-review.tsx`
- `src/components/domain-evidence-panel.tsx`
- `src/components/astronaut-daily-health-companion.tsx`
- `src/components/astronaut-health-report.tsx`
- `src/components/researcher-interpretation-view.tsx`
- `src/components/unknown-biomarker-review-panel.tsx`
- `tests/domain/p367-five-column-pdf.test.ts`
- `tests/domain/p367-pdf-source-fidelity.test.ts`
- `tests/domain/universal-intake-adapters.test.ts`
- `tests/domain/intake-review-selection.test.ts`
- `tests/domain/observation-sync.test.ts`
- `tests/domain/p3681-date-only.test.ts` (new)
- `scripts/verify-v94-observation-sync-e2e-pg.ts` (optional disposable date-only mode)
- `docs/P36_8_1_IMPLEMENTATION_RESULTS.md` (new)

Project memory records the new calendar-date requirement separately. Generated ignored release samples and temporary browser/SQL files are verification artifacts, not source deliveries.
