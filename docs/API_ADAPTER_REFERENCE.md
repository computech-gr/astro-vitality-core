# API and adapter reference

This release-candidate reference points contributors to the stable integration boundaries already implemented in P4-P8 and P15.

## Canonical observation boundary

All health/environment inputs converge on the canonical contracts in `src/domain/` before analytics. Vendor payloads must not bypass normalization, provenance, unit, timestamp, quality, classification or review-state checks.

See:

- `docs/CANONICAL_HEALTH_DATA.md`
- `docs/DOMAIN_MODEL.md`

## Universal Device Adapter SDK

The adapter lifecycle is defined in `src/integrations/device-adapters/` and documented in `docs/DEVICE_ADAPTER_SDK.md`.

Required lifecycle concepts include discovery, connection, capability declaration, streaming, quality metadata, normalization, resumable cursor state, adapter health and graceful disconnect.

## Implemented integration classes

- Wearables: `src/integrations/wearables/`
- Medical/lab: `src/integrations/medical-lab/`
- Environmental/radiation: `src/integrations/environmental-telemetry/`

See the corresponding documentation files in `docs/`.

## Ground persistence API

Authenticated store-and-forward persistence uses the governed Supabase RPC boundary introduced in P15 and hardened in P16. Browser code must not bypass mission membership/RLS rules or use a service-role credential.

Important RPCs include:

- `ingest_mission_event(jsonb, text)`
- `get_ground_mission_snapshot(text)`
- `export_research_mission(text)`

The authoritative definitions are the version-controlled SQL migrations in `supabase/migrations/`.

## Scientific safety

An adapter is a transport/normalization boundary, not scientific authority. New metrics, derived scores, relationships, clinical thresholds or action rules require the scientific-governance process. Research-only or unreviewed values must fail closed for operational interpretation.
