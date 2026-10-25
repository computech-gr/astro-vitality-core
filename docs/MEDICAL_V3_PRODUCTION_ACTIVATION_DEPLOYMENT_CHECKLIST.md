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

| File | SHA-256 |
|---|---|
| `supabase/pending/20261028000000_medical_demo_activation_guard.sql` | `a12164a0e9d47b398bd4eaad35ca446a84c815511afd7c95605a87aa85adcbc1` |
| `supabase/pending/20261028000000_medical_demo_activation_guard.rollback.sql` | `b95473edf8f0cfd15b8cf5093a57a531931660281f113025636a35e8b8f2c49e` |

Both fingerprints rechecked. Schema is multiple PostgreSQL statements, **not the seed's single DO block**: use a documented atomic migration transaction with atomic journal recording. Do not submit statement-by-statement through the SQL Editor. Stop if transport cannot preserve bytes/atomicity. Functions: `scope`, `authorize`, `reserve`, `dispatch`, `finish`, `disable` (all prefixed `medical_demo_`): **six named functions in the actual file**. The previous report's seven-function count is incorrect; acceptance must require exactly these six, not invent a seventh. Three tables are `medical_demo_authorization`, `medical_demo_attempts`, `medical_demo_control_audit`.

Immutable audit facts remain distinct: approved base schema `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc`; committed base schema `eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237`, journal ID 12. Seed `131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1` is already executed: do not rerun. Old base retaining-disable `e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3` is not the new guard recovery artifact.

## 3. Smallest implementation change set — approval to prepare, not execute

1. Retain `/mission/health-report`, `SyntheticMedicalReview`, authenticated `askSyntheticEvidence` and direct OpenAI Responses integration. No new AI endpoint, privileged API, service-role client or legacy draft activation.
2. In `src/lib/synthetic-evidence-qa.server.ts`, retain exact synthetic scope/question validation; replace the unconditional transport denial **only after item 4's explicit policy decision** with verified guard-presence/default-off checks. Route all production requests through existing reserve → dispatch → one fetch → finish. Missing RPC/configuration, stale evidence, revoked scope or unconfirmed accounting deny generation. Keep disposable mode inaccessible in production.
3. In `src/domain/health-intelligence/synthetic-activation-policy.ts`, retain ten irreversible USD 0.10 holds (USD 1.00 ledger ceiling), 4096 UTF-8 request bytes, 1500 output tokens and conservative USD 10/million input/output accounting. Add model-specific input token validation with a hard input cap of 6144; reject unsupported framing/model/pricing. The existing byte-plus-overhead estimate alone is not a proven tokenizer bound. Pin an available OpenAI model and record dated pricing; any model/policy change requires recalculated limits, new fingerprints and tests. No tools/images/files, `store:false`, one raw fetch, 25-second timeout, no automatic retry.
4. **Required owner policy decision before removing the hard denial:** the requested practical stop and conservative accounting differ from the previously mandatory absolute billing/outbound guarantees. Explicitly approve a narrowly scoped replacement of that rule for this synthetic demo: stop means “no new SQL dispatch permits after disable commits”; USD 1.00 means nonrefundable conservative reservations, not independently guaranteed final provider billing. Update the project rule, blocker documentation and tests only in that separately reviewed change. General risk willingness, this plan's approval or a flag is insufficient. If the absolute guarantees remain mandatory, retain the denial: the current direct-provider architecture cannot deliver them.
5. Keep the existing Emergency disable AI button callable while generation is busy. Database disable and dispatch take the same authorization row lock. Disable-first rejects dispatch; dispatch-first creates at most one unresolved permit (global active-attempt lock). That request **can start after disable commits**, complete or be billed after timeout/expiry. Do not claim physical outbound serialization. Unknown outcomes retain attempts/holds/concurrency indefinitely; recovery disables, never resets.
6. Keep server-authoritative evidence checks before reserve/dispatch and after response. Exact IDs, values and timestamps must match. Permit only the existing three predefined questions and exact fact-template citations. This produces real provider-generated structured research text, not free-form medical interpretation. Keep legacy `/api/medical-ai-draft` production-denied, real-data AI denied, persistent-review/history-export disabled and acknowledgment session-only.
7. Add non-secret revision/policy/guard-state attestation to the existing authenticated console flow (not a new endpoint). Show effective authorization/counts/window/operator to authorized users without exposing nonce, key, prompts or privileged data. Replace misleading persistence actions with session-only review in production synthetic mode; preserve disposable workflows.
8. Test the actual proposed enabled path, not just today's blocked path: fake-provider success with exact citations, unauthorized scope/real data, eight concurrent reservations, ten lifetime holds, both minute quotas, token/cost exhaustion, both stop orderings including permitted-before-disable HTTP delay, expiry between reserve/dispatch, timeout, unknown usage, provider failure, replay and transaction rollback. Update the guard verifier/server tests and architecture rule. Run full Bun tests, disposable production-equivalent SQL/security tests and exact-final-SHA Quality/Security with typecheck/build. No production writes or live generation during preparation.

