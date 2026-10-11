# P23C — Source persistence repair

- Cloud transport handles each RPC response independently, so one failed/rejected event does not cause already-accepted events to be marked failed.
- Bone Health mission/crew selectors are derived from signed-in, active mission memberships, with no free-form identifiers. Crew-self can select only their own linked crew ID; ground medical may select only crew IDs explicitly present in their memberships. This does **not** expand permissions or provide a mission-wide ground-medical roster.
- Readiness assessments require a signed-in crew-self mission membership; no placeholder identity is written. Existing local placeholder records remain encrypted and are **not** automatically reassigned to a person.
- No database migrations, navigation edits, raw file uploads, or clinical rules.
- Existing rejected local records still require a separate quarantining/retry policy; per-record isolation prevents poisoning other RPC results, but does not automatically cure permanently rejected records.
- No device-to-cloud end-to-end test was run by this patch. Validate synthetic accepted/rejected mixed batches, offline reconnection, role isolation, and mission_events/crew_health_record_index in the target environment. Do not claim cloud persistence without observing it.
