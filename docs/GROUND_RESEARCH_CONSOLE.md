# P15 — Ground / Research Console

P15 introduces the cloud-side mission boundary that P14 deliberately deferred. The local astronaut runtime remains operational without Earth connectivity; when authenticated connectivity exists, queued mission events can be sent through the `ingest_mission_event` RPC and persisted under mission/crew authorization.

## Role separation

- `crew_self`: own identified mission-health records only.
- `ground_medical`: identified crew health, alert review, audit review, research export.
- `mission_operator`: mission overview, alert/device health and audit review, but not general identified medical access.
- `researcher`: de-identified research export only.

Research access never grants direct reads of `mission_events`. The research RPC produces a reduced, de-identified projection and writes an audit record.

## Audit trail

Mission event ingestion, ground snapshot reads and research exports append server-side audit events. Browser clients cannot insert/update/delete audit events directly.

## Store-and-forward handoff

P14's encrypted local queue binds to `SupabaseMissionSyncTransport`. The transport calls the authenticated `ingest_mission_event` RPC, preserving idempotency. The cloud is still not in the live sensor-to-astronaut path.

## Security boundary

All health persistence tables use forced RLS. Anonymous access is revoked. Sensitive writes are exposed only through governed RPCs that validate `auth.uid()` and active mission membership. P16 will perform the full threat model/RLS audit and hardening review.