## 4. Deployment sequence and separate approvals

- [ ] **Implementation/policy review:** approve preparation of section 3, explicitly deciding the changed guarantee semantics. Receive actual final implementation commit, schema/recovery hashes and exact-SHA CI. Current baseline CI cannot certify that future change.
- [ ] **A — Schema approval:** authorize only the reviewed fingerprinted guard migration once, with trusted atomic transport and rollback-on-failure. Its empty tables must remain off; verify six functions, three tables, ACLs, exact base dependencies and new journal row. No fixture changes or authorization call.
- [ ] **B — Deployment approval:** authorize the exact reviewed implementation SHA after Quality/Security/typecheck/build pass. Deploy default-off; verify authenticated revision attestation and denied generation without any provider call. Set governance/isolated/test flags unset/false; production synthetic flag false. No window is consumed.
- [ ] **C — Residual-risk acceptance:** sign a record naming the reviewed model/pricing, conservative-not-hard billed ceiling, permit-before-disable/expiry exposure, in-flight/timeout billing, nonrefundable holds and one-lifetime/no-reset behavior. Confirm the scoped policy replacement was actually approved and implemented. Preauthorize emergency retaining-disable by exact fingerprint and name an operator with matching active ground-medical scope.
- [ ] **D — Final AI activation:** separately approve a future UTC start/end exactly thirty minutes apart (start within 24 hours), actor/operator UUIDs, authoritative evidence digest, authorization reference, ten lifetime attempts and USD 1.00 reservation ceiling. Validate existing OpenAI key/model availability via separately authorized non-generating check; do not log secrets. Enable only `MITO_MEDICAL_PRODUCTION_SYNTHETIC_AI_ENABLED=true` with `MITO_MEDICAL_AI_MODEL` pinned to the reviewed model. Published flag changes require the approved deployment step; make the flag effective while authorization is still empty, verify denial, then execute the one-lifetime trusted authorization in section 5. Flag enablement alone never authorizes requests.
- [ ] Sign in as the existing authorized ground-medical account, open `/mission/health-report`, load the two fixtures and explicitly consent. After start, request one predefined question; verify provider response/citations and one hold, session-only acknowledgment and zero persistent events. Do not exhaust ten attempts for acceptance. Verify stop using pre-dispatch deterministic tests before production; production stop ends the lifetime window permanently.

No independent staging environment is required. Failed/uncertain migration, deployment attestation, authorization or generation stops the sequence; do not retry writes blindly.

## 5. Production verification and activation SQL (review-only)

Run SELECT-only checks in the trusted SQL Editor before/after authorized operations. Never call reserve/dispatch for a “read-only test.”

