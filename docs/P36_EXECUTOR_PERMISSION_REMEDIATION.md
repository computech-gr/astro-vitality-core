# P36 narrow permission remediation — preparation checkpoint

No live permissions, flags, admission rows, records or installation steps changed in this pass.

## Verified source and impact

Affected installed tables: `public.p36_dynamic_admission`, `public.p36_dynamic_handoff_submissions`, `public.p36_dynamic_handoff_terms`.

`postgres` default table privileges in `public` grant `sandbox_exec` SELECT and INSERT. At creation these become **direct object grants**, not dynamically inherited default privileges. PUBLIC has no grant on these tables; no column ACLs exist. `sandbox_exec` has LOGIN, INHERIT and BYPASSRLS, no superuser or role-creation privilege, and no parent-role membership. The reverse membership is `postgres` → `sandbox_exec`; it does not give the executor postgres privileges.

Effective live access:

| Role | SELECT | INSERT | UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES |
| --- | --- | --- | --- |
| sandbox_exec | yes | yes | no |
| anon / authenticated | no | no | no |
| service_role | yes | no | no |

Executor sequence SELECT/USAGE also comes from defaults. Executor has no EXECUTE on any installed P36 function. All three tables have RLS enabled with zero policies; BYPASSRLS lets the executor use its granted INSERT despite that protection. Helpers and caller-scoped definer functions remain postgres-owned with pinned `public, pg_temp` search paths. Authorized RPCs alone have authenticated EXECUTE.

Scanning all roles found owner `postgres`, superuser `supabase_admin`, executor `sandbox_exec` and built-in `pg_write_all_data` with effective table writes. No memberships into the owner, admin or built-in writer roles were found. The built-in writer does not bypass RLS and these tables have no policies; owner/superuser remain trusted administration exceptions and cannot be bounded by application ACLs. This proposal does not claim to eliminate administrative writes.

## Exact proposed SQL

File: `supabase/pending/20261107000002_p36_handoff_executor_insert_remediation.sql`

SHA-256: `11c08f81f112f6b32234c2cb0a1f55143082678e4d36fa56f9ae1c811005c6ef`

```sql
-- PREPARATION ONLY: requires separate owner execution approval.
-- Object-local revocation only; preserve platform SELECT and sequence access.
-- Run in the supported migration tool's managed transaction.
revoke insert on table public.p36_dynamic_admission,
  public.p36_dynamic_handoff_submissions,
  public.p36_dynamic_handoff_terms from sandbox_exec;
```

One statement, in the supported migration transaction. Only three direct INSERT grants are removed. No function, RLS, read grant, sequence privilege, column, data row, default ACL, global membership or unrelated object changes. Preserving sequence USAGE is deliberate narrowness: it cannot grant table INSERT, although privileged sequence advancement remains possible and already existed.

Expected result: sandbox_exec and any inheriting child lose all direct INSERT/UPDATE/DELETE on these tables; its SELECT remains. Application/API roles keep existing access. Definer owner keeps the table/sequence privileges needed for atomic RPC submission, subject to closed admission and caller scope. Trusted administrative owner/superuser writes remain outside the application threat model.

## Platform compatibility — unresolved

The executor role characteristics and platform-provisioned defaults are live-verified. Historical project documentation calls it infrastructure and explicitly preserved its grants for a separate Medical v3 installation. Those notes are not current platform attestation. The available Lovable knowledge lookup returned no authoritative executor lifecycle or object-REVOKE compatibility documentation.

Therefore its exact internal migration/test responsibilities and **zero platform disruption cannot be verified**. PostgreSQL analysis proves owner-run DDL and definer writes still work; executor-based direct data initialization on these three tables would stop working. Whether the supported data tool uses that executor for Step 2 is not attested. No production probe was attempted. The platform needs to confirm that removing INSERT on these three P36 tables is supported and that trusted initialization transport does not rely on that privilege. Do not use an endpoint, definer bypass or temporary grant as an unapproved workaround.

## Disposable verification

`tests/integration-pg/p36-executor-acl.py`: **177 assertions PASS**. Explicit socket-only PostgreSQL under `/tmp/p36-unified/socket-preflight`, port 55439, local owner lovable, never managed PG defaults.

- Reproduced live default grants and successful executor direct INSERT despite RLS before remediation.
- Modeled an inheriting child and verified effective INSERT disappears on both roles.
- Verified actual INSERT/UPDATE/DELETE refusals for executor, inherited child and API roles on every table.
- Verified column-grant absence, SELECT preservation and unchanged sequence privileges.
- Compared defaults, memberships, function bodies/ACLs, RLS, triggers, unrelated grants and base rows before/after.
- Injected transaction failure; checked no partial revoke or restoration survives.
- Verified definer closed denial, authorized scoped local submission after disposable-only admission, scope refusal and retaining-disable.
- Restored exact original ACLs, reapplied remediation twice and preserved evidence.
- Confirmed future Step 3 inherits unsafe INSERT on `p36_dynamic_source_validation` and `p36_dynamic_authorization_events` under the same defaults.

Existing tool-compatible equivalence suite: **149 assertions PASS**. Existing P36 workflow SQL verifier: **38 checks PASS**, including synthetic 197-term and independent recommendation/decision tests. Python syntax and touched roadmap/rules formatting PASS. These use simulated SQL identities, **not** genuine authenticated browser or hosted-platform acceptance. No full application regression or hosted CI is newly claimed for this SQL-only task.

## Restoration instructions

File: `supabase/pending/20261107000002_p36_handoff_executor_insert_remediation.rollback.sql`

SHA-256: `7567bd367b71c91cd8d23ab40c280fe87bf79acb614e32794244b97315613e5c`

The exact restoration grants INSERT back on the same three tables to sandbox_exec. It restores the unsafe baseline; it is **not an automatic operational fallback**. Keep application flags unchanged. Before separately approved restoration, use trusted readback to require zero admission rows or exactly one singleton with both switches false; stop on any open or inconsistent state. Run the restoration in the supported transaction, then verify original ACLs, history and data preservation. No deletes or data rollback are involved. Original migrations and original destructive rollback files remain untouched.

## Approval checkpoint and remaining sequence

**Preparation passes local PostgreSQL verification; live execution remains BLOCKED by separate approval and platform compatibility evidence.** Approve only the exact remediation file/hash above after confirming or explicitly addressing that evidence gap; authorization here would not cover restoration, initialization, later migrations or activation.

After approved execution, re-read all roles' effective and column privileges, RLS, owner/search paths, admission state, counts and migration history. Stop on any remaining non-admin direct write path or transport failure. Step 1 must never be replayed.

Step 2 initialization remains separate and admission must stay false. Step 3 needs independently approved object-local ACL hardening for its two new tables; unchanged approved SQL is not insulated from the verified defaults. Step 4 remains unexecuted. Do not change global defaults to solve these future grants. Only after completed installation/security readback should Metadata Handoff activation and real Ground Medical → Researcher acceptance receive separate scope-bound authorization. No scientific evidence or catalog activation is authorized.