# Medical Governance v3 — safe completion handoff

## Current blockers (source: v3 implementation status)

- Production migration has not been approved or applied.
- Encrypted device-only observations are not available as authoritative server evidence.
- Both server evidence adapters intentionally fail closed; AI generation and durable approvals must remain blocked.
- Five existing verification gates remain red, including three copy assertions and two private owner-evidence gates.
- No full exact-commit CI validation has been established for this version.

## Required design decision before any migration or data transfer

Obtain owner approval for a **synthetic-only authoritative evidence source**. Implement it without treating browser JSON, user-provided provenance, or an unverified hash as authoritative. Define exactly how reviewer-accepted synthetic observations, source IDs, corrections, catalog eligibility and current versions are validated server-side. Any upload, new trust boundary, persistence, or managed migration requires separate explicit approval. Never backfill synthetic evidence from real patient data.

## Ordered acceptance gates

1. Confirm the final commit and CI SHA; rerun full test, typecheck, build, security and scientific gates.
2. Independently inspect the staged SQL for permissions, search_path, RLS, immutability, idempotency, quotas, rollback and operational risk. Do not deploy SQL without approval.
3. Design and separately approve the synthetic authoritative evidence adapter and privacy model. Until it exists, leave AI and durable review blocked.
4. Run isolated DB concurrency, cross-crew, revoked-role, stale-evidence, and tamper tests; include failures and rollback evidence.
5. After explicit owner approval of each production change, run authenticated synthetic end-to-end tests at desktop and mobile widths, including 429 and review history after reload.
6. Verify that Medical Advisor acknowledgement is never represented as licensed physician verification, digital signature, clinical clearance, or scientific validation. Keep PENDING_NIKOLAS_REVIEW unchanged.

## Known failures

The five failing gates in the source status must not be auto-overridden: P22 bone catalog source assertion, P22 OCR fallback copy assertion, P23J permission-copy assertion, P36.6.3 private restore evidence, and P36.6.4 private owner-risk acknowledgement. Request real evidence for the latter two; do not fabricate it.

This patch adds a static release-gate verifier and a bounded handoff. It does **not** enable production AI, apply a migration, introduce an evidence source, or claim durable medical approvals.
