# P21.4 — Independent Scientific Review & Evidence Traceability

## Scope
This patch adds a **review queue**, not scientific approval. It preserves the v7 handbook catalog, the v1 mapping and all application behavior. The 63 records are tied to the handbook source hash and existing mapping IDs. Author-assigned evidence tiers A/B/C are not equivalent to independently verified evidence or NASA-approved operational thresholds.

## How to conduct a real review
1. For each `handbookId`, retrieve the original paper, NASA report, or laboratory assay documentation. Record full citation, DOI/URL, version, population, protocol, and precise supporting claim; do not rely on a generic NASA homepage.
2. Check biological identity and **specimen, assay, manufacturer, unit, sampling time, fasting, phase and method**. For DXA/QCT, verify site, modality, scanner and precision. For urine, verify collection period/completeness. Never merge related-but-not-equivalent mappings.
3. Assess confounders (renal function, medication, exercise, nutrition, timing), baseline comparability, and whether a claim is observational, mechanistic or validated for its intended use.
4. A qualified reviewer can later record a dated decision with a rationale and sources through a separately governed change. This patch deliberately contains no approvals and does not change ingestion, alerts, readiness, or clinical rules.
5. Candidate mappings (`candidate_exact`) remain **candidates**, not proven identity. Unmapped metrics require an independent design decision before adding them to the canonical registry.

## Priority review queue
- **High priority for evidence and assay comparability**: CTX (`bone-001`), P1NP (`bone-009`), 25(OH)D (`bone-019`), urine volume (`bone-037`), protein intake (`bone-059`), fluid intake (`bone-061`).
- **Do not alias**: urinary creatinine vs serum creatinine; exercise adherence/load vs activity load; mission duration vs mission phase; microgravity exposure vs gravity regime.
- **Research only until validated**: molecular signals (e.g. RANKL/OPG/DKK1), isotope kinetics and modeled supersaturation.

## Safety rules
No fabricated NASA cutoffs, fracture probabilities, percent bone loss from CTX, numerical CTX+P1NP bone score, or supersaturation computation without a validated model. BMD retention requires same site and comparable method; no automatic diagnosis. This ledger stores no astronaut data.

## Verification
`node scripts/verify-p21-scientific-review.mjs` checks source linkage, exact coverage, absence of fabricated approvals, and zero activation. It is included in the existing central check chain, without changing the checks themselves.
