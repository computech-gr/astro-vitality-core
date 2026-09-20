# Infrastructure layer

Runtime concerns: configuration, logging, error reporting, build-time
constants, and concrete adapters for external services.

- `config.ts` holds canonical-origin and environment resolution.
- PWA plumbing and the service-worker boundary anchor here.
- P14 offline mission storage is implemented through the governed offline runtime: encrypted local persistence, append-only critical records, protocol cache, sync queue, conflict handling, and explicit local/cloud state separation.
