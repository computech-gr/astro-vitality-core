# P36.7 PDF intake candidate extraction results

## Scope and exact changed files

- `src/components/unified-intake-workspace.tsx`: supplied replacement applied byte-identically. Adds five-column candidates to the existing review path and retains document name/SHA-256 on each incoming row.
- `src/domain/health-intelligence/universal-intake-parser.ts`: supplied recognizer integrated with the minimal corrections below.
- `tests/domain/p367-five-column-pdf.test.ts`: supplied three assertions retained; runner import changed from Vitest to the project's Bun test runner.
- `tests/domain/p367-pdf-source-fidelity.test.ts`: five additional safety/geometry regressions.
- `src/domain/health-intelligence/AGENTS.md`: records the parser's source-fidelity boundary.
- `roadmap.md`: records completion and acceptance blockers.
- `docs/P36_7_PDF_INTAKE_RESULTS.md`: this report.

No catalog, scientific source, database, sync, authorization, stored record, Health Report or PDF export code was changed. No publication, deployment, migration or automatic approval occurred.

## Reproduction and deviations

The previous parser returned zero candidates for a five-column date-only table. The supplied patch also returned zero when given ` | ` separators emitted by the existing PDF geometry serializer. The shared geometry reconstruction/serializer was preserved; the new recognizer accepts its existing pipe separators alongside tabs and multiple spaces.

The supplied digit-led `25(OH) Vitamin D` regression failed because the patch required names to begin with a letter. Names may now begin with a digit but must contain a letter. This permits the supplied laboratory name without loosening extraction to unrestricted clinical prose.

The patch converted decimal commas to points. Candidate values now retain the exact reported text; numeric validation does not rewrite them. Comma-valued rows still encounter the existing strict save-eligibility rules. Newly edited parser code removes non-null assertions without changing existing CSV/timestamp semantics.

The README was read as patch instructions rather than copied into the app. The shared PDF geometry file was not modified.

## Verification

- Focused parser, geometry and review-selection tests: **31 passed, 0 failed**.
- Complete test suite: **1123 passed, 0 failed**, 183 files, 11459 assertions.
- Security boundary audit, lint, formatting and every non-build/non-typecheck step from the existing project check chain passed. Lint: **0 errors, 12 existing warnings**.
- Initial full-suite failures were caused by the absent ignored deterministic release sample. Running the existing `sample:release` generator restored its sealed bytes; the same suite then passed without weakening assertions or changing evidence gates.
- Latest managed preview compilation reported **build OK**.
- The exact `bun run check` command, standalone typecheck and production build were **not executed**: platform instructions prohibit manually running project builds/typechecks. The check chain was executed with only those two steps omitted. This is not a claim of full production-build/typecheck or exact-commit CI validation.

## Browser PDF verification and limitations

The requested `NASA_Astronaut_Simulated_Medical_Report.pdf` is absent from project files, uploads and uploaded ZIP contents. The P36.7 archive contains only three source/test files plus its README. **Actual-report acceptance remains blocked; no original-report counts can be reported.**

A clearly labelled representative 11-page synthetic PDF, created only under `/tmp/browser/p367`, was selected through `/mission/intake` in bundled Chromium. No PDF, geometry, extraction or classification response was mocked. The same PDF reader reported 11 pages. Desktop 1280px and mobile 375px had no page overflow or runtime errors; the existing review table scrolls horizontally on mobile.

Representative-fixture results (not the NASA report):

| Category | Count | Reason |
| --- | ---: | --- |
| Extracted/classified candidates | 22 | Two finite laboratory results per page |
| Catalog matched | 11 | Heart rate with exact `bpm` unit |
| Unit review required | 11 | Vitamin D with literal ambiguous `ng/mL or nmol/L` |
| Eligible to select/save | 0 | All observation timestamps blank |
| Held/excluded from save | 22 | Missing full observation timestamp; 11 also need unit review |
| Non-numeric rows rejected/skipped | 11 | PTH result `--`, no finite measurement |

Categories overlap: matched and unit-review rows partition the 22 candidates; all 22 are held from saving. The 11 non-numeric rows are fixture-known counts, not new UI diagnostics.

All candidates stayed unchecked, all observation date fields stayed blank, source excerpts contained the reported label and unit, and Save remained disabled. No observation-sync, review-write or document-AI request occurred; no save/attest/approve action was invoked. The signed-in requesting account had no eligible intake mission/crew selection, so authorized persistence was not exercised or claimed. Units containing Greek ambiguity and decimal commas were additionally verified in focused tests, not the ASCII browser fixture.

## Outstanding acceptance prerequisites

1. Supply the original 11-page NASA report to measure actual candidates, classification/holding reasons, rejected/skipped rows and source fidelity.
2. Repeat desktop/mobile intake against that original PDF without saving or approving any row.
3. Obtain managed full typecheck/production-build and exact-commit CI evidence; those cannot be inferred from unit tests or preview compilation.

No scientific approval, catalog activation or physical-device offline OCR readiness is asserted.