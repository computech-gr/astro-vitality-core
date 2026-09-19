# Contributing to The Mitochondria

Thank you for helping build an open, reproducible astronaut-health software platform.

## Workflow

1. Create a focused branch from the current `main` branch.
2. Keep changes scoped to one coherent concern.
3. Run `bun install --frozen-lockfile` and `bun run check` before opening a pull request.
4. Describe what changed, why it changed, and how it was verified.
5. Do not rewrite published history on branches synchronized with Lovable.

## Pull-request expectations

A pull request should:

- keep the application buildable;
- include or update documentation when behavior or architecture changes;
- preserve accessibility and responsive behavior for UI changes;
- avoid unrelated refactors;
- identify any security, scientific, or safety implications;
- state whether the change affects offline behavior, data provenance, or future device integrations.

## Data policy

Do not commit:

- real astronaut, patient, or personally identifiable health data;
- production database exports;
- authentication tokens or private credentials;
- service-role keys, database passwords, private API keys, JWT secrets, or signing keys.

Public demo datasets must be synthetic or explicitly cleared for public redistribution.

## Scientific changes

Scientific or medical behavior must be traceable to evidence. Changes that introduce or modify biomarkers, physiological interpretation, alert thresholds, risk logic, escalation wording, or health guidance must:

- cite an appropriate source or controlled project reference;
- state known limitations and confounders;
- distinguish research hypotheses from operational rules;
- avoid unsupported diagnosis or treatment claims;
- receive the project’s required scientific/medical review before becoming operational logic.

## Device and integration changes

Future device integrations must conform to the project’s vendor-neutral adapter boundary. Device-specific behavior must not leak into core health-domain logic.

Adapters are expected to preserve, where applicable:

- source/device identity;
- capability metadata;
- timestamps and clock context;
- units;
- quality/artifact information;
- raw-versus-derived provenance;
- deterministic normalization into the canonical model.

## Security

Do not disclose vulnerabilities, exposed secrets, or exploitable medical/safety issues in a public issue. Follow [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contributions are provided under the repository’s Apache License 2.0 unless explicitly documented otherwise for a specific third-party asset.
