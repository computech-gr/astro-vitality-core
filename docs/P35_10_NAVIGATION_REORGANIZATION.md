# P35.10 — User journey navigation reorganization

Status: UI-only navigation change, research-only, synthetic-only. No migration, no changes to authentication, backend authorization, mission memberships or scientific gates.

The existing routes are preserved while the desktop mega-menu and mobile accordion are grouped into Mission Console, Health & Intelligence, Science, Technology, and About & Open Source. Search derives from the same navigation configuration.

## Administrator demo: explicitly NOT activated

`info@computech.gr` has been observed as a mission operator, **not** confirmed as a super administrator. This patch does not grant admin privileges. The future synthetic demo workspace needs separately reviewed mission-scoped demo permissions and backend RLS enforcement; an email match or a navigation toggle must never authorize a write or a Ground Medical decision.

## Follow-up acceptance

- Desktop and mobile navigation; global search; all old URLs and bookmarks.
- Signed-out and Crew Self role views; mission context remains protected.
- No publication until owner approval.
