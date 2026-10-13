# P33 — Astronaut Experience & Mission Control UX

## Scope
A new `/mission/experience` operational hub appears in the Platform menu. The hub reads authenticated active mission membership and displays role-filtered workflow links. No clinical inference, device readings, alerts, or persistence are created here. Existing destinations retain responsibility for their own server-side authorization; hiding links is not an access-control boundary.

## Experience principles
- Explicit sign-in/mission selection and honest loading/error/unauthorized states.
- Tasks describe their scientific and operational limitations before navigation.
- No synthetic data presented as live astronaut evidence.
- No automatic diagnosis or autonomous medical action.
- Keyboard accessible native links/buttons, visible headings, polite status announcement.

## Acceptance
Run `node scripts/verify-p33-mission-experience.mjs`, `bun test tests/domain/p33-mission-experience.test.ts`, foundation and SEO verifiers, typecheck, build. Browser validation across Crew Self, Operator, Ground Medical, Researcher and signed-out accounts is deferred to P34. Check mission switch, expired membership, keyboard and mobile view.
