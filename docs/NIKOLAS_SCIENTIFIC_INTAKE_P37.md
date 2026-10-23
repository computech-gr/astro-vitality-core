# P37 — Nikolas scientific intake (non-activating)

Source: Nikolas immune and behavioral developer handbooks, received 2026-10-23.

## Extracted evidence inventory

- Immune: 117 tabular entries including original and 20 supplementary rows; do not equate entries to unique clinical biomarkers.
- Behavioral: 99 numbered measurements/derived fields.
- Existing P35.5 draft: 71 entries. Exact-name matches are hints, not an adequate semantic deduplication.
- Three research-only cross-domain contextual relationships.

## Hard boundaries

This patch only adds scientific intake JSON, a verifier, and documentation. It does NOT modify approved catalogs, scores, UI, permissions, schema, migrations, sync, live data, or clinical activation. Source classifications (NASA-SSM, NASA-Research, Candidate, N/E/P) are attributed claims from the handbooks, NOT independently verified NASA endorsements.

Before activation: independent citation checks; alias/assay/protocol deduplication; compare with current biomarker matrix; decide KEEP/MODIFY/ADD/MERGE/RESEARCH-ONLY for each candidate; approve access visibility; implement and test separately. Missing/below-detection/not-ordered must remain distinct. No automatic diagnosis, global immune score or psychiatric classification.

Run: `node scripts/verify-nikolas-scientific-intake.mjs`.
