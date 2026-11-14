# Public NASA live demo rules (P69–P71)

- Public demo identities are random server-created auth users bound to one isolated synthetic workspace by service_role-only RPCs after a database admission/rate check; the browser only ever receives that identity's session tokens, never a password, service key or a shared/named account.
- All workspace reads and writes are caller-scoped RPCs that resolve the workspace from auth.uid() membership and enforce role, expected revision, idempotency key, quota and expiry in SQL; TypeScript validation in workflow.ts mirrors these rules for feedback and the offline rehearsal only, never as authority.
- Demo workspaces never read or write real missions, crew, memberships, observations, sync, P36/P37/P615 ledgers or catalogs; the synthetic subject "Alex Morgan — Synthetic Astronaut" is a per-workspace persona, not the MITO_DEMO_2026 crew record.
- Records and events are append-only; reset seeds a new epoch and restore re-points to an earlier one, so nothing is deleted.
- The SQL seed literal must equal buildP69SeedDocument() (tested); change both together.
- A demo scientific assessment is never scientific authorization or catalog activation, and a demo medical review is never a diagnosis or clinical clearance; astronauts see the final medical state with assessment details redacted.
- Tab storage holds only the synthetic join code, role and expiry.
- Provisioning signs the new demo identity in before binding it to a workspace, and deletes it on any later failure; a failed entry must never leave a bound or orphaned identity.
- The admission rate-limit address comes only from the edge-set `cf-connecting-ip` (IPv6 bucketed per /64); forwarded-for headers are client-controlled and never trusted, and a missing address shares one fail-closed bucket.
- Workspace notices (refused reviews, Reset/Restore results) are owned by the workspace view, not record cards, and come from the pure workspace-feedback module: Reset/Restore report success only after the server accepted the change and the reload succeeded, run single-flight, and refused actions are never retried; examination dates are calendar strings never parsed through Date, so time zones cannot shift them.
