# FV-01.4.4 — Global Card Navigation & Reference Completion

Scope: public and operational card surfaces. No database, RLS, auth or FV-01.4.3 changes.

## Audit

- Home capability cards (8) and Technology topic cards (8): all already linked (P21). No change.
- Technology topic pages (8): related links and source documents already verified by P21 tests.
- Project Guide (`src/components/project-guide.tsx`): 45 cards; 21 had no explicit destination
  (6 Technology cards relied only on an implicit topic link).

## Corrections (Project Guide)

- Mission: Our Mission → `/#mission`; Why Autonomous Health → offline-first topic; Long-Duration Spaceflight → NASA evidence.
- Science: Scientific Foundation → NASA evidence + SCIENTIFIC_BASELINE_V1_1.md; Spaceflight Health Risks → P26 doc; Biomarkers & Signals → canonical data topic; Environment & Radiation → environmental telemetry topic.
- Platform: Platform Overview → system architecture topic; Astronaut Health Twin → Mission Workspace.
- Technology: all 8 cards → explicit "Explore Technology" topic links (console links kept).
- Open Source: Open-Source Mission → OPEN_SOURCE.md; Device Adapter SDK → device integration topic + DEVICE_ADAPTER_SDK.md; Data & Interoperability → medical & laboratory topic.
- About: The Mitochondria → GitHub README; Scientific Approach → NASA evidence + SCIENTIFIC_GOVERNANCE.md; Roadmap → new `#roadmap-detail` section; Team → intentionally no link (no verified team roster exists).

## New section

`#roadmap-detail` on `/project/guide`: phase list built only from existing repository docs; explicitly states listing ≠ validation.

## Tests

`tests/navigation/fv0144-card-navigation.test.ts` — coverage, route/anchor/doc existence, no duplicates, safe external attributes, no invented team link.
