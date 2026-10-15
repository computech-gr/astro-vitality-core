# P36.8D — Independent reviewer acceptance gate (prepared, NOT passed)

Scope: MITOCHONDRIA synthetic-only research demonstration, mission `FV01-TEST-B` only. No clinical approval. This is a **preparation and evidence protocol**, not proof of live acceptance.

## Preconditions

- Governed migration `0010_p368c_research_decisions.sql` applied exactly once, with SHA-256 `7a233de35794684da7dfc4ffd7b657c3a545bf0f96a1d6f86733853bae4f07f1`.
- Both P36.8A read-only RPCs and the P36.8C decision RPC exist with authenticated-only grants and enforced mission isolation.
- Original synthetic batch remains `pending_review` with 8 unchanged items and zero decisions; **do not decide the original batch**.
- Ground Medical `marketing@computech.gr` active in `FV01-TEST-B`, separate from Crew Self submitter. All identity and membership checks performed without disclosing credentials.
- `MISSION_TEST` and the separate external Supabase project are out of scope.
- `OWNER_MANAGED_BACKUP_RISK_ACCEPTED` is a risk waiver, NOT verified restore evidence.

## Acceptance sequence — defer until owner authorizes publication and live testing

1. Verify GitHub CI for the deployed commit, current migration history and a read-only baseline (counts, original batch ID, item fingerprint, event and audit counts). Record publication version and timestamp. Do not publish automatically.
2. After explicit owner approval, publish the P36.8B/C UI. Verify `/mission/ground` with a signed-out session: no reviewer queue or decision controls; no protected data exposed.
3. Crew Self submits a **new**, clearly synthetic batch in `FV01-TEST-B`. Record new batch ID and expected item count. Do not reuse the original eight-item pending batch.
4. Independently authenticated `marketing@computech.gr` opens `/mission/ground`, selects `FV01-TEST-B`, views the new batch and confirms only synthetic values are shown. Capture the values fingerprint before the decision.
5. Ground Medical performs **one** owner-authorized `accepted_for_research` OR `rejected_for_research` action on the new batch. Capture confirmation, status and database-issued receipt. The decision is final; do not execute it until specifically authorized.
6. Confirm the decided batch leaves the pending queue, its submitted values remain byte-identical, exactly one immutable decision event exists, and the audit row contains no values, note, filename or excerpts.
7. Verify idempotent retry against the same batch/key using a controlled method that preserves the original key. **Do not claim the UI supports replay after navigation**: a new view generates a new key and may correctly reject a second decision. Use an authorized read-only evidence check or controlled retry mechanism, never a second different decision.
8. Verify Crew Self, Mission Operator, Researcher, anonymous and other-mission accounts cannot decide or read unauthorized batch details. Do not alter live memberships for revocation tests; use disposable PostgreSQL test evidence.
9. Confirm original pending batch unchanged, `MISSION_TEST` untouched, health index and mission events unchanged by decision, and clinical features still disabled.
10. Record evidence, failures and reviewer sign-off. Mark `P36.8D ACCEPTED` **only after** live evidence and independent reviewer approval. Until then status is `READY_FOR_LIVE_ACCEPTANCE`.

## Stop conditions

Stop and report immediately on SQL fingerprint drift, unexpected schema/membership change, CI failure, exposure of protected data, non-synthetic data, wrong mission, missing independent reviewer, unexpected write, missing receipt, duplicate decision or audit privacy breach.

## Standing gates

`FV-01.13 OPEN`; `P32/P34 PENDING`; `Final Security Gate BLOCKED`; clinical features `DISABLED`. P36.8D acceptance does not close any of these gates.
