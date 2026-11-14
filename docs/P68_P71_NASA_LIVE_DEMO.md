# P68–P71 NASA live demonstration

Status: implemented in Preview. The database change is **staged, not applied**; the public one-click entry is **default-off**. Nothing was published, deployed, migrated or pushed.

## 1. Inventory (before changes)

| Area             | Found                                                                                                                                      | Decision                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telemetry codes  | `radiation.dose_rate`, `environment.co2`, `environment.temperature` in `src/integrations/environmental-telemetry/`                         | Reused; no new codes.                                                                                                                                   |
| Body temperature | `phys.core_temperature` (core, validated method required); synthetic demo term `demo:ubt-323050f4` (°C, site unknown)                      | Core code used only for core sites; other sites stay context-only. No new biomarker.                                                                    |
| Domains          | Bone, Immune, Cardiovascular, Behavioral all render `HealthMeasurementEntry`                                                               | One insertion point covers all four.                                                                                                                    |
| Sign-in          | Password, sign-up, magic link, password change in `mission-identity.tsx` (`/mission/identity`, magic-link return URL)                      | Kept unchanged and labelled **Standard sign-in**.                                                                                                       |
| Review flows     | P36/P37 = scientific authorization of catalog terms; P36.8 = research-use decision on crew review batches; medical-advisor ledger disabled | None is an examination → assessment → medical review chain. A new, separate synthetic chain was built; none of the existing ledgers is read or written. |
| Public access    | No guest/demo login; no shared credentials                                                                                                 | New server-only provisioning.                                                                                                                           |

## 2. What was built

- **P68** — `src/domain/mission-context/shared-context.ts`: four parameters with exact closed unit lists (no conversion). Dose rate refuses cumulative-dose units. Body temperature requires a site; only core sites map to `phys.core_temperature`, and skin is labelled "not core temperature". Missing/unavailable states are kept, the same parameter/time/source is stored once, and conflicting duplicates are rejected. The same frozen projection appears in all four domains (`SharedMissionContextPanel`) and never changes review status. Outside a demo workspace the panel shows "No reading"; nothing is invented.
- **P69** — `src/lib/p69-public-demo.{server,functions}.ts` and `supabase/pending/20261114000000_p69_public_demo_workspaces.sql` (+ rollback). One click creates a random demo identity on the server, admits it (rate-limited per hashed client address and globally) and binds it to a new isolated workspace or, with a code, to an existing one. The browser receives only that identity's session tokens. Every other action is a caller-scoped RPC.
- **P70** — homepage headline and subtitle as requested, three role buttons (Astronaut, Researcher, Medical) with no password field, and links to **Standard sign-in**.
- **P71** — `/mission/demo`: submitted → scientific assessment (Researcher) → medical review (Medical). One immutable record ID and append-only events (revision, actor role, before/after state, time, provenance, source quality, measurement hash, previous event). Wrong role, stale revision, wrong state, cross-workspace and reused idempotency keys are rejected in SQL. Astronauts see the final medical outcome; assessment details are redacted. Reset seeds a new version; restore returns to an earlier one; nothing is deleted. The offline rehearsal (`/mission/demo?offline=true`) runs the same rules in memory and says so.

### Demo subject

"Alex Morgan — Synthetic Astronaut" is a persona inside each demo workspace (mission code `NASA-DEMO-304-001`). Its seed is a copy of the owner-approved P63 synthetic examination values (30 parameters, exact units; Galectin-3 excluded). It is **not** linked to the MITO_DEMO_2026 crew record, any account or any person.

## 3. Security boundaries

- No password, service key or named account in browser code or the repository. Demo identities are random, flagged `app_metadata.mitochondria_public_demo`, and deleted after their workspace has been expired for over an hour.
- `p69_demo_admit_v1`, `p69_demo_provision_v1` and `p69_demo_claim_expired_v1` are executable only by `service_role`. All browser RPCs resolve the workspace from `auth.uid()`; direct table access is read-only, workspace-scoped and excludes the join-code hash and events.
- Quotas: 12 entries per client per hour, 240 globally; 9 members, 26 examinations per version, 120 in total and 20 versions per workspace; 24-hour expiry.
- The privileged client is loaded only inside the entry handler after the default-off check.

## 4. Operator checklist (owner approval required for each step)

1. Review and approve `supabase/pending/20261114000000_p69_public_demo_workspaces.sql` (independent of all other pending files). Apply it unchanged.
2. Add server secrets: `P69_PUBLIC_DEMO_CLIENT_SALT` (random, at least 32 characters) and `P69_PUBLIC_DEMO_ENABLED=true`. Optional: `P69_PUBLIC_DEMO_EMAIL_DOMAIN` (default `demo.mitochondria.edocinfo.com`; no email is sent).
3. Confirm email/password sign-in is enabled in authentication settings (demo identities are created as confirmed users).
4. Rehearse in Preview (section 5), then authorize publication separately.
5. To switch off: set `P69_PUBLIC_DEMO_ENABLED` to anything other than `true`. Existing workspaces stay readable until they expire.

## 5. Live demo procedure (three browser profiles)

1. **Profile A (Astronaut):** open the homepage and click **Astronaut**. Copy the workspace code from `/mission/demo`.
2. **Profile B (Researcher):** open `/mission/demo`, enter the code, click **Researcher**.
3. **Profile C (Medical):** same, click **Medical**.
4. A: choose **Fill with the synthetic P63 sample values** (or enter a few values) and save. Status: "Under scientific assessment".
5. B: Refresh, open the record under "Awaiting scientific assessment", choose an outcome, add a note, record.
6. C: Refresh; the record shows the assessment. Choose a medical outcome and record. Optionally enter a new examination for Alex as Medical.
7. A: Refresh. The final medical outcome is shown; the scientific details are redacted.
8. Show stale-update protection: open the same record in two tabs of B, record in one, then try in the other.
9. **Reset workspace** returns to the seed (new version); **Restore version** brings the earlier work back.

Fallback: if entry reports "not switched on", "not installed" or "unavailable", use **Open the offline rehearsal** (same workflow, not saved, labelled).

## 6. Verification

- `tests/domain/p68-shared-mission-context.test.ts`, `tests/domain/p71-demo-workflow.test.ts`, `tests/security/p69-public-demo.test.ts`, `tests/navigation/p70-landing-access.test.ts`.
- `FV01_PG_SOCKET_DIR=<disposable socket> node scripts/verify-p69-public-demo-pg.mjs` — applies stubs + the staged SQL twice, runs `tests/integration-pg/p69-public-demo.sql`, proves rollback and re-apply.
- Not verified: live provisioning against the real backend and a three-profile browser run (both need the SQL applied and the secrets set).
