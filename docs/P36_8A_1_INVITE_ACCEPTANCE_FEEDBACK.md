# P36.8A.1 — Invitation acceptance feedback

Scope: UI + client RPC validation only. No SQL migrations, membership writes, mission changes or feature flags.

The existing `accept_mission_invite` RPC returns `mission_id` and `role` on successful redemption. The client now also accepts a governed `status=accepted` response and rejects null/unknown responses rather than reporting success. Database errors and `status=rejected` remain failures.

The Join a mission card now displays an accessible inline success or failure message, disables duplicate submissions while the RPC is pending, clears stale feedback when the code changes, and refreshes memberships after success. Never log or expose invitation codes in tests or screenshots.

Acceptance: sign in as a distinct synthetic Ground Medical test identity, redeem an approved unexpired invite to FV01-TEST-B, verify active membership. If rejected, record only sanitized error category and check invitation approval/expiration via authorized operator. Do not touch MISSION_TEST. The invitation must not be reused.

Quality: run focused tests, `bun run check`, real browser checks and GitHub CI. Do not claim live success before authenticated acceptance.
