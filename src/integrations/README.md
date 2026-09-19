# Integrations layer

Ports and adapters for external systems (e.g. Supabase for the existing
`mitochondria` project, sensor sources, AI services).

- Define narrow interfaces (ports) here; implementations live in
  `src/infrastructure` or alongside the port behind a factory.
- Credentials come from environment variables / secret storage only —
  never hardcoded.
- No Supabase client or schema is wired up in this phase.
