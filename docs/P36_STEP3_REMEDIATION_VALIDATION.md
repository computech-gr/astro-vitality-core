# P36 Step 3 remediation — validation PASS, execution not authorized

## Independent audit acknowledgment

A separate read-only audit confirmed the approved Step 3 source is 23,901 bytes, SHA-256 `8c038a0a797441a0245092dbaa5a14567ef39ba88884d8b0a2ce4be4d01b0a4d`; installed artifact is 23,900 bytes, SHA-256 `796ded9d0d7341a417555d1e1852edf0528203842bec555d9e1e20242b582434`. Approved bytes equal installed bytes plus exactly one final LF. Every SQL statement and its order are identical. The owner’s 07:46 UTC conditional acknowledgment is therefore supported by the independent comparison. No replay or committed history rewrite occurred.

## Exact tested artifact

`supabase/pending/20261107010001_p36_authorization_executor_insert_remediation.sql`

SHA-256: `90d89ad74bf6e5f163a6f2cd1cac14cbc6761d2a235960e325ead539cf2f1d2b`

```sql
-- PREPARATION ONLY: separate owner approval required; managed transaction.
-- Preserve SELECT, sequence access, RLS and existing caller-scoped functions.
revoke insert on table public.p36_dynamic_source_validation,
  public.p36_dynamic_authorization_events from sandbox_exec;
```

This is the existing 276-byte artifact, unchanged and hash-asserted by the test. Exactly two direct INSERT grants are removed. Live readback still shows sandbox_exec SELECT/INSERT on both tables: testing did not execute this against the live backend. The grants came from postgres table defaults; not PUBLIC or role inheritance. No other permission changes are proposed.

Expected post-execution: executor and any inheriting child lose direct INSERT; existing UPDATE/DELETE/TRUNCATE denials remain. API roles remain denied direct table writes. Executor/service-role SELECT and sequence access remain unchanged. RLS, policy count, function ACL/body/ownership/search paths and immutable triggers are unchanged. Trusted owner administration remains possible and is not an unauthorized application path.

## Validation evidence

- **261 assertions PASS** in `tests/integration-pg/p36-executor-acl.py` (177 existing plus 84 authorization-specific assertions): exact artifact hash, effective direct/inherited ACLs, actual INSERT/UPDATE/DELETE refusal, column-grant absence, preserved SELECT/sequence access, defaults, memberships, RLS, immutable triggers, function bodies/ACLs, missions/membership/scientific-dossier/audit test rows, transaction failure, closed RPC denial, scoped RPC read, exact ACL rollback, idempotent reapplication and evidence preservation.
- **38 workflow checks PASS** in `scripts/verify-p36-dynamic-pg.ts`, with `P36_EXECUTOR_ACL_VALIDATION=1` and both exact remediations applied in disposable transactions. Includes 197-term atomic submission, Ground Medical recommendation, independent Researcher decision, source-validation denial, replay/conflict, mission/crew/provenance isolation, revocation and retaining disable. This verifies definer writes still work despite revoked executor INSERT.
- Python syntax, modified verifier lint and roadmap formatting PASS.
- Explicit local socket `/tmp/p36-unified/socket-preflight`, port 55439, local owner lovable; no managed PG defaults. Disposable server stopped after validation.

These are PostgreSQL identity simulations, not real authenticated browser acceptance or complete hosted-platform compatibility attestation. Real records were not used in tests. Existing platform grant semantics for service_role function EXECUTE are preserved, not changed; caller-scoped RPCs still require identity and membership. Owner/superuser remain privileged administration exceptions.

## Rollback

Prepared, not executed or separately approved: `supabase/pending/20261107010001_p36_authorization_executor_insert_remediation.rollback.sql`

SHA-256: `cc35da509d51d964cdbb9560186ee69b0e84efd975ee662b65b11a6c269ab938`

It restores only sandbox_exec INSERT on these two tables, exactly matching pre-remediation ACLs in tests. This reopens the unsafe privileged direct-write path and must never be an automatic fallback. Separate owner authorization and trusted readback of exactly one singleton with both switches false are required first. Execute in a supported transaction; no data/history removal occurs.

## Live safety confirmation

Read-only checks after testing confirm exactly one singleton=true, handoff_open=false, authorization_open=false, change_note='initial: closed'. Live grants remain unchanged; no remediation, Step 4, flags, metadata upload, memberships, publication, scientific authorization or catalogs changed. Original approved migration files and committed artifacts remain untouched.

## Precise execution approval

“Authorize only `supabase/pending/20261107010001_p36_authorization_executor_insert_remediation.sql`, SHA-256 `90d89ad74bf6e5f163a6f2cd1cac14cbc6761d2a235960e325ead539cf2f1d2b`, through the supported transactional migration mechanism, preserving exact bytes. Verify effective direct/inherited/column permissions, unchanged SELECT/sequence grants, RLS, RPC ownership/ACLs, immutable triggers, both closed admission switches and migration history. Stop on any discrepancy. Do not replay Step 3 or execute rollback. After successful checks, resume only the already approved Step 4 with its exact hash and verify it; no activation, flags, upload, membership changes, publication, science or catalog changes.”

After remediation and Step 4 pass, request separate Metadata Handoff activation and real Ground Medical → Researcher acceptance authorization. Installation validation does not itself authorize submission or scientific decisions.
