# Infrastructure layer

Runtime concerns: configuration, logging, error reporting, build-time
constants, and concrete adapters for external services.

- `config.ts` holds canonical-origin and environment resolution.
- PWA plumbing (manifest, future service worker registration) anchors here;
  offline health-data storage is intentionally NOT implemented yet.
