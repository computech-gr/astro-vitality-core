# P36 — Document-to-Biomarker & Research Report Contract (design gate)

## Scope and actual status
This patch adds the source mapping registry and acceptance contract **only**. It does NOT implement document ingestion, OCR, automatic extraction, database persistence, dashboards, or report generation. Existing bone-health document extraction and import facilities must be audited and reused, not duplicated. All 159 catalog entries remain reference-only, pending independent scientific review.

## Intended operator workflow
1. Authenticate, select an ACTIVE mission membership and confirm correct subject. Never silently use LOCAL P9 SESSION for person-specific uploads.
2. Upload a PDF/image/CSV from a laboratory, imaging service or clinical exam. Require explicit consent, supported file type, bounded size and local-only processing by default. For scanned PDFs/images OCR is **untrusted**; if local OCR assets are unavailable, do not silently upload to an external OCR/AI service.
3. Parse text into **candidates** using strict IDs from `p36-biomarker-source-registry.v1.json`. Match aliases only from an explicit reviewed dictionary; no fuzzy automatic insertion. Capture document page, quoted source span, extraction confidence and original value/unit.
4. Show a review table with candidate, proposed metric, value, unit, specimen, method, date, source page and ambiguity flags. Operator must confirm each candidate; no bulk silent approval. Reject missing unit/date, unsupported unit conversion, contradictory or multiple measurements without disambiguation. Never treat reference ranges as patient results.
5. On approval, write immutable provenance-linked observations in the mission's existing encrypted evidence infrastructure, honoring existing RLS/mission access boundaries. Hash the source document and preserve versioned extraction metadata. Avoid storing raw medical documents by default; if retained, use explicit consent, encryption, access controls and deletion policy.
6. Render graphs only for compatible actual observations. Never mix research datasets, simulated samples and personal measurements. Label source and quality in the UI.
7. Generate a **research-only, non-diagnostic** report showing coverage, observations, longitudinal trends where comparable, missing/uncertain evidence, methodological caveats and source references. Do not output clinical diagnosis, fitness-to-fly, fracture risk or autonomous operational recommendations.

## Data contract (candidate; NOT auto-approved)
- `candidate_id`, `mission_id`, `subject_id`, `metric_id`, `raw_label`, `raw_value`, `raw_unit`, `proposed_value`, `proposed_unit`
- `observed_at`, `specimen`, `assay_method`, `anatomical_site`, `modality`, `posture`, `rest_state`, `device_model`
- `source_document_sha256`, `source_filename`, `source_page`, `source_excerpt`, `extraction_method`, `extraction_confidence`, `validation_flags`
- `review_status` = pending | approved | rejected; `reviewer_id`, `reviewed_at`, `import_batch_id`
- No document text or secret is sent to external AI endpoints without separate explicit user opt-in and documented provider controls.

## Required negative tests
- A reference interval is never imported as a measurement.
- A lab report for a different person/mission cannot be imported into this mission.
- Ambiguous aliases and units do not map automatically.
- Unreviewed OCR candidates never become evidence.
- PDF with embedded script / malformed PDF / oversized file is rejected safely.
- Same document + same measurement reimport does not duplicate observation.
- Missing date or incomparable method does not create a trend.
- Research-only datasets never appear as real crew measurements.
- Unauthorized user cannot see source document or derived observation.
- Offline uploads do not bypass consent, approval, provenance or encrypted persistence.

## Scientific and security gates
FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED. Scientific source classifications here are provisional and must be approved by Nikolas and independently reviewed. No schema migrations in this patch.
