# P35.11 — Mission Operator Synthetic Demo Launchpad

This change places an operator-visible, mission-scoped demo navigation panel inside the already role-gated Mission & Crew Operations page. It does not grant Administrator, Crew Self or Ground Medical privileges and does not bypass RLS. Destinations retain independent authorization.

The intended principal `info@computech.gr` is currently a Mission Operator; full Administrator access has **not** been provisioned. A future isolated synthetic demo authorization design requires a separately reviewed backend migration and live role tests before activation. No real data, clinical decisions, impersonation, publishing or production authorization changes are included.

Acceptance: signed-out and non-operator users cannot see launchpad; mission operators see it for a loaded mission; destination access is independently enforced. Verify navigation in desktop and mobile, full tests, typecheck, lint, build.
