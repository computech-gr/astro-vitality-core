# P36.8C — Governed Research Decision Implementation Handoff

Baseline: P36.8A migration 0009 deployed. P36.8B UI implemented, unpublished. P36.8C design exists at docs/P36_8C_IMPLEMENTATION_DESIGN.md. This handoff does NOT authorize migration 0010 deployment.

## Required implementation

Implement migration 0010 as a governed, additive, single-transaction migration, using the deployed 0006–0009 SQL as source of truth. Preserve existing quarantine logic, immutable submission values, deny-all browser table access, forced RLS, and P36.8A read-only RPCs. Support only accepted_for_research and rejected_for_research, never clinical approval. Require same-mission active independent Ground Medical membership, verified synthetic pending batch, active submitter, exact expected item count, atomic single terminal decision, append-only decision event and receipt, retry-key payload binding, and privacy-safe audit metadata. Deny direct writes and item deletes. No MISSION_TEST changes.

## Required verification before owner approval

1. Show exact migration SQL and SHA-256 and verify live schema drift/read-only preflight.
2. Execute PostgreSQL 17 disposable integration tests, including 253 existing assertions, both decision paths, cross-role and cross-mission denial, self-review denial, revocation races, concurrency, idempotency, immutable values, audit privacy and no mission/health promotion.
3. Run full bun run check, typecheck, lint, production build.
4. Stage migration 0010 and UI code but DO NOT apply migration or make any live decision. No publication or live acceptance until owner approves.
5. Explicitly identify if any schema detail or existing trigger behavior requires a design deviation.

## Acceptance sequencing

After migration approval, deploy once, verify counts unchanged and deny rules intact, then publish P36.8B/C and run one consolidated live acceptance on a NEW synthetic batch. Preserve the original pending batch. P36.8D independent acceptance follows. Standing FV-01.13/P32/P34/security gates remain unchanged.
