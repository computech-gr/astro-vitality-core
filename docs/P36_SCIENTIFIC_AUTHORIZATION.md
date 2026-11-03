# P36 Scientific Authorization & Independent Approval

Status: implemented in code; the database change is staged only
(`supabase/pending/20261104000000_p36_scientific_authorization.sql`, rollback alongside). Until the
owner approves and applies it, the Catalog Scientific Review page shows every term as pending and
activation-blocked, with "the staged database change has not been applied".

## Who can do what

| Action                                   | Ground Medical | Researcher (same mission)  | Others |
| ---------------------------------------- | -------------- | -------------------------- | ------ |
| Read the mission's authorization ledger  | yes            | yes                        | no     |
| Submit a recommendation (evidence only)  | yes            | yes                        | no     |
| Approve / Reject / Request more evidence | no             | yes                        | no     |
| Approve a recommendation they authored   | —              | no (self-approval refused) | —      |

Roles come only from active `mission_memberships` rows checked in the database from `auth.uid()`.
No role, account or permission is created by this change. Reviewer name, qualification and the
conflict-of-interest declaration are recorded declarations; the application cannot verify credentials.

## Status model

Scientific status per term and authority mission: `PENDING_NIKOLAS_REVIEW`, `MORE_EVIDENCE_REQUIRED`,
`SCIENTIFICALLY_REJECTED`, `SCIENTIFICALLY_APPROVED` (latest verified, current decision wins; history is
append-only). A decision whose catalog/source fingerprints no longer match the bundled artifacts is
shown as stale and the term reverts to pending. Any ledger verification failure fails closed.

Activation status is separate: `ACTIVATION_BLOCKED` unless every gate passes, then `ACTIVE`.
Gates: independent approval verified; routed P36 identity; validated catalog unit equal to the approved
unit; specimen/method/protocol recorded with no explicitly unvalidated scale or protocol; validation
evidence; an effective entry in `data/scientific/catalog-extensions.v1.json` whose approval record cites
`p36-auth:<event id>`; current fingerprints; and the registry note `verifiers-passed:<40-hex commit>`.
With the current catalogs no term can become active (no P36 candidate has a validated unit and several
candidates are P35.5 drafts).

## Activation prerequisites (each a separate, owner-approved step)

1. Apply the staged migration after owner approval.
2. A Ground Medical or Researcher member records a recommendation with complete evidence.
3. A different Researcher of the same mission records an approval referencing it.
4. A governed catalog patch sets the validated unit for the routed P36 target (or promotes a P35.5 draft).
5. A code-reviewed registry patch adds the alias extension citing `p36-auth:<event id>` and the
   passing-verifier commit; CI must pass on that exact commit.

## Verification

`FV01_PG_SOCKET_DIR=<disposable socket> bun run verify:p36-scientific-authorization-pg` applies the
staged SQL to a disposable PostgreSQL and drives the real server core plus forged direct RPC calls
(46 checks, including rollback refusal and clean rollback). It refuses managed `PG*` variables.
