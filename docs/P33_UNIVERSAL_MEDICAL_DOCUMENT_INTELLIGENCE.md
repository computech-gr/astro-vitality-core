# P33 — Universal Medical Document Intelligence: Completion Report

Date: 2026-10-25 (UTC). Scope: offline-first, shared by Bone, Immune,
Cardiovascular and Behavioral Health. No migrations, RLS, AI, scientific
approval, release-gate or publishing changes were made.

## Implemented capabilities

- **PDF.js text-geometry engine** (`src/domain/bone-health/pdf-geometry.ts`):
  groups text items into lines by y-position with font-size-scaled tolerance,
  chains vertically-centered wrapped row fragments into one logical row,
  rejoins wrapped words with spaces, and splits cells on horizontal gaps so
  table columns survive without relying on reading order.
- **Header-aware table interpretation**
  (`src/domain/bone-health/universal-document-rows.ts`): recognizes English and
  Greek header labels (result/value, unit, analyte, ID, date, specimen,
  reference), maps columns by header position so reordered columns parse
  correctly, and ends the table at prose/footers instead of holding them.
- **Catalog-aware analyte matching**: exact catalog ID anchors a row; the
  analyte cell must exactly equal or contain the catalog name (exact match at
  any length, so `HR` works; substring matching only for longer labels).
  Mismatches are held for manual review — never silently mapped.
- **Unit validation without conversion**: cardiovascular rows whose reported
  unit differs from the catalog-defined unit are held with an explicit reason.
  Bone/Immune/Behavioral have no approved unit bindings, so their units are
  recorded exactly as reported.
- **Strict dates**: ISO 8601 with explicit time only; wrapped dates
  (`2026-10- 01T09:00:00Z`) are rejoined; decimal commas in values are
  accepted; reference ranges, comparison symbols and report-level notes never
  become measurements.
- **Fail-closed unsupported layouts**: unknown catalog IDs, column-count
  mismatches and comparison prose produce explicit held/error diagnostics with
  line, page and snippet — zero fabricated rows.
- **Source traceability**: every parsed row carries its raw source line and
  PDF page; the review screen shows an extraction diagnostics line (method,
  pages, matched/held/rejected counts, source file name); saved records keep
  the source file name in `sourceLabel`.
- **Integration**: `document-extraction.ts` runs geometry extraction first for
  selectable-text PDFs (existing same-origin PDF.js v6 worker, `eval` disabled,
  size/page limits, loading-task cleanup), merges universal rows with the
  legacy parser, de-duplicates lines, and restores document line order.
  On-device OCR fallback for scanned pages/images is unchanged (first use may
  need network for language resources).
- **Human review preserved**: read-only extracted source text, per-row
  Details/edit, Verify All with eligibility rules, shared-date confirmation,
  per-file review, encrypted append-only history, mission/crew authorization,
  tab-state retention — all unchanged.

## Actual PDF extraction results (verified)

Synthetic fixtures in `fixtures/synthetic/p33/` (see its README for provenance
and the original-document limitation):

| Fixture                                                         | Result                                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `p28-immune-report.pdf`                                         | 5/5 rows recognized (IMM-001/002/003/007/030), header-tied dates, reference intervals ignored                                            |
| `p28-cardiovascular-report.pdf`                                 | 5/5 rows recognized (cv-001/005/006/027/065) from Greek headers in swapped column order                                                  |
| `p28-behavioral-report.pdf`                                     | 4/4 rows recognized (BSC-001/002/004/015); wrapped analyte name and decimal comma handled; report-level date note not invented onto rows |
| `p33-unsupported-layout.pdf`                                    | 0 matches; explicit held reasons incl. unknown ID `IMM-999`; no fabrication                                                              |
| `tests/fixtures/p3661-synthetic-lab-report.pdf` (existing Bone) | exactly its 2 catalog matches, unchanged                                                                                                 |

All 14 expected P28 synthetic observations are recognized; nothing is held
except the intentionally unsupported fixture.

## Test results

- `bun test`: **737 pass, 0 fail** (144 files, 10,097 assertions) — includes
  new `p33-universal-rows`, `p33-pdf-geometry`, `p33-pdf-regression` suites.
- Typecheck: 0 errors. Lint: 0 errors, 12 pre-existing warnings. Prettier:
  pass. `security:audit`: PASS. `verify:seo`, `verify:global-header`: PASS.
- P22 verifiers: `ocr-fallback`, `offline-ocr`, `medical-mapping` PASS.
  `bone-documents`, `bone-import`, `bone-coverage` were already failing at
  baseline before P33 (stale source-pattern assumptions) and remain so.
- Browser (`tests/navigation/p33-universal-documents.browser.py`, synthetic
  in-memory auth/history adapters): real PDF upload → review → Verify All →
  save for all four domains; saved variable IDs exactly match the catalogs;
  every saved row has an explicit date, synthetic provenance and the source
  file name; unsupported layout shows zero rows with the `IMM-999` reason;
  desktop/mobile without horizontal overflow; zero page errors.

## Changed files

- `src/domain/bone-health/pdf-geometry.ts` (new)
- `src/domain/bone-health/universal-document-rows.ts` (new)
- `src/domain/bone-health/document-extraction.ts` (geometry + OCR pipeline)
- `src/domain/bone-health/file-queue.ts` (review diagnostics, held rows, page)
- `src/domain/health-measurements/profiles.ts` (optional exact catalog-unit
  accessor; cardiovascular only)
- `src/components/bone-health-document-import.tsx` (diagnostics line, page
  display)
- `scripts/generate-p33-fixtures.py`, `fixtures/synthetic/p33/*` (new)
- `tests/documents/p33-*.test.ts`, `tests/navigation/p33-universal-documents.browser.py` (new)

## Remaining limitations (honest)

- The **original P28/P32 PDFs were never in this repository**; the fixtures are
  synthetic reconstructions from the P28 CSVs. They verify the engine against
  realistic PDF geometry but are not regression evidence against the originals.
- OCR remains browser-dependent; first use may download language resources.
  Physical-device airplane-mode OCR is not proven.
- Browser verification used synthetic in-memory adapters; authenticated
  encrypted-storage acceptance is unverified.
- Exact-revision GitHub CI was not run in this task.
- No universal compatibility is claimed: layouts outside the tested patterns
  fail closed into manual review by design.
