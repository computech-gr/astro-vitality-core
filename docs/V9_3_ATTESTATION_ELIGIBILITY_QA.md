# v9.3 - Attestation eligibility clarity

Source inspected: 2026-11-01T203418.137 ZIP, and the 11-page Unified Health PDF supplied with it.

## Contract

- Already-attested rows MUST remain ineligible for bulk attestation. This prevents duplicate approvals.
- Do not change the underlying `selectionCounts`, `toggleSelectAll`, attestation persistence, revocation, append-only corrections, or cloud sync rules.
- Explain why selection is unavailable in the visible help text and via screen-reader text for each ineligible row.
- The approved row continues to offer History, Revoke, Edit and Mark erroneous according to its existing permissions.
- Cloud review sync remains blocked until the separately staged Supabase migration is explicitly approved and applied.

## PDF review findings (not modified in this patch)

- The supplied 11-page PDF contains 32 active synthetic observations, 2 attested and 30 not attested, and zero scientifically validated interpretations.
- Descriptive differences are not validated health trends or diagnoses.
- Potential data quality review: immune metric IMM-001 and IMM-002/003 appear with both `10^9/L` and `x10^9/L`; do not silently merge or convert without catalog approval.
- The Medical Intake narrative says there are no reviewer-accepted bone/immune/behavioral intake observations even though module observations are present. The PDF distinguishes these sources, but the wording could be clearer to readers.
- Scientific catalog mapping and interpretation review remain pending; no new biological claims should be generated.

## Required QA

1. Existing Attested rows remain unchecked and disabled in Select all.
2. Not attested eligible rows remain selectable and Save selected approvals still requires reason/confirmation.
3. Revoke transitions remain unchanged and are auditable.
4. Edit continues append-only and stale approvals do not carry over.
5. Desktop/mobile accessibility: disabled checkbox explanation is announced; no layout overflow.
6. Run focused tests, full `bun run check`, and browser smoke tests. Do not publish or run migrations without approval.
