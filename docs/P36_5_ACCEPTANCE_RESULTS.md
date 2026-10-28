# P36.5 Report Export Results

## Implemented

- Cover and evidence TXT use authorized membership mission/astronaut display names; immutable mission/crew IDs remain explicit. Blank names fall back to identifiers or “Crew identity unavailable”, never an inferred person.
- Download PDF produces actual A4 PDF bytes locally, named exactly `${reportExportBasename(identity)}.pdf`; TXT uses the same basename. Print remains separate with a best-effort title hint.
- Existing print CSS, sections, tables, colors, evidence, exclusions and limitations are captured in an isolated browser clone. Item-boundary pagination avoids splitting fitting rows. No medical-data upload, history write, AI call or persistence is introduced.
- Export rechecks the signed-in account and exact mission/crew role before action and again after PDF rendering; account/scope/filter changes cancel delivery.
- The supplied identity helper and contract are byte-identical. The supplied component was extended, rather than replaced blindly, to fulfill its explicitly missing PDF implementation, add TXT identity content, delayed Blob cleanup and authorization checks. Additional helper, regression tests, dependencies and acceptance documentation complete the requested contract.

## Actual verification

- Full suite: **794 tests pass**, 0 fail, 10,286 assertions, 155 files. Five new filename/fallback/pagination tests pass.
- Lint: **0 errors / 12 existing warnings**. Security boundary audit: **PASS**.
- Dependency audit: **2 moderate / 1 low** existing esbuild/qs advisories; no finding names either new PDF dependency.
- Latest automatic compiler signal after corrections: **build OK**, `2026-10-28T18:44:45Z`. Full exact-revision GitHub typecheck/production-build attestation is unavailable; no manual build/typecheck was run under platform constraints.
- Existing desktop keyboard/mobile pointer Medical Report navigation passed. Actual Download PDF and Export evidence text clicks passed in bundled Chromium at 1280px and 390px.
- Each actual downloaded PDF is **4,243,707 bytes**, starts `%PDF-`, contains **15 A4 pages** (595.28 × 841.89 points). Exact filename: `MITOCHONDRIA_SYNTHETIC_P29_Synthetic_display_fixture_Unified_Health_Report_SYNTHETIC_2026-10-28.pdf`.
- TXT: **33,325 characters**, same basename, authorized synthetic names and IDs, all 60 long fixture IDs and exclusion evidence retained.
- All 15 downloaded desktop/mobile page images are pixel-identical. First, second and last pages inspected; OCR across all downloaded pages confirms identity, all four domains, units, exclusions, intake and limitations. Existing native print PDFs still retain 64 records / 4 exclusions / 60 long IDs, Greek labels and precise timestamps inside page bounds.
- Blank-name fallback and exclusion of a mission-operator-only fixture scope passed. No runtime page errors occurred.
- A genuine session for the requesting account was restored through the configured sign-in service: **zero authorized crew options**. Report export controls correctly remain absent. Populated download checks used clearly synthetic memory-only identity/history adapters, not genuine authorized crew persistence.

## Remaining acceptance limits

- Installed browser is bundled Chromium, **not branded Chrome or Edge**; both branded launch attempts report missing distributions. Their native download acceptance remains unverified.
- Requesting account lacks Crew Self/Ground Medical crew-scoped membership; actual authorized crew-name/populated encrypted-history download acceptance is blocked. No memberships were created or changed.
- Downloaded PDFs preserve visual content as rasterized pages, not selectable/searchable text or tagged accessible PDF. Native Print retains the existing selectable-text output. Table headers are captured once, not repeated automatically across image pages. A report exceeding the local capture bound or containing a single over-page item fails with a visible message rather than silently clipping; Print remains available.
- Full formatting check reports three pre-existing unformatted documents: P34_REAL_PDF_REGRESSION, P36_3_AUTOMATIC_DATE_PROPAGATION and P36_IMPLEMENTATION_CONTRACT. They were not rewritten as part of this export-only change.
- No database migrations, RLS, AI settings, release-gate changes or publishing. P3663/P3664/P20 remain unchanged.

## Changed files

- `src/components/astronaut-health-report.tsx`
- `src/domain/health-intelligence/report-export-identity.ts`
- `src/domain/health-intelligence/report-pdf.ts`
- `tests/domain/p365-report-export.test.ts`
- `tests/navigation/p365-report-export.browser.py`
- `docs/P36_5_MISSION_ASTRONAUT_REPORT_EXPORT.md`
- `docs/P36_5_ACCEPTANCE_RESULTS.md`
- `package.json`, `bun.lock`, `AGENTS.md`, `roadmap.md`

Browser artifacts remain in `/tmp/browser/p365`; they are synthetic test evidence, not visitor download links. Repeat the stored browser regression with `python3 tests/navigation/p365-report-export.browser.py` after a requesting-account test session is available.