# P23J — First operator owner handoff

## Why this patch exists

The deployment has no mission operator. Existing authentication and mission operations cannot be validated end-to-end until a real owner signs up, confirms email, and completes the privileged one-time bootstrap. P23J adds an explicit owner-facing checklist; it does **not** arm bootstrap, create an account, grant a role, or execute SQL.

## Owner procedure (manual, authorized)

1. Create and confirm the first operator account on `/mission/identity`; sign in.
2. On a trusted local computer with this project, run `node scripts/prepare-first-operator-bootstrap.mjs`. The output contains a **private secret** and a **hash-only SQL statement**. Never commit, photograph, log, or share the secret.
3. Explicitly approve execution of only the generated `select public.configure_mission_bootstrap('<sha256-hash>'::text);` statement through Lovable Cloud's authorized privileged database tool. The tool must have appropriate rights. **Do not** send the private secret to Lovable or to a chat.
4. Confirm successful hash arming; enter the secret in the signed-in activation form once, with a valid mission code and name.
5. Verify the new operator membership. In Mission & Crew Operations, activate the mission, create an active crew member, issue separate crew-self and ground-medical invitations, and have two separate confirmed users accept them.
6. Only then perform real authenticated synthetic browser-to-cloud persistence, RLS isolation, idempotency, offline/reconnect and device tests. Record actual results and failures.

## Security / limitations

- `configure_mission_bootstrap` is not available to anonymous or authenticated client roles. Never grant it to them or embed a service-role key in frontend code.
- The private secret is required by `bootstrap_first_mission` and must not be sent to the database administrator or copied into the hash-only SQL.
- No new migration, SQL execution, user provisioning, account confirmation, or actual cloud/device validation is included.
- Do not claim first-operator activation or end-to-end success until verified against the live deployment.
