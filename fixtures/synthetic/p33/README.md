# P33 Synthetic PDF Fixtures — Provenance

All files in this directory are **SYNTHETIC TEST DATA**. They are not real medical
records, contain no real person data, and are never auto-imported.

| File | Contents | Source |
| --- | --- | --- |
| `p28-immune-report.pdf` | 5 IMM rows (IMM-001/002/003/007/030) | Reconstructed from `fixtures/synthetic/p28/immune-synthetic.csv` |
| `p28-cardiovascular-report.pdf` | 5 CV rows (cv-001/005/006/027/065), Greek headers, reordered columns | Reconstructed from `fixtures/synthetic/p28/cardiovascular-synthetic.csv` |
| `p28-behavioral-report.pdf` | 4 BSC rows (BSC-001/002/004/015), wrapped analyte name, decimal comma | Reconstructed from `fixtures/synthetic/p28/behavioral-synthetic.csv` |
| `p33-unsupported-layout.pdf` | Unknown ID `IMM-999`, reference-range prose, markup-like text | Hand-written negative fixture |

## Important limitation

The **original** P28 PDFs and any P32 PDFs were never present in this repository
(only the P28 CSV fixtures existed). These PDFs are synthetic reconstructions
generated from the P28 CSV values by `scripts/generate-p33-fixtures.py`
(headless Chromium print-to-PDF). They therefore verify the P33 extraction
engine against realistic PDF text geometry, but they are **not** regression
evidence against the original documents, which were unavailable.
