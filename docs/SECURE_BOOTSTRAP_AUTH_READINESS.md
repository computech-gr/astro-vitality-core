# Secure Bootstrap & Auth Readiness — v20.12.0

## Purpose

A clean deployment cannot safely make the first signed-in user a mission administrator. v20.12.0 provides a one-shot, audited bootstrap path that preserves the normal authorization model while eliminating manual SQL as the first-production-operator procedure.

## Security model

- The public application never contains a bootstrap token or a service-role credential.
- `mission_bootstrap_control` has forced RLS and no direct browser privileges.
- Only `service_role` can arm the bootstrap by storing a SHA-256 hash.
- The bootstrap secret itself exists only in the trusted provisioning process memory.
- The first operator must authenticate as a normal Supabase user; the database records that real `auth.uid()` as the operator and audit actor.
- `bootstrap_first_mission` serializes concurrent attempts, rejects anonymous callers, rejects an invalid/replayed secret, and permanently refuses bootstrap once any active mission operator exists.
- Consuming bootstrap atomically creates the first planning mission, grants the authenticated user `mission_operator`, writes the audit event, and marks the bootstrap consumed.

## First production operator procedure

1. Verify Email authentication is enabled in the Supabase project and that the canonical production URL is configured as the Site URL / allowed redirect target.
2. Create the intended first operator account through `/mission/identity` and complete email confirmation.
3. In a trusted terminal, export server-only provisioning values. Never put these in `.env.local`, `VITE_*`, source control, screenshots, or a browser bundle:

```bash
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_PUBLISHABLE_KEY='<publishable-key>'
read -rsp 'Service role key: ' SUPABASE_SERVICE_ROLE_KEY; echo; export SUPABASE_SERVICE_ROLE_KEY
export MISSION_BOOTSTRAP_EMAIL='operator@example.org'
read -rsp 'Operator password: ' MISSION_BOOTSTRAP_PASSWORD; echo; export MISSION_BOOTSTRAP_PASSWORD
export MISSION_BOOTSTRAP_CODE='ARTEMIS-DEMO'
export MISSION_BOOTSTRAP_NAME='Artemis Demo Mission'
bun run bootstrap:first-operator
```

The script generates a 256-bit random bootstrap secret in memory, arms only its hash using the service role, signs in the intended user with the publishable client, consumes the secret through the authenticated bootstrap RPC, signs out, and never writes the secret to disk.

Immediately unset the service role key and password from the shell after success. Subsequent mission creation uses the normal Mission & Crew Operations workflow; bootstrap cannot be replayed.

## Browser auth readiness

`/mission/identity` probes the browser-safe Supabase `/auth/v1/settings` endpoint. When the project explicitly reports Email authentication disabled, the page shows `CONFIGURATION REQUIRED` and disables email sign-in, account creation, and magic-link actions. A settings endpoint that cannot be reached is reported as readiness unknown rather than falsely claiming the provider is disabled.

This probe intentionally does not expose project-admin configuration such as the full redirect allowlist. Production Site URL and redirect allowlist remain deployment controls and must be verified through an authorized Supabase project-management surface. Canonical production origin: `https://mitochondria.edocinfo.com`; identity redirect: `https://mitochondria.edocinfo.com/mission/identity`.

## Production Auth configuration verification

The repository also provides a trusted deployment check for project-admin Auth configuration. It is intentionally not part of the public browser or the normal CI check because it requires a Supabase Management API access token:

```bash
export SUPABASE_PROJECT_REF='<project-ref>'
read -rsp 'Supabase access token: ' SUPABASE_ACCESS_TOKEN; echo; export SUPABASE_ACCESS_TOKEN
bun run verify:auth-remote
```

The check requires the Site URL to equal `https://mitochondria.edocinfo.com` and the redirect allowlist to contain `https://mitochondria.edocinfo.com/mission/identity`. If the Management API exposes the Email-provider flag, an explicitly disabled provider also fails the check.

## Local reproducibility

`supabase/config.toml` now versions the local Auth contract. Local Supabase enables Email auth and uses `http://localhost:3000` as the local Site URL, with the mission identity route allowed explicitly. This is local-development configuration only and does not overwrite production Auth settings.

## Negative acceptance cases

- anonymous bootstrap: rejected;
- publishable/ordinary authenticated client attempting to arm bootstrap: rejected;
- wrong bootstrap secret: rejected;
- second/replayed bootstrap: rejected;
- bootstrap after any active mission operator exists: rejected;
- service-role key in browser bundle: prohibited by the existing security audit;
- Email provider explicitly disabled: identity page shows `CONFIGURATION REQUIRED` before auth action.
