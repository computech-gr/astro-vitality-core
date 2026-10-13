# P28 — Researcher Workspace & Privacy Containment

## Purpose

Contain an existing unsafe row-level `export_research_mission` RPC that exposed pseudonymized individual event records, timestamps and payloads. A frontend-only change is insufficient: the migration **replaces the server RPC** with a fail-closed aggregate.

## Access

- Authenticated active `researcher` or `ground_medical` mission role enforced by server RPC.
- Client uses signed-in membership selection rather than arbitrary mission-ID entry.
- Only `ground_medical` can request the existing identified ground snapshot in this UI; existing server authorization still applies.
- Research export returns **zero or one** aggregate row: no participant ID, exact timestamp, event kind, source ID, metric, payload, mission ID or medical record.
- At least three distinct crew with ingested events and at least ten total events; otherwise empty result, audited suppression.
- Event counts rounded **down to multiples of ten**. No drilldown or repeated query filters.
- Client rejects any response that violates the strict aggregate schema, including old unsafe RPC responses if the migration has not yet been applied.

## Migration / deployment

`20261013000000_p28_research_export_privacy.sql` **must be applied once** before enabling research export. The migration is idempotent via CREATE OR REPLACE, but track it as applied; do not reapply P23/P24. Migration policy includes P28 marker. Review existing direct data-access policies separately; this patch hardens the RPC, not every possible query path.

## Scientific/privacy limitations

This aggregate is deliberately low-information and is **not a guarantee of anonymity**, a validated disclosure-control system, IRB approval, or a scientific data-sharing release. No production research datasets or row-level exports are authorized. Expanded analytics require separate governance and risk review. Do not claim end-to-end authenticated browser validation without testing.
