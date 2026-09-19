# P16 Security & Safety Misuse Cases

These cases are mandatory regression targets. They describe what the system must refuse or fail closed on.

| ID | Misuse / failure case | Required outcome |
| --- | --- | --- |
| MC-01 | Anonymous caller invokes mission RPC | Denied before data access |
| MC-02 | Authenticated member requests another mission | Denied by membership/RLS |
| MC-03 | Crew member reads another crew member's identified event | Denied |
| MC-04 | Researcher queries identified `mission_events` | No read path |
| MC-05 | Mission operator requests general identified medical events | Denied |
| MC-06 | Mission operator uploads a `medical_sensitive` event | Denied by P16 ingestion scope |
| MC-07 | Same idempotency key is replayed with different payload | Conflict, never silent duplicate |
| MC-08 | Event has unsupported kind/classification or malformed timestamp | Rejected before write |
| MC-09 | Event payload exceeds 256 KiB | Rejected before write |
| MC-10 | Research payload contains nested direct identifiers/free text | Removed recursively from research export |
| MC-11 | Browser-reachable code imports service-role client/key | Security audit fails |
| MC-12 | Tracked source contains a recognizable private credential | Security audit fails |
| MC-13 | App is framed by another origin | Denied by CSP/frame headers |
| MC-14 | Experimental/research-only finding requests protocol escalation | Existing P12/P13 fail-closed rules remain authoritative |
| MC-15 | Network disappears during collection | Local encrypted capture continues; queued sync retries later |
| MC-16 | Data quality is poor or evidence missing | No silent imputation; operational guidance is blocked or reduced |
