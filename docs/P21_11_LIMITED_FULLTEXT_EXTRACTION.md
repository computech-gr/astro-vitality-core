# P21.11 — Limited Verified Full-Text Extraction

This is a **source-inspection record**, not an independent scientific approval. No clinical rule or Health Intelligence algorithm is activated.

## Source inspection (2026-10-11)

- **PMID 25107989** — Morgan et al. (2014), *Sex-specific responses of bone metabolism and renal stone risk during bed rest*. Public full text: https://pmc.ncbi.nlm.nih.gov/articles/PMC4246590/ . Results, Table 4, and renal stone discussion inspected. Four qualitative, locator-linked findings are in `data/scientific/bone-health-fulltext-extraction.v1.json`. This is **bed-rest analog**, not flight data. Urinary CTX cannot be substituted for serum CTX. No exact effect size or clinical threshold has been inferred.
- **PMID 22549960** — Smith et al. (2012), full-text PDF link located at https://onlinelibrary.wiley.com/doi/epdf/10.1002/jbmr.1647 . Not marked extracted; a full methods/tables assessment remains pending.
- Other four study full texts remain not verified.

## Review requirements

Independent biology reviewer must verify article content against the original paper, assess methods, assay/specimen, sample sizes, confounding and transferability, and record a separate sign-off. These extracted findings do not update the existing P21.10 appraisal statuses. P21.11 adds a separate provenance layer and verifier only.

Run: `node scripts/verify-p21-fulltext-extraction.mjs`.
