# P23H — First Mission Activation

## Verified repository capabilities

- `/mission/identity` supports account creation, email confirmation, sign-in and invite acceptance.
- `scripts/bootstrap-first-operator.mjs` is the existing trusted one-time first operator bootstrap. It requires a real, confirmed account and server-only credentials.
- Mission & Crew Operations supports crew creation and role-scoped invitations.
- `docs/SECURE_BOOTSTRAP_AUTH_READINESS.md` is the authoritative bootstrap procedure.

## Activation checklist (human-authorized, never simulated)

1. Check production Email Auth, canonical Site URL and redirect allowlist.
2. Create and confirm an operator account using the public identity page.
3. A deployment administrator runs the existing bootstrap script in a trusted terminal, with ephemeral server-only secrets. Do not expose service role keys, account passwords or invitation codes to Lovable, browser bundles, chat, screenshots or Git. Never re-run bootstrap after an operator exists.
4. Sign in as operator; in Mission & Crew Operations create active crew entries, then create crew-self invites linked to the correct crew IDs and a separate ground-medical invite.
5. Each test user creates/confirms their own account and accepts only their assigned one-time invite.
6. Validate role-scoped mission and crew selectors, synthetic Bone Health and readiness events, offline-to-online sync, mission_events and crew_health_record_index, idempotency, and negative cross-crew access.
7. Delete test cloud data only using approved test cleanup procedures; never reassign or delete encrypted historical device records.

## Non-goals

No fake accounts, credentials, SQL migration, elevated browser permission, synthetic authentication, or claim of completed cloud validation. The on-screen guide contains no secrets.
