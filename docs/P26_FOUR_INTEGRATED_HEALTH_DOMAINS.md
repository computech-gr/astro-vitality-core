# P26 — Four Integrated Astronaut Health Domains

## Implementation
- Preserves the existing Bone Health entry/import/history functionality, with cross-domain navigation.
- Adds Immune Changes, Cardiovascular Health and Behavioral Health routes to Platform navigation.
- Reuses P25's Crew Self authorization, mission/crew isolation, read-only scientific observations, quality metadata and descriptive-only historical summaries. Does not create a parallel health database or duplicate medical records.
- Provides an explicit, testable domain registry of metric coverage, reviewed relationship IDs and scientific review state.
- Does not add migrations, clinical rules, predictions, event detectors or alert escalation.

## Scientific status
- Bone: existing handbook variable mapping and a previously reviewed long-horizon relationship; no validated clinical interpretation.
- Immune: awaiting Nikolas's scientific foundation; intentionally **no approved metric list**, and the existing microbiome relationship remains research-only.
- Cardiovascular: existing heart rate, HRV, BP and hydration context can be displayed, but does not diagnose arrhythmias, cardiovascular events or orthostatic disease.
- Behavioral: existing sleep, fatigue, workload and cognition context can be displayed, but does not diagnose mental health disorders.
- The P25 pattern-coverage status is not a validated pattern finding; concurrent time windows and baseline policies are not yet approved.

## Privacy and acceptance
- New domain pages only call the P25 Crew Self loader after an active mission membership is confirmed. Operators, Ground and Researchers are not granted this private observation view.
- Test: `bun test tests/domain/p26-health-domains.test.ts`; verifier: `node scripts/verify-p26-health-domains.mjs`; then typecheck and build.
- Signed-in browser/device validation remains a separate end-to-end acceptance activity.
