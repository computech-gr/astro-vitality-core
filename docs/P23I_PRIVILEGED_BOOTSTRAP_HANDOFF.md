# P23I — Privileged bootstrap handoff (Lovable Cloud)

The original `bootstrap-first-operator.mjs` requires a service-role key not exposed by Lovable Cloud. P23I adds a **manual, explicitly authorized** hash-only SQL arming path and an authenticated one-time redemption form. This does **not** bypass database authorization.

## Deployment administrator steps

1. Confirm `20260921002000_p20_secure_bootstrap_auth_readiness.sql` is deployed and the database is the intended Lovable Cloud project. Verify no existing active mission operator and no consumed bootstrap. Do not reapply that migration.
2. Create and confirm the intended operator account through `/mission/identity`; sign in. Do not share credentials.
3. On your own trusted computer, run `node scripts/prepare-first-operator-bootstrap.mjs`. It prints a random secret and **only its SHA-256 hash** in an SQL statement. Securely retain the secret; do not save terminal output to project files, Git, screenshots or chat.
4. Only with explicit owner approval and authorized **privileged Lovable Cloud SQL/database-console access**, execute the printed `select public.configure_mission_bootstrap('<hash>'::text);` statement. It arms a one-time hash; it does not create an account, mission or membership. Do not paste the secret into SQL.
5. Return to the **authenticated** Mission Identity page with zero memberships. Enter mission code, mission name and the one-time secret privately. Click **Activate first mission once**. The existing `bootstrap_first_mission` RPC creates the planning mission and first operator membership and consumes the secret atomically.
6. Refresh identity. Confirm operator membership, then use Mission & Crew Operations to activate mission/crew and issue individual crew-self and ground-medical invitations. Use distinct confirmed users.
7. Test real signed-in browser-to-cloud flows with synthetic values, RLS isolation, offline/reconnect, idempotency and real device separately. No test evidence is asserted by this patch.

## Security boundaries

- Never put service-role keys or bootstrap secrets in browser configuration, migrations, repository, chat or logs.
- This patch **contains no migration** and **does not execute any SQL or bootstrap**. The operator must authorize and perform privileged arming manually. If the Lovable Cloud environment offers no privileged SQL/admin route, stop and report that infrastructure blocker; do not invent an unprotected browser RPC.
- The UI holds the secret only in component state and clears it before invoking the authenticated RPC; the RPC transmits it to Supabase over HTTPS. It is not written to localStorage.
- An unauthorized user with no secret cannot bootstrap. Bootstrap remains unavailable after an operator exists, and the existing RPC enforces one-time consumption.
- Do not reassign or delete encrypted historical records.
