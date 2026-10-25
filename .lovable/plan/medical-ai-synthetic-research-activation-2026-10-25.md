# Medical AI synthetic research activation

## Decision

**NO-GO for activation; GO for reviewing this plan.** No application code, production data, flags or SQL artifacts were changed during this assessment. No provider request was sent. Risk willingness is not authorization to bypass the current production block.

## Verified current state

Read-only checks on 25 October 2026 found:

- One synthetic source and two non-human test receipts. Exact observations: `synthetic-v3-hr-001`, 62 bpm, `2026-10-01T10:00:00Z`; `synthetic-v3-hr-002`, 66 bpm, `2026-10-02T10:00:00Z`. Both are `cv-001`, cardiovascular, synthetic, and belong to the existing Alex Morgan demonstration scope.
- The existing authorized ground-medical membership is active for the exact mission and crew. This is database membership verification, not signed-in browser acceptance.
- All fifteen live v3 function fingerprints match the candidate's exact prerequisite pins. Functions are postgres-owned with pinned search paths. Only snapshot, evidence, quota reservation and release are authenticated-callable; anon/service-role execution is denied.
- All five existing v3 tables have RLS and deny application-role table access, including TRUNCATE. Persistent review denial trigger is installed; persistent reviews and quota reservations are both zero.
- Existing SQL enforces five attempts/user/minute and twenty/mission/minute. The three `medical_demo_*` guard tables and seven guard functions are **not installed**: production does not yet have the ten-attempt lifetime/window/cost-hold/operator-disable guard.
- `OPENAI_API_KEY` exists by secret name only. Its validity, model availability, provider billing configuration and effective deployment flags are **unverified**. No provider calls were permitted by this request.
- The canonical published website is reachable. Public assets do not attest its server commit or effective AI configuration. The unconditional production denial is verified in current repository source, not independently attested in the deployed server.

## Exact-commit checks

Source revision: `853ba6a6bbf5d90b3a3bdfa648add44b4d692b84`.

