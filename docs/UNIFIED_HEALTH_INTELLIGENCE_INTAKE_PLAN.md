# Unified Health Intelligence Intake — guarded implementation plan

## Implemented in this patch

A deterministic, read-only classification foundation for multi-marker documents. It matches exact P36 catalog names and exact source units; reports unknown, ambiguous and unit-review-required items without inferring new biomarkers or approving any observation. No storage, mission permissions, sealed evidence, clinical interpretation or cloud submission paths are modified.

## Not yet implemented — requires explicit integration and validation

1. Route all reviewed CSV, PDF/OCR, manual, device and questionnaire observations through one versioned, provenance-rich observation envelope.
2. Preserve original document bytes/hash and extraction source with mission- and crew-scoped authorization.
3. Present a per-row review UI for multi-domain classification, original units, observation timestamps, duplicate warnings and explicit reviewer approval.
4. Connect accepted observations to the domain read models only after domain-specific scientific approval; do not treat provisional P36 registry entries as operational approval.
5. Add append-only correction/supersession semantics and offline encrypted event compatibility, with no historical rewrites.
6. Verify authorization and cross-mission isolation, false-positive extraction, ambiguous names, unknown units, timezones, and replay/idempotency.
7. Integrate with Health Intelligence pattern engine only through approved evidence adapters; never convert catalog-only observations to diagnostic alerts.

## Safety boundary

This patch is an additive foundation, not a complete automatic document ingestion feature. `PENDING_NIKOLAS_REVIEW` and independent acceptance gates remain unchanged. A classification result always requires human review.
