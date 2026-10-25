# Medical v3 production implementation and deployment checklist

## 1. Verified baseline and deployment difference

Inspected 25 October 2026. Implementation baseline: `8fdba5e6e023c9fe75ed8d0f65d16bb0f7a87eeb`. Historical pre-implementation inspection only; this is **not the final practical-guard implementation commit**. Production has not been re-inspected or modified in this preparation.

- [Quality 40163880158](https://github.com/computech-gr/astro-vitality-core/actions/runs/40163880158): successful, including tests, typecheck, lint, formatting and production build.
- [Security Scan 40163880144](https://github.com/computech-gr/astro-vitality-core/actions/runs/40163880144): successful vulnerability/secret scan.
- Medical v3 Release Gate 40163880153 fails its scientific/private-evidence step. P3663, P3664 and P20 remain BLOCKED; this is not a substitute for Quality/Security and is not changed by this plan.
- Revised preparation: 579 tests, 484 base SQL plus 109 guard SQL assertions, security audit and zero-finding full-scope Trivy. See `MEDICAL_V3_COMPLETE_SYNTHETIC_ACTIVATION_GUARD.md`. Final exact-SHA CI must pass independently.

| Area                  | Verified production                                                                                        | Tested repository candidate / required delta                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixtures              | One source, two non-human receipts, exact 62/66 bpm observations; zero reservations/review events          | Preserve all rows; no reseeding                                                                                                                                                   |
| Scope                 | Existing active ground-medical membership matches fixed account/mission/crew                               | Recheck at authorization, reservation and dispatch                                                                                                                                |
| Existing v3           | Fifteen function hashes match guard prerequisites; five postgres-owned RLS tables; four authenticated RPCs | Preserve all definitions and journal entries                                                                                                                                      |
| Activation guard      | Zero `medical_demo_*` tables/functions                                                                     | Add three operational tables/seven functions; initially empty/off                                                                                                                 |
| Lifetime/window/stop  | Guard absent                                                                                               | Ten nonrefundable attempts, fixed 30-minute window, SQL-serialized disable                                                                                                        |
| Server deployment     | Public site returns 200; HTML metadata names `853ba6a6bbf5d90b3a3bdfa648add44b4d692b84`                    | Metadata does not attest server code or effective flags. Publish approved exact implementation and record its deployment evidence                                                 |
| Provider transmission | Effective production flags/server revision not attested                                                    | Revised source requires matching `synthetic-practical-v1` status, default-off configuration and atomic guard permit; missing migration/authorization denies before provider fetch |

Live base table ACLs also include the infrastructure `sandbox_exec` role with SELECT/INSERT. This is not an application-role grant; preserve it and document the trusted infrastructure boundary. Owner/infrastructure privilege is outside protection against application callers.

## 2. Exact artifacts — no substitution

| File                                                                         | SHA-256                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/pending/20261028000000_medical_demo_activation_guard.sql`          | `f796b9c84d7bf17ffc18cd75cab61bcc313e0c60fb395332f5f392b345779e9a` |
| `supabase/pending/20261028000000_medical_demo_activation_guard.rollback.sql` | `b95473edf8f0cfd15b8cf5093a57a531931660281f113025636a35e8b8f2c49e` |

Both fingerprints rechecked. Schema is multiple PostgreSQL statements, **not the seed's single DO block**: use a documented atomic migration transaction with atomic journal recording. Do not submit statement-by-statement through the SQL Editor. Stop if transport cannot preserve bytes/atomicity. Functions: `scope`, `authorize`, `status`, `reserve`, `dispatch`, `finish`, `disable` (all prefixed `medical_demo_`): **seven functions in this revised file**. The earlier candidate actually contained six; this revision intentionally adds read-only caller-scoped status. Three tables are `medical_demo_authorization`, `medical_demo_attempts`, `medical_demo_control_audit`.

Immutable audit facts remain distinct: approved base schema `2024f9023006ba4b8134919f1efb7c8f7c550a19668681d5a6a673b53dc6affc`; committed base schema `eb0921ca3155d4e15c9cfb2d60996de85ef53a04956634970ea1a4fc75ffe237`, journal ID 12. Seed `131502bd285c5714586220f05f2f2a0da43c383a88b92dd5372ef0ea811095e1` is already executed: do not rerun. Old base retaining-disable `e7eb66b4e676aac6b410ca18aaa3ac2758e4ec8bbc7ef809f681415b96cf09b3` is not the new guard recovery artifact.

## 3. Prepared implementation — no production execution

- Existing authenticated OpenAI Responses path now requires matching guard status then reserve → one-use dispatch → single provider fetch → finish. Exact synthetic scope/evidence/citations and legacy/real-data/persistent-review denial are preserved.
- Local bundled o200k tokenizer enforces 6144 input admission tokens including a conservative 2048 framing allowance; complete request also capped at 4096 UTF-8 bytes. Model is `gpt-4.1-mini-2025-04-14`, provider output cap/local output validation 1500 tokens. USD 10/million input/output is conservative estimated accounting, not cash billing attestation. Dated pricing/model availability needs separately authorized non-generating verification before activation.
- Ten irreversible USD 0.10 holds, one lifetime thirty-minute UTC authorization, both existing minute quotas, unknown-outcome permanent stop and retaining-disable are enforced by SQL.
- Emergency disable denies new SQL permits, not previously permitted/network-in-flight work. The owner explicitly accepted this race and non-guaranteed billing; no second policy approval is needed unless controls change.
- Authenticated console reports scoped status/counts/window/operator/config and optional operator-supplied revision label, not independent Git attestation. Emergency disable stays usable while generation is busy and discards delayed answers locally.
- Executed: 579 tests, 593 disposable SQL assertions including enabled server integration with simulated provider, token exhaustion, denial/dispatch races, timeout/429/no retries, unknown accounting, atomic failure and retaining-disable. No real provider/browser acceptance is claimed.

## 4. Deployment sequence and separate approvals

- [x] **Policy/preparation approval:** owner explicitly approved practical estimated accounting and permit-before-disable/in-flight limitations for synthetic-only research. This does not authorize production execution.
- [ ] Review final implementation hashes and successful exact-SHA CI; historical baseline CI is not a substitute.
- [ ] **A — Schema approval:** authorize only the reviewed fingerprinted guard migration once, with trusted atomic transport and rollback-on-failure. Its empty tables must remain off; verify seven functions, three tables, ACLs, exact base dependencies and new journal row. No fixture changes or authorization call.
- [ ] **B — Deployment approval:** authorize the exact reviewed implementation SHA after Quality/Security/typecheck/build pass. Deploy default-off; verify authenticated revision attestation and denied generation without any provider call. Set governance/isolated/test flags unset/false; production synthetic flag false. No window is consumed.
- [x] **C — Residual-risk policy acceptance:** recorded by owner for the controls above; no redundant approval request.
- [ ] Preauthorize emergency retaining-disable by exact fingerprint and name an operator with matching active ground-medical scope; any changed model/controls require renewed review.
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

Require unchanged fifteen base hashes; new seven function definitions must match independently generated disposable fingerprints of the final approved SQL. Authenticated allowlist: four existing v3 RPCs plus guard status/reserve/dispatch/finish/disable only; anon/service execute false. All eight tables must be RLS, postgres-owned, application access including TRUNCATE false; no application RLS policies grant direct access. Verify policy catalog and denial trigger definitions against the approved SQL, not only counts.

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

This plan authorizes no migration, deployment, provider call or AI activation. Policy acceptance is recorded; remaining approvals are the exact schema, implementation deployment, emergency recovery and final UTC activation/configuration. No independent staging requirement is introduced.
