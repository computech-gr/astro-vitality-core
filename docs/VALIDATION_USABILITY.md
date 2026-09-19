# P18 — Validation & Usability

P18 validates the product as a critical workflow, not as a list of passing unit tests. The controlled roadmap requires biologist validation, scenario review, accessibility, cognitive-load testing, latency and battery tests, with known limitations documented and critical workflows passing.

## Evidence model

`data/validation/p18-evidence.v1.json` is the controlled evidence ledger. Automated criteria may be supported by deterministic repository gates. Browser/hardware criteria may be marked `pass` only after the stated check is actually performed and evidence is recorded. The P18 verifier fails closed while a critical criterion remains pending or failed.

## Critical browser routes

Validate at minimum:

1. `/mission/live`
2. `/mission/readiness`
3. `/mission/intelligence`
4. `/mission/guidance`
5. `/mission/offline`
6. `/mission/ground`
7. `/mission/simulation`
8. `/mission/validation`

The Mission Day 127 story should remain understandable as one flow: live/synthetic evidence → data quality/baseline context → cognitive check → explainable finding → bounded action guidance → offline continuity → later ground synchronization.

## Accessibility / cognitive load

Keyboard review must cover header navigation, submenu access, links, buttons, forms and visible focus on critical routes. Responsive review must cover a narrow/touch viewport and verify no horizontal overflow or unreachable controls. P11 retains the explicit `<3 min` daily-assessment acceptance gate.

## Latency

Record an engineering observation of the local sample-to-visible-update path. Do not invent a universal latency threshold: the controlled source defines the need for latency testing but not a numeric limit. Record the measured value, device/browser conditions and whether the path depended on cloud connectivity.

## Battery

Battery drain cannot be truthfully validated without target hardware. P18 therefore documents target-hardware battery characterization as a known limitation rather than fabricating a synthetic pass. When hardware is available, attach an instrumented measurement to the evidence ledger.

## Closure rule

P18 may close when:

- every **critical** criterion is `pass`;
- noncritical hardware gaps are explicitly `known_limitation` rather than hidden;
- `bun run check` passes;
- the critical browser flow has been reviewed without broken navigation or unusable responsive/keyboard behavior;
- known limitations remain visible in `docs/KNOWN_LIMITATIONS.md` and the validation UI.

P18 does **not** claim clinical validation.
