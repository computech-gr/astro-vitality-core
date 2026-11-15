# P72.7 — Scientific Review queue visibility and approval workflow

Status: Preview only. No database change, migration, approval, activation or publication.

## 1. Why the six request IDs were not visible

- The six requests (ubr-19aa5a1e 12, ubr-8b1514d8 197, ubr-7818f4ad 11, ubr-bb177779 15,
  ubr-d9851dd7 1, ubr-6a205852 7 = 243 terms) are all in MITO_DEMO_2026, synthetic, submitted
  by Ground Medical. The server already returned every request ID to the authenticated
  Researcher (basis: global scientific review + the mission sharing policy).
- The Global scientific review panel did not choose a mission automatically when the account
  had more than one authorized mission (the Researcher also holds FV01-TEST-B as mission
  Researcher, with no submissions), so it stayed on "Choose a mission".
- The panel was term-centred: a request ID appeared only in each term row's Receipt column,
  25 rows per page sorted by label. No request-level list existed, so the 197-term request
  dominated and the 1-term ubr-d9851dd7 was not on the first page.
- The 243 seen during P72.6 came from the P38 bulk synthetic demo section, which counts terms
  but does not list requests.

Fix: the panel preselects the only mission (or the only mission holding submissions), adds a
"Submitted review requests" table — original ubr-* ID, receipt time (UTC), originating role,
mission/crew pseudonym, term count, triage and scientific-decision counts, synthetic demo
decided/active/revoked counts — and "Show terms" opens that request's terms; a request filter
is also available. Status is derived only from recorded triage and decisions.

## 2. Display-sync (hydration) error

React reported "Hydration failed … server rendered text didn't match the client" in
Biomarker interpretation review (Open review tasks: server 416, client 437). The server never
holds device catalogs, but the component read the device's synthetic demo catalog runtime
during its first render; when the verified demo snapshot loaded before that part of the page
hydrated, the first client render counted 21 more activated demo identities. Five more
components passed the live getter as the server snapshot of `useSyncExternalStore`.

Fix: `src/hooks/use-device-catalogs.ts` (server snapshot always empty) is used by every
component; installed-snapshot details are read only once the hook value has them. Regression
test: `tests/mission/p727-display-sync-hydration.test.tsx` (fails on the previous code with
416 vs 437; passes now). No examination data, catalog decisions or audit history changed.

## 3. Scientific approval authorization (no change proposed)

- Production scientific approval (`p37_catalog_approve_v1`) needs: the separate
  `p37_scientific_approvers` grant (Researcher holds it), a read basis from
  `p36_global_review_basis` (global reviewer grant + mission sharing policy — no mission
  membership needed), triage ACCEPT_FOR_REVIEW (all 243 accepted), not the submitter, and
  exactly one independently provisioned source-validation receipt by someone else.
- MITO_DEMO_2026: permission is in place without membership; each approval is blocked by
  `exactly one independently provisioned source-validation receipt is required` because
  `p36_dynamic_source_validation` holds 0 receipts. Granting more write access would not
  remove this blocker and is not proposed.
- FV01-TEST-A and MISSION_TEST have no sharing policy (approval would return `scope denied`),
  but they have no submissions. If they ever need review, the smallest change is one
  owner-approved sharing-policy row for that mission — not a widening of the P72.6 read grant.
- The P72.6 global read grant confers no triage, approval or activation authority.
- Synthetic demo decisions (`p37_demo_decide_v1`, `p38_demo_bulk_decide_v1`) use the same
  approver grant + read basis and are labelled SYNTHETIC DEMO, never scientific approval.

## 4. Medical handoff

Implemented: an approval appears in `p37_catalog_activation_queue_v1` for active Ground
Medical of the approval mission; `p37_catalog_activate_v1` requires that membership (crew
binding must match the submission crew), rejects the approver activating their own approval,
re-checks the proposal digest and receipt, and is idempotent. Nothing activates automatically.
In MITO_DEMO_2026 the Ground Medical account is crew-bound to the submitting crew. No live
approval exists, so the live queue is empty; verified in isolation only (below).

## 5. Verification

- Disposable PostgreSQL (socket-only, never the shared backend): P36 global review 105,
  P36 global triage 84, P37 catalog activation 84 (includes a reviewer without mission
  membership approving on a shared mission, unshared mission denied, receipt required,
  approver cannot self-activate, Ground Medical activation), P37 Ground Medical activation 73,
  P72.6 global read 90 — all pass.
- Preview as the Researcher: six request IDs listed; Show terms for ubr-d9851dd7 shows its
  single term (Galectin-3) and opens its dossier; no console errors.
- Preserved (read-only checks): 265 examinations, 264 reviews, 0 corrections, 14 memberships,
  6 submissions / 243 terms, 243 triage, 414 demo catalog events, 0 catalog events,
  0 source receipts, 0 authorization events, 429 audit events. Reading the review panel appends
  read-audit rows to the existing global-review audit log, as designed.
