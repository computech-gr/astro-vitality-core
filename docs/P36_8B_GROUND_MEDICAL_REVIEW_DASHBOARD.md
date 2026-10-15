# P36.8B — Ground Medical synthetic read-only dashboard

Adds a read-only queue and biomarker detail panel to `/mission/ground`, backed only by the already-deployed P36.8A RPCs. No migrations, writes, review decisions, or clinical interpretations.

## Prerequisites and acceptance gate

- P36.8A governed migration 0009 must already exist in Lovable Cloud. Do not reapply.
- Before declaring P36.8B accepted, perform the owner-approved P36.8A **live authenticated** acceptance as `marketing@computech.gr` for `FV01-TEST-B` (not service role), verifying one pending synthetic batch and eight values; record results without revealing personal secrets.
- Confirm no queue/detail for unauthenticated, Crew Self, Researcher, Mission Operator, cross-mission, self-review, or revoked Ground Medical sessions. Revocation may be tested only in isolated test DB.
- UI selection is a convenience only: PostgreSQL checks mission/role/submitter for every RPC. No direct P36 table reads or local persistence of values.
- The dashboard does not write, approve, reject, classify, diagnose, or promote any record. MISSION_TEST and clinical gates remain unchanged.

## Files

- `src/infrastructure/p368b-ground-medical-review.ts`: typed client wrappers for the two authorized RPCs (generated DB types not yet updated).
- `src/components/p368b-ground-medical-review.tsx`: mission-scoped queue/detail panel.
- `src/components/ground-research-console.tsx`: embeds the panel below existing research workspace.

## Expected live smoke test

1. Sign in as the verified Ground Medical member and open `/mission/ground`.
2. Select `FV01-TEST-B` and press **Refresh pending reviews**. Expect one batch with eight items.
3. Press **View values**. Expect the eight synthetic biomarkers and units; no edit or approval buttons.
4. Switch identity to Researcher/Crew Self; the queue should not be available. Confirm RPC rejects unauthorized calls independently of UI.
5. Recheck zero review decisions and unchanged batch/item counts. Audit sign-in entries may increase normally.
