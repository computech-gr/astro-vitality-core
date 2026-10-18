# P35.12 — Navigation & Demo Access Readiness

This release expands the P35.11 operator launchpad with a **read-only, mission-scoped access readiness panel**. The five P35.10 navigation categories and all existing routes remain unchanged. It explicitly distinguishes Mission Operator from Crew Self, independent Ground Medical, Researcher and any future privileged Administrator capability.

## Non-goals and hard gates

- **Not** an Administrator grant. `info@computech.gr` is not automatically Super Administrator because it is an operator.
- **Not** a role switcher or an RLS bypass. Backend role enforcement remains authoritative.
- **Not** permission to write to reserved `MISSION_TEST`, publish, process real medical data, activate clinical workflows, or bypass independent reviewer requirements.
- The separate isolated synthetic administrator demo mission and its privileged backend verification require a governed migration/design and independent approval. Do not claim full demo execution is complete.

## Acceptance

Verify mission-scoped membership states in the launchpad; test signed-out, operator, and (if authorized) Crew Self views; verify five navigation groups desktop/mobile; verify no additional privileges, database writes or publication. Focused P35.12 tests then one `bun run check` only.
