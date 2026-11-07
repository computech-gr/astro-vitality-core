# P36 compact Scientific Review — implementation and validation

## Result

The complete presentation improvement is implemented against the current project checkout and the supplied `MITOCHONDRIA_P36_-_COMPACT_SCIENTIFIC_REVIEW_pasted.md` specification. No repository ZIP accompanied this request. No production migration, write flag, admission switch, local metadata upload or publication occurred.

Original documentary dossiers and the authorized dynamic inventory now use compact searchable tables, domain/review/evidence filters, bounded pagination and per-row Review drawers. Mission, authorized crew and provenance remain scope selectors. Drawers preserve the full existing documentary dossier, exact-unit comparisons, specimen/assay/protocol context, unresolved questions, source references, worksheet history and cloud decision history. Additional cloud terms expose their complete derived dossier. Local-only terms never become cloud terms merely by being visible.

The pending status is displayed as **Pending Scientific Review** without changing stored `PENDING_NIKOLAS_REVIEW` values. PDF/JSON builders, catalogs, source handbooks, observation precision, encrypted records and immutable history were not changed. Search/filter/pagination never supplies classification or authority. There is no bulk scientific approval.

Individual Approve, Reject and Request More Evidence controls remain disabled without an authorized Researcher and verified ledger. Entered decision fields are checked through the existing payload validator before a button can enable and before submitting. Approval requires an independent matching recommendation and the existing exact-unit/specimen/method/protocol/evidence rules. Dynamic recommendations still require Ground Medical; server and database recheck independently provisioned source receipts on every mapping write. A frontend field or label never proves source validation, deployment admission or scientific acceptance. Approval never activates a catalog extension.

## Verified visibility defects and exact submission blocker

Read-only catalog queries against the connected backend verified that `p36_dynamic_handoff_submissions`, `p36_dynamic_admission` and `p36_dynamic_handoff_list_v1(text,text,text,bigint,integer)` do not exist. The dynamic handoff schema and admission are therefore **not deployed**. This is a sufficient, verified blocker preventing Ground Medical cloud submissions from appearing in Researcher review; an empty display was not evidence of zero requests.

Read-only `pg_policies` inspection verified that `memberships_self_or_ground_select` permits the caller's own memberships or Ground Medical/mission_operator access, and `crew_member_ground_select` likewise does not include mission-wide Researcher access. The existing roster loader queried other crew's `crew_self` memberships. An account can consequently have a valid mission-wide Researcher role yet receive an empty RLS-filtered roster. That was a visibility-path defect, not absence of a Researcher role.

The corrected loader first uses the staged narrow caller-scoped roster RPC below. Its permissions are confined to active mission assignments and the caller's active crew-bound or mission-wide Ground Medical/Researcher memberships; it returns only mission ID, crew ID and display name. Existing table policies are unchanged. Missing RPC fallback reads only existing RLS-visible rows, never guesses an ID, and explains the owner-gated visibility requirement rather than asserting the mission has no crew. Errors, loading, successfully empty cloud reads and unavailable cloud reads are distinct.

The actual encrypted 197-term device request was not read, submitted or uploaded during this work. Its server submission cannot be asserted. Server flag values were not changed or independently attested; missing SQL alone is the verified live blocker. No claim is made that all 209 terms exist in cloud. The 12 documentary dossiers are preserved separately and the 209-row regression fixture is explicitly synthetic.

## Files changed

- `src/components/p36-compact-review-table.tsx` — shared compact review table and complete dossier drawer.
- `src/domain/health-intelligence/p36-review-table.ts` — read-only filter/pagination/status presentation helpers.
- `tests/domain/p36-review-table.test.ts` — four concrete regression tests, including complete 209-term pagination and literal unit preservation.
- `src/components/p36-scientific-review-workspace.tsx` — original dossiers use compact inventory; existing exports retained.
- `src/components/p36-dynamic-review-workspace.tsx` — compact dynamic inventory, full details, exact-scope roles, roster loading/errors, cloud unavailable versus empty states; Researcher-only path does not read local requests.
- `src/components/p36-final-authorization.tsx` — explicit disabled scientific actions and existing-validator-based decision eligibility.
- `src/components/p36-pending-requests-summary.tsx` — surface roster errors, read authorized cross-device scopes even without local receipts, qualify partial/unavailable inventories.
- `src/infrastructure/mission-crew-roster.ts` — prefer narrow authorized roster RPC; no table-policy widening.
- `src/domain/health-intelligence/p36-scientific-authorization.ts` — neutral pending display label only.
- `src/hooks/use-p36-authorization.ts` — optional guarded first-mission access instead of a non-null assertion.
- `scripts/verify-p36-dynamic-pg.ts` — five additional negative/positive roster checks.
- `supabase/pending/20261107020000_p36_authorized_crew_roster.sql` and matching rollback — staged only.
- `docs/P36_AUTHORITATIVE_MIGRATION_SEQUENCE.md`, this report, `roadmap.md`, `AGENTS.md` — migration sequence, validation results and structural safeguard.

