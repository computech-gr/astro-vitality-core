# P68–P71 live activation readiness audit (2026-11-14)

Status: **REVIEW COMPLETE — NOT ACTIVATED.** No production migration, secret, enablement, publication, deployment or push was performed. The live database contains no `p69_demo_*` tables.

## 1. Confirmed defects (reproduced, then fixed)

| #   | Defect                                                                                                                                                                                                                                                           | Reproduction                                                                                                      | Fix                                                                                                                                                                                                    | Regression tests                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| D1  | A sign-in failure after provisioning returned "unavailable" but left the new identity alive **and bound** to the workspace (one of the 9 member slots consumed). A thrown error after identity creation left it alive too.                                       | Server core with failing `signIn`: RPCs `claim, admit, provision` ran; `deleted = []`.                            | `src/lib/p69-public-demo.server.ts`: sign in **before** binding; delete the identity on sign-in failure, provisioning refusal or any thrown error; fixed non-sensitive message.                        | `tests/security/p69-public-demo.test.ts` (failed sign-in; thrown failure)             |
| D2  | The rate-limit address fell back to client-controlled `x-forwarded-for` whenever `cf-connecting-ip` was absent, so each spoofed value minted a fresh 12/hour bucket. IPv6 visitors could rotate addresses inside their own /64 to multiply the per-client limit. | Old expression: three spoofed XFF values produced three addresses; two addresses in one /64 produced two buckets. | `demoClientAddress()`: trust only edge-set `cf-connecting-ip`, validate IP syntax and length, bucket IPv6 per /64; missing/malformed shares one fail-closed `unknown` bucket. Global 240/hour remains. | `tests/security/p69-public-demo.test.ts` (XFF ignored; /64 bucketing; unknown bucket) |

Production responses carry `server: cloudflare` and `cf-ray`, so `cf-connecting-ip` should be set by the edge. **Not verified:** that the deployed worker receives the visitor's own address (not an intermediate proxy address). Verify during the live rehearsal (step 3 below).

## 2. Staged SQL review (disposable PostgreSQL 17 only)

`node scripts/verify-p69-public-demo-pg.mjs` — **70/70 PASS** (applies twice, scenarios, rollback, re-apply). Added scenario: Ground Medical enters a new synthetic examination → Researcher assesses → Medical reviews the same record → Astronaut sees the final outcome with assessment redacted. SQL migration and rollback bytes are **unchanged**.

Catalog audit with Supabase-style default privileges (all tables/functions granted to anon/authenticated/service_role before applying):

- 20 functions, all with `search_path = ''`; none executable by `anon`.
- `authenticated` executes only the 8 caller-scoped functions; `service_role` alone executes admit/provision/claim-expired.
- No table privilege for `anon`; no write privilege for `authenticated` or `service_role`; RLS enabled on all 7 tables; join-code hash and events not directly readable.
- A wrong join-code guess keeps its admission (rate-limited separately from provisioning). Codes are 48-bit; at 12 guesses/hour per client and 240/hour globally, guessing is impractical.
- Rollback removes every P69 table and function (0 objects left). It does not delete demo sign-in identities.

Live read-only inspection: every real-data table policy requires a mission membership/scope; every signed-in-executable privileged function checks a caller-bound scope helper. A demo identity therefore has the same access as a freshly signed-up account with no mission membership (spot-checked, not a formal proof).

## 3. Verified in Preview (no live writes)

- Homepage headline unchanged; three role buttons; no password field; Standard sign-in link present. Clicking Astronaut returns "not switched on" (default-off).
- `/mission/identity` still shows the password sign-in.
- All four shared parameters (radiation dose rate, cabin CO₂, cabin air temperature, body temperature) appear in Bone, Immune, Cardiovascular and Behavioral, with "No reading" outside a demo workspace.
- Offline rehearsal: Astronaut submits → Researcher assesses → Medical reviews; Medical enters a new exam → Researcher → Medical; Astronaut sees both final outcomes with assessment notes hidden; reset (1 record) and restore (3 records). No page errors.

## 4. Residual risks (not fixed; owner decision)

- **Global quota exhaustion:** about 20 distinct addresses can use the 240/hour global admission limit and block entry for an hour. Fallback: offline rehearsal.
- **Role switching in one tab** creates a new identity and member each time. Earlier identities stay until expiry cleanup, and a workspace allows 9 joins. Use three separate browser profiles.
- **Expired identity cleanup** only runs when someone enters the demo (up to 5 per entry). Expired identities cannot read anything (`MDEXP`).
- **Auth sign-in limits** on the server's address may cause "unavailable" during bursts. With D1 fixed, this no longer leaves orphaned identities.
- **Shared-device sessions:** starting the demo on a device signed in to a standard account signs that account out locally, after confirmation.

## 5. Activation plan — each step needs separate written approval

1. **Database migration.** Apply `supabase/pending/20261114000000_p69_public_demo_workspaces.sql` byte-identically. Confirm 7 `p69_demo_*` tables, 20 functions and the grants above, read-only. Rollback file exists but is only run after separate approval.
2. **Server secrets and demo activation.** Add `P69_PUBLIC_DEMO_CLIENT_SALT` (random, ≥32 characters) and then `P69_PUBLIC_DEMO_ENABLED=true`. Confirm email/password sign-in remains enabled. Off switch: any value other than `true`.
3. **Three-browser-profile live rehearsal (Preview).** Profile A Astronaut creates the workspace and submits; B Researcher joins by code and assesses; C Medical reviews, then enters a new exam that B assesses and C reviews; A refreshes and sees both outcomes, assessment redacted. Also check stale-revision refusal in two tabs, cross-workspace denial with a fourth workspace, reset/restore and Standard sign-in. Read-only check: distinct `client_hash` values per network, so the edge address is per-visitor.
4. **Final publication.** Publish only after steps 1–3 pass. Then run read-only production smoke tests.
