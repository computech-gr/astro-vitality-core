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
