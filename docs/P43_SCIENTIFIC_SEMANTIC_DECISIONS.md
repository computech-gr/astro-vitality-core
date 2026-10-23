# P43 — Scientific semantic decision proposals

This patch provides **54 preliminary, explainable scientific semantic dispositions** grounded in P39 and P42, without representing them as independent scientific approvals.

- 11 possible aliases: verify analyte, specimen, protocol, timing and unit equivalence.
- 42 distinct components: keep their independent measurement identities; do not merge into umbrella metrics.
- 1 related assay: high-sensitivity CRP is not automatically interchangeable with generic CRP.

Every row has a specific rationale and required checks. The independent reviewer, decision and timestamp remain unfilled. The 162 unmatched P37 source records remain untouched.

## Review workflow

1. Compare each source with its primary study or protocol and the actual P35.5 definition.
2. Verify unit, specimen, method, device, scoring protocol, reference context and missingness.
3. Obtain independent qualified scientific review and record its evidence separately.
4. Only after approval, plan a separate controlled catalog integration; no approvals are issued here.

## Validation

Run `node scripts/verify-p43-semantic-decisions.mjs`, then permitted checks in Lovable. Run full `bun run check` in GitHub Actions on the exact synchronized commit. The current workflow must also add a P43 verifier step in a future workflow change, or use a workflow command explicitly executing it; do not claim P43 CI coverage merely because older gates pass.

No migrations, UI changes, Cloud writes, clinical rules, or deployments. Real-device airplane-mode OCR remains unverified.
