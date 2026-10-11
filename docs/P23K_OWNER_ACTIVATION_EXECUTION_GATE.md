# P23K — Owner activation execution gate

## Decision
P23J and earlier code is in place. **Do not generate another bootstrap UI patch before completing the real owner workflow.** P23K provides a repeatable static guard and an operational handoff, not privileged execution.

## Owner-only sequence
1. On the canonical published site, use **Mission Identity** to sign up and verify the email of the intended first operator. Sign in. Never share the password.
2. On a trusted local copy of this project, run `node scripts/prepare-first-operator-bootstrap.mjs`. Keep the **secret** private. The generated SQL contains only a SHA-256 hash, but treat the statement as a privileged authorization request.
3. In Lovable, **explicitly approve one execution** of `select public.configure_mission_bootstrap('<generated-hash>'::text);` using its authorized privileged database tool. Ask for the returned result; do not authorize any other SQL. Do not share the secret.
4. After confirmed successful arming, on the signed-in Mission Identity page enter the mission code, mission name and private secret exactly once. Verify an active operator membership exists. Stop and investigate if the result is ambiguous; do not re-arm blindly.
5. Activate the mission, create an **active** crew member, invite a separate crew-self account and a separate ground-medical account. Each user confirms their own email and accepts their own invitation.
6. Run authenticated synthetic persistence checks and RLS isolation, then real-device offline/reconnect and fresh-install tests. Report observed results, not assumptions.

## Gates and prohibitions
- No service-role key in the frontend or in chat; no anonymous or authenticated permission to arm bootstrap.
- Never put the private secret in SQL, logs, git, screenshots, or a chat message.
- Do not create dummy memberships, bypass RLS, auto-reassign historic records, or claim cloud validation from static tests.
- The one-time arming is a privileged operation and requires explicit owner approval. This patch does **not** include a migration or execute SQL.
- `verify:p23k` validates only source-level contracts. It cannot establish the live cloud's account count, privileges, or readiness.
