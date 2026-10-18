# P35.15 — Operational Synthetic Demo Runbook

Adds a role-separated, offline exportable demonstration runbook to the existing Mission Operator launchpad. All 10 navigation links and five global navigation groups remain unchanged.

- Mission Operator, Crew Self, Ground Medical and Researcher steps are distinguished, with observed membership presented only as advisory.
- A downloadable JSON runbook describes the current browser-session checklist, mission and role handoffs. The export does not save, upload or synchronize.
- MISSION_TEST exports always mark all steps not_checked and are explicitly planning-only.
- No Administrator entitlement is granted. Administrator backend scope, isolated demo mission and independent reviewer acceptance remain separate gated work.
- No SQL migration, auth change, clinical activation or publishing.

Acceptance: focused P35.15 tests; one `bun run check`; browser-check operator view, offline JSON export and signed-out hiding. Do not claim actual backend Administrator access.
