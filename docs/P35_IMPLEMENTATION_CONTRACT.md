# P35 — Clinical Laboratory Document Understanding & Mission Access Consistency

## Implementation supplied
- Exact-alias, catalog-bound analyte-only clinical row recognizer, with human-review-only results.
- Integration into shared document extraction; no fabricated timestamps or units.
- Focused synthetic clinical-report tests; original realistic PDF included.

## Mandatory Lovable completion in one pass
1. Run PDF.js geometry extraction against **fixtures/synthetic/p35/realistic-clinical-lab.pdf** itself (not retyped fixtures). Verify five expected candidates: IMM-001 6.2 10³/µL, IMM-002 3.4 10³/µL, IMM-003 2.1 10³/µL, IMM-006 1.62 ratio, IMM-007 1.8 mg/L. Report-level collection timestamp is not a per-row observation timestamp; require explicit human date confirmation.
2. Inspect the exact extracted PDF text and geometry. Repair line/cell reconstruction if the fixture still fails. No fabricated readings, no reference-range contamination, no silent unit conversion. Reject or hold ambiguous aliases and missing units with page/line evidence.
3. Run real browser upload/review with this PDF in Immune, not a mocked parser. Preserve existing P34 Cardiovascular and Bone, Behavioral regressions. Add real-PDF-byte regression tests.
4. Audit the `Mission-scoped measurements` read-only panel for Ground Medical: inspect actual membership/RLS/service authorization and correct misleading Crew-Self-only text only where authorization truly exists. Never broaden data access, bypass RLS, change role compatibility or expose unrelated crew.
5. Harmonize scientific status copy: owner-reported verbal Nikolas review; formal signed per-entry reconciliation not recorded; no clinical validation or approval implied.
6. Preserve encrypted append-only local history, source/provenance, correction behavior, Verify All, and Medical Report. Verify authenticated Ground Medical scoped synthetic save/read persistence, not just memory mocks. Do not claim this if environment prevents it.
7. Run full tests, typecheck, lint, security audits, production build, browser desktop/mobile. Document precise results and outstanding P22/P20/P3663/P3664 blockers. No migrations, RLS changes, external AI uploads, release gate changes or publishing.

## Safety boundary
This is a bounded, deterministic alias matcher, **not universal understanding of arbitrary PDFs**. Unknown clinical layouts and analytes must fail closed into manual review, never auto-save.
