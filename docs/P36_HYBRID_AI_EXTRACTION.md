# P36 — Automatic Hybrid AI Medical Document Extraction: results

Date: 2026-10-28. Scope: one shared automatic hybrid extraction pipeline across
Bone, Immune, Cardiovascular and Behavioral Health. No migrations, no RLS
changes, no release-gate changes, no publishing.

## What was built

- **Supplied validator** (`src/domain/medical-document/ai-extraction-contract.ts`):
  applied from the P36 package. One integration fix was required: the supplied
  file used dot access on `Record<string, unknown>`, which this project's
  `noPropertyAccessFromIndexSignature` tsconfig rejects (40 TS4111 errors).
  Converted to bracket access; validation logic, messages and limits are
  unchanged. The Challenge 02 PDF is byte-preserved (SHA-256
  `877dc53c59c3759441c03713b31d0758ecaf3f36e3f77a5b7b88cd4fb09ec4bd`).
- **Shared policy** (`ai-extraction-policy.ts`): endpoint path, 20,000-character
  bounded text representation, 12-page limit, and the assistance trigger
  (local parsing empty, held or rejected rows).
- **Client hybrid engine** (`hybrid-extraction.ts`): runs the existing
  deterministic parser first; when incomplete, automatically calls the server
  endpoint (no AI button, no per-document approval). Provider output is
  re-validated client-side against the domain catalog, merged by
  document/page/analyte/value/unit evidence keys; exact duplicates are skipped,
  conflicts with deterministic results are held (local value kept), and every
  AI row is unchecked with `provenance: "ai"`. A collection/report timestamp is
  never promoted to the observation date; it is recorded in the row notes as
  document metadata. AI failure or denial never discards local results — it is
  shown as a visible status instead.
- **Server endpoint** (`/api/medical-document-extraction`,
  `src/routes/api.medical-document-extraction.ts` +
  `src/lib/medical-document-extraction.server.ts`):
  - Same-origin POST, bearer session validated, membership checked as the
    caller (RLS): assigned Crew Self for the exact scope, or Ground Medical in
    the mission with an active Crew Self roster match — the existing import
    access policy.
  - Default deny: `P36_DOCUMENT_AI_ENABLED=true` master gate; `provenance:
"real"` additionally requires `P36_REAL_DOCUMENT_AI_ENABLED=true`. Neither
    is set in any managed environment, so the endpoint currently answers 503
    and sends nothing.
  - Provider allowlist: `lovable` (Lovable AI Gateway `/v1/responses`, model
    `openai/gpt-6-astra`, `LOVABLE_API_KEY`) or `openai` (existing medical
    contract `/v1/responses`, `gpt-4.1-mini`, `OPENAI_API_KEY`). `P36_AI_MODEL`
    must be on the allowlist. Credentials never leave the server.
  - Bounds: 25 s timeout, no automatic retries, 4,000 max output tokens,
    strict `p36.1` JSON schema, best-effort per-user rate limit
    (`P36_AI_RATE_PER_HOUR`, default 10/hour, per-isolate — not a
    cross-instance guarantee).
  - The provider call streams (SSE) and is assembled server-side; the browser
    receives one validated JSON response.
  - Audit events contain correlation-safe metadata only (user, domain,
    provenance, SHA-256 of the text, counts, provider/model, usage, duration) —
    never raw document contents.
- **Queue/UI wiring**: `processBoneFile` is wrapped once in
  `processBoneFileWithAi`, shared by all four domains through the existing
  per-domain profiles. The review table labels AI rows "AI-assisted suggestion —
  unverified", shows an AI status line (added/duplicates/held or
  unavailable/denied with reason), and keeps Verify All, shared-date
  confirmation, corrections, duplicate detection, encrypted append-only
  storage and tab retention unchanged. Session retention persists the
  provenance label only (allowlisted, validated).
- The legacy `/api/medical-ai-draft` guard is untouched; synthetic evidence
  Q&A is unchanged.

