# Application layer

Use-case orchestration between UI, domain, and integrations.

- Hooks/services that coordinate domain logic and integration ports.
- Depends on `src/domain` and integration *interfaces*, never on concrete
  infrastructure clients directly.
- No UI components here.
