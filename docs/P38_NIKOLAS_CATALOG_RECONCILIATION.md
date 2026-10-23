# P38 — Nikolas Scientific Catalog Reconciliation (review-only)

## Result
- Source candidates: **216** (117 immune, 99 behavioral).
- Exact normalized name candidates: **2**.
- Unresolved/manual reconciliation: **214**.
- Clinical / operational approvals: **zero**.

## Scope
This patch adds an independently reproducible, **read-only** comparison to the existing P35.5 proposed catalog. Exact normalized names are candidate links, **not approved equivalences**. Existing P35.5 records have no units; unit compatibility cannot be established here. P37's `exact_name_matches_in_p355` is preserved for audit but is not trusted as approval. No P36 registry, UI, database, authorization, clinical interpretation or source data is modified.

## Next gate
A qualified reviewer must resolve terminology/aliases, specimen and method, unit dimensional compatibility, provenance, duplicate and missing signals, and evidence quality before approving any operational catalog integration. Source evidence labels are attributed handbook claims, not verified NASA endorsement.

## Verify
`node scripts/verify-p38-nikolas-reconciliation.mjs`

No migration, publish or deployment is authorized by this patch.
