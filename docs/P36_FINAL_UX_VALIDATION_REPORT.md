# P36 Unified Workflow — Final UX and Release Readiness Validation Report

Date: 2026-11-06 (UTC). Scope: authorized selectors, consolidated pending-requests summary, role-aware Ground Medical / Researcher workflows, release validation. No deployment, no production migration, no production write flags, no real user data upload.

## Changes delivered

### 1. Authorized selectors replace technical ID inputs
- **Mission**: dropdown populated only from the signed-in account's authorized Ground Medical / Researcher mission memberships (existing `AuthorizationSummary`, unchanged behavior, labels from mission code/name).
- **Crew member**: new searchable `CrewSelector` in `src/components/p36-dynamic-review-workspace.tsx` displays crew display names from authorized memberships and resolves selections to exact authorized IDs; free-text ID entry removed.
- **Provenance**: existing governed Synthetic/Real selection retained.
- **Validated catalog revision**: free-text 40-hex input replaced by a dropdown populated only from the new governed registry `data/scientific/p36-verified-revisions.v1.json` via `src/domain/health-intelligence/p36-verified-revisions.ts`. The registry is **empty** because no commit has independently verifiable CI evidence; the dropdown is disabled and governed promotion preparation is unavailable. Revisions are never generated, guessed or accepted from free text; registry tampering fails closed (entries rejected, problems reported).
- Technical IDs (mission, crew, request, revision) are shown in expandable "Technical identifiers" details for audit.

### 2. Consolidated pending review requests
- New pure module `src/domain/health-intelligence/p36-pending-requests-summary.ts` and component `src/components/p36-pending-requests-summary.tsx`.
- One summary across all locally stored and submitted requests, grouped by exact mission/crew/provenance scope: total requests, total unique terms, original 12-term batch count, additional submitted batch count (computed from data, never hardcoded), local-only / submitted / conflict status per request, request date and latest submission receipt.
- Every scope batch is expandable; per-request technical identifiers are expandable.
- Genuine duplicates are detected with the governed identity rules (normalized label + exact unit → termId) and **reported only** — originals are never deleted, merged or rewritten.
- Invalid stored entries (wrong scope, claimed approval, tampered term identity, empty) are rejected and listed, never shown as terms.

### 3. Role-aware workflows
- Ground Medical / Crew Self: per-request metadata preview, explicit consent checkbox and submission (`P36HandoffSubmission`) retained for the selected authorized scope.
- Researcher-only accounts (researcher role without ground_medical/crew_self for the scope) see **only successfully submitted and authorized cloud terms**; device-local registrations, submission controls and local-only terms are hidden, with an explanatory note.
- Independent recommendation/approval, source-validation requirements, immutable audit history and all scientific restrictions are unchanged.

## Validation results

| Gate | Result |
| --- | --- |
| New domain tests (verified revisions, pending-requests summary) | 14/14 pass |
| Full test suite | **1,184 pass / 0 fail** (189 files; +14 new) |
| Typecheck (`tsc -b --noEmit`) | Pass |
| Lint | 0 errors, 12 warnings (unchanged pre-existing baseline; new files add none) |
| Security boundary audit (`security:audit`) | PASS |
| Production build (`bun run build`) | Pass |
| Formatting gate (`format:check`: docs/md/yml only) | Pass (source TS is outside the project's Prettier gate; existing source files also warn) |
| Signed-out browser check (desktop 1280px + mobile 390px) | Pass: revision dropdown disabled with "No verified revisions registered", free-text revision input absent, mission prompt shown, no page errors |

## Exact migration hashes (staged, NOT applied)

```
0cedaaf3f848de6d9881d952de6044e53f52f68e8f69f6bfec98700587c8e193  20261107000000_p36_dynamic_handoff.sql
dc8b9d5e423fce5ef55e105d167c5db2f7e70839ca5e94a356e312d724c1e81c  20261107000000_p36_dynamic_handoff.rollback.sql
1ffc46a130abad9be7bf3838ae3cd7f6766c67a44268e674c48e015b2df2db85  20261107010000_p36_dynamic_authorization.sql
4af6a908698a20ec792c56214fa09cf6001b1ea7b556650b35104f5ca98c5704  20261107010000_p36_dynamic_authorization.rollback.sql
1b1b537aed11cba5914d7da95ff33a7521f160c9d1c4bfa426e29238551375a2  20261104000000_p36_scientific_authorization.sql
e89b84ff671cc2adea012d3bedb993ab0b078b94f049a839284649e560f684b9  20261104000000_p36_scientific_authorization.rollback.sql
```

## Unresolved blockers (precise)

1. **Real two-account authenticated browser tests** (cross-device visibility, rejected permissions, retry/conflict, scope isolation, 12-term and 197-term workflows): blocked — no isolated non-production auth/backend services are available in this environment (`FV01_PG_SOCKET_DIR` unset; no disposable PostgreSQL; live backend use is not authorized). The disposable SQL harnesses refuse to run without the socket, by design.
2. **Disposable SQL negative tests** for the staged migrations: blocked by the same absent isolated PostgreSQL.
3. **Verified-revisions registry is empty**: governed promotion preparation stays unavailable until a commit with independently verifiable CI evidence is registered through code review. Exact-revision CI remains unverified (no synchronized GitHub run evidence).
4. **The 197-term local request** was not accessed, uploaded or modified; it remains encrypted on the originating device. Batch counts in the summary are computed from whatever is actually stored.
5. Authenticated UX states (crew name rendering, researcher-only filtering, summary with real data) are covered by pure-module tests and signed-out browser checks only; authenticated browser confirmation awaits blocker 1.

## Safety confirmations

- No database migrations applied; no live data altered; no publishing or deployment.
- No scientific decisions invented; no biomarker approved; every term remains PENDING_NIKOLAS_REVIEW.
- Local encrypted evidence, sync behavior and PDF safeguards untouched.
- Label matches are never treated as medical validation; source-unvalidated terms remain blocked.
