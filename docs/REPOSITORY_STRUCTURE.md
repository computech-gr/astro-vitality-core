# Repository Structure

```text
.github/
  workflows/quality.yml       CI quality gate
.lovable/
  project.json                Lovable project metadata
public/
  favicon.png                 public icon
  manifest.webmanifest        PWA manifest foundation
  robots.txt                  crawler directives
src/
  app/                        application-layer boundary
  assets/                     visual assets
  components/                 public shell and reusable UI
  domain/                     P3 canonical health/science contracts + tests
  hooks/                      reusable React hooks
  infrastructure/             runtime/infrastructure configuration
  integrations/
    supabase/                 generated/current Supabase client boundary
  lib/                        shared technical utilities
  routes/                     TanStack Start routes
  router.tsx                  router initialization
  server.ts                   server entry/wrapper
  start.ts                    application start integration
  styles.css                  global design system/styles
tests/
  domain/                     P3 synthetic domain-contract tests
supabase/
  config.toml                 Supabase project configuration; no P3 schema migrations
AGENTS.md                      Lovable/Git collaboration constraints
CODE_OF_CONDUCT.md             contributor conduct
CONTRIBUTING.md                contribution rules
CITATIONS.md                   scientific/resource registry
LICENSE                        Apache-2.0
README.md                      project overview and setup
SECURITY.md                    vulnerability reporting policy
.env.example                   safe environment template
bun.lock                       deterministic dependency lockfile
package.json                   scripts and dependencies
```

Generated files such as `src/routeTree.gen.ts` should not be manually edited unless the framework specifically requires it.
