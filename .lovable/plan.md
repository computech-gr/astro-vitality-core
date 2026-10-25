# Medical v3 production implementation and deployment checklist

## 1. Verified baseline and production differences

Inspected 25 October 2026. Baseline `8fdba5e6e023c9fe75ed8d0f65d16bb0f7a87eeb`, not a future activation commit.

- [Quality 40163880158](https://github.com/computech-gr/astro-vitality-core/actions/runs/40163880158) passed tests/typecheck/lint/format/production build; [Security 40163880144](https://github.com/computech-gr/astro-vitality-core/actions/runs/40163880144) passed. Fresh focused tests: 13 passed/49 expectations. Historical report: 577 tests/103 guard SQL assertions, not freshly rerun.
- Production: one synthetic source/two receipts, exact 62/66 bpm observations, active fixed ground-medical membership, zero reservations/review events. Fifteen base function hashes match prerequisites; five postgres-owned RLS tables. Guard tables/functions absent.
- Candidate adds three operational tables/six functions for ten attempts, fixed window and SQL-serialized stop. Source still unconditionally denies production transmission: migration/flags alone cannot unblock it.
- Public site returns 200; HTML metadata names `853ba6a6bbf5d90b3a3bdfa648add44b4d692b84`, not proof of served server code/flags. Approved publication must attest exact implementation/configuration.
- Live base ACLs include trusted infrastructure `sandbox_exec` SELECT/INSERT; preserve/document this non-application boundary.
- Release Gate 40163880153 fails scientific/private evidence. P3663/P3664/P20 stay BLOCKED; they are independent of this demo and Quality/Security.

## 2. Exact artifacts — no substitution

Full checklist, queries and recovery details: `docs/MEDICAL_V3_PRODUCTION_ACTIVATION_DEPLOYMENT_CHECKLIST.md`.

| File | SHA-256 |
|---|---|
| `supabase/pending/20261028000000_medical_demo_activation_guard.sql` | `a12164a0e9d47b398bd4eaad35ca446a84c815511afd7c95605a87aa85adcbc1` |
| `supabase/pending/20261028000000_medical_demo_activation_guard.rollback.sql` | `b95473edf8f0cfd15b8cf5093a57a531931660281f113025636a35e8b8f2c49e` |

Both fingerprints rechecked. Schema is multiple PostgreSQL statements, **not the seed's single DO block**: use a documented atomic migration transaction with atomic journal recording. Do not submit statement-by-statement through the SQL Editor. Stop if transport cannot preserve bytes/atomicity. Functions: `scope`, `authorize`, `reserve`, `dispatch`, `finish`, `disable` (all prefixed `medical_demo_`): **six named functions in the actual file**. The previous report's seven-function count is incorrect; acceptance must require exactly these six, not invent a seventh. Three tables are `medical_demo_authorization`, `medical_demo_attempts`, `medical_demo_control_audit`.

Immutable audit facts remain distinct: approved base schema `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc`; committed base schema `eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237`, journal ID 12. Seed `131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1` is already executed: do not rerun. Old base retaining-disable `e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3` is not the new guard recovery artifact.

## 3. Smallest implementation change set — approval to prepare only

1. Reuse `/mission/health-report`, `SyntheticMedicalReview`, authenticated `askSyntheticEvidence` and existing direct OpenAI Responses integration. No new endpoint, privileged API or legacy draft activation.
2. In `src/lib/synthetic-evidence-qa.server.ts`, replace the unconditional production denial **only after an explicit policy decision**, then enforce default-off guard presence and reserve → dispatch → one fetch → finish. Missing configuration/RPCs, revoked scope, stale evidence or unknown accounting fail closed.
3. In `src/domain/health-intelligence/synthetic-activation-policy.ts`, retain ten nonrefundable USD 0.10 holds, USD 1.00 reservation ceiling, 4096 UTF-8 request bytes, 1500 output tokens and conservative USD 10/million input/output accounting. Add model-specific validation capped at 6144 input tokens; reject unsupported model/framing/pricing. Verify availability and dated pricing before pinning; model changes require new fingerprints/tests. No tools/files/images, `store:false`, 25-second timeout, no retries.
4. **Explicit policy decision:** practical stop means no new SQL dispatch permits after disable commits, not guaranteed physical outbound serialization. USD 1.00 is a conservative ledger ceiling, not guaranteed final provider billing. Approve a narrowly scoped replacement of the previous mandatory hard-guarantee rule before preparing any unblock. Risk willingness, plan approval or flags alone cannot remove the denial. If absolute guarantees remain required, retain it.
5. Keep the emergency button usable while generation is busy. Same-row database locking serializes disable/dispatch: disable-first denies; dispatch-first leaves at most one unresolved permit that can start after disable/expiry and remain billed after timeout. Unknown outcomes permanently retain attempts/holds/concurrency; recovery disables, never resets. The existing architecture cannot guarantee a hard billed ceiling or atomic SQL/HTTP start.
6. Preserve authoritative evidence checks before reservation/dispatch and after response, exact IDs/62/66 bpm/timestamps, three predefined questions and exact fact-template citations. Real provider generation is structured research text, not free medical interpretation. Keep real-data AI, legacy production drafts, persistent review/history export and clinical activation denied; acknowledgment stays session-only.
7. Add non-secret revision/policy/guard-state attestation through the existing authenticated flow, no new endpoint. Show window/counts/operator, never nonce/key/prompts. Make production review controls session-only; preserve disposable workflows.
8. Test the proposed enabled path with simulated provider and disposable SQL: exact citations, unauthorized/real input, eight concurrent reservations, ten holds, both quotas, token/cost exhaustion, both stop orderings including delayed HTTP after permit, expiry, timeout, unknown usage, failure, replay and atomic rollback. Update server tests/verifier/architecture rule; full tests/security and exact-final-SHA Quality/Security/typecheck/build are required before approval. Today's blocked-path tests do not certify the future implementation.

## 4. Deployment sequence — four separate approvals

- [ ] **Implementation/policy review:** approve preparation, explicitly deciding the changed guarantee semantics. Receive actual final implementation SHA, artifact hashes and exact-SHA CI; baseline CI does not certify future changes.
- [ ] **A — Schema approval:** authorize only the fingerprinted guard migration once through atomic trusted transport. Verify empty/off three tables, six functions, ACLs, unchanged base dependencies and atomic new journal entry. No seed or authorization call.
- [ ] **B — Deployment approval:** approve exact implementation SHA after Quality/Security/typecheck/build pass. Publish default-off and verify authenticated revision/effective configuration and denied generation without a provider call. Governance, isolated and test flags stay unset/false; production synthetic flag false.
- [ ] **C — Residual-risk acceptance:** record reviewed model/pricing, conservative-not-hard billing ceiling, permitted-before-disable/expiry exposure, timeout/in-flight billing and irreversible holds/window. Confirm the scoped hard-guarantee rule replacement was separately approved and implemented. Preauthorize exact retaining-disable hash; name an operator with active matching ground-medical scope.
- [ ] **D — Final activation:** separately approve future UTC start/end exactly thirty minutes apart (start within 24 hours), scoped operator UUID, independently verified evidence digest/reference, ten attempts and USD 1.00 reservation ceiling. Separately authorize non-generating OpenAI configuration/model verification. Make only `MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED=true` and reviewed pinned `MITO_MEDICAL_AI_MODEL` effective through approved publication while authorization is empty; verify denial, then execute the single trusted lifetime authorization template in the full checklist. Never invent/reset activation values.
- [ ] Signed-in acceptance on `/mission/health-report`: load exact fixtures, consent, request one predefined question after start; check real generated citations, one hold, session-only acknowledgment and zero persistent events. Production emergency stop ends this lifetime permanently; prove race orderings in deterministic disposable tests beforehand. No independent staging is required. Stop on uncertain outcomes; no blind retries.

## 5. Production verification SQL

Exact SELECT-only queries and the review-only lifetime authorization template are in `docs/MEDICAL_V3_PRODUCTION_ACTIVATION_DEPLOYMENT_CHECKLIST.md`, section 5: journal, fixtures/membership, table ACL/RLS, function hashes/allowlists, policies, denial trigger, window/holds/audit. Require empty guard state before activation; zero persistent reviews throughout. Reserve/dispatch calls are not read-only. Times/operator/digest require approval D.

## 6. Rollback / emergency recovery

1. Operator clicks Emergency disable AI; verify database disabled state, not merely feedback. Already-permitted/in-flight work may continue.
2. If uncertain, execute the separately preauthorized complete guard `.rollback.sql` as one DO statement in the trusted editor. Verify authorization disabled, reserve/dispatch grants denied and all holds/audit/fixtures retained. No drops, deletes, refunds or reauthorization.
3. With separate deployment approval set production flag false and restore known fail-closed code. Deployment is not the immediate stop. Preserve schema/journal; failed migration must leave both unchanged before any newly approved retry.

This plan authorizes no migration, deployment, provider call or activation. It supplies a concrete policy/implementation/deployment sequence, not another feasibility investigation.
