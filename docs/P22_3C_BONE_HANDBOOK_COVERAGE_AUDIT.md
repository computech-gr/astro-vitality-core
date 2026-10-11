# P22.3c — Bone Health Handbook Coverage Audit

## Source reconciliation

The original **Astronaut Bone Health Handbook v7 — Biology for Developers** was inspected directly. Its six four-column variable tables contain **63 rows** (8, 4, 15, 15, 12, 9). Each row's label, order, and author-assigned A/B/C tier matched the existing P21 catalog exactly (63/63). This is a **catalog completeness check**, not independent scientific validation.

The coverage manifest captures the 63 exact IDs, labels, categories and review states, and the source catalog SHA-256. The verifier checks the catalog, the TypeScript runtime catalog, manual selection, CSV mapping, document mapping, and opt-in review. A catalog edit intentionally fails until the source reconciliation is repeated.

## Important limitations

- **Manual entry:** All 63 items are selectable, but this does not mean all have approved reference ranges or are equally suitable for numeric lab entry (some describe imaging, exposure, or adherence).
- **CSV:** Exact catalog IDs or exact names can be matched; incorrect units, specimens, dates, or methodology are not clinically validated by this coverage audit.
- **PDF / image:** Current extractor is a conservative, line-prefix heuristic. It cannot reliably recognize all 63 from real-world reports, alternative names, multiline tables or unsupported OCR browsers. It requires human review and explicit selection.
- **Science:** All 63 remain pending independent review; no diagnostic, readiness, fracture-risk, or clinical 'OK' decision is enabled.

## Run

`bun run verify:p22:bone-coverage` or `node scripts/verify-p22-bone-coverage.mjs`.

**Next:** P22.4 offline OCR and mapping should measure recall/precision on consented, de-identified test documents, with explicit false-positive and unit-mismatch tests before claiming reliable extraction.
