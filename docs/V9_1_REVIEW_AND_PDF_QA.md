# MITOCHONDRIA v9.1 - Review table + report follow-up

## Implemented
- Constrained horizontal scrolling with keyboard-accessible region and mobile hint.
- Fixed, predictable column widths, wrapping long provenance strings, and full-width stacked action buttons.
- No changes to review semantics, roles, storage, Supabase schema, or scientific catalog.

## Required PDF improvements (not implemented in this patch)
- Preserve 32 included / 0 attested, pending scientific review and synthetic disclaimers.
- Fix unit-display equivalence only through governed mapping; never silently convert units.
- Collapse duplicate missing-data bullets by canonical ID plus unit, without erasing evidence IDs.
- Avoid labeling two points on the same day as a longitudinal trend.
- Reflow Appendix A: keep full identifiers and provenance but prevent awkward wrapping.
- Make missing Ground Medical attestation obvious on page one.
- Preserve searchable text-based PDF, repeat headers, and print/download separation.

## Acceptance tests
1. 375px, 768px, 1280px viewports: all actions accessible without page-level horizontal overflow.
2. Select all -> reason and confirmation -> save -> reload; no double attestation.
3. Edit -> Save: corrected record active, original erroneous, full audit retained.
4. Cloud review sync remains disabled with migration-required explanation until operator-approved migration.
5. No scientific interpretation is promoted from pending review.
