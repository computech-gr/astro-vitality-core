# MITOCHONDRIA v3 — synthetic-only completion contract

Status: implementation authorization for a **disposable/non-production synthetic fixture only**. Not approval for a production migration, cloud observation upload, real medical data, or persistent clinical sign-off.

## Scope and authority

- Use only the existing synthetic demonstration mission and the existing Alex Morgan synthetic crew member; resolve their IDs from the authenticated server-side database, never trust a user-provided scope as authority.
- Use **new, explicitly marked synthetic fixture observations** generated from deterministic literals owned by this patch; never copy, sync, promote, backfill, or read device-local observations into the authoritative server fixture. These fixtures are separate from the offline research evidence and cannot attest to it.
- Do not silently treat the two previously entered local heart-rate observations as authoritative. If those records are required, stop and request a separate explicit evidence-transfer approval.
- Fixture data for a reproducible synthetic-only test: `synthetic-v3-hr-001` heart_rate 62 bpm at 2026-10-01T10:00:00Z; `synthetic-v3-hr-002` heart_rate 66 bpm at 2026-10-02T10:00:00Z. The values are **invented demonstration fixtures**, not astronaut health records. Confirm catalog metric/unit/domain compatibility before using; if incompatible, stop rather than remapping silently.
- Use a versioned v2 canonical JSON document, fixed UTF-8 key ordering, exact value/unit strings, UTC times, explicit provenance, source digest, pinned catalog revision, human-review receipt and correction lineage. SHA-256 must be recomputed on server from trusted fixture source. Do not allow a browser-asserted `reviewer-accepted` flag to become server authority.
- Synthetic review receipts are **test fixtures**, not proof of a real human review. Never label these as medically reviewed or scientific approval.

## Implement in one coherent integration

1. Stage (do not apply to production) the exact SQL/RPC/RLS for an immutable, server-controlled synthetic fixture registry and append-only review/correction receipts. Deny browser writes and direct reads. Authenticate exact caller and mission/crew for all RPCs; narrow SECURITY DEFINER search_path and privileges; test access revocation.
2. Implement `medical_v3_authoritative_evidence` and `medical_v3_ai_evidence` from the same effective server fixture records. Fail closed on unknown catalog entries, missing provenance, ambiguous corrections, forks/cycles, source outage, stale receipt, or scope mismatch. No browser snapshot fallback.
3. Require atomic quota reservation before provider call. Ensure quota failures yield 429, transient provider errors do not create approved review events, and a disabled source keeps AI blocked. No secret in browser or logs.
4. Bind durable draft/review/revoke event chains to the **server canonical SHA-256** and authenticated advisor identity. An approval must require explicit rationale and verified active ground-medical membership. UI must clearly distinguish session-only draft, synthetic fixture, server-verified event, stale and revoked; never claim legal signature or clinical certification.
5. Add regression tests for exact evidence IDs, per-statement citations, invalid references, reference-range hallucinations, scope, RLS, source outages, idempotency, concurrency, quota exhaustion, hash parity, and stale/revoked evidence. Run disposable PostgreSQL integration and browser 1280/390 tests with synthetic fixtures only.
6. Repair repository formatting and stale CI expectations only where demonstrably necessary. Never bypass private restore-evidence or owner-risk acknowledgment gates; report them separately.

## Activation gates

- Stage all SQL and prepare a precise migration diff, permissions audit, retention/rollback plan, and risk review. **Do not run production migrations or flip `MITO_MEDICAL_GOVERNANCE_V3_ENABLED`** without separate explicit owner approval after the evidence design is verified.
- Do not enable `MITO_MEDICAL_AI_REAL_DATA_ENABLED`; do not transmit real medical data.
- Do not change `PENDING_NIKOLAS_REVIEW` or scientific gates.
- Report exact tests executed, failures, CI commit SHA and whether a live synthetic OpenAI call was performed. Do not claim operational persistent review while activation remains blocked.

## Explicit next decision

After successful disposable implementation, request one narrowly scoped approval for the reviewed production SQL and synthetic-only activation. Include SQL hash, tables, grants, RLS policies, rollback, expected cost limits, and exact evidence fixtures. Do not bundle this approval with unrelated work.
