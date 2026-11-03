# P36 Catalog Reconciliation — Review-only patch

This is a **complete, non-activating review handoff**, grounded in the uploaded 2026-11-03 source ZIP and the unknown biomarker review request.

## Findings

- P36 contains cardiovascular and bone only; Immune/Behavioral are P35.5 draft.
- bone-015 and bone-019 have null originalUnit. No automatic unit approval.
- CTX, P1NP and PVT_MEDIAN_RT require protocol/assay identity resolution, not just string aliases.
- BSC-008 scale explicitly unvalidated; PVT protocol explicitly unvalidated.
- This patch does **not** activate catalog extensions or rewrite source observations.

## Implementation contract for Lovable

1. Add the JSON review handoff to data/scientific. Do not modify existing P36/P35.5 catalogs or catalog-extensions.v1.json.
2. Add a read-only reconciliation view or integrate this artifact into the existing Unknown Biomarker Review panel. Display source labels/units, candidate catalog ID, evidence count, candidate status, and pending gate.
3. Preserve all 36 rows as review-only; no import, domain analytics, PDF interpretation, or sync eligibility change.
4. Keep independent named scientific reviewer, evidence references, unit/specimen/assay/protocol confirmation and versioned code review as prerequisites.
5. Do not treat review-panel dropdown decisions as scientific approval. No auto-approved aliases, conversions or catalog edits.
6. Tests: all 12 terms, 36 observations, no approved extension, P36 units null remain blocked, P35.5 draft remains blocked, BSC-008 and PVT cannot activate; full bun run check.
7. Do not apply migrations, publish, alter existing cloud/local records or change server settings. Report exact files/tests.

## Next scientific gate

Qualified independent reviewer must supply explicit decisions and supporting handbook evidence. Only then prepare a *separate* governed activation patch with exact unit handling and appropriate PDF interpretation safeguards.
