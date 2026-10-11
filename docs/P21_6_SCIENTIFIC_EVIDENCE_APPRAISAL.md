# P21.6 — Scientific Evidence Appraisal & Interpretation Approval Queue

## Scope
Adds a source-traceable, non-operational review queue for all 16 P21.5 biological relationships. **This is not a completed independent literature review or scientific approval.** The team-authored Handbook v7 and its author-assigned evidence tiers are not independent verification.

## Required independent appraisal
For each relationship, a qualified reviewer must examine original, retrievable primary sources (DOI/PMID/URL, title, authors, year, publication, study design, population, flight/analog/terrestrial applicability, endpoints, effect direction and uncertainty), study limitations, assay/specimen/unit/site/method comparability, confounders, temporal ordering, competing explanations, and applicability to the astronaut context. Document reviewer identity, date, reasoned decision, and source-specific conclusions. Do not infer causality from association or treat tier A as clinical validation.

## Decision boundaries
All entries start `pending_independent_review` / `defer`; source lists are empty, no review signatures or approval flags are invented. A future independent review may support educational wording, but that **does not** authorize operational alerts, clinical cutoffs, diagnosis, risk predictions, readiness scores or automatic data mappings. Such changes require a separately approved, tested, versioned implementation and governance decision. The verifier intentionally enforces the pending state for this version and must be explicitly revised under governance if review decisions are later recorded.

## Reproducibility
Run `node scripts/verify-p21-bone-evidence.mjs`. This targeted check is included in `bun run check`. It verifies graph/ledger/catalog referential integrity and fail-closed no-activation constraints. It does not verify scientific validity of the claims.
