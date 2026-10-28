# P35 clinical laboratory recognition and access audit

## Implemented and verified

- Shared four-domain extraction now includes a bounded, catalog-bound exact-alias Immune clinical recognizer. It recognizes complete analyte prefixes, chooses the longest alias for the same catalog target, rejects competing catalog targets, separates a single result/unit from illustrative reference intervals and never converts units.
- Missing/invalid units, comparison/range-only results, unknown analytes in the recognized clinical table, extra numerical columns and ambiguous aliases produce held rows with page/line/snippet evidence. Existing catalog-defined unit binding is enforced when present. Immune's source catalog has no approved unit bindings; reported units are preserved, not clinically certified.
- Candidates retain the original source filename, PDF page and raw line. Collection/reported metadata never supplies observation dates; every candidate remains unchecked. Existing individual/shared date confirmation, Verify All eligibility, corrections, authorization, append-only encryption and Medical Report are untouched.
- Actual supplied PDF bytes are preserved with SHA-256 `53dfc06d73264d75095b5dc99bfdcd5865d9b5b46a17a0640647d99591287371`.

## Actual PDF.js extraction

| Catalog ID | Result | Exact PDF.js unit | Page | Observation date |
| --- | --- | --- | --- | --- |
| IMM-001 | 6.2 | 10³/μL | 1 | Missing; human confirmation required |
| IMM-002 | 3.4 | 10³/μL | 1 | Missing; human confirmation required |
| IMM-003 | 2.1 | 10³/μL | 1 | Missing; human confirmation required |
| IMM-006 | 1.62 | ratio | 1 | Missing; human confirmation required |
| IMM-007 | 1.8 | mg/L | 1 | Missing; human confirmation required |

Five matched, zero held/rejected for this supplied PDF. Its exact text uses Greek μ U+03BC, unlike the contract's micro sign µ U+00B5. Neither superscripts nor the actual mu character are converted. Reference intervals are retained in raw-line evidence, never measurements.

## Access audit and wording

- Read-only inspection of live policies confirms active Ground Medical can read mission events within its mission, Crew Self event reads require its own active mission/crew binding, and roster reads use existing same-mission role checks.
- The scientific-evidence service deliberately has a stricter Crew-Self-only analytics restriction. P35 does **not** weaken it merely because database reads are permitted. The read-only panel no longer offers Ground Medical selections it cannot load, and explicitly distinguishes that panel from the separately authorized Ground Medical measurement/import controls.
- The existing import authorization checks remain unchanged: assigned Crew Self only, or Ground Medical in the selected mission plus an active Crew Self roster match, errors/unrelated roles denied. A new isolated regression executes 32 positive/negative scenarios across four profiles.
- Immune, Behavioral and Cardiovascular displayed review notes now attribute completed verbal review to the owner, state that formal signed per-entry reconciliation is not recorded and disclaim clinical validation/approval. Historical scientific JSON, classifications and release gates are unchanged.

## Verification results

- Focused document/profile/access suite: **75 passed, 0 failed, 245 assertions, 18 files**.
- Full suite: **750 passed, 0 failed, 10,134 assertions, 149 files**. Established deterministic release samples were generated using the existing generator; sealed evidence was not rewritten.
- Lint: **0 errors, 12 existing warnings**.
- Security-boundary audit: **PASS**. Dependency audit: **2 moderate and 1 low existing advisories**, no dependency changes.
- Managed compilation initially identified an exact-optional-property type issue; it was corrected. Latest automatic signal: **build OK**. Separate manually executed full typecheck and production build were not run because platform instructions prohibit them. Exact synchronized GitHub typecheck/production-build validation is unavailable and is **not claimed**.
- Chromium actual PDF.js uploads: supplied P35 PDF at desktop 1280×1800 and mobile 390×844, five exact candidates, no page errors or horizontal overflow; empty dates block verification/save, entering a date alone still blocks it, explicit date confirmation does not check rows, separate human verification is required. Saving was exercised with synthetic in-memory history adapters only.
- Browser regression also uploads the existing Bone PDF, three P33 domain PDFs and both actual P34 Cardiovascular PDFs. P34 five-column timestamps/source and simple-PDF missing-date behavior remain covered by actual-byte tests.
- Authenticated requesting account was restored without changing membership: it has four active mission-operator memberships, no Ground Medical/Crew Self membership. The real UI correctly denied import. **Authenticated Ground Medical encrypted save/read persistence was not exercised.** No account was impersonated, membership provisioned or real record written.
- P22 OCR fallback, optional offline OCR pack and medical mapping static verifiers pass. Three pre-existing source-pattern verifiers still fail: old unprofiled `listBoneEntries(missionId, crewMemberId)` and `parseBoneImport(text)` expectations, and full-catalog empty-search expectation. Their assumptions were not rewritten to manufacture a pass.
- P3663 remains blocked without private restore evidence. P3664/P20 authorization gates remain unchanged; P20's structural verifier passing is not owner rules confirmation.

## Changed files and reconciliation

Supplied files: new `src/domain/bone-health/clinical-lab-rows.ts`, integrated `src/domain/bone-health/document-extraction.ts`, `tests/documents/p35-clinical-lab.test.ts`, actual `fixtures/synthetic/p35/realistic-clinical-lab.pdf`, `docs/P35_IMPLEMENTATION_CONTRACT.md`.

Contract completion additionally changes `src/components/health-domain-workspace.tsx`, `src/components/scientific-handbook-reference.tsx`, `src/domain/health-measurements/profiles.ts`, `AGENTS.md`, `roadmap.md`, and adds `tests/documents/p35-real-pdf-regression.test.ts`, `tests/mission/p35-access-contract.test.ts`, `tests/navigation/p35-clinical-lab.browser.py`, `fixtures/synthetic/p35/README.md`, and this report. Supplied starter matcher was hardened rather than copied verbatim: no non-null assertions, longest complete alias selection, explicit held diagnostics and unit-binding checks. The actual PDF and supplied contract are byte-preserved.

## Remaining limitations

This is bounded deterministic matching, not universal clinical understanding or clinical validation. Unknown layouts can require manual review. Physical-device airplane-mode OCR, original real Immune/Behavioral clinical variants beyond this fixture, authenticated Ground Medical encrypted persistence, independent scientific acceptance and exact-revision CI remain unverified. A suitable authorized Ground Medical account and isolated test environment are needed for the blocked persistence check. Medical Report/PDF source and styling were not modified; its full regression tests passed, but a fresh A4 pixel comparison was not part of this task.

No migrations, RLS, cloud data writes, external AI transmission, AI settings, release gates or publishing changes.