# P21.9 — Primary-study discovery and abstract-level extraction

This release records **six real PubMed-indexed publications** (five research reports and one review), using identifiers and information visible in public abstracts. The term _primary-study extraction_ here means a preliminary bibliographic/abstract extraction, **not full-text critical appraisal**.

- Smith et al. (2014), PMID 24470067, DOI 10.1002/jbmr.2185: 42 ISS astronauts, DXA and blood/urine biochemistry, resistance-exercise comparisons.
- LeBlanc et al. (2013), PMID 23334732: 7 astronauts on alendronate plus exercise; 18 iRED and 11 ARED historical comparison subjects. Do not infer an exercise-only effect.
- Smith et al. (2012), PMID 22549960: exercise and nutrition context.
- Smith et al. (2015), PMID 26456109: bone turnover and renal stone context.
- Bed-rest analog, PMID 25107989: 74 participants; **not** spaceflight data.
- Sibonga et al. (2015), PMID 26630194: review, **not** primary evidence.

The linked relationships are **topic relevance links, not claim-level support determinations**. None of the studies has been fully critically appraised; no quantitative effects, assay equivalences, confidence intervals, reviewer approvals or clinical thresholds are invented. For a future P21.10 full-text extraction, capture table/figure location, actual outcome definitions, units, effect estimates, uncertainty, countermeasures, bias, and reviewer identity.

Verification: `node scripts/verify-p21-primary-study-extraction.mjs`. No app runtime, clinical rule, database migration, or dependency change.
