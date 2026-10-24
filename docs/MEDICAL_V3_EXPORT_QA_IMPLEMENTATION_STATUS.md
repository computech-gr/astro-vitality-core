# Synthetic history export and isolated evidence Q&A

## Patch integrity and deviations

Both baseline and supplied after fingerprints matched before applying:

- `src/components/synthetic-medical-review.tsx`: baseline `bfcad148bdd1f4404ac2ca517e9d7c86a15f45d3100cf13c7ac3044df81f49e1`, supplied `56e1d85225219a66c1a3570b4857dbecc22272a3df76c2b97307ebdc3280421e`.
- `docs/MEDICAL_V3_EXPORT_AND_QA_GATE.md`: supplied `91b37e7d97647d262cf037eb9579dd9e910cc16b172ac4883ed63d4b11c5a2cd`.

The supplied files were copied exactly, then touched-file formatting and integration changes were applied. The supplied client export used a cached snapshot hash and browser clock; the integrated export instead obtains fresh authority/history twice server-side, rejects changed evidence and stamps server UTC. The patch document describes Q&A as proposed; this separate report records the owner's subsequent isolated implementation authorization. No processor change was made.

## Export behavior

- `exportSyntheticMedicalHistory` requires authenticated caller middleware and the existing disabled v3 flag, then invokes only caller-scoped snapshot/history RPCs. Missing authority, revoked scope, malformed response, cross-scope history or changing evidence denies export.
- Current canonical SHA-256 is independently recomputed and binds exact synthetic observation fields, scope and canonical bytes. Historic digests are format-validated and preserved from the authorized append-only RPC; the existing history RPC omits historical canonical bytes, so exported old digests are **not independently recomputed** here.
- UTC event timestamps, contiguous revisions, predecessor links, nondecreasing event times, event/actor identifiers, scope, provenance and verified-current digest/state are checked. Export uses server UTC `exported_at`; Q&A validates `generated_at` as UTC. Parsed history explicitly allowlists fields instead of leaking internal request metadata. No export or chat transcript is stored in browser storage.
- Export is an ordinary editable JSON file, not a cryptographic signature, attestation, legal opinion or scientific acceptance. Reviewer identifiers and review text still require careful handling.

## Isolated Q&A

- Reuses the existing server-held OpenAI key, `https://api.openai.com/v1/responses`, existing model selection/default `gpt-4.1-mini`, `store:false` and 1500-token budget through a shared provider contract. No Lovable AI Gateway call or new secret.
- Dedicated authenticated server function is disabled unless both server-only disposable-environment flags match. Neither flag was enabled in the running/published app. Existing production v3 and real-data flags remain unchanged/off.
- Explicit per-request consent and synthetic provenance are mandatory. No browser observation payload is accepted. Caller RPCs resolve scope and authoritative evidence, verify canonical hash, reserve the existing atomic quota and re-check authority after generation. Quota release is attempted for every completed provider attempt; failed release withholds output.
- Question limit is 1000 characters, with control-character/instruction and out-of-scope checks. Prompt injection is not solved by regex: the decisive answer check allows only exact literal fact templates, each with its own valid observation ID. Unknown citations, invented values, biomarkers, ranges, diagnoses and all unsupported prose are rejected, not rewritten.
- This intentionally constrained Q&A selects/restates recorded facts only; it does not infer trends or answer open-ended medical questions. It does not verify semantic relevance to every possible question. No persistent chat, automated retries or new clinical interpretation.

## Actual validation

- Full suite: **524 tests pass**, zero failures, 112 files; 15 new export/Q&A tests cover scope, consent, real-data denial, chain integrity, UTC timestamps, exact claims, injection, 429/Retry-After, provider denial/failure, stale source and release failure. Denied requests make zero provider calls.
- Real-source disposable SQL harness: **51 assertions pass**. Existing isolated database integration: **305 assertions pass**. No SQL changes or production migrations in this task.
- Additional isolated verifier uses the actual caller-scoped disposable snapshot, history and quota RPCs, not a fabricated authoritative resolver. It exported retained history successfully with canonical/UTC checks. Invalid consent, real provenance, injection and cross-scope requests made zero provider calls.
- Live OpenAI test: final isolated attempt **HTTP 200**, one provider call, **two exact valid observation citations**. Only the two invented server-controlled fixture readings and question were sent; no names, actor identifiers, offline data or real readings. First attempt withheld output because the test adapter incorrectly parsed a void release RPC as JSON; the adapter was repaired and a fresh explicit test run succeeded. No automatic provider retry.
- Authenticated existing-owner browser at **1280px/390px**: fixture load reports disabled, export/Q&A controls absent, no horizontal overflow; screenshots inspected. Full loaded export/download and Q&A browser acceptance against disposable SQL is **not verified**. The available preview uses the shared hosted backend, which must not be activated for testing.
- Lint: zero errors, 13 existing warnings. Repository formatting passes. Security audit passes; fresh Trivy: **zero HIGH/CRITICAL vulnerabilities, zero secrets**. Scientific/security verifier inventory: **96/99 pass**; 11 static medical release guards pass.
- Automatic preview validation reports build OK. Manual typecheck and production build are not run under sandbox instructions; exact-commit GitHub Actions is required for those claims.

## Remaining blockers and CI

- Authentic restore evidence (`verify-p3663-activation`) and owner-risk evidence (`verify-p3664-owner-risk`) remain blocked. Submission gate still lacks sealed `data/release/mission-day-127.synthetic.json`. No evidence fabricated or safeguard weakened.
- Full loaded desktop/mobile export/Q&A acceptance requires an isolated application attached to the disposable database; existing source/append race acceptance remains outstanding from v3 completion. Historical hash recomputation needs authorized historical canonical access, not a browser substitution.
- Public GitHub evidence checked: Quality and Security Scan both succeeded at **`13e940f8b34df71ef51285b418f5864f4a65818c`**. That is not the current managed commit; exact-final-commit synchronization/Quality/Security status is unverified. Workflow definitions or preview checks do not prove exact-commit CI.
- Latest observed managed implementation commit before this final documentation update: **`323229afa0642035d2f159e82d6c76f48f54552d`**. The platform manages subsequent commits; this is not claimed as the final documentation commit or synchronized GitHub SHA.
- No production migrations, persistent approvals, production AI activation, role changes, real-data transmission, scientific activation or publication occurred. Separate owner approval remains mandatory before production activation; complete production approval is **not requested now** while acceptance blockers remain.

## Changed files

- Supplied: `src/components/synthetic-medical-review.tsx`, `docs/MEDICAL_V3_EXPORT_AND_QA_GATE.md`.
- Integration: `src/lib/medical-governance.functions.ts`, `src/lib/synthetic-evidence-qa.functions.ts`, `src/lib/synthetic-evidence-qa.server.ts`, `src/routes/api.medical-ai-draft.ts`.
- Browser-safe contracts: `src/domain/health-intelligence/synthetic-review-export.ts`, `src/domain/health-intelligence/synthetic-evidence-qa.ts`, `src/domain/health-intelligence/medical-openai-contract.ts`.
- Tests: `tests/domain/synthetic-export-qa.test.ts`, `scripts/verify-medical-v3-export-qa.ts`.
- Documentation: `AGENTS.md`, `roadmap.md`, this report. All scientific sources, sealed artifacts, PDFs, MP4 and pending SQL remain unchanged.