```sql
SELECT current_user, session_user;
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
SELECT id, metric_id, value, unit, observed_at
FROM public.medical_v3_fixture_observations ORDER BY id;
SELECT count(*) AS persistent_events FROM public.medical_advisor_review_events;
SELECT id, user_id, mission_id, crew_member_id, role, active
FROM public.mission_memberships
WHERE id='63470171-3a22-4075-b197-ac85b90cb0ef';
SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) AS owner,
 r.role, has_table_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any_access
FROM pg_class c CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role)
WHERE c.relnamespace='public'::regnamespace AND
 (c.relname LIKE 'medical_demo_%' OR c.relname IN
 ('medical_advisor_review_events','medical_ai_quota_reservations',
 'medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts'));
SELECT p.oid::regprocedure AS signature, pg_get_userbyid(p.proowner) AS owner,
 p.proconfig, p.prosecdef,
 encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex') AS sha,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
 AND (p.proname LIKE 'medical_v3_%' OR p.proname LIKE 'medical_demo_%');
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public'
 AND (tablename LIKE 'medical_demo_%' OR tablename IN
 ('medical_advisor_review_events','medical_ai_quota_reservations',
 'medical_v3_fixture_sources','medical_v3_fixture_observations','medical_v3_fixture_receipts'));
SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid='public.medical_advisor_review_events'::regclass
 AND NOT tgisinternal;
```

Require unchanged fifteen base hashes; new six function definitions must match independently generated disposable fingerprints of the final approved SQL. Authenticated allowlist: four existing v3 RPCs plus guard reserve/dispatch/finish/disable only; anon/service execute false. All eight tables must be RLS, postgres-owned, application access including TRUNCATE false; no application RLS policies grant direct access. Verify policy catalog and denial trigger definitions against the approved SQL, not only counts.

After schema exists, inspect operational state without mutating it:

```sql
SELECT starts_at, ends_at, enabled, attempts, held_microusd, active_attempt,
 operator_id, evidence_sha, disabled_at,
 enabled AND clock_timestamp()>=starts_at AND clock_timestamp()<ends_at AS window_valid
FROM public.medical_demo_authorization;
SELECT id, outcome, hold_microusd, usage_microusd, dispatched_at, finished_at
FROM public.medical_demo_attempts ORDER BY reserved_at;
SELECT action, at, reference FROM public.medical_demo_control_audit ORDER BY at;
```

Before activation all three tables must be empty. Obtain canonical digest from the existing signed-in fixture load and independently validate it against caller-scoped database reconstruction; the authorization function reconstructs again. Only after approval D, substitute approved values into **one** trusted call:

```sql
-- TEMPLATE ONLY: do not run with placeholders or before approval D.
SELECT public.medical_demo_authorize(
 '<approved-start-UTC>'::timestamptz, '<approved-end-UTC>'::timestamptz,
 '<approved-scoped-operator-UUID>'::uuid, '<approved-reference>',
 '<independently-verified-sha256-digest>');
```

Actor is fixed in SQL: `22a72429-1674-4174-9b27-ba63db3c0279`; mission `mission-9d8ce8f3e5554509a0885461f9ad2e1c`; crew `crew-9806e7e611f44dc38dac5e23f7740f1a`. No second authorization, reset or quota refill is permitted.

## 6. Rollback / emergency recovery

1. Approved operator clicks Emergency disable AI; confirm database disabled state, not merely button feedback. Already-permitted/in-flight work may continue.
2. If uncertain, execute the separately preauthorized **complete** `20261028000000_medical_demo_activation_guard.rollback.sql` as its single DO statement in the trusted editor. It disables authorization, records audit and revokes reserve/dispatch. Verify those grants are denied and holds/fixtures/history unchanged. Do not drop tables, delete audit, refund holds or reauthorize.
3. Set production flag false and, with separate deployment approval, restore the known fail-closed application revision; do not rely on redeployment as the immediate stop. Retain schema/journal. After failed migration, atomic transport must leave both schema and journal unchanged; verify before any newly approved retry.

This plan authorizes no migration, deployment, provider call or AI activation. The remaining decision is explicit acceptance of the practical-stop/conservative-accounting contract versus retention of the stricter hard guarantees; it is not another infrastructure feasibility investigation.