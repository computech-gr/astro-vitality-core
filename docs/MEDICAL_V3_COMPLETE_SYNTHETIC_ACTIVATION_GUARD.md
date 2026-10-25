# Medical v3 practical synthetic research guard — prepared, not activated

## Owner policy and scope

On 25 October 2026 the owner explicitly approved replacing absolute provider-billing and atomic network-dispatch guarantees with practical controls for this synthetic-only research demonstration. This approval permits repository preparation/disposable validation only. No production SQL, deployment, AI flag changes, provider requests or release-gate changes occurred.

Existing `/mission/health-report` → `askSyntheticEvidence` → OpenAI Responses integration is reused. No new AI endpoint or service-role client. Only the existing exact mission/crew/account/membership and three predefined questions are accepted. Authoritative 62/66 bpm observations retain exact IDs, timestamps, cv-001 and cardiovascular classification. Real data, legacy production drafts, persistent reviews and clinical functionality remain denied. Acknowledgment is session-only; delayed responses after local emergency stop are discarded.

## Prepared SQL artifacts

- Schema: `supabase/pending/20261028000000_medical_demo_activation_guard.sql`
  SHA-256 `f796b9c84d7bf17ffc18cd75cab61bcc313e0c60fb395332f5f392b345779e9a`.
- Retaining-disable: `supabase/pending/20261028000000_medical_demo_activation_guard.rollback.sql`
  SHA-256 `b95473edf8f0cfd15b8cf5093a57a531931660281f113025636a35e8b8f2c49e` (unchanged).

Revised schema adds three locked-down operational tables and **seven functions**, now including caller-scoped `medical_demo_status`. The earlier candidate actually contained six functions despite its seven-function report. No fixture seeding or authorization calls execute in the migration. Only status/reserve/dispatch/finish/disable are authenticated RPCs; activation is trusted SQL-only. All application table CRUD/TRUNCATE remains denied, with explicit owner grants followed by revocations and RLS. Base fifteen-function fingerprints, permissions and persistence-denial trigger must match exactly before any guard object is created.

Original schema approval `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc` and actual committed schema `eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237` remain immutable distinct facts. Existing seed `131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1` and base retaining-disable `e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3` are unchanged; do not reseed or rerun the committed base migration.

## Enforced practical controls

- `synthetic-practical-v1` status must match and be eligible before evidence/generation. Missing migration, mismatched version, disabled/expired/exhausted authorization, wrong scope or unresolved active attempt fails closed. Status is advisory; atomic reserve/dispatch recheck authority.
- Exactly one lifetime authorization with a future UTC start within 24 hours, end exactly 30 minutes later, half-open validity checked using database time at reservation and dispatch. Expiry denies permits automatically; it does not need to flip stored enabled state.
- Ten lifetime attempts, each irreversibly reserving USD 0.10; USD 1.00 is an **estimated reservation ledger ceiling**, not a guaranteed cash billing ceiling. Failures never refund attempts/holds. Quota-denied/invalid requests do not transmit or consume a provider attempt.
- Existing five/user/minute and twenty/mission/minute quotas run inside the guard transaction. Global active attempt blocks concurrent sends without lease-expiry recovery.
- Pin `gpt-4.1-mini-2025-04-14`; unchanged model availability/dated pricing need a separately authorized non-generating check before activation. No fallback or mutable alias. Conservative USD 10/million input/output accounting; maximum modeled usage cost 76,440 microUSD, below each 100,000-microUSD hold.
- 4096 UTF-8 bytes for complete request; bundled `js-tiktoken@1.0.21` o200k tokenizer counts complete serialized instructions/input/schema plus 2048 conservative framing allowance; reject above 6144 local estimated input tokens. Provider output cap 1500, local output token validation and usage reconciliation both enforced. Provider-side hidden framing is not independently controllable; above-limit reported usage is rejected and permanently disables further dispatch. This is a strict local input admission bound and provider-requested output bound, not proof of hidden provider tokenization.
- `store:false`; text/schema only; no tools/files/images; one raw fetch, 25-second timeout, no automatic retries. Unknown/missing/over-bound usage, model mismatch or unconfirmed completion withholds answer and retains holds. Unknown accounting permanently disables; crashed/pre-dispatch ambiguous attempts block further work until retaining-disable.
- Server nonce is never returned to browser; dispatch is one-use and binds evidence/attempt. Evidence is reconstructed before reservation/dispatch and re-read after answer. Exact fact-template statements and observation-ID citations are validated, not rewritten.

## Emergency stop and accepted limitations

