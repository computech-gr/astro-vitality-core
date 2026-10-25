# Medical v3 complete synthetic activation guard candidate

## Decision: NO-GO for activation

Hardened and disposable-tested; not applied, deployed or activated. **Production synthetic Q&A now unconditionally returns 503 before any evidence RPC, reservation or provider transmission**, even with enabled flags, the pinned model and valid consent. No configuration switch or owner acknowledgment can override this safety block. Available infrastructure does not guarantee provider billing or serialize actual outbound-start with disable. This is a fail-closed corrective change, not a completed live-demo transport.

## Immutable existing evidence

- Original approved schema SHA-256: `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc`.
- Actual committed schema SHA-256: `eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237`.
- Existing reconciled seed: `131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1`.
- Existing synthetic retaining-disable: `e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3`.

None of these bytes or migration history was changed. Existing production seed success is owner-reported; this change did not query or mutate production fixtures.

## New pending artifacts

| Artifact                                                                     | SHA-256                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/pending/20261028000000_medical_demo_activation_guard.sql`          | `a12164a0e9d47b398bd4eaad35ca446a84c815511afd7c95605a87aa85adcbc1` |
| `supabase/pending/20261028000000_medical_demo_activation_guard.rollback.sql` | `b95473edf8f0cfd15b8cf5093a57a531931660281f113025636a35e8b8f2c49e` |

The schema adds three locked-down operational tables and seven functions without altering the existing fifteen v3 functions/five tables. No fixture inserts or activation calls execute in the migration. An empty authorization table defaults off. No application role receives table CRUD or TRUNCATE. Only reserve, dispatch, finish and operator disable are authenticated RPCs; activation is trusted SQL-only. These operational audit records are not clinical approvals and contain no real observations, prompts, generated text or medical rationale.

## Implemented invariants

- Exact mission `mission-9d8ce8f3e5554509a0885461f9ad2e1c`, crew `crew-9806e7e611f44dc38dac5e23f7740f1a`, membership `63470171-3a22-4075-b197-ac85b90cb0ef`, account `22a72429-1674-4174-9b27-ba63db3c0279`.
- One lifetime authorization, UTC timestamps exactly thirty minutes apart; half-open `[start,end)` validity checked using database time at reserve and dispatch. Expiry makes authorization ineffective automatically without a schedule. The stored enabled bit need not flip on expiry.
- Ten lifetime attempts. Every accepted provider attempt consumes one hold, including failures; fresh retries consume another attempt when recovery permits. No automatic provider retries. Quota-denied requests never reach the provider.
- Each accepted attempt irreversibly holds USD 0.10; ten holds exhaust USD 1.00. Reconciliation records bounded usage without refunding the hold or replenishing attempts.
- Existing 5/user/minute, 20/mission/minute ordered-lock quotas remain nested within the guard reservation transaction.
- Server-generated 256-bit nonce is never returned to the browser. One-time dispatch binds nonce, evidence and attempt. Early completion, repeated dispatch and NULL identifiers fail closed.
- Active attempt has no expiry-based unlock. Missing usage, failed provider calls, crashes and unconfirmed cleanup retain active state; safe recovery disables rather than retries or resets.
- Missing, negative or above-76,440-microUSD reconciliation permanently disables the SQL authorization, records an accounting-failure audit event, marks the outcome unknown and retains all holds. No usage beyond the modeled worst-case ceiling is accepted as bounded.
- Emergency button and signed-in server function invoke the database-checked operator disable without changing a secret or deploying. Button is not blocked by a pending UI generation operation. Disable retains holds/audit and prevents future permits.
- Legacy medical draft endpoint is production-denied so the separate governance flag cannot bypass bounded Q&A. Existing disposable path remains available.
- Authoritative source rechecked before reservation, dispatch and after the answer; exact 62/66 bpm facts/citations retained. Real-data AI, persistent reviews and clinical functionality remain denied; acknowledgment remains session-only.

## Spending proof boundaries and residual risks

Existing direct OpenAI endpoint is preserved. Candidate pins `gpt-4.1-mini-2025-04-14` rather than a mutable alias. Official model documentation lists standard uncached input USD 0.40/million and output USD 1.60/million: <https://developers.openai.com/api/docs/models/gpt-4.1-mini>. Availability and price validity require non-generating preflight before activation; documentation currently marks the family deprecated.

Only bounded text/schema payloads are permitted: at most 4096 UTF-8 serialized request bytes, 2048 conservative framing overhead tokens, maximum 1500 output tokens, no tools, files, images or extra calls. At a deliberately conservative USD 10/million for **both** input and output, the maximum modeled cost is `(4096 + 2048 + 1500) × 10 microUSD = 76,440 microUSD`, less than the USD 0.10 hold. Usage above bounds or wrong returned model blocks output/recovery. Unknown usage does not release the concurrency hold.

This establishes a conservative **conditional token-cost bound**, not independent proof of billed cash or provider policy. UTF-8 byte-token/framing assumptions, future price changes and extra provider charges must be independently guaranteed by the implementation/provider contract or replaced by a demonstrably hard scoped provider-side cutoff. Owner acceptance alone does not establish the guarantee. Provider-reported usage is reconciliation evidence only. Other applications using the same key are outside this demonstration budget. Therefore production transmission is blocked rather than trusting these assumptions. No live generation or provider billing probe was performed.

Dispatch and disable serialize in PostgreSQL, but HTTP transmission is not inside that transaction. Tests deterministically exercise both lock orderings: disable-first denies the waiting dispatch; dispatch-first completes its permit before disable, which then rejects every later permit. **A permit is not a transmission.** RPC completion cannot hold the row lock across a subsequent HTTP start, so no SQL-only success is claimed to solve that gap. The production hard block prevents the vulnerable permit-then-send path from executing at all. No configured shared serialized outbound executor was found; an in-memory mutex, another RPC check or feature flag would not coordinate multiple server instances. No new resource, privileged API or independent staging was introduced.

Any request already transmitted by an older deployed version cannot be unsent by this repository change; provider processing or billing may continue after cancellation/timeout. This corrective code has not been deployed. A future reviewed outbound executor must order actual start and disable through the same durable coordinator, fail closed on coordinator failure, avoid automatic retries and retain worst-case holds for every ambiguous/in-flight attempt. No such capability was provisioned or claimed available here.

Authenticated direct RPC calls can consume their own attempts with a caller-chosen nonce but cannot obtain the server-created nonce for an application attempt or cause unbudgeted provider sends. Trusted database owners inherently can bypass controls; they must never reset rows/counters. Audit is protected from application roles, not from the database owner.

## Executed validation

- Full Bun suite: **577 passed, zero failed**, across 121 files.
- Existing production-equivalent disposable SQL: **484 assertions passed**.
- New guard disposable SQL: **103 assertions passed**, including exact fifteen-function dependency/ACL refusal, eight concurrent reserves, early/NULL completion, nonce mismatch, replay, independent budget exhaustion, ten-attempt cap, both minute quotas, expiry between reserve/dispatch, operator access denial, revoked membership, unknown-outcome disable, over-bound accounting and repeatable retaining-disable.
- Deterministic database kill-switch tests wait until the first transaction holds the authorization lock before launching the competing operation; both orderings pass without deadlock. They verify SQL ordering only, not atomic external transmission.
- Enabled production server path denies before RPC/HTTP with the real disposable SQL service available. Eleven repeated valid requests send zero provider requests and consume zero holds. A simulated timeout provider is never invoked on this blocked path. Existing disposable Q&A/timeout/provider-failure tests remain in the full passing suite; they are not live AI or production/browser acceptance.
- Lint: zero errors, thirteen existing warnings. Security boundary audit passed.
- Fresh Trivy full-scope development/unfixed vulnerability and secret scan: **zero vulnerabilities, zero secrets**.
- Static verifiers: **99 passed / three failed**: P3663 restore evidence, P3664 owner risk and P20 official rules. All remain BLOCKED and unchanged.
- Automatic preview compile reports build OK; manual project typecheck/build is prohibited here and was not run.
- Final artifact/source fingerprint manifest: `docs/MEDICAL_V3_ACTIVATION_GUARD_SHA256.json` (excludes itself and this explanatory report to avoid recursive fingerprints).

## CI evidence

Final-hardening CI is **unverified**, not replaced by the competition release gate or historical green runs. Theodore's existing GitHub API connection successfully reads the repository's workflows. Quality contains full tests, typecheck and production build; Quality/Security run on main pushes and pull requests, not manual dispatch. During validation, public main was still `b74fbf851d20283603c00a49f05fd1776cdcf3d0`, the pre-hardening baseline, while the changing local checkout was `4d8a47a03f10ec5302620f9e6ff8c15233496948`. No stateful Git push, workflow rewriting, provider-key extraction, deployment or substitute-commit validation was performed. Only matching final synchronized runs can satisfy this requirement; no successful final run is claimed.

## Separate approvals and owner procedure (not authorized now)

1. **Schema:** after independent review and exact-commit CI, separately authorize only the pending schema fingerprint above through the atomic migration tool. Verify empty authorization/attempt/audit state, seven-function ACLs, RLS/TRUNCATE denials and unchanged v3 fixtures/history. Stop on byte/dependency mismatch.
2. **Deployment:** separately approve the exact synchronized guard commit with successful Quality, Security, typecheck and production build. Keep `MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED` unset/false until separately approved; governance/isolated/test flags stay unset/false. No migration alone enables generation.
3. **Activation is not approvable for this candidate:** first implement and independently verify guaranteed worst-case billing and shared serialized outbound-start/disable coordination in a separately reviewed change, then rerun exact-commit CI. The hard block must not be removed merely by configuration or owner acceptance. A future candidate needs separate exact future UTC start/end thirty minutes apart, ten attempts, USD 1.00 cumulative ceiling, named operator UUID, pinned model/pricing contract and activation reference approval.
4. Do not call `medical_demo_authorize` for this candidate: it cannot make the blocked production path usable and would irreversibly consume the one lifetime window. This document intentionally supplies no executable activation values. A future accepted implementation must preserve trusted SQL-only authorization, future start within 24 hours, exactly thirty minutes and no reset/replenishment. No seed is authorized.
5. **Emergency:** signed-in approved operator uses **Emergency disable AI**; failure must be followed by separately pre-authorized trusted SQL retaining-disable. Preauthorize the rollback fingerprint for emergencies before any window. It preserves fixtures, attempts, holds and audit and revokes reserve/dispatch; no drops, clinical approvals, reset or retry. Already-permitted/in-flight exposure remains as disclosed above.
6. After an ambiguous failure, stop; read operational rows/audit in the trusted editor. Do not retry, reset, clear active attempts or rerun authorization. Retaining-disable is the recovery path; future demonstrations require a new separately reviewed design, not recycling this window.

Production objects, fixtures, AI flags, deployment, immutable migration history and scientific/release gates were untouched.
