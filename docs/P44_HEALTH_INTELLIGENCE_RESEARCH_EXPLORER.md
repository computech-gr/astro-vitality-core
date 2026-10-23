# P44 — Health Intelligence research-only semantic explorer

P44 adds a read-only, searchable view of the 54 P43 semantic proposals to the existing Health Intelligence page. It does **not** alter the reviewed pattern engine, clinical workflows, databases, mission-scoped evidence, or scientific approval ledger.

- Every P43 proposal remains pending independent scientific review.
- Provisional semantic equivalence does not imply matching specimen, protocol, unit, denominator, timing, or instrument.
- The other 162 P37 records remain unmapped and are not rejected.
- No patient-specific evidence is included in the explorer; the data is repository-local scientific metadata.
- No catalog merges, medical scores, automated alerts, clinical activation, or Cloud writes.
- The existing mission-scoped evidence component retains its authentication and privacy boundaries.

Validation: `node scripts/verify-p44-research-explorer.mjs`, then the full GitHub Actions workflow on the synchronized commit. A green workflow validates code checks, **not** independent scientific approval or real-device offline OCR.
