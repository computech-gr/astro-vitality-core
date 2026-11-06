# P36 production activation checklist

**Current state: not authorized; write flags default-off; activation blocked.**

## Before requesting owner authorization

- [ ] Reconcile the supplied latest repository snapshot with this preserved development baseline.
- [ ] Run exact-revision CI: full tests, negative SQL, typecheck, lint, formatting, security, production build and all offline validation gates. Resolve or explicitly record failures.
- [ ] Provision genuinely isolated auth/data services and execute two-account browser flows: 197-term explicit preview/consent, retry/conflict, fresh browser readback, multi-mission/crew/provenance, revoked role, sign-out/scope races, independent decisions and blocked self-approval. Do not use production as substitute.
- [ ] Expand direct-RPC malformed/catalog/concurrency/atomic rollback tests and validate effective ACLs under production-like default grants.
- [ ] Preserve original 12-term, date-only, encrypted evidence, sync and PDF/adverse-highlight behavior in isolated populated regression flows.
- [ ] Independently review sensitive metadata exposure, source-validation receipt provisioning/revocation and reviewer qualification evidence. Never seed synthetic test receipts into production.

## Precise approval checkpoint

Owner must explicitly authorize **each** of: applying exact hashed SQL to production; deploying the validated candidate; enabling `P36_DYNAMIC_HANDOFF_ENABLED`; enabling `P36_DYNAMIC_AUTHORIZATION_ENABLED`; and submitting the real local request from its original browser. None is implied by development authorization. Scientific decisions and catalog promotion remain separately governed.

## SQL application order (only after authorization)

1. Back up and independently verify effective roles, assignments, trusted SQL ownership and exact file hashes.
2. Apply `supabase/pending/20261107000000_p36_dynamic_handoff.sql` byte-for-byte using the authorized migration workflow.
3. Apply `supabase/pending/20261107010000_p36_dynamic_authorization.sql` byte-for-byte. This does not require modifying/applying the original pending fixed-dossier authorization migration.
4. Keep both flags off until scoped read/write acceptance completes. Never bypass a missing source receipt by changing classification.
5. Authorize metadata transport separately, then original user previews and consents to submission; confirm receipt and different-device readback. Local source is never cleared.
6. Independently provision genuine source receipts through a separately reviewed SQL plan. Ground Medical recommends; different-account Researcher reviews with genuine qualification, evidence, exact unit/specimen/method/protocol/version and conflict declaration.
7. Export promotion artifact for code review; review exact alias/context and versioned registry approval, validate, then separately authorize catalog deployment. Re-import held evidence row by row; never rewrite stored observations.

## Disable / rollback

Disable both flags first; this retains all rows. Roll back **authorization first**, then handoff, using their `.rollback.sql` siblings **only when every corresponding table is empty**. The SQL refuses deletion when audit/source-validation/metadata rows exist. With records present, retain tables and authorize a preservation plan separately; no force-drop override or live cleanup is provided.
