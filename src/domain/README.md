# Domain layer — P3 contracts

`src/domain` is the framework- and vendor-neutral core of The Mitochondria.

P3 establishes **contracts and invariants only**. It does not implement clinical
thresholds, diagnoses, treatment recommendations, autonomous alerts, device SDKs,
authentication, persistence, or mission database schema.

## P3 scope

- canonical mission/crew observation contract;
- health-signal taxonomy spanning physiological, biological, laboratory,
  cognitive, behavioral, psychological, sleep/circadian, activity/performance,
  nutrition/hydration, environmental, radiation, symptom, and device/system data;
- explicit source, quality, provenance, classification, and raw-vs-derived fields;
- scientific signal-definition contract with evidence references and an explicit
  non-diagnostic boundary;
- personal-baseline definition contract without selecting a clinical algorithm;
- deterministic validation functions and synthetic contract tests under `tests/domain/`.

## Dependency rules

- No React, network, storage, database client, or device-vendor SDK imports.
- Domain contracts must not depend on Supabase or persistence representations.
- Do not embed unreviewed medical thresholds in these contracts.
- No real astronaut or patient data may be committed. Test fixtures must be
  clearly synthetic.
- Psychological and behavioral signals are represented as health context, not as
  diagnoses or inferred mental-health conditions.
