# Mission Identity & Sign-in

Mission identity is the authenticated bridge between device-local autonomy and governed Supabase synchronization.

## Security model

Authentication does not grant mission data access by itself. A signed-in user must also hold an active row in `mission_memberships`, and all cloud reads/writes remain subject to the existing mission RLS and ingestion RPC checks.

The application supports email/password sign-in, email magic links, sign-out, mission membership selection and one-time invite redemption. No service-role credential is exposed to the browser.

## Mission membership and live capture

An active membership can be selected as the current mission context. New physiological live capture is mission-bound only when the active membership has role `crew_self` and identifies a `crew_member_id`. Otherwise the live dashboard deliberately retains its encrypted local fallback context rather than attributing data to the wrong astronaut.

Existing encrypted local records are append-only and are never rewritten when a user later signs in. Records captured before mission identity was established therefore retain their original local mission provenance.

## One-time invitations

`mission_operator` members can issue one-time invitation codes for missions they already govern. Invite codes are generated randomly, stored only as SHA-256 hashes, expire, and are invalidated after one successful claim. Direct browser access to the invite table is denied.

A `crew_self` invitation requires a pre-existing crew member identifier. This prevents an arbitrary authenticated account from inventing an astronaut identity.

## First operator bootstrap

The very first mission operator must still be provisioned through an authorized administrative path (for example, the Supabase dashboard/service administration). The product intentionally does not create a public self-elevation path.

## Mission operations

Mission operators use `/mission/operations` for governed mission lifecycle, mission-scoped crew registration, role-bound invite issuance, and non-destructive membership activation/deactivation. See `docs/MISSION_CREW_OPERATIONS.md`.

## Auth provider readiness

v20.12.0 adds a browser-safe Auth settings probe. An explicitly disabled Supabase Email provider is surfaced before sign-in as `CONFIGURATION REQUIRED`; signup is also disabled when project settings explicitly prohibit new accounts. The probe does not expose or guess the production redirect allowlist. Production Site URL and redirect configuration are deployment controls documented in `SECURE_BOOTSTRAP_AUTH_READINESS.md`.