Signed-in approved operator invokes database-checked disable through the existing button/server function; button remains usable while generation is busy. Disable and dispatch lock the same authorization row. Disable-first denies a waiting permit; permit-first may allow **one already-permitted request to begin network transmission after disable commits**. SQL and HTTP are not atomic. Already-transmitted work cannot reliably be cancelled and may complete/bill after timeout, expiry or disable. These are the owner's explicitly accepted limitations, not claims of physical cancellation.

Actual provider billing may exceed USD 1.00 (pricing changes, hidden framing/provider behavior, other use of the same key). Nonrefundable estimated holds and conservative accounting mitigate but do not eliminate this risk. No live provider generation or billing verification was performed. Trusted owners/infrastructure remain privileged; they must not reset/replenish audit/counters.

## Executed validation

- Full Bun: **579 passed, zero failed**, 122 files, 9497 expectations.
- Production-equivalent disposable base SQL: **484 passed**.
- Revised guard disposable SQL: **109 passed**, including seven functions/status scope, exact prerequisites, late-failure atomic rollback, eight concurrent reserves, lifetime/budget exhaustion, both minute quotas, nonce/replay/NULL denial, expiry, both SQL kill-switch orderings, unknown/over-bound usage and retaining-disable.
- Existing production server candidate executes reserve → dispatch → simulated provider → exact citation validation → finish against real disposable SQL. One permanent hold and one attempt are read back. No live provider request or production/browser acceptance is implied.
- Unit server tests cover missing guard across eleven requests, disabled status, rejected dispatch (zero sends), accepted permit-before-disable race, timeout without retry, provider 429/unknown accounting and failed reconciliation. Local input/output tokenizer limits tested.
- Security audit passed; lint zero errors/13 existing warnings; full-scope Trivy including development/unfixed findings: zero HIGH/CRITICAL vulnerabilities/secrets.
- Scientific/security verifiers: 99 passed/3 failed on unchanged P3663, P3664 and P20 owner evidence. No release gates weakened.
- Preview compilation reports build OK. Full manual typecheck/build is not run here; exact synchronized GitHub Quality/Security/typecheck/build must be checked for the saved final revision. Preparation baseline or prior green runs do not certify this revision.

## Deployment checklist and approvals still required

1. Review final fingerprints/source and successful exact-commit Quality/Security including typecheck/build. Final saved SHA/CI inventory is returned separately; a repository saved after reporting may have a different documentation commit. No substitute SHA is accepted.
2. **Schema approval:** separately authorize ONLY the revised schema hash above through atomic migration+journal transport, preserving exact SQL bytes. It is multiple statements, not the seed's single DO block. Verify rollback-on-failure before executing. Confirm three empty/off operational tables, seven pinned functions, five authenticated guard RPCs, RLS/CRUD/TRUNCATE denials, unchanged base fixtures/reviews and exact migration journal. Compare function definitions to `docs/MEDICAL_V3_PRACTICAL_GUARD_FUNCTIONS_SHA256.json`.
3. **Deployment approval:** separately authorize exact reviewed implementation SHA; deploy default-off, model pinned, governance/isolated/test flags unset/false. Optional server `MITO_MEDICAL_DEPLOYMENT_REVISION` is an operator-supplied non-secret 40-hex label, NOT independent artifact attestation. Verify label against actual deployment evidence. Missing guard/config stays denied.
4. Residual-risk policy approval is now recorded; do not request it again unless model/limits/stop semantics change. Preauthorize exact retaining-disable hash for emergency recovery; name existing scoped operator.
5. **Final activation authorization:** separately approve future UTC start/end, scoped operator UUID, independently verified authoritative digest/reference, ten attempts and estimated USD 1.00 ledger. Authorize non-generating provider configuration check separately. Make only production synthetic flag true and pinned model effective through approved publication while authorization is empty; verify denial, then execute one trusted `medical_demo_authorize` call using approved values. Do not invent times, reset or reauthorize.
6. Signed-in console acceptance after separate activation: load exact fixtures, consent, generate one predefined research answer, read back exact IDs and one hold/attempt, acknowledge session-only, verify zero persistent reviews. This live flow remains unperformed by design. No independent staging requirement is introduced.

Production SELECT-only verification queries and authorization template are in `docs/MEDICAL_V3_PRODUCTION_ACTIVATION_DEPLOYMENT_CHECKLIST.md` (updated for this policy). Never invoke reserve/dispatch as a read-only probe.

## Rollback / recovery

Operator emergency disable first; confirm database disabled, not merely UI feedback. If uncertain, use separately preauthorized complete guard retaining-disable DO artifact: disabled state/audit retained and reserve/dispatch privileges revoked. Keep all fixtures, attempts, holds, schema and journal. No deletes, drops, resets, refunds or retries after unknown outcome. Set production flag false and restore known fail-closed deployment only with separate deployment authorization; deployment is not the immediate stop. Existing permitted/in-flight requests remain subject to documented limitations.
