# P36.2B4 — Membership identity alignment (STAGED ONLY)

Based on `astro-vital-spark (68)(2).zip`. This patch **replaces the existing, unapplied pending SQL** from P36.2B3 and replaces its static tests; it does not add a second migration. Do not apply to the shared Lovable Cloud database or publish.

## Changes

- Submitter and reviewer provenance now references `public.mission_memberships(id)` rather than `auth.users(id)` directly, aligning with the existing mission-role model.
- Schema-level reviewer/submitter membership IDs must differ. This alone does **not** prove independence: an authorized server-side workflow must additionally check distinct user IDs, membership role, active status, and same mission.
- Both tables remain synthetic-only, RLS forced, deny-all, with all anon/authenticated grants revoked. No ingest/review RPC, cloud write, or clinical interpretation.

## Mandatory next security design review

Before any database deployment, verify membership references and enforce matching mission and crew associations through a separate server-side transaction; plain membership FKs alone do not enforce same mission. Also consider the lifecycle of membership deletion and reassignment, cross-mission attacks, independent reviewer roles, and immutable audit records. The current `approved` state is merely reserved. Do not use real personal health data.

## Verification

Run `bun test tests/security/p362b3-schema.test.ts tests/security/p362b4-membership-identity.test.ts` and `bun run check`; test SQL in disposable database only. No live database changes. Existing mission and crew identities must be read from authenticated mission context, never invented.

Gates: FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.
