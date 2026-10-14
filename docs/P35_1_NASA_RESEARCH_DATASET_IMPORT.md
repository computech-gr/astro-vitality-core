# P35.1 — NASA Research Dataset Import

Scope: on-demand retrieval of published NASA OSDR Biological Data API v2 dataset metadata and bounded per-sample metadata, displayed and downloaded as a research-only JSON evidence package. Source: https://visualization.osdr.nasa.gov/biodata/api/ (REST `/v2/dataset/OSD-48/` and sample query `/v2/query/metadata/`).

Route: `/mission/nasa-evidence`. Server API: `/api/nasa-research` with strictly validated accession and mode. Fixed NASA origin, 12-second timeout, no redirects, 1 MiB maximum upstream response, no-store response, no API credentials. Bounded client parsing (500 rows), cross-accession rejection. Downloaded JSON carries source URL, retrieval timestamp, classification `research_only`, `subjectBinding:none`, and `clinicalActivation:false`.

**Scientific boundary:** sample-level study metadata are not physiological measurements. The feature does not ingest omics matrices, waveform values, personally identifiable astronaut health data, or clinical measurements. It does not write to Supabase or IndexedDB, create missions, bind samples to crew, compute baselines, or trigger alerts. No implicit equivalence between animal/cell studies and humans. No live NASA crew feed. NASA is not endorsing this project.

**Acceptance:** run `bun test tests/domain/p351-nasa-research.test.ts`, `bun run check`, verify real API response schema for OSD-48 in browser and validate error/timeout, 1 MiB bound, keyboard/mobile behavior. If NASA schema differs, fix adapter and tests rather than silently accepting malformed data. Verify server route is supported by the project's TanStack Start version. Do not publish until checks pass. P32 pending, P34 pending, FV-01-13 OPEN, Final Security Gate BLOCKED.

**Next separate work:** governed quantitative data import requires dataset-specific file selection, measurement semantics, subject and species screening, units, licenses, version hashes, review approvals and separate controlled research storage. It is **not** implemented in P35.1.