## Staged SQL and owner checkpoint

Existing handoff and authorization SQL and rollback bytes were preserved. The definitive dynamic sequence is:

| Order | Pending SQL | SHA-256 |
| --- | --- | --- |
| 1 | `20261107000000_p36_dynamic_handoff.sql` | `c36ed38b8836f5c8cb0a906735e1ec6a8748145df393ab7029312434275ff83d` |
| 2 | `20261107010000_p36_dynamic_authorization.sql` | `47c3498fad113acec0c9776636ae1378adbcdcf5b719cfc7c4e4d98124d33b06` |
| 3 | `20261107020000_p36_authorized_crew_roster.sql` | `79cbac14e37717c98977f199974df0575449050cee38ec0612703567e01b66f0` |

The roster follows the existing handoff authorization model and requires the existing missions, memberships, crew names, assignments and `auth.uid()`. It grants only RPC execution to authenticated callers, no anonymous execution or broader table access. No new table is created. Both write admissions remain closed by default; neither app flag alone admits writes.

Roster rollback: `20261107020000_p36_authorized_crew_roster.rollback.sql`, SHA-256 `8de32cf5b790e6782c0fff0375598dfc7cd845b9cec4b1f744a072d3256dfc11`. It drops only the read RPC, never evidence. Remove it first if disabling the roster feature, then follow the existing reverse-order empty-only authorization/handoff rollbacks. If evidence exists, retain it and close admission instead of destructive rollback.

**Next owner checkpoint:** authorize independently isolated staging auth/data services, two separate synthetic test accounts and these exact staged SQL files there, with closed admission initially. Separate explicit authorization is required for synthetic staging submission/decision admission and test-only source receipts. Genuine account/browser acceptance must precede any production decision. Production SQL, write admission, deployment, user metadata upload and catalog activation are separate approvals; none is granted or performed here.

## Validation evidence

| Check | Observed result |
| --- | --- |
| Full automated suite | **1,199 pass, 0 fail**, 191 files; 12,550 expectations |
| Disposable PostgreSQL | **38 checks pass**, including 197-term synthetic insertion, Ground Medical recommendation, independent Researcher decision, source-receipt absence/mismatch, replay/conflict, scope/provenance separation, direct ACL denial, retaining disable, concurrent revocation and roster mission/crew/anonymous/inactive-assignment checks |
| Main project gate scripts | **56 pass, 0 fail**; excludes typecheck/build/test/lint/format commands which are reported separately |
| Extended offline verifiers | **107 pass, 3 blocked/fail**: `verify-p3663-activation.mjs` needs private restore evidence, `verify-p3664-owner-risk.mjs` needs independent backup/owner-risk evidence, `verify-submission-gate.mjs` needs official submission/rules evidence; safeguards were not weakened |
| Lint | **0 errors, 12 existing warnings** |
| Security boundary audit | **PASS** (`scripts/security-audit.mjs`) |
| Dependency audit | **FAIL: 2 moderate advisories**, transitive esbuild and minimatch; no dependency changes were included in this UX patch |
| Formatting | **PASS** before final documentation; final report and checklist formatting rechecked at delivery |
| Managed compilation | Latest `/tmp/observability/build-errors.log`: **build OK** after source edits; the earlier nullable-ID compiler error was corrected |
| Standalone typecheck/production build | **Not manually run** under platform execution rules; no exact-candidate production-build or hosted CI acceptance is claimed |
| Desktop 1280×1800 / mobile 390×844 | Real browser checks pass: 10+2 original dossier pagination, search, domain filter, full dossier drawer, disabled scientific actions, no page horizontal overflow, no runtime errors |
| Genuine two-account browser and cross-device workflow | **BLOCKED**: no independently isolated real-auth/application/data services were attested; disposable SQL role claims are not browser authentication acceptance |

Screenshots of both fully opened drawers were visually inspected. Browser checks were signed out and did not submit requests or decisions. No simulation is represented as authenticated acceptance. Existing PDF/JSON regression tests passed with the full suite; source export pipelines remain unchanged.

## Readiness

The compact UI and staged roster fix are implemented and locally verified. **Production remains NO-GO.** The actual Ground Medical → Researcher workflow and user-originated 197-term cross-device readback require deployed owner-approved staging SQL, genuinely isolated authenticated services and explicit test authorization. Missing dynamic production SQL is the verified current visibility blocker, not a reason to bypass admission or upload local records.