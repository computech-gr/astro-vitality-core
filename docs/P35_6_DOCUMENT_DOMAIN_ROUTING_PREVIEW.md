# P35.6 — Document-to-Domain Routing Preview

Scope: UI-only, deterministic, read-only projection of existing P36 exact-name/exact-unit candidates to the four P26 health domains. Does not change extraction, reviewer selection, cloud handoff, authorization, or health-domain data stores.

- A report can project into more than one domain; candidate IDs remain canonical P36 IDs.
- Unknown/unmatched labels, units and P35.5 IMM/BSC draft IDs are not classified.
- No filename-based routing, automatic approval, timeline writes, scientific interpretation or new persistence.
- Links open existing domain reference pages; they do not transfer or save observations.
- All P35.5 draft proposals remain `PENDING_NIKOLAS_REVIEW`.
- No migrations, no Matrix changes, no clinical activation, no MISSION_TEST edits.

Acceptance: run focused Vitest, `bun run check`, production build, and browser smoke test on `/mission/documents` using synthetic data only. Do not publish without owner approval.
