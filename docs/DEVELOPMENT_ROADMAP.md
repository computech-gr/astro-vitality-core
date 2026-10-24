# Development roadmap registry

The Project Guide roadmap (`/project/guide#roadmap-detail`) is rendered from the
centralized registry in `src/content/roadmap-phases.ts`. Do not maintain phase
lists inside UI components.

## Rules

- Every numbered phase P0–P47 appears exactly once, in numeric order.
- Subphases (for example P21.3, P23C, P36.8D, P41.2) are nested under their
  numbered phase and link to their own repository document.
- Entries without a dedicated record are labelled `referenced_only` (P0) or
  listed under missing/unverified records (P21.1–P21.2, P23B, P41.1). They are
  never invented.
- Status reflects documentation and implementation evidence only:
  `implemented`, `review_only`, `gate_open`, `referenced_only`.
- Implementation, automated verification, independent scientific approval,
  real-device acceptance and competition submission authorization are shown as
  separate dimensions. Passing tests is not scientific, clinical or flight
  validation.
- `tests/navigation/roadmap-registry.test.ts` checks phase coverage, ordering,
  that every linked document and verifier exists, and that review/gate states
  match `data/submission/p46-acceptance-evidence.v1.json` and
  `data/submission/p47-competition-handoff.v1.json`.

## Adding a phase

Add the phase document under `docs/`, add one registry entry (or subphase), and
run `bun test tests/navigation`.
