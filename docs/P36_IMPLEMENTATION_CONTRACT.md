# P36 — Automatic Hybrid AI Medical Document Intelligence: implementation contract

## Non-negotiable acceptance target

One upload experience across Bone, Immune, Cardiovascular and Behavioral. The user never chooses a parser or presses an AI button. Local geometry/OCR parsing runs first; when incomplete, uncertain, or empty, a properly configured server-side AI extraction service automatically supplements it. The user reviews, edits, verifies and explicitly saves. No AI output ever auto-saves.

## Critical security architecture

- Mission-level authorization may be configured centrally once, with no repeated astronaut prompt. **Do not treat a claimed NASA approval as a server-verifiable permission**. An authorized administrator/provider agreement is a deployment prerequisite for transferring real medical documents to external AI. No new UI consent per document is needed once correctly configured.
- Server-side authenticated endpoint only; validate session and active mission/crew access using existing access policy. No client-supplied 'approved=true' flag, no bypass of RLS, no broad service-role read. Use existing mission/crew authorization. Default deny if configuration is absent. Synthetic and real must remain isolated.
- Provider credentials exclusively on server, approved endpoint/model allowlist, timeout, retry limits, request size/page limits, usage budget, audit without raw medical contents, no document retention in logs, no hidden uploads.
- Offline: deterministic parser remains usable; visibly indicate AI unavailable and show held rows. No fabricated success.

## Extraction pipeline

1. Reuse `src/domain/bone-health/document-extraction.ts`, `pdf-geometry.ts`, `clinical-lab-rows.ts` and `universal-document-rows.ts`.
2. The shared queue in `src/domain/bone-health/file-queue.ts` is used by `src/components/bone-health-import.tsx` with a domain-specific `MeasurementProfile`. Implement AI fallback here ONCE for all four domains, not four independent parsers.
3. Reconstruct PDF table structure from text geometry and, where required, OCR/image pages. The AI request should include a bounded representation with page references; scanned image handling must be supported by the selected provider or safely reported unsupported.
4. Return strict JSON with analyte, numeric value, reported unit, exact observation/collection timestamp or null, date type, specimen/source where present, page, evidence snippet, catalog candidate and uncertainty. Use `ai-extraction-contract.ts` validation and extend it for source provenance. Provider confidence is never a substitute for validation.
5. Match against only the selected domain's scientific catalog, allow aliases, flag ambiguous mappings. Do not mistake reference intervals, lab IDs, accession IDs, report date or collection date for observation dates. Collection date can be suggested but not silently promoted to observation time.
6. Merge deterministic and AI suggestions using document/page/analyte/value/unit/date evidence keys, preserving conflicts as held items rather than overwriting deterministic values. All AI-derived rows are unchecked.
7. Existing correction, date confirmation, Verify All, duplicate handling, encrypted append-only storage, mission/crew permissions, tab retention and Medical Report must remain unchanged.
8. Clearly label provenance (`local parser`, `AI-assisted`), show source evidence and errors; no fake AI processing when provider absent.

## Existing AI is NOT an extraction API

`src/routes/api.medical-ai-draft.ts` is a legacy synthetic draft endpoint guarded for disposable environments, Ground Medical and synthetic provenance. DO NOT remove its guard or repurpose it to upload real reports. Build a dedicated, authorized server endpoint with mission-scoped provider configuration. Existing synthetic evidence Q&A is separate.

## Acceptance tests

- Exact original `MITOCHONDRIA_Synthetic_External_Lab_Challenge_02.pdf`: expected 5 synthetic immune values WBC 6.7 10^9/L, neutrophils 3.8 10^9/L, lymphocytes 2.2 10^9/L, hs-CRP 2.4 mg/L, NLR 1.73 ratio; collection 2026-10-14 07:35 UTC must not be silently misclassified as observation time.
- Original P34/P35 real PDF bytes, all four domain fixtures, mixed columns, split tables, scanned pages, misleading reference ranges, contradictory dates, duplicate results, unsupported units, unauthorized session, provider outage, offline mode, and aborted upload.
- Verify actual provider call on approved synthetic demo configuration, not mocked AI; report provider/model, exact extraction outcomes and spend estimate, without disclosing keys or PHI.
- Browser upload → editable review → verified save → reopen encrypted history → Medical Report. Authenticated real storage test, not only memory stand-in.
- Full tests, typecheck, lint, security audit, build, responsive visual tests. Preserve blocked P3663/P3664/P20 gates; no migrations/RLS changes/publish without approval.

## Scope of supplied files

The package includes a real domain-neutral, fail-closed AI result validator and this full implementation contract. It does NOT contain a configured provider, deployed endpoint or completed automatic AI fallback. Lovable must implement and test those pieces, and must report any blockers rather than claim the entire P36 is already implemented.
