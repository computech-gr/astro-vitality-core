# P21.3 — Type compatibility & governance gate

Based on astro-vital-spark (64).zip. Overlay the files at repository root.

Changes:

- Root error boundary accepts unknown error values as supplied by current router typing; existing telemetry accepts unknown already.
- Registers P21 catalog and mapping verification commands and includes both in the main check gate.

No biomarker mappings, rules, clinical activation, migrations, or dependencies changed.

Targeted checks after application (only if needed): `bun run typecheck`, `bun run verify:p21:catalog`, `bun run verify:p21:mapping`.

Scientific review remains pending for all 63 variables.
