# FV-01.4.2B — Operator Browser Gate and Staged Approval

Status: **READ-ONLY GATE; NO PHASE B WRITE AUTHORIZATION**.

## Source and evidence

- The FV-01.4.2A preflight recommends **conditional GO**, not execution approval.
- Phase A: A3 and A7 owner-confirmed PASS; R1/R2/R3/R5 count-only read PASS for TEST A and TEST B; R4 INCONCLUSIVE because `mission_events` is empty.
- Clean release is confirmed on public pages, but the owner has not yet confirmed signed-in removal of the temporary diagnostic.
- The existing Mission Operator has not yet confirmed access to `/mission/operations` using their own browser session.
- Existing production state, according to the read-only preflight: one real mission, one active operator, no open invitations; proposed codes `FV01-TEST-A` and `FV01-TEST-B` available. Recheck before any writes.
- FV-01-13 `sandbox_exec` remains OPEN; final security approval BLOCKED.

## Owner-operated browser prerequisites (no writes)

1. In a normal signed-in session, refresh `https://mitochondria.edocinfo.com/mission/identity` and verify the temporary RLS diagnostic is absent. Record PASS/FAIL and date; do not expose credentials or tokens.
2. Separately, the existing authorized Mission Operator signs in using their own account and opens `https://mitochondria.edocinfo.com/mission/operations`. Confirm the operator workspace and mission-create capability are visible **without clicking create**. Record PASS/FAIL and date. Do not impersonate the operator.
3. If either fails or remains unverified, stop. No mission creation or invitation issuance.

## Proposed controlled execution (not yet authorized)

| Hold point | Proposed action                                                                                                                                   | Authorization required          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| B0         | Owner confirms both browser prerequisites and accepts permanent audit-trail implications                                                          | Explicit owner approval         |
| B1         | Existing operator creates planning missions `FV01-TEST-A` and `FV01-TEST-B` using normal UI                                                       | Separate approval before writes |
| B2         | Operator adds one clearly synthetic crew registry entry per test mission, activates only as required                                              | Separate approval               |
| B3         | Operator issues one short-lived, one-time `crew_self` invite per mission; deliver A only to TEST A and B only to TEST B privately                 | Separate approval               |
| B4         | Each test account redeems only its own invite in its own session                                                                                  | Owner-controlled execution      |
| B5         | Verify own-mission visibility, other-mission denial, real-mission denial, and operator-action denial; record evidence without private health data | Approved test plan              |
| B6         | If justified, test mission events with synthetic data to make R4 probative; avoid real health data                                                | Separate approval               |
| B7         | Deactivate test memberships, inactivate crew as allowed, and transition planning missions to aborted if supported; retain immutable audit history | Separate approval               |

## Constraints

- Mission creation automatically grants the creating operator membership in each new test mission.
- Mission creation and invitation actions create permanent audit evidence; these records cannot simply be deleted.
- Never alter the real mission, existing real crew, existing real memberships or live health records.
- No service-role keys, privileged SQL writes, impersonation, test shortcuts or automatic browser actions.
- Any nonzero unauthorized result or unexpected access is a STOP and requires investigation.
- A conditional GO is **not** approval to execute B1-B7. Phase B remains **NOT APPROVED** until explicitly authorized by the owner.

## Lovable report format

- Signed-in diagnostic absence: OWNER PASS / FAIL / NOT VERIFIED.
- Authorized operator workspace: OWNER PASS / FAIL / NOT VERIFIED.
- Current code availability and live mission/invitation state: read-only findings only.
- Write actions performed: **NONE**.
- Phase B: **NOT APPROVED**.
- FV-01-13: **OPEN**; final security approval: **BLOCKED**.
