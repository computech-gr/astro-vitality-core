# MITOCHONDRIA v9.4.1 — Security hardening and activation

This patch makes two targeted changes to the v9.4 source snapshot:

1. New Unified Intake observation events remain in the encrypted local store but are NOT enqueued for the legacy `mission_events` background uploader.
2. Legacy queue entries already present from earlier releases are blocked by the Supabase transport before the `ingest_mission_event` RPC. This guard is fail-closed. Other mission events retain existing sync behavior.

**Existing cloud records:** The 62 pre-existing Medical Intake events mentioned in the developer report are NOT removed or encrypted retroactively. Investigate their scope, access, retention and remediation separately. Never automatically delete or mutate production records.

**Activation (requires explicit owner approval):** Apply the existing staged `supabase/pending/20261102000000_v94_observation_sync.sql` to the verified live backend; set `MITO_OBSERVATION_SYNC_KEY_V1` to a newly generated cryptographically secure 32-byte base64 secret in SERVER-ONLY secret management; set `MITO_OBSERVATION_SYNC_ENABLED=true`; leave `MITO_OBSERVATION_SYNC_REAL_ENABLED` disabled. Never place secrets in a prompt, repository, logs or client environment. Do not publish without owner approval.

**Acceptance:** Run all tests and verifiers; validate two-device synthetic observations + matching attestations; retry is idempotent; existing legacy queued Unified Intake records do not hit the RPC; unrelated mission records continue to sync; no real records uploaded. Verify that server settings are actually available to the deployed server runtime (not merely configured in build tooling).

**Limitations:** This is a targeted source patch, not proof of passing the full suite. Database migration and server key setup are not performed here. A `rejected` result for a pre-existing legacy queue item is intentional and should be shown as blocked, not synced.
