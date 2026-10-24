# Medical v3 authoritative synthetic source — implementation plan

**Status: proposed only. Not approved, implemented or activated.** No source, schema, migration, transfer, AI activation or durable approval is authorized by this plan.

## Decisions required from the owner

1. Exact synthetic fixture contents, mission and crew scope, and ownership.
2. Canonical evidence version: v1 byte parity plus separately bound receipts, or a new versioned v2 document.
3. Catalog eligibility policy (any use of `PENDING_NIKOLAS_REVIEW` entries is a separate research-only decision; no status changes).
4. Review and correction rules, privacy and retention, and the exact reviewed SQL with rollback.

Moving, syncing, backfilling or uploading offline observations would contradict the offline-only rule and is **not** part of this plan.

## Proposed components

- **Fixture manifest:** server-controlled, immutable, with stable source IDs, version, digest and declared synthetic origin. Populated only from owner-approved literal synthetic data.
- **Source adapter:** server-only resolver returning independently reconstructed evidence plus source, catalog, review and correction receipts. Fails closed; never falls back to browser snapshots.
- **Catalog policy:** pinned revision; exact metric, domain and original-unit checks; unknown or mismatched rows stay review-only.
- **Review and correction ledger:** append-only and scope-bound; rejects missing parents, cross-scope links, cycles, forks and ambiguous current versions.
- **v3 integration:** after separate approval only, implement `medical_v3_authoritative_evidence` and `medical_v3_ai_evidence` from the same effective records, and keep revocation possible without current evidence.

## Canonical bytes (if v2 chosen)

Locale-independent ID ordering, fixed field order, UTF-8, explicit nulls, exact value/unit strings, UTC timestamps, and binding of source digests, catalog revision, review decision and correction lineage. The server builds the bytes and computes SHA-256; browser hashes are comparison claims only.

## Permissions and tests

No browser grants on source tables; narrow caller-authenticated RPCs with fixed search paths; exact mission/crew ground-medical checks on every request; no new roles or service-role reads in request flow. Tests: provenance, scope, membership revocation, catalog eligibility, correction-graph edge cases, stale/revoked status, no browser fallback, cross-runtime hash parity, RLS denial, idempotency, concurrency and source outages — first in disposable databases only.

## Rollout and rollback

1. Owner decisions above.
2. Migration and permission review, retention-safe disable-first rollback, genuine restore drill, and the two private evidence gates.
3. Non-production deployment and verification, then a separate production activation decision.
4. Rollback disables RPC behavior first and preserves append-only history; any rollback or restore needs separate authorization.