## Actual extraction results

### Live provider call (synthetic demo configuration, real provider — not mocked)

The exact Challenge 02 PDF text (1,457 characters, 1 page) was sent through the
real server module to the Lovable AI Gateway, model `openai/gpt-6-astra`
(reasoning effort low, strict schema, streaming). Result HTTP 200, 5.9 s,
usage 1,658 input + 629 output tokens (2,287 total; workspace-credit cost per
the gateway rate card). All five expected synthetic immune measurements were
returned with correct catalog IDs, values and units as printed:

| Catalog | Analyte                   | Value | Unit (as reported)  | Date handling                             |
| ------- | ------------------------- | ----- | ------------------- | ----------------------------------------- |
| IMM-001 | Total leukocytes / WBC    | 6.7   | x10^9/L             | collection → held for manual confirmation |
| IMM-002 | Neutrophils, absolute     | 3.8   | x10^9/L             | collection → held                         |
| IMM-003 | Absolute lymphocyte count | 2.2   | x10^9/L             | collection → held                         |
| IMM-007 | hs-CRP                    | 2.4   | mg/L                | collection → held                         |
| IMM-006 | NLR                       | 1.73  | dimensionless ratio | collection → held                         |

The header collection time (14 October 2026, 07:35 UTC) arrived as
`dateKind: "collection"` with `observedAt: null` on every row — never as an
observation time. Reference intervals and instrument numbers were not returned
as results.

### Deterministic baseline (same document)

The deterministic parser alone produces 0 matches on Challenge 02 (no catalog
IDs, value-before-analyte layout) and correctly holds the NLR prose line — which
is exactly the documented trigger for automatic AI assistance.

### Browser acceptance (synthetic adapters, not authenticated persistence)

Chromium, real PDF.js upload of the actual Challenge 02 bytes:

- **AI unavailable path** (no session): local failure retained, visible
  "AI-assisted extraction unavailable" status, zero fabricated rows, nothing
  saved.
- **Stubbed-server wiring** (route-intercepted envelope; not real AI): 5
  AI-assisted rows appear unchecked with provenance labels; the collection date
  does not appear as an observation date; save is blocked until the shared
  observation date is explicitly confirmed and Verify All is checked; 5 adapter
  receipts carry the correct IDs, values, units, confirmed date and source file
  name. Verified at 1280 px and 390 px with no horizontal overflow and no page
  errors.

## Checks

- 785 tests pass, 0 fail (153 files; +35 new P36 tests across validator, merge,
  orchestration, endpoint and actual-PDF regression suites).
- Typecheck (`tsc --noEmit`) clean; lint 0 errors on all changed files;
  security audit passed; automatic compilation "build OK".
- P34/P35 real-PDF regressions and all four domain fixtures still pass
  unchanged (full suite).

## Remaining limitations and blockers

- The endpoint is **disabled in every managed environment** (master gate
  unset). Enabling synthetic extraction requires setting
  `P36_DOCUMENT_AI_ENABLED=true`; real medical documents additionally require
  `P36_REAL_DOCUMENT_AI_ENABLED=true` after an authorized administrator/
  provider agreement — a deployment decision for the owner, not taken here.
- The per-user rate limit is per-isolate best effort, not a cross-instance
  guarantee; the existing SQL-governed synthetic spending controls are a
  separate system and were not extended to this endpoint.
- Authenticated encrypted-storage acceptance with a real Crew Self/Ground
  Medical account remains unverified (the requesting account has no such
  membership; no membership was provisioned and no real record written).
- Physical-device airplane-mode OCR, exact-revision GitHub CI, and the blocked
  P3663/P3664/P20 gates remain unchanged and unverified.
- AI suggestions are only as good as the provider response; the validator and
  merge layer hold unknown catalogs, unit mismatches, invalid dates,
  uncertainties and conflicts, but human verification against the original
  report remains mandatory for every row.
