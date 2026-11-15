# P72.3 — NASA presentation routing (Preview only)

Homepage buttons (labels unchanged):

| Button     | Mapped account (server-only) | Console                      | Preselected scope                   |
| ---------- | ---------------------------- | ---------------------------- | ----------------------------------- |
| Astronaut  | marketing@                   | `/mission/ground`            | MITO_DEMO_2026 — Alex Morgan        |
| Medical    | marketing@                   | `/mission/ground`            | MITO_DEMO_2026 — Alex Morgan        |
| Researcher | nikolasilvestros@            | `/mission/scientific-review` | none (its existing mission context) |

- The scope is preselected only when the signed-in account already holds the exact
  Ground Medical membership for MITO_DEMO_2026 / Alex Morgan; there is no fallback to
  MISSION_TEST or any other mission.
- Examinations preselects the console's active scope once, when it is one of the listed
  authorized scopes; provenance is still chosen by the user.
- Signed-out visitors keep the one-click synthetic demo; other accounts see the
  existing wrong-account choice and are never switched.
- No database change, migration, import, copy, approval or deletion.

Researcher: no MITO_DEMO_2026 membership (only FV01-TEST-B Researcher plus the separately
provisioned global scientific review grant). Mission-scoped records need an operator invite.
