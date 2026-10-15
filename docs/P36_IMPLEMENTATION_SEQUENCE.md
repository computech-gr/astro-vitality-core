# P36 implementation sequence

P36.1 (this patch): canonical registry with 159 entries + documented ingestion/report contract. No new UI and no ingestion execution.

P36.2: authenticated Mission Document Intake (PDF/images/CSV), local parsing, explicit consent, strict file limits, OCR readiness disclosure and human review queue. Reuse existing bone-health extraction/import components after audit.

P36.3: approved candidate -> canonical observation mapping, provenance and encrypted append-only storage, mission RLS, idempotency, unit/specimen comparability gates.

P36.4: source-aware dashboards with coverage and missingness; graphs only with compatible verified observations.

P36.5: research-only astronaut evidence report (not a health verdict), citations back to approved source rows, uncertainty and missing evidence, downloadable export after privacy review.

Acceptance: independent science review and all security gates remain mandatory. Do not invent data, device compatibility or clinical thresholds.
