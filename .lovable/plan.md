# Medical v3 production implementation and deployment checklist

## 1. Verified baseline and deployment difference

Inspected 25 October 2026. Implementation baseline: `8fdba5e6e023c9fe75ed8d0f65d16bb0f7a87eeb`. This is the current tested source, **not a future activation implementation commit**.

- [Quality 40163880158](https://github.com/computech-gr/astro-vitality-core/actions/runs/40163880158): successful, including tests, typecheck, lint, formatting and production build.
- [Security Scan 40163880144](https://github.com/computech-gr/astro-vitality-core/actions/runs/40163880144): successful vulnerability/secret scan.
- Medical v3 Release Gate 40163880153 fails its scientific/private-evidence step. P3663, P3664 and P20 remain BLOCKED; this is not a substitute for Quality/Security and is not changed by this plan.
- Fresh focused safety tests: 13 passed, 49 expectations. The guard report records historical 577 tests and 103 guard SQL assertions; these were not freshly rerun for this planning task.

| Area | Verified production | Tested repository candidate / required delta |
|---|---|---|
| Fixtures | One source, two non-human receipts, exact 62/66 bpm observations; zero reservations/review events | Preserve all rows; no reseeding |
| Scope | Existing active ground-medical membership matches fixed account/mission/crew | Recheck at authorization, reservation and dispatch |
| Existing v3 | Fifteen function hashes match guard prerequisites; five postgres-owned RLS tables; four authenticated RPCs | Preserve all definitions and journal entries |
| Activation guard | Zero `medical_demo_*` tables/functions | Add three operational tables/six functions; initially empty/off |
| Lifetime/window/stop | Guard absent | Ten nonrefundable attempts, fixed 30-minute window, SQL-serialized disable |
| Server deployment | Public site returns 200; HTML metadata names `853ba6a6bbf5d90b3a3bdfa648add44b4d692b84` | Metadata does not attest server code or effective flags. Publish approved exact implementation and record its deployment evidence |
| Provider transmission | Effective production flags/server revision not attested | Current source unconditionally denies production Q&A before RPC/fetch. Flags or SQL alone cannot make it operational |

Live base table ACLs also include the infrastructure `sandbox_exec` role with SELECT/INSERT. This is not an application-role grant; preserve it and document the trusted infrastructure boundary. Owner/infrastructure privilege is outside protection against application callers.

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

## 4. Deployment sequence and separate approvals

- [ ] **Implementation/policy review:** approve preparation of section 3, explicitly deciding the changed guarantee semantics. Receive actual final implementation commit, schema/recovery hashes and exact-SHA CI. Current baseline CI cannot certify that future change.
- [ ] **A — Schema approval:** authorize only the reviewed fingerprinted guard migration once, with trusted atomic transport and rollback-on-failure. Its empty tables must remain off; verify six functions, three tables, ACLs, exact base dependencies and new journal row. No fixture changes or authorization call.
- [ ] **B — Deployment approval:** authorize the exact reviewed implementation SHA after Quality/Security/typecheck/build pass. Deploy default-off; verify authenticated revision attestation and denied generation without any provider call. Set governance/isolated/test flags unset/false; production synthetic flag false. No window is consumed.
- [ ] **C — Residual-risk acceptance:** sign a record naming the reviewed model/pricing, conservative-not-hard billed ceiling, permit-before-disable/expiry exposure, in-flight/timeout billing, nonrefundable holds and one-lifetime/no-reset behavior. Confirm the scoped policy replacement was actually approved and implemented. Preauthorize emergency retaining-disable by exact fingerprint and name an operator with matching active ground-medical scope.
- [ ] **D — Final AI activation:** separately approve a future UTC start/end exactly thirty minutes apart (start within 24 hours), actor/operator UUIDs, authoritative evidence digest, authorization reference, ten lifetime attempts and USD 1.00 reservation ceiling. Validate existing OpenAI key/model availability via separately authorized non-generating check; do not log secrets. Enable only `MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED=true` with `MITO_MEDICAL_AI_MODEL` pinned to the reviewed model. Published flag changes require the approved deployment step; make the flag effective while authorization is still empty, verify denial, then execute the one-lifetime trusted authorization in section 5. Flag enablement alone never authorizes requests.
- [ ] Sign in as the existing authorized ground-medical account, open `/mission/health-report`, load the two fixtures and explicitly consent. After start, request one predefined question; verify provider response/citations and one hold, session-only acknowledgment and zero persistent events. Do not exhaust ten attempts for acceptance. Verify stop using pre-dispatch deterministic tests before production; production stop ends the lifetime window permanently.

No independent staging environment is required. Failed/uncertain migration, deployment attestation, authorization or generation stops the sequence; do not retry writes blindly.

## 5. Exact verification queries and authorization template

The complete review-only SQL checklist is in `docs/MEDICAL_V3_PRODUCTION_ACTIVATION_DEPLOYMENT_CHECKLIST.md`, section 5. It includes identity, immutable migration journal, exact observations/membership, eight table ACL/RLS checks, fifteen base plus six guard function hashes/allowlists, policies, persistence trigger, authorization window/holds/attempt audit, and the trusted one-lifetime `medical_demo_authorize` template. No reserve/dispatch test is read-only. Require empty guard tables before activation and zero persistent review events throughout. All operator/time/digest values require separate approval; no activation values are invented.

## 6. Rollback / emergency recovery

1. Approved operator clicks Emergency disable AI; confirm database disabled state, not merely button feedback. Already-permitted/in-flight work may continue.
2. If uncertain, execute the separately preauthorized **complete** `20261028000000_medical_demo_activation_guard.rollback.sql` as its single DO statement in the trusted editor. It disables authorization, records audit and revokes reserve/dispatch. Verify those grants are denied and holds/fixtures/history unchanged. Do not drop tables, delete audit, refund holds or reauthorize.
3. Set production flag false and, with separate deployment approval, restore the known fail-closed application revision; do not rely on redeployment as the immediate stop. Retain schema/journal. After failed migration, atomic transport must leave both schema and journal unchanged; verify before any newly approved retry.

This plan authorizes no migration, deployment, provider call or AI activation. The remaining decision is explicit acceptance of the practical-stop/conservative-accounting contract versus retention of the stricter hard guarantees; it is not another infrastructure feasibility investigation.