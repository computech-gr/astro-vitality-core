# AI Medical Generation v2 — implementation and release gates

This patch introduces an opt-in server-mediated OpenAI Responses API draft to the existing human advisor review workbench. The provider key is server-only (`OPENAI_API_KEY`). The browser sends a Supabase user access token to the same-origin API; the server validates the user and active crew-specific `ground_medical` membership with the user-scoped Supabase client before accepting any evidence. The AI provider receives only measurement IDs, domains, canonical metric codes, values, units, timestamps and provenance, never mission or crew identifiers. Drafts are research-only, require human editing/review, and have no clinical approval. `store:false` requests provider non-storage; it is NOT a contractual privacy or zero-retention guarantee.

## Required deployment controls

1. Configure `OPENAI_API_KEY` as a server secret. Never expose in `VITE_*`, source, client, or logs.
2. Approve the provider's data processing, region, retention, security and medical-data arrangements before processing real observations. Leave `MITO_MEDICAL_AI_REAL_DATA_ENABLED` unset/false until approved. Do not assume `store:false` ensures zero retention.
3. Explicit consent is required per request. The user is warned that observation values are transmitted to the AI provider.
4. Optionally configure `MITO_MEDICAL_AI_MODEL` to an approved model (default `gpt-4.1-mini`). Restrict outbound egress and configure provider spending/rate limits externally.
5. Validate live authorization using a test account with actual crew-specific ground-medical membership. Browser tests without such membership cannot validate the feature.
6. Keep `PENDING_NIKOLAS_REVIEW` and scientific gates unchanged.

## Scope limitations and follow-up

- Advisor review remains session-only and is **not** a signed, persistent clinical record. This patch intentionally does not introduce a database migration or claim legal sign-off.
- The server validates caller membership but cannot independently verify the contents of client-side encrypted local evidence. A malicious authorized client could supply arbitrary observations. Human review is mandatory. Future production-grade evidence attestation requires server-verifiable signed ingestion or an authenticated evidence ledger.
- There is no server-side per-user request throttling; enforce gateway-level rate limits before production enablement.
- Output citation check rejects unknown bracketed IDs, but does not prove medical correctness or completeness. Model output is untrusted.
- Current review role is mission authorization, **not** professional license verification.
- The manual-export/paste option remains available; never send real data to an unapproved consumer AI account.
- No tests or typecheck were run in the patch-authoring environment because Bun/dependencies were unavailable. Lovable must run the complete CI suite, typecheck, lint, build, security scans and live authorized browser tests before deployment.
