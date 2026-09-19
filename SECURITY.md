# Security Policy

## Supported version

During active challenge development, security fixes target the current `main` branch. A formal supported-release matrix will be added when versioned releases begin.

## Reporting a vulnerability

Do **not** publish exploitable vulnerabilities, exposed credentials, private health information, or safety-critical misuse scenarios in a public issue.

Report the issue privately to the project maintainers through the repository owner’s private security/contact channel. Include:

- affected component;
- reproduction steps;
- expected and observed behavior;
- impact assessment;
- any evidence of credential or data exposure.

Do not include real astronaut or patient data in a report.

## Secret handling

The repository must never contain private credentials such as:

- Supabase service-role/secret keys;
- database passwords;
- private API tokens;
- OAuth client secrets;
- JWT/signing secrets;
- private encryption keys.

Browser-safe publishable configuration must still be handled through environment configuration and must never be mistaken for a server-only authorization boundary.

If a private credential is committed, remove it from active code, rotate/revoke it at the provider, and assess repository history and downstream exposure.

## Health and safety misuse

Security review includes conventional application threats and health/safety failure modes. Examples include:

- cross-crew or cross-mission data exposure;
- unauthorized alteration of health observations;
- spoofed device or telemetry provenance;
- suppression or fabrication of alert evidence;
- unsafe fallback behavior during connectivity loss;
- presentation of experimental intelligence as clinical diagnosis.

Operational safety controls will be implemented only in governed later phases. The P2 repository foundation does not claim clinical validation.

## P16 automated security gates

The repository runs `bun run security:audit` as part of the main quality gate. It checks tracked-secret patterns, browser references to server-only Supabase privilege boundaries, `SECURITY DEFINER` search-path pinning and public/anonymous execute grants. A separate GitHub security workflow performs scheduled and change-triggered filesystem vulnerability/secret scanning.
