# Medical governance v3 implementation status

## Implemented and verified

- Both supplied manifest hashes match. The supplied contract and SHA-256 helper are preserved byte-identically.
- Pending SQL defines synthetic-only append-only review events, caller-derived actor, ordered revisions, idempotent requests, mission-and-crew ground-medical RLS, and appended revocation. Browser inserts are denied; update/delete triggers reject mutation.
- SHA-256 comparison and read-time stale/role checks are implemented against an internal authoritative-evidence interface. The production interface deliberately returns no evidence, not browser assertions.
- Custom atomic quotas are staged: five requests/user/minute, twenty/mission/minute, one concurrent request/user; reservations precede the provider call and leases expire after 35 seconds. Provider budget remains 1,500 tokens with the existing 25-second timeout. HTTP quota rejection is wired to 429 with Retry-After 60. These limits are proposed implementation defaults, not enabled production limits.
- Server functions expose gated history and append APIs with bearer verification. Offline review remains session-only. UI distinguishes draft, local acknowledgment, stale and revoked-access states and shows SHA-256 without attestation/signature claims.
- AI structure validation rejects unknown sections, nonstring/duplicate citations, embedded brackets/newlines, duplicate input IDs, wrong statement metric citations, wrong cited values and unsupported timestamps. It never rewrites invalid output. These lexical guards cannot establish clinical correctness or exhaustively detect novel biomarker names and paraphrased claims.
- Real-data AI requests are always denied. No production migration, managed database writes, user/role changes or scientific activation occurred.

## Not operational / approval requirements

1. `supabase/pending/20261024000000_medical_governance_v3.sql` has NOT been applied to production. Explicit owner approval is required before applying this exact SQL through the managed migration tool.
2. Encrypted offline unified observations have no authoritative server-readable evidence source. Both evidence adapters deliberately fail closed. Approvals, persistent drafts and provider generation remain blocked even if the migration alone is applied.
3. A separately authorized adapter must reconstruct accepted synthetic records, provenance, catalog eligibility, source IDs, current versions and corrections. No observation upload or new source trust was invented.
4. Durable save/revoke controls, verified print/export, model/request receipt persistence, end-to-end provider quota exhaustion (HTTP 429) and live revocation handling still need integration/acceptance after the source boundary is approved. Only history reading is connected in the current UI; append APIs and isolated SQL are foundation code, not a complete operational workflow.
5. No automatic corrective model retry was introduced. A rejected request ends without a draft or silent rewriting.

## Validation

- 505 tests pass, 0 fail (110 files, 8,512 assertions).
- Existing disposable PostgreSQL harness: 305 assertions pass; all pending SQL included, migration reapplication exercised.
- V3 disposable PostgreSQL harness: 30 assertions pass, including cross-mission/crew denial, tampering, idempotency, concurrent approvals, stale evidence, revoked roles, direct-insert denial, immutable history, provenance isolation and atomic concurrent quotas. Its authoritative fixture exists ONLY inside the disposable test database.
- 90 of 95 permitted verifier stages pass, including scientific freeze, P38–P47, SEO and security audit.
- Five unresolved verifier failures: P22 bone catalog source assertion; P22 OCR fallback copy assertion; P23J permission-copy assertion; P36.6.3 missing private restore evidence; P36.6.4 missing private owner-risk acknowledgment. No evidence gates were bypassed.
- Lint: 0 errors, 13 warnings. Formatting check fails on the byte-identical supplied contract; it was not rewritten merely to satisfy formatting.
- Latest automatic preview validation reports build OK after TypeScript errors were corrected. Manual full typecheck/production builds were not run; exact-commit GitHub Actions validation is required.
- Trivy filesystem vulnerability/secret scan: zero HIGH/CRITICAL vulnerabilities and zero secrets. Repository/dependency manifest scan; generated output and node_modules excluded.
- Authorized browser at 1280px and 390px: selected the existing linked synthetic crew, saved two reviewer-accepted observations encrypted locally, received the intentional AI 503 without a draft, acknowledged a manual session-only draft, and verified acknowledgment disappears on reload. Controls wrap and no horizontal overflow was observed. No persistent approval or real-data transfer was exercised.
- Existing intake paragraph/div hydration warning remains; the intentional AI 503 also appears in console. No unrelated intake change was made.

## Commit and CI

The last observed automatic save was `0cda2a7a5e96131f5ee5cb480ebafe673fdcce68`; subsequent changes and this report still require their final automatic save SHA. No manual commit/push was performed.

Public GitHub evidence at verification showed Quality and Security Scan successful on the previous baseline `341b248f1b5aa5d5ee4d74af0c50e45ab525eb59`, not this completed v3 update. Synchronization and exact-final-commit CI are unverified.

## Changed scope

Two manifest files plus necessary requested integration additions/changes: `AGENTS.md`, `roadmap.md`, this status report, `src/start.ts`, `src/components/astronaut-health-report.tsx`, `src/components/medical-advisor-workbench.tsx`, `src/domain/health-intelligence/ai-draft-validation.ts`, `src/domain/health-intelligence/medical-governance.ts`, `src/lib/medical-governance.functions.ts`, `src/lib/medical-session-middleware.ts`, `src/routes/api.medical-ai-draft.ts`, the pending SQL, `scripts/verify-medical-governance-v3.mjs`, and `tests/domain/medical-governance-v3.test.ts`.

Scientific data, sealed submission artifacts, competition PDFs/video, and existing mission data were not modified.
