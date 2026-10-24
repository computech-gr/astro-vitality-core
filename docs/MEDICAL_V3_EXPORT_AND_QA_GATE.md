# MITOCHONDRIA v3 — Synthetic export and AI Q&A approval gate

## Implemented in this patch
- Add a JSON download of **fresh, server-authorized** synthetic Medical Advisor review history. The existing authenticated history server function enforces mission/crew authorization and the v3 feature flag. No new database tables, migrations, server secrets or permissions.
- Preserve append-only event revisions, actor identifiers, evidence SHA-256 digests, timestamps, rationales, verification status, and research-only disclaimers. This is a client-side export of the server response, **not** a digitally signed attestation or tamper-proof file. Avoid persisting exports in browser storage.
- When v3 remains disabled, the export button cannot appear until the synthetic snapshot loads; a disabled history RPC fails closed. The button re-fetches history instead of exporting stale UI state.

## AI questions — proposed, NOT implemented or approved
An in-app evidence Q&A assistant is useful, but **do not activate it yet**. Reuse the existing secured server-side OpenAI Responses route and key rather than switching silently to Lovable AI Gateway (which changes data processor, cost, telemetry and privacy controls). Require separate owner approval for any gateway change.

Before enabling Q&A: authoritative synthetic-only server evidence; caller-scoped membership and crew; per-request explicit provider consent; atomic quotas; server-side structured claim/evidence ID validation; deny diagnosis, treatment, unapproved ranges, unreferenced facts; question length and prompt-injection defenses; fail-closed on unknown citations; never use offline data or real health data; no persistent chat transcript by default. Test injection, 401/403/429, provider failures and mobile UX in an isolated environment. Scientific governance remains pending.

## Release and migration gate
- Existing staged SQL must stay unapplied until owner approval and isolated end-to-end provider/browser acceptance. Do not set `MITO_MEDICAL_GOVERNANCE_V3_ENABLED=true` or `MITO_MEDICAL_AI_REAL_DATA_ENABLED=true`.
- Restore-evidence, owner-risk and missing sealed submission artifact remain authentic-evidence blockers. Never fabricate them or weaken verifiers.
- Fix formatting, verify typecheck/build, and require GitHub Quality and Security Scan green on the **same final SHA**.
- The export may contain sensitive information even when synthetic; limit to authorized users and warn before distribution.
