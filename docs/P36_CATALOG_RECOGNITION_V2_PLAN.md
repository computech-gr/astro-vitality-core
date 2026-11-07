# P36 Catalog Recognition v2 — Implementation Plan (not applied)

Status: plan only. Nothing here is installed, activated or approved. No real or
synthetic biomarker is added to the live catalog. No source-validation record is
created.

## Triage installation record (2026-11-07)

- Migration `0022_p36_global_triage.sql` installed byte-identical to the approved
  `supabase/pending/20261107040000_p36_global_triage.sql`, SHA-256
  `f7d7ea90aa1d23629a1d7a8e19d5435681fa31e9a6d859fe2353cd2ea8688973`.
- Demo triage grant `20261107040001_p36_global_triage_demo.authorize.sql`, SHA-256
  `40a69f99c0b5e17e5066bf2172439aa7ab552101c57b55984c95073b2c2a0415`, applied
  once; the grant insert was recorded in the global review audit.
- One live synthetic `ACCEPT_FOR_REVIEW`: request `ubr-8b1514d8`, term
  `ubt-7c10c994` (25(OH) Vitamin D), event `03c25d1a-0f08-47ea-ace6-c346bf842bd6`.
  Submitted metadata, memberships, catalog and scientific-authorization ledger
  fingerprints were unchanged. Reject and Request More Evidence were exercised only in the
  disposable verifier (84 assertions).

## Current baseline (reused, not replaced)

- `data/scientific/p36-biomarker-source-registry.v1.json`: base P36 catalog, read only.
- `data/scientific/catalog-extensions.v1.json` + `evaluateCatalogExtensionRegistry`
  / `classifyWithGovernedExtensions` (`unknown-biomarker-review.ts`): fail-closed
  registry; only `alias_to_existing_metric` with exact unit; optional
  method/specimen context; label+unit conflicts disable both entries.
- `p36-verified-revisions.ts`: empty verified-revisions registry (fail closed).
- Cloud: handoff submissions, triage ledger (installed), scientific authorization
  ledger (installed, `authorization_open=false`).

Gaps: there is no kind for entirely new metrics; nothing links a cloud approval to an
extension proposal; intake does not pass method/specimen into classification;
offline devices only receive changes with an app bundle; there is no revocation kind.

## Minimal implementation (9 requirements)

1. **New metrics.** Add extension kind `new_metric` to registry schema v2
   (`mitochondria.catalog-extension-registry.v2`). A `new_metric` must carry a
   canonical metric ID (`ext:` namespace, never colliding with P36 IDs), domain,
   exact unit, specimen, method, protocol + version, and ≥1 source-validation receipt
   reference. A v1 registry is still read unchanged.
2. **Approval → proposal link.** Pure builder
   `buildGovernedCatalogProposal(authorizationEvent, triageChain, sourceReceipt)` that
   requires: triage `ACCEPT_FOR_REVIEW` as the latest triage event; an independent
   approval event from the scientific authorization ledger (approver ≠ recommender);
   and an independently provisioned receipt from `p36_dynamic_source_validation`. The
   output is a proposal only, with a SHA-256 over its canonical JSON.
3. **Explicit activation.** A separate SQL-provisioned `p36_catalog_activators` grant
   and an append-only `p36_catalog_activation_events` ledger (ACTIVATE / REVOKE,
   chained, idempotent, expected predecessor). It is written only through a caller-scoped
   security-definer RPC that re-verifies the proposal hash. Activator ≠ approver.
4. **Matching.** Extend `classifyWithGovernedExtensions` input so that hybrid
   extraction passes `method` and `specimen`. A `new_metric` matches only on
   normalized label + exact unit + exact specimen + exact method; any field missing
   means it is held for review. No unit conversion.
5. **Offline distribution.** Signed catalog manifest
   `catalog-manifest.v2.json` (Ed25519, public key bundled; private key held only as
   a server secret). Devices accept a manifest only when the signature is valid, the
   version is greater than the installed one and the base SHA matches. The last valid
   manifest is cached in IndexedDB; an invalid manifest leaves the previous one in place.
6. **Automatic recognition.** Recognition reads the effective set from the verified
   manifest via the existing evaluator; matched rows still require human confirmation
   (`reviewRequired: true`). Nothing is saved automatically.
7. **Immutable history.** Observations keep the catalog version they were classified
   with. Re-classification creates a new projection only; stored envelopes are never
   rewritten.
8. **No duplicate unknown requests.** `buildCatalogExtensionProposal` and the handoff
   draft skip terms that the effective manifest already recognizes and terms that already
   have a pending submission (same normalized label + unit + specimen + method).
9. **Revocation / rollback.** A REVOKE activation event or a manifest that lowers
   status removes the entry from the effective set. Earlier observations keep their
   recorded version (as tested in the synthetic lifecycle). SQL rollback drops only the
   new activation objects.

## Artifacts to prepare next (staged, unapplied)

- `supabase/pending/20261108000000_p36_catalog_activation.sql` + `.rollback.sql`
- `scripts/verify-p36-catalog-activation-pg.ts` (disposable socket only)
- `src/domain/health-intelligence/catalog-extension-v2.ts` (pure schema, evaluator
  and proposal builder; browser-safe)
- `src/domain/health-intelligence/catalog-manifest.ts` (signature verification and
  version monotonicity)
- `src/lib/p36-catalog-activation.functions.ts` (caller-scoped server functions)
- Tests: `tests/domain/catalog-extension-v2.test.ts` and
  `tests/domain/catalog-manifest.test.ts`, with fixtures marked test-only

## Separate approvals required

1. Approval to implement the staged artifacts above (code + pending SQL only).
2. Approval to install the activation SQL on the backend (exact SHA-256).
3. Provisioning of the activator grant (named account, separate from Researcher).
4. Generation and storage of the manifest signing key as a server secret.
5. For each biomarker: an independent scientific approval in the authorization ledger,
   which requires opening `authorization_open` under its own approval and a genuine
   source-validation receipt. Each step is separate from activation.
6. Per-entry activation approval, then publication approval for distribution.

## P37 installation record (2026-11-07 UTC)

- Owner-approved `supabase/pending/20261108000000_p37_catalog_activation.sql` installed as `drizzle/migrations/0023_p37_catalog_activation.sql`; both files are byte-identical (SHA-256 `be60490d9248256a635e5cbd5b60a410fb0886ceaa9eea41b35e7dafd600eb8e`). Rollback (`f20f815a…e82a`) not executed.
- The migration needs only one scientific approver per term (the Researcher's SCIENTIFIC APPROVE is final) plus an independently provisioned source-verification receipt; activation is a separate activator grant held by a different account.
- Signing secret `P37_CATALOG_SIGNING_KEY` generated in the encrypted secrets store (never displayed); key ID `p37-prod-2026-11-08`; matching public key registered in `data/scientific/catalog-signing-keys.v1.json`. A live signed snapshot (version 0, no entries) was verified and installed in the Preview.
- Pending, not executed: `supabase/pending/20261108000001_p37_scientific_approver_demo.authorize.sql` (SHA-256 `c4801c1444538c77ab535a0885d804b8c715988a23a7af2a26a493c8301b5757`) granting the scientific approver capability to nikolasilvestros@gmail.com.
- After installation: 209 submitted terms, 1 triage acceptance, 0 source-validation receipts, 0 P37 events, 0 approver/activator grants, base catalog fingerprint unchanged.
