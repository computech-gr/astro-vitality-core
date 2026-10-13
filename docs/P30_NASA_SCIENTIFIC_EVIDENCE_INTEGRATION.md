# P30 — NASA Scientific Data & Evidence Integration

## Delivered

- Navigable, noindex `/mission/nasa-evidence` workspace with search, category filter, source links, provenance, and appraisal status.
- Versioned static NASA reference metadata index grounded in the **existing** P21 literature-screening registry and `CITATIONS.md`.
- Traceable P21 source IDs and verified-at dates retained exactly. No new study or scientific claim fabricated.
- Fail-closed scientific activation flags; no NASA live feed, no health record import, no change to P25 findings, P28 research export, or P29 sync.
- Registry integrity verifier and domain tests. No migration.

## Boundaries

These are public NASA source references, **not** real NASA astronaut measurements. Preliminary screening is not full-text critical appraisal, independent scientific validation, or medical approval. The source index must never drive clinical alerts or diagnoses. URLs open NASA pages only when clicked; there are no automated network requests. P32 scientific validation and P34 device acceptance remain outstanding.

## Acceptance

Run `node scripts/verify-p30-nasa-evidence.mjs`, `bun test tests/domain/p30-nasa-evidence.test.ts`, existing P21 and P28 verifiers, foundation, typecheck and build. Confirm navigation, noindex and link handling in browser later.
