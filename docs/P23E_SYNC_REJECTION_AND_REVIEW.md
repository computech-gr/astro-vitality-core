# P23E — Sync rejection and review separation

- Deterministic input/auth errors (including unsupported event kind, invalid source provenance, oversized event identifiers and invalid idempotency keys) are quarantined as `needs_review`.
- Transport outages, timeouts, unknown errors and rate limits remain retryable. Accepted records are not rolled back.
- Offline status separates retryable/pending queue from quarantined review count. Review items are retained encrypted and excluded from automatic retry.
- No reassignment, reset, deletion or modification of legacy records. Historical Bone Health index values remain unchanged.
- Human-reviewed recovery workflow and authenticated browser/device end-to-end tests remain future work. Do not claim production readiness based on static verification.
