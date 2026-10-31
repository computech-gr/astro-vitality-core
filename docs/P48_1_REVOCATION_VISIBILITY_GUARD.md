# P48.1 — Crew Self visibility return revocation guard

## Scope
A client-side safety improvement only. When the Companion tab is hidden and then becomes visible, it reloads. The reload clears in-memory evidence and reruns mission membership authorization and RLS-backed evidence retrieval. This is deliberately conservative and avoids retaining stale health readings after background-tab revocation.

## Limitations
- A membership revoked while the page stays continuously visible is **not** immediately cleared; server RLS still blocks fresh requests. Do not describe this as real-time revocation.
- Browser may throttle or suspend visibility events; reload is not a guarantee of instantaneous removal.
- Reload resets temporary checklist progress, synthetic demo visibility and foreground reminder timer; this is expected and must be tested.
- No new accounts, mission, membership, synthetic records, migrations, RLS policies, or publishing are authorized by this patch.

## Required acceptance
1. Crew Self A can see only A's authorized synthetic evidence in a separately approved test environment.
2. Hide tab and return: page reloads, membership and evidence are rechecked; previous in-memory readings are not retained.
3. Revoke A using approved operator workflow while tab hidden, then return: no A evidence is visible.
4. Crew B data must remain inaccessible to A at the backend, even with altered IDs.
5. No tab-hiding: existing chart filters, synthetic examples and reminders continue normally.
6. Report whether any background reload creates a UX concern and whether a more granular abortable revalidation would be preferable.

## Data governance
The live and preview apps share a backend. Existing missions may contain medical-sensitive data. Never reuse them for synthetic acceptance. Request explicit owner approval before creating a dedicated mission, accounts or immutable records.
