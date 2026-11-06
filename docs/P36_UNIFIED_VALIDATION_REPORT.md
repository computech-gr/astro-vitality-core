# P36 unified development validation report

## Delivery status

Integrated development candidate; **not production-ready or accepted**. Metadata submission, dynamic review, safe proposal preparation, scoped recommendations/decisions, guarded SQL rollback and promotion-artifact preparation are implemented together. Both write features remain default-off. No production SQL, live-data write, local user-request upload, scientific decision or publication was performed.

The named November 7 latest repository archive was not available in the mounted uploads. The supplied specification was read; development preserved the current project baseline containing Phase 1 and P36.8.2 instead of replacing it with the older October 28 archive. Exact latest-snapshot compatibility remains unverified.

## Audit and reused architecture

- Existing encrypted, separate append-only review ledger retains requests and evidence. A new encrypted receipt kind records explicit metadata transport without rewriting requests.
- Fixed 12-term crosswalk/dossiers, pure proposal helpers, authorization chain verification, existing Ground Medical/Researcher forms and mission identity checks are reused.
- Original staged `20261104000000_p36_scientific_authorization.sql` and rollback remain byte-identical. New dynamic counterpart scopes chains, decisions and read paths by mission/crew/provenance.
- Observation store, observation/review sync, date-only pipeline, PDF pipeline, scientific handbook layers and catalog registries are not edited.

## Implemented safeguards

Explicit preview/consent, five transport states, retry/idempotency, server receipt and separate scientific status. Payload excludes measurements, observation dates, filenames, excerpts and document contents. Strict client/server schemas reject unknown keys; server RPCs derive caller identity and membership. Submission header supports 197 terms without per-term submission-key collisions. Tables deny direct application access; update/delete/truncate denied; immutable metadata conflicts held rather than overwritten. Rollbacks refuse when records exist.

Dynamic UI has exact-scope reads, search, pagination, evidence fingerprints, eligible proposal selection and local-only labels. Proposals do not persist or approve. Final decisions require Researcher identity and another account’s matching Ground Medical recommendation. Source-unvalidated terms and ambiguous candidates cannot authorize mappings. A separately owner-provisioned, independently verified source receipt tied to term, document hash, unit, method/specimen/protocol is mandatory; none is seeded in production. This deliberate fail-closed dependency prevents an uploaded label from claiming source validation.

Promotion exports are code-review artifacts only. Exact units, method/specimen matching context and versioned reviewer evidence are required. No registry writer or auto-activation exists. Historical held rows remain unchanged and future re-import still needs explicit review.

## Validation evidence

- Full Bun regression suite: **1,170 passed, 0 failed**, 187 files; 13 new negative/regression tests.
- Disposable PostgreSQL socket-only harness: **22 passed**. Full 197-term insert, replay, conflict, second-account readback, Ground Medical recommendation, independent Researcher approval with disposable-only synthetic source receipt, source-receipt-absence rejection, tenant/crew/provenance isolation, revoked caller, direct ACL denial and preservation rollback refusal.
- Test identities in SQL are simulated JWT claims, not genuine hosted authentication. These tests are **not two-account authenticated browser acceptance**.
- ESLint: **0 errors, 12 existing warnings**. Security source audit passed.
- Foundation, SEO, P21 catalog/mapping/freeze/handoff verifiers passed. Full aggregate `check` was not run because it includes manually prohibited build/typecheck steps and service-dependent gates.
- Automatic preview compilation reported `build OK`; standalone production build/typecheck and exact synchronized GitHub Actions validation are **unverified**. No manual build/typecheck was run.
- Formatting check initially flagged the pre-existing Phase 1 audit and new scope note; the new scope note and delivery documents were formatted. The pre-existing audit remains unchanged and flagged.
- Public signed-out Scientific Review browser checks at 1280×1800 and 390×844: page rendered, dynamic heading present, no page errors or horizontal overflow. Screenshots inspected. Populated authenticated dynamic workflow, submission/consent/reload UI, PDF export and true cross-device acceptance are **unverified**.

## Risk register / unresolved release blockers

1. Isolated genuine auth/data services are absent. End-to-end two-account browser submission, revocation races and populated pagination remain to be validated without using production.
2. Latest named archive unavailable; baseline reconciliation must precede activation.
3. Exact-revision CI/build/typecheck evidence absent; automatic preview success is not a production certificate.
4. Source-validation receipts require independent documentary review and separately authorized provisioning. No source validation or reviewer qualification is fabricated. Receipt revocation/correction governance needs a separately reviewed preservation mechanism before operational use.
5. Metadata labels remain potentially sensitive even without clinical values; owner must approve the exact preview, scope, retention and transport before real upload.
6. Bulk proposal preparation is ephemeral; there is no bulk approval. Original PDF exports retain fixed dossier behavior; no dynamic evidence is silently injected into reports.
7. SQL negative coverage is not exhaustive for malformed fields, concurrency failures, partial-insert rollback, service-role ACL inheritance and direct-RPC catalog mismatch. These require expanded isolated acceptance before enabling writes.
8. Existing formatting warnings are recorded, not hidden. No claim that all requested validation gates passed.

## Owner checkpoint

Review the checklist and exact staged SQL hashes. Authorization to stage/test does not authorize application, feature enabling, uploading the local 197-term request, scientific approval or catalog deployment. Request a single explicit production authorization only after the remaining acceptance gates pass; scientific reviewers must separately supply genuine decisions and source evidence.

Changed-path inventory and SHA-256 manifest are packaged in the source archive. No destructive rollback override is supplied.
