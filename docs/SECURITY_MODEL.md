# Security Model — Foundation

This document records P2 security boundaries. It is not the final threat model.

## Configuration classes

### Browser-safe configuration

Values intentionally exposed to browser code, such as a Supabase publishable key, are configuration rather than authorization secrets. They do not replace RLS, server authorization, or least-privilege policies.

### Server-only secrets

Service-role/secret keys, database passwords, private API tokens, signing keys, and equivalent credentials must never enter browser bundles or tracked source.

## Repository boundary

- `.env` and `.env.*` are ignored, except `.env.example`.
- `.env.example` contains placeholders only.
- CI must not require production secrets for the P2 quality build.
- Real astronaut/medical records are prohibited from the public repository.

## Future authorization model

Later phases must implement explicit mission/crew access control and Supabase Row Level Security. Cross-mission and cross-crew denial must be tested, not inferred from UI behavior.

## Future health-data protections

The later security model must cover:

- observation integrity and provenance;
- device identity and spoofing resistance;
- synchronization conflicts and replay/duplication;
- audit events;
- sensitive exports;
- loss of connectivity;
- alert evidence tampering;
- privilege separation between astronaut, medical/ground, research, and administrative contexts.

## Safety separation

Experimental analytics must not silently become safety-critical alarms. Reviewed deterministic rules, model-derived insights, data-quality warnings, and human escalation must remain distinguishable in code and UI.

## P15 mission/ground boundary

P15 introduces forced-RLS mission persistence and role-separated capabilities. Researchers do not receive direct `mission_events` access; de-identified exports are produced by an audited server-side RPC using a mission-scoped pseudonymization key that is not granted to browser roles. Mission operators receive operational summary/audit capability without general identified-medical event access. P16 will threat-model and adversarially audit this boundary.

## P16 security & safety hardening

P16 adds the formal threat model, misuse-case register, browser/server privilege audit, SSR security headers, a governed database hardening migration, replay-conflict handling, mission-operator ingestion restrictions and recursive research-export identifier stripping. Research export remains **pseudonymized, not anonymous**. Current CSP still permits required inline hydration/style execution; that residual risk is explicitly tracked for release-candidate hardening.

### Zero-install sensor browser authority

The public mission console permits `camera=(self)`, `accelerometer=(self)`, `gyroscope=(self)`, and `magnetometer=(self)` through `Permissions-Policy` only for the same production origin. Microphone, geolocation, payment, USB, serial, and HID remain disabled by policy. Camera access still requires an explicit browser user permission and is used only by the governed Camera PPG adapter.

## Mission identity and one-time membership invitations

Mission authentication is intentionally separate from mission authorization. A Supabase Auth session does not grant mission access: cloud reads and writes continue to require an active `mission_memberships` row and the existing RLS / ingestion RPC checks.

Mission operators may create short-lived, one-time membership invitations only for missions they already govern. The plaintext invite code is returned only at creation time; the database stores only a SHA-256 hash. The invite table has forced RLS and no direct browser grants. Invite redemption requires an authenticated user and is audited. There is no public self-elevation path and no browser service-role credential.
