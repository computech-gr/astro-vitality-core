# P39 — Scientific semantic mapping review candidates

This is a **non-operational review artifact**, derived from the P37 intake and the P35.5 draft catalog. It does **not** constitute scientific approval or a change to the live biomarker catalog.

## Deterministic results

- Source entries: **216** (117 immune, 99 behavioral).
- Existing P35.5 draft entries: **71**.
- Curated semantic review links: **54**.
- Source entries without a curated link: **162**.
- Operational approvals: **0**.

These are **candidate** relationships only. `alias` suggests possible naming equivalence; `component` indicates a potentially narrower submeasure within a broader catalog item; `related_assay` indicates a related but potentially different assay. None are automatically merged.

## Critical review boundaries

1. P35.5 lacks units, so numerical unit compatibility is **not verified**.
2. A component is not necessarily the same measurable quantity as the parent item.
3. Review specimen, method, instrument, time anchor, population, quality and reference provenance before approving any mapping.
4. Behavioral restricted fields and immune viral assays must not create automatic diagnosis, alert thresholds or unrestricted access.
5. The source document's NASA labels are source attributions, not endorsements or independent validations.
6. No migrations, runtime catalog activation, UI changes, Cloud writes or changes to scientific approval state are included.

## Verification

Run `node scripts/verify-p39-semantic-review.mjs`, then `bun run check` in Lovable. All current repository files remain unchanged except the three added P39 files.

## Next gate

Scientific reviewers should record ACCEPT / MODIFY / REJECT for each candidate, document assay and unit compatibility, and independently assess unmapped entries before any operational integration.
