# P16 Threat Model

## Scope

P16 threat-models the first complete connected mission loop: device/lab/environment ingestion, local encrypted persistence, Health Intelligence, protocol guidance, authenticated synchronization, Supabase mission persistence, Ground Console and de-identified research export.

## Protected assets

- identified mission and health events;
- crew identity and mission membership;
- personal baselines and cognitive/behavioral records;
- protocol versions and action acknowledgements;
- research pseudonymization material;
- audit events and provenance;
- service-role/database/OAuth credentials;
- integrity of evidence used by Health Intelligence and guidance.

## Trust boundaries

1. Sensor / wearable → browser/device adapter.
2. Browser runtime → encrypted local IndexedDB.
3. Browser authenticated session → Supabase RPC boundary.
4. Supabase RLS / SECURITY DEFINER routines → mission tables.
5. Identified mission store → Ground Medical console.
6. Identified mission store → de-identification RPC → Research export.
7. Experimental intelligence → governed protocol/action layer.

## Threats and controls

| Threat | Primary controls | Residual risk / next work |
| --- | --- | --- |
| Cross-mission or cross-crew read | forced RLS, membership checks, role matrix, negative tests | Requires live policy regression tests after every schema change |
| Mission operator reads/ingests medical data | no identified-medical SELECT path; P16 limits operator ingestion to non-medical operational events | Future administrative workflows require separate governed capability |
| Researcher re-identification | no direct event SELECT; mission-specific pseudonyms; recursive identifier/free-text stripping; audited export | Pseudonymization is not anonymization; small cohorts and quasi-identifiers remain re-identification risks |
| Replay/idempotency abuse | unique idempotency key, payload hash, conflict response on mismatched replay | Endpoint rate limiting remains deployment/platform responsibility |
| Oversized/malformed event payload | P16 field, type, length, timestamp, kind, classification and 256 KiB payload validation | Clinical schema-specific validation expands with future event contracts |
| Service-role key exposure | server-only client, repository secret audit, no browser import | Provider/workspace secret-management controls remain external |
| XSS / browser exfiltration | CSP, frame denial, no-referrer, nosniff, restrictive permissions policy | Current hydration requires `unsafe-inline`; nonce/hash CSP is a release hardening target |
| Offline-device theft | AES-GCM encrypted local records, non-extractable device key | A compromised unlocked browser profile may still access plaintext while the app is running |
| Device spoofing / false provenance | adapter capability contracts and source provenance | Hardware attestation/device identity is not yet implemented |
| Experimental pattern treated as diagnosis | research-only fail-closed path, explicit uncertainty, action-governance separation | Requires continued human review and validation in P18 |
| Network loss | offline local runtime, cached protocols, sync queue | Extended storage exhaustion and device loss remain operational risks |
| Audit tampering | no browser INSERT/UPDATE/DELETE, audit writes inside trusted RPCs | Privileged database operators remain inside infrastructure trust boundary |

## Safety principle

A security failure must not silently become a medical conclusion. Missing, stale, conflicting or untrusted evidence must degrade confidence, produce data-quality handling, or block operational guidance rather than being imputed as healthy or unsafe.
