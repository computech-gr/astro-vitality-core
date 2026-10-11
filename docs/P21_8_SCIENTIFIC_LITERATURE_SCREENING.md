# P21.8 — Scientific Literature Screening (NOT approval)

This release starts actual source identification rather than adding another empty review queue. Four NASA source records were checked against public NASA pages or NASA NTRS metadata/excerpts on 2026-10-11. All 16 existing biological relationships are cross-referenced to candidate sources where the publicly inspected material is relevant. A blank candidate list explicitly means targeted literature is still needed.

## Evidence handling

- `sourceRegistry`: verified NASA URLs, titles, dates and access scope. Source discovery is **not** full-text critical appraisal, primary-study extraction, or an independent peer review.
- `relationships`: preliminary relevance navigation, **not** proof that a source validates the precise biological statement. `sourceSupportForExactClaim` stays `not_assessed` for all 16.
- Existing P21.6 appraisal and P21.7 retrieval files are deliberately **unchanged**; their zero completed reviews and zero approved evidence remain truthful.
- No physiological thresholds, risk scores, clinical alerts, user-facing educational approvals, or operational activation.
- The NASA technical standard is a normative document for NASA operations, not a clinical validation of this application.

## Next scientific work

Obtain and read the underlying full texts and relevant primary studies; extract study populations (flight vs analog), assay methods, specimen and units, sampling times, quantitative effect estimates and uncertainty, and contradictory evidence. Independent domain reviewers must document identity and decision before any status change. Prioritize CTX/P1NP, CTX/DXA, site-specific DXA/QCT, and microgravity exposure. Do not infer fracture probability from isolated biomarkers.

## Local check

`node scripts/verify-p21-literature-screening.mjs`
