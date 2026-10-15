# P36.6.1 — Security dependency remediation

Remediates the 5 HIGH findings from the Trivy scan of commit `c6aaee5d`.

| Package                                                                                            | Before  | After   | How                                                       | Advisory                            |
| -------------------------------------------------------------------------------------------------- | ------- | ------- | --------------------------------------------------------- | ----------------------------------- |
| pdfjs-dist (direct)                                                                                | 5.7.284 | 6.4.299 | `dependencies` `^6.4.299`                                 | CVE-2026-16633 (fixed 6.2.108)      |
| @modelcontextprotocol/sdk (via @lovable.dev/mcp-js, which pins 1.28.0 exactly in all 3.x releases) | 1.28.0  | 1.32.1  | `overrides` exact patched version, same major             | CVE-2026-104850 (fixed 1.31.0)      |
| js-yaml (via eslint, xmlbuilder2)                                                                  | 4.3.0   | 4.3.2   | `overrides` exact patched version, within parents' ranges | CVE-2026-84375, GHSA-5p4m-2wfm-xmqj |
| source-map-js (via postcss, tailwind)                                                              | 1.2.1   | 1.2.2   | `overrides` exact patched version, within parents' ranges | CVE-2026-93749                      |

No findings were suppressed. Overrides pin exact, published, patched releases with no major-version change.

## pdfjs-dist v6 integration change

`PDFDocumentProxy.destroy()` was removed in v6; `src/domain/bone-health/document-extraction.ts` now destroys the
loading task. Worker stays same-origin (`pdfjs-dist/build/pdf.worker.min.mjs?url`), `isEvalSupported: false`.

## Verification

- `tests/documents/p3661-pdfjs-v6-regression.test.ts` with synthetic fixture
  `tests/fixtures/p3661-synthetic-lab-report.pdf` (no real person): text extraction, exact matches only, unselected and review-required.
- Real Chromium against the dev server: `extractBoneDocument` with the v6 worker returned 1 page, "PDF selectable text",
  matches bone-002 42.5 nmol and bone-003 3.1 nmol, no page errors.
- Select All, manual review and synthetic export UI require an active Crew Self session and were not re-run in the
  browser; their logic is unchanged and existing tests pass.
- Remaining (outside Trivy HIGH/CRITICAL): moderate esbuild dev-server advisory via @lovable.dev/mcp-js.

No schema, migration, Cloud saving, publication or MISSION_TEST changes. All security gates unchanged.
