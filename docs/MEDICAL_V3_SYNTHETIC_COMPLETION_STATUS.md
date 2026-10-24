# Synthetic v3 completion — catalog compatibility stop

The two attached manifest files were applied byte-identically. The integration is **not implemented or activated**: the supplied contract explicitly requires stopping if its fixture metric is incompatible, rather than silently remapping.

## Confirmed blocker

- Both fixture literals specify `heart_rate`, `bpm`. The unified intake uses the P36 source registry, which has no metric ID or exact label `heart_rate`.
- That registry has `cv-001`, label `HR`, unit `bpm`, domain `cardiovascular`, and provisional scientific classification. The separate live-signal catalog has `phys.heart_rate`, domain `physiological`, canonical unit `{beats}/min` with `bpm` as an alias. Neither is the exact contract identifier; no mapping, unit conversion, catalog change or scientific approval was introduced.
- A regression test confirms the exact `heart_rate`/`bpm` intake stays unclassified. Choosing an alternate identifier requires an explicit fixture-contract correction before source implementation can proceed.

## Validation executed

- Full suite: 506 tests pass, zero failures (111 files).
- Lint: zero errors, 13 existing warnings.
- Repository formatting passes. The supplied verifier is preserved byte-identically rather than reformatted away from its manifest hash.
- Completion-contract verifier and all 11 existing static release guards pass; these are not runtime acceptance evidence.
- Existing disposable PostgreSQL harnesses: 30 v3 assertions and 305 integration assertions pass. The v3 harness replaces the empty source with a test stub; it does not validate the requested fixture integration.
- 99 verifier scripts executed: 96 returned zero; three failed. Private restore evidence and owner-risk acknowledgment remain correctly blocked. The submission gate additionally fails because `data/release/mission-day-127.synthetic.json` is absent; no sealed artifact was fabricated or regenerated.
- Repository security audit passes. Fresh Trivy filesystem vulnerability/secret scan: zero HIGH/CRITICAL findings and zero secrets.
- Automatic preview validation reported build OK. Manual typecheck and production build are prohibited in this environment; exact-commit GitHub Actions validation is required and unverified.
- No live synthetic OpenAI call or desktop/mobile synthetic acceptance was performed: the required authoritative source does not exist and must remain blocked. No offline evidence was read, uploaded or promoted.

## SQL, permissions and rollback

No new migration was authored. The existing pending foundation SQL is unchanged:

`supabase/pending/20261024000000_medical_governance_v3.sql`

SHA-256: `a29e11adc7eb00c09b0c37b840d3f7546dea252e6819a383ae586257ac8c564c`

- Review events: authenticated SELECT only, scoped by active ground-medical mission/crew membership; RLS enabled, no browser write grant/policy, mutation-denying append-only trigger. Service-role grant exists but request functions use the caller, not service role.
- Quotas: RLS enabled, no browser table privileges or policies. Caller-authenticated reservation/release RPCs use advisory transaction locks. Limits are five requests per actor per minute, 20 per mission per minute and one active actor lease; these are existing foundation limits, not new production cost authorization.
- Internal evidence resolver denies browser EXECUTE and returns no records. Public-facing RPCs revoke PUBLIC/anon execution and require caller authentication/scope. AI evidence remains null; persistent operations remain feature-gated.
- There is no completed source-registry/RLS design or reviewed completion rollback SQL. A future rollback must disable source/AI/review behavior first and retain append-only history; destructive rollback and restore drills require separate authorization.

## Approval status

No production approval is requested: the contract's successful disposable implementation and acceptance prerequisite has not been met. No production migrations, Cloud writes, role changes, real-data transmission, AI activation or persistent approval activation occurred. Final managed save SHA and exact-commit GitHub Quality/Security synchronization remain unverified.