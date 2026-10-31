# P48.2 — Focused Crew Self Revalidation (implementation contract)

## Source findings
The current `src/components/astronaut-daily-health-companion.tsx` attaches a `visibilitychange` handler that invokes `window.location.reload()` after a hidden-to-visible transition. This clears the checklist, filters, synthetic chart, and running reminders, even if the user has no Crew Self scope. `getCloudMissionContext()` determines active crew_self memberships; `loadCrewScientificEvidence()` reads authorized evidence. Existing reads and database RLS must remain authoritative.

## Required implementation
1. Replace unconditional reload with an explicit asynchronous revalidation when the tab returns. Do not change database, memberships, or RLS.
2. Fail closed immediately on return: hide all private crew evidence and scope-dependent metric details *before* any asynchronous request. Preserve non-sensitive UI state (checklist, selected environment, synthetic demo and reminders) while authorization is checked.
3. Fetch fresh mission context using `getCloudMissionContext()`. Rebuild allowed Crew Self scopes. If the previous scope is revoked, clear selected scope, report, metric and source/time filters; show the existing unauthorized message. If still authorized, reload evidence with `loadCrewScientificEvidence()` and restore selection only if still valid.
4. Prevent stale results: use monotonically increasing request generation or abort/cancel tokens for *both* context and evidence loads; old requests must never repopulate private data after revocation, scope change, sign-out or unmount.
5. Handle concurrent focus events, auth changes, failed network requests, and rapid crew switching. On error, show no private data; do not infer authorization from cached state.
6. Recheck on focus/visibility return; do not claim instantaneous revocation while continuously visible. Keep RLS as the server-side enforcement point. Do not store medical data in localStorage/sessionStorage.
7. Keep reminders running across focus changes if possible; browser notification delivery is best effort and is not a background scheduler.

## Acceptance gates
- Authorized Crew Self A returns: evidence revalidated, checklist and reminders preserved.
- Crew Self A revoked while hidden: private chart/table immediately hidden on return and never repopulated by stale requests.
- Switching A/B: no cross-crew values, even with delayed responses.
- Signed-out and operator-only users: no private evidence requested or displayed.
- Offline/network failure: private evidence stays hidden; explicit retry state.
- 1-minute reminders, synthetic chart, five environments, mobile, a11y and existing tests remain intact.
- Run full test, typecheck, lint, security audit, formatting and build; report known warnings separately.

## Explicit non-goals
No accounts, invitations, synthetic medical record inserts, migrations, RLS changes, publishing or silent alteration of existing medically sensitive records. Separate Stage B approval is required for synthetic account creation and permanent records.
