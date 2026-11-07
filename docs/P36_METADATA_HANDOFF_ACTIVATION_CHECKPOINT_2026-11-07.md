# P36 Metadata Handoff activation checkpoint — 7 November 2026

## Actual result: BLOCKED / NOT ACTIVATED

Owner authorized controlled Metadata Handoff activation, but the required published compatibility/runtime-flag checkpoint could not be established. No flag, admission switch, account, membership, request, encrypted record, scientific dossier or catalog was changed; no publication occurred.

Final live readback: exactly one singleton, `handoff_open=false`, `authorization_open=false`, zero handoff submissions, zero handoff terms. Since admission was never opened, no closing write was necessary.

## Reverified installation and security

Live migration journal IDs 17–21 still match the installed hashes in `P36_FINAL_INSTALLATION_CHECKPOINT_2026-11-07.md`, including both exact new remediation/roster hashes. All five dynamic tables remain postgres-owned and RLS-enabled. Effective executor table/column INSERT and authenticated/service-role table INSERT are false on all five tables. Dynamic functions retain postgres ownership and pinned search paths. Anonymous/executor EXECUTE is false for all inspected dynamic functions; authenticated EXECUTE remains scoped to the intended RPCs. No grants were broadened.

These are current read-only catalog checks, not new direct-write probes or full runtime acceptance. Previously documented sequence access and service-role function grants were preserved, not removed. No real account was minted or impersonated for this operation.

## Exact activation blocker

Platform execution rules state that adding/updating server configuration takes effect in preview immediately, but the published app receives the updated configuration only at the next publish. The existing project rule requires deployment authorization separately from flag/admission activation, plus exact-revision release evidence. This upload authorizes activation, not a separately identified validated deployment. Publishing now would also deploy the current application snapshot, not merely change one live switch.

Configured secret-name inspection did not list `P36_DYNAMIC_HANDOFF_ENABLED` or `P36_DYNAMIC_AUTHORIZATION_ENABLED`. This is evidence about configured names only, **not proof of any actual published runtime value**. Legacy `P36_CLOUD_SUBMISSION_ENABLED` is configured; its value was neither read nor changed. The existing handoff submission handler fails closed unless its server-only handoff flag is explicitly enabled. No preview-only flag update was made, avoiding divergence from the requested published activation.

The published `/mission/scientific-review` page returned successfully with title `Catalog Scientific Review | The Mitochondria`, and its public application index referenced Scientific Review and handoff modules. This establishes page/asset availability, **not the deployed server handler's revision, schema compatibility or effective flag**. Existing source provides authenticated listing and consented submission, but no dedicated non-mutating operational flag-status read was established. The submission endpoint was not used as a flag probe because it can mutate when enabled.

## Required next checkpoint

Provide separate owner authorization for a specific validated deployment carrying only the intended handoff activation configuration, with scientific authorization and legacy submission kept disabled. Establish exact deployment/release evidence and an authenticated, non-mutating published compatibility/status check before opening database handoff admission. Do not create a status endpoint, bypass permissions or change deployment under this checkpoint implicitly. If any activation verification subsequently fails after opening admission, close handoff immediately through the approved supported data-write mechanism.

## Manual two-account acceptance after successful activation

Use two existing, explicitly identified synthetic accounts with active Ground Medical and Researcher memberships in the same authorized mission. Do not create accounts or change memberships without separate authorization. Use separate browser profiles/sessions, not fabricated JWTs or a shared login. Neither scientific recommendation nor Researcher decision is part of this handoff-only test.

### First: existing 12-term request

1. Ground Medical opens `/mission/scientific-review` in the original device/browser holding the request.
2. Select the authorized mission, crew member and **synthetic** provenance in “Submitted and device-local terms.” Select the intended existing request; do not aggregate it with another request or construct replacement terms.
3. Choose **Preview metadata submission** and verify exactly 12 intended terms, exact units, source pointers, request identity and mission/crew/provenance. Stop on a mismatch.
4. The user explicitly checks **I consent to sending this metadata for this mission, crew member and provenance. This does not grant scientific approval.**
5. The user chooses **Submit metadata to cloud** and records the actual receipt/status. No automatic or assistant-triggered submission.
6. Researcher separately opens the same route, selects the identical authorized scope and chooses **Refresh submitted terms**. Compare the exact 12-term batch and metadata with the receipt, not just an aggregate count. Confirm local-only records are absent.

### Second: additional 197-term request

Repeat the same preview, exact-scope check, explicit consent, user submission and separate Researcher refresh for the original additional request. Verify that batch contains exactly 197 intended terms. Preserve the original 12-term batch. Do not assume aggregate unique-term count is 209 when cross-request term IDs overlap; compare batch membership and report genuine duplicates without merging/deleting originals.

### Negative and retry checks

- Confirm unauthorized missions/crew are absent or denied, and switching scope never retains another scope's rows.
- After a genuine failed submission, use **Retry metadata submission** with the unchanged original request; verify duplicate protection and stable readback rather than new history duplicates.
- Changed-payload/same-request conflicts should be refused; do not alter real local evidence solely to manufacture a test conflict.
- Cross-request duplicate reporting must preserve originals, exact units and source evidence.
- Keep scientific authorization admission/flag disabled; perform no recommendations, approvals, receipt fabrication or catalog promotion.
- Report each account, batch count, scope and receipt result only after actual readback; do not claim end-to-end success from asset inspection or SQL ACLs.

No authenticated acceptance steps above have been executed. No background operation remains scheduled.
