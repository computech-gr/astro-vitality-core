# Synthetic v3 completion — staged implementation status

The two attached manifest files were applied byte-identically. The owner subsequently selected `cv-001 / HR` as the corrected fixture identifier. A synthetic source, canonical v2 evidence, review controls and SQL/RPC integration are now implemented and staged, **not activated in production**. Full provider/browser acceptance and exact-commit CI are still unverified; no production approval is requested yet.

## Owner-corrected fixture scope

- Both fixture literals specify `heart_rate`, `bpm`. The unified intake uses the P36 source registry, which has no metric ID or exact label `heart_rate`.
- The owner explicitly chose `cv-001`, label `HR`, unit `bpm`, domain `cardiovascular`. Catalog revision is pinned to SHA-256 `ce2271260428b152778ad67d1cad36306a7913dd3a4442abe3aa11ea65297148`; provisional scientific classification and all pending review statuses remain unchanged. The supplied contract bytes remain unchanged; this report records the authorized correction.
- New invented fixtures only: `synthetic-v3-hr-001`, 62 bpm, `2026-10-01T10:00:00Z`; `synthetic-v3-hr-002`, 66 bpm, `2026-10-02T10:00:00Z`. Test receipts are explicitly not real human review. No offline observations are read by the source path.
- Migration resolves a unique existing active demonstration mission and Alex Morgan assignment from server records; it creates no missions, crew, users, memberships or roles. Missing/ambiguous scope yields no authoritative source. Actual hosted scope resolution is unverified because activation remains disabled.

## Validation executed

- Full suite: 509 tests pass, zero failures (111 files).
- Lint: zero errors, 13 existing warnings.
- Repository formatting passes. The supplied verifier is preserved byte-identically rather than reformatted away from its manifest hash.
- Completion-contract verifier and all 11 existing static release guards pass; these are not runtime acceptance evidence.
- Disposable PostgreSQL: the new real-source harness passes 51 assertions including exact fixture IDs/values, cross-runtime compact canonical bytes and SHA-256, RLS/grants denial, catalog/source tampering, stale/revoked receipts, cycles/forks, accepted corrections, citation rejection, concurrent approvals, concurrent quotas, idempotency, history outage and disable-first rollback. Existing integration harness passes 305 assertions; earlier foundation harness passes 30 assertions. The new harness does not replace the evidence resolver with a stub.
- 99 verifier scripts executed: 96 returned zero; three failed. Private restore evidence and owner-risk acknowledgment remain correctly blocked. The submission gate additionally fails because `data/release/mission-day-127.synthetic.json` is absent; no sealed artifact was fabricated or regenerated.
- Repository security audit passes. Fresh Trivy filesystem vulnerability/secret scan: zero HIGH/CRITICAL findings and zero secrets.
- Automatic preview validation reported build OK. Manual typecheck and production build are prohibited in this environment; exact-commit GitHub Actions validation is required and unverified.
- Authenticated existing-owner browser checks at 1280px and 390px confirm the production-disabled fixture path returns no persistent acknowledgment, with no horizontal overflow. Screenshots were inspected. This is disabled-state verification, **not synthetic workflow acceptance**. No live OpenAI call was made and provider errors/429 have not been exercised end-to-end. No offline evidence was uploaded or promoted.

## SQL, permissions and rollback

The foundation pending SQL is unchanged:

`supabase/pending/20261024000000_medical_governance_v3.sql`

SHA-256: `a29e11adc7eb00c09b0c37b840d3f7546dea252e6819a383ae586257ac8c564c`

- Review events: authenticated SELECT only, scoped by active ground-medical mission/crew membership; RLS enabled, no browser write grant/policy, mutation-denying append-only trigger. Service-role grant exists but request functions use the caller, not service role.
- Quotas: RLS enabled, no browser table privileges or policies. Caller-authenticated reservation/release RPCs use advisory transaction locks. Limits are five requests per actor per minute, 20 per mission per minute and one active actor lease; these are existing foundation limits, not new production cost authorization.
- New migration: `supabase/pending/20261025000000_medical_v3_synthetic_completion.sql`, SHA-256 `4bbe95212b9cc36eb55850a20d783b3214a73ecdb5bae1f0f27d1338ca4b2401`. It adds fixture sources, observations and append-only test review/correction receipts. Each table explicitly grants service-role access, enables RLS, has no browser policies or privileges, and denies UPDATE/DELETE by immutable triggers. Ordinary application requests never use service role.
- Internal canonical/scope/resolver helpers revoke PUBLIC/anon/authenticated EXECUTE. Snapshot and AI evidence RPCs allow authenticated EXECUTE only and reconstruct exact scope and current source internally; callers cannot promote their request IDs, scope, values or acceptance flags into authority.
- Authenticated durable append RPC remains membership-checked, hash-bound and revision-locked. New insert triggers reject unsupported fixture statements and citations even when called directly, and bind revocation to the prior approved digest. SQL text acceptance uses a deliberately narrow controlled vocabulary; valid unrestricted prose may be rejected rather than rewritten. Provider output passing browser-safe heuristics may still fail durable SQL validation.
- Rollback: `supabase/pending/20261025000000_medical_v3_synthetic_completion.rollback.sql`, SHA-256 `08cb7900d9f52c481791c8807552e4c631dad221f28a8efbe5c5e1f9eee99227`. It disables source, snapshot, append and reservation behavior while retaining history/fixtures. Smoke-tested transactionally; it is not a restore drill or destructive schema reversal. Retention duration and monetary AI budget require owner review; quota frequency is not a spending cap.
- Remaining hardening/acceptance: correction-receipt writes are privileged only, not yet coordinated with advisor append locks; history checks invalidate changed evidence on read but strict source-change/append race ordering is not proven. UI error paths mark cached approvals unverified; automatic background invalidation after remote changes is not implemented.

## Approval status

No production approval is requested: the contract's complete acceptance prerequisite has not been met. Private restore and owner-risk evidence gates remain blocked, as does the missing controlled release fixture submission gate. No production migrations, Cloud writes, role changes, real-data transmission, AI activation or persistent approval activation occurred. Final managed save SHA and exact-commit GitHub Quality/Security synchronization remain unverified.