- [Quality run 40150066836](https://github.com/computech-gr/astro-vitality-core/actions/runs/40150066836): successful; job steps explicitly show tests, typecheck, lint, formatting and production build successful.
- [Security Scan run 40150066934](https://github.com/computech-gr/astro-vitality-core/actions/runs/40150066934): successful.
- Medical v3 Release Gate run 40150066903 failed. P3663 restore evidence, P3664 owner-risk acknowledgment and P20 official rules remain unchanged and BLOCKED. Synthetic-demo readiness is separate; these are not substituted for Quality/Security checks or silently waived.

These checks attest this source revision, not an unbuilt future implementation or the published server revision. Plan-only changes do not require provider generation.

## Smallest complete change to review

Keep the existing authenticated `askSyntheticEvidence` server function and existing OpenAI Responses integration. Do not add a separate AI endpoint, change providers or reuse the production-denied legacy draft path.

1. Resolve two mandatory blockers **before** removing the unconditional production denial: independently supported worst-case billing bounds and shared serialized actual outbound-start/emergency-disable ordering. SQL permit ordering alone cannot supply the latter. A byte bound plus a guessed framing allowance is not an API-enforced input-token limit or unconditional billed-cash guarantee.
2. Add an exact pinned-model tokenizer check for the complete text/schema input, plus a documented framing allowance, rejecting oversized input before reservation. Retain 1,500 output tokens, bounded payload size, no tools/files/images, no automatic retries, and conservative nonrefundable holds. Unsupported/unknown accounting, model mismatch or ambiguous outcomes disable and retain holds. Availability and deprecated-model status must be checked later without generation; any model change requires separate review, not silent replacement.
3. Preserve the pending caller-scoped guard design: one immutable thirty-minute UTC window, ten lifetime attempts including dispatched failures, existing minute quotas, one active attempt, authoritative evidence at reservation/dispatch/completion, protected operational audit and no replenishment on crashes or expired leases.
4. Preserve exact fact/citation validation, research-only warnings, real-data denial, session-only acknowledgment, and database-denied persistent clinical review. This does not authorize unrestricted medical narrative generation or inferred clinical claims.
5. Independently validate both disable/dispatch orderings, actual outbound ordering, token rejection, concurrent requests, expiry, cost exhaustion, unknown usage, timeout/Stop, no retries, partial failure and unchanged evidence. Run full exact-final-commit Quality/Security including typecheck/production build. Disposable/simulated tests are not provider billing or authenticated live acceptance.

No existing configured durable outbound coordinator or independently guaranteed provider billing cutoff has been established. If those guarantees remain unavailable, stop with **NO-GO**; do not provision infrastructure or substitute an in-memory lock. Documented residual risks can be discussed, but changing a mandatory requirement would need a distinct independently reviewed policy/design proposal and explicit approval; this plan does not propose or authorize a bypass.

## Approval and execution sequence

1. **Plan review only:** approve investigation/implementation of the above default-off candidate, with no production changes or provider requests. If the blockers cannot be resolved, no activation procedure may proceed.
2. **Candidate acceptance:** review the complete diff, revised manifest, independent guarantee evidence, tests and exact-final-commit CI. Accept the stated boundaries: already-transmitted work cannot be unsent, cancellation may not stop provider processing/billing, and an uncertain outcome must remain disabled without retries or hold refunds.
3. **Schema and emergency recovery approvals, separately:** authorize the exact final guard SQL and retaining-disable fingerprints, trusted atomic execution, and read-only post-application verification. Existing schema/seed history and fixtures stay untouched. Do not rerun seed SQL. Do not authorize the one-lifetime window yet.
4. **Deployment approval:** approve the exact reviewed and CI-passing commit; leave production synthetic AI, governance, isolated-QA and disposable/test flags unset/false. Read back the deployed server revision and denial behavior before proceeding. No deployment is authorized now.
5. **Non-generating provider preflight approval:** separately permit a credential/model metadata check using the existing OpenAI integration. Verify pinned model availability, token contract, current pricing and approved billing controls. No Responses generation. Terminal configuration/access failures stop the procedure.
6. **Window/operator/flags approval:** approve exact future UTC start and end thirty minutes apart, named existing authorized actor/operator, evidence SHA, ten nonrefundable attempts, conservative budget/holds, authorization reference, final configuration and emergency recovery procedure. The existing trusted SQL `medical_demo_authorize` interface takes `(start, end, operator UUID, reference, evidence SHA)`; supply executable values only after an accepted implementation. Never call it on today's blocked candidate or reset a consumed lifetime window.
7. **Explicit live-demo approval:** enable only `MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED=true` and the reviewed pinned model configuration when the authorization is valid. Keep `MITO_MEDICAL_GOVERNANCE_V3_ENABLED`, `MITO_MEDICAL_QA_ISOLATED_ENABLED` and `MITO_MEDICAL_TEST_ENVIRONMENT` unset/false. Sign in as the existing authorized account, select the exact Alex Morgan synthetic scope and issue a predefined question. Confirm exact observation-ID citations, source/evidence SHA, session-only acknowledgment and operational usage readback. This is the first step authorized to send a generation request; no implicit test call precedes it.
8. **Disable and verify:** the approved operator uses Emergency disable AI; verify disable confirmation, reject new transmissions and retain audit/holds. If confirmation fails or any outcome is uncertain, stop and use the separately preauthorized trusted retaining-disable recovery, then read back state. Do not clear active attempts, retry, reseed or reactivate the lifetime window.

## Unchanged artifact fingerprints

| Artifact | SHA-256 |
| --- | --- |
| Reconciled seed | `131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1` |
| Existing synthetic retaining-disable | `e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3` |
| Pending activation guard | `a12164a0e9d47b398bd4eaad35ca446a84c815511afd7c95605a87aa85adcbc1` |
| Pending activation guard retaining-disable | `b95473edf8f0cfd15b8cf5093a57a531931660281f113025636a35e8b8f2c49e` |

Approved original schema `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc` and actual committed schema `eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237` remain separate immutable audit facts. These hashes are references, not fresh execution authorization. Any implementation-changing artifact receives a new reviewed fingerprint.