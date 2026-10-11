# P21.10 — Full-Text Evidence Appraisal Readiness

This patch introduces a strict, traceable **full-text appraisal work queue** for the six P21.9 publications and all sixteen P21.5 relationships. It does **not** claim to have accessed, downloaded, read, or independently appraised any full text.

## Appraisal workflow

1. Independently retrieve each full text from a lawful source, recording URL, access basis, reviewer, date and exact section/table/figure locator. A PubMed abstract alone is insufficient.
2. Verify study type: PMID-26630194 is classified as a **review**, not a primary study; bed-rest cohorts are terrestrial analogs, not spaceflight cohorts.
3. Extract actual population, sample sizes, exposure duration, comparator, assay, specimen, units, sampling times, effect estimates and uncertainty intervals; never invent missing results.
4. Assess confounding, intervention co-exposures, outcome specificity, missing data, applicability to astronauts and contradictory evidence.
5. Obtain independent scientific review, with explicit decisions per study and relationship. No automated approval or clinical activation is permitted by this patch.

## Safeguards

- CTX or P1NP changes are not equivalent to percent BMD loss or fracture probability.
- DXA aBMD, QCT vBMD, HR-pQCT and FEA are distinct modalities.
- Exercise plus bisphosphonate studies cannot identify an exercise-only causal effect.
- An article citation is not verification of the linked biological relationship.
- Never place restricted full-text copyrighted content in the public repository. Store citations and short evidence summaries with appropriate provenance.

## Files and checks

`data/scientific/bone-health-fulltext-appraisal.v1.json` records missing full-text evidence explicitly. `scripts/verify-p21-fulltext-appraisal.mjs` rejects mismatched IDs, unsupported verification claims and any activation. `bun run verify:p21:fulltext` is included in `bun run check`.

This is an evidence-readiness gate, **not** a completed full-text scientific assessment. A later patch must be based on verified accessible study content and documented human review.